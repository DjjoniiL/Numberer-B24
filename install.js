(function () {
  "use strict";

  const appVersion = "Numberer B24 v.3";
  const settingsOption = "numbererB24Settings";
  const uniqueFieldName = "UF_CRM_UNIQUE_NUMBER";
  const uniqueFieldShortName = "UNIQUE_NUMBER";
  const uniqueFieldTitle = "Уникальный номер";
  const core = window.NumbererCore;

  const statusNode = document.querySelector("#installStatus");
  const finishButton = document.querySelector("#finishButton");
  const logNode = document.querySelector("#installLog");

  function setStatus(text) {
    statusNode.textContent = text;
  }

  function write(value) {
    const line = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    logNode.textContent += `${logNode.textContent ? "\n\n" : ""}${line}`;
  }

  function fileUrl(fileName) {
    const url = new URL(window.location.href);
    url.pathname = url.pathname.replace(/install\.html$/i, fileName);
    url.search = "";
    url.hash = "";
    return url.toString();
  }

  function callMethod(method, params = {}) {
    return new Promise((resolve, reject) => {
      window.BX24.callMethod(method, params, (result) => {
        if (result.error()) reject(new Error(result.error_description() || result.error()));
        else resolve(result.data());
      });
    });
  }

  async function callList(method, params = {}) {
    const rows = [];
    let start = 0;
    do {
      const data = await new Promise((resolve, reject) => {
        window.BX24.callMethod(method, { ...params, start }, (result) => {
          if (result.error()) reject(new Error(result.error_description() || result.error()));
          else resolve({ data: result.data(), next: result.more() ? result.next() : null });
        });
      });
      rows.push(...(Array.isArray(data.data) ? data.data : []));
      start = data.next;
    } while (start !== null && start !== undefined);
    return rows;
  }

  async function ensureUniqueField() {
    const fields = await callList("crm.deal.userfield.list").catch(() => []);
    const existing = fields.find((field) => String(field.FIELD_NAME || "").toUpperCase() === uniqueFieldName);
    const labels = {
      EDIT_FORM_LABEL: uniqueFieldTitle,
      LIST_COLUMN_LABEL: uniqueFieldTitle,
      LIST_FILTER_LABEL: uniqueFieldTitle,
      HELP_MESSAGE: "Автоматически созданный номер сделки",
      EDIT_IN_LIST: "N",
      SHOW_IN_CARD: "Y",
      MANDATORY: "N",
    };
    if (existing?.ID) {
      await callMethod("crm.deal.userfield.update", { id: existing.ID, fields: labels });
      return { updated: existing.ID };
    }
    const id = await callMethod("crm.deal.userfield.add", {
      fields: {
        FIELD_NAME: uniqueFieldShortName,
        USER_TYPE_ID: "string",
        XML_ID: uniqueFieldName,
        ...labels,
      },
    });
    return { created: id };
  }

  function normalizeCategory(category) {
    const id = Number(category.id ?? category.ID);
    if (!Number.isFinite(id)) return null;
    return { id, name: category.name || category.NAME || (id === 0 ? "Основная" : `Воронка #${id}`) };
  }

  async function loadCategories() {
    const response = await callMethod("crm.category.list", { entityTypeId: 2 }).catch(() => ({ categories: [] }));
    const custom = (response?.categories || response?.result?.categories || []).map(normalizeCategory).filter(Boolean);
    return [{ id: 0, name: "Основная" }, ...custom]
      .filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index);
  }

  function stageEntityId(categoryId) {
    return Number(categoryId) === 0 ? "DEAL_STAGE" : `DEAL_STAGE_${categoryId}`;
  }

  async function loadStagesForCategory(categoryId) {
    return callList("crm.status.list", {
      filter: { ENTITY_ID: stageEntityId(categoryId) },
      order: { SORT: "ASC" },
    }).catch(() => []);
  }

  function successStageId(stages) {
    const success = stages.find((stage) => String(stage.SEMANTICS || "").toUpperCase() === "S")
      || stages.find((stage) => /WON|SUCCESS/i.test(String(stage.STATUS_ID || stage.ID || "")))
      || stages[stages.length - 1];
    return success ? String(success.STATUS_ID || success.ID || "") : "";
  }

  async function buildDefaultSettings(categories) {
    const stagesByCategory = {};
    for (const category of categories) {
      const stages = await loadStagesForCategory(category.id);
      const stageId = successStageId(stages);
      if (stageId) stagesByCategory[String(category.id)] = stageId;
    }
    return core.normalizeSettings({
      ...core.defaultSettings,
      prefixMode: "manual",
      manualPrefix: "NUM",
      digits: 4,
      letterLength: 2,
      generationMode: "sequential",
      startDate: core.dateDaysAgo(14),
      stagesByCategory,
    });
  }

  async function ensureInitialSettings(categories) {
    const existing = await callMethod("app.option.get", { option: settingsOption }).catch(() => null);
    if (existing) {
      let parsed = null;
      try {
        parsed = JSON.parse(existing);
      } catch {
        parsed = null;
      }
      const settings = core.normalizeSettings(parsed || core.defaultSettings);
      if (!settings.startDate) {
        const migrated = core.normalizeSettings({ ...settings, startDate: core.dateDaysAgo(14) });
        await callMethod("app.option.set", { options: { [settingsOption]: JSON.stringify(migrated) } });
        return { preserved: true, migratedStartDate: true, settings: migrated };
      }
      return { preserved: true };
    }
    const settings = await buildDefaultSettings(categories);
    await callMethod("app.option.set", {
      options: {
        [settingsOption]: JSON.stringify(settings),
      },
    });
    return { preserved: false, settings };
  }

  function defaultDealCardLayout() {
    return [
      {
        name: "main",
        title: "О сделке",
        type: "section",
        elements: [
          { name: "TITLE", optionFlags: 1 },
          { name: "OPPORTUNITY_WITH_CURRENCY", optionFlags: 0 },
          { name: "STAGE_ID", optionFlags: 0 },
          { name: uniqueFieldName, optionFlags: 1 },
          { name: "CLIENT", optionFlags: 0 },
        ],
      },
    ];
  }

  function placeUniqueFieldInMain(layout) {
    const sections = Array.isArray(layout) && layout.length ? layout : defaultDealCardLayout();
    let inserted = false;
    return sections.map((section, index) => {
      const elements = (section.elements || []).filter((element) => String(element.name || "").toUpperCase() !== uniqueFieldName);
      if (!inserted && (section.name === "main" || index === 0)) {
        const stageIndex = elements.findIndex((element) => String(element.name || "").toUpperCase() === "STAGE_ID");
        elements.splice(stageIndex >= 0 ? stageIndex + 1 : elements.length, 0, { name: uniqueFieldName, optionFlags: 1 });
        inserted = true;
      }
      return { ...section, elements };
    });
  }

  async function configureDealCard(categories) {
    const methods = [
      { get: "crm.item.details.configuration.get", set: "crm.item.details.configuration.set", baseParams: { entityTypeId: 2 } },
      { get: "crm.deal.details.configuration.get", set: "crm.deal.details.configuration.set", baseParams: {} },
    ];
    const attempts = [];
    for (const category of categories) {
      for (const method of methods) {
        const extras = { dealCategoryId: category.id };
        let current = null;
        try {
          const response = await callMethod(method.get, { ...method.baseParams, scope: "C", extras });
          current = response?.data || response;
        } catch (error) {
          if (!/card layout is empty/i.test(error.message || "")) {
            attempts.push({ categoryId: category.id, method: method.get, ok: false, error: error.message });
            continue;
          }
        }
        try {
          await callMethod(method.set, { ...method.baseParams, scope: "C", extras, data: placeUniqueFieldInMain(current) });
          attempts.push({ categoryId: category.id, method: method.set, ok: true });
          break;
        } catch (error) {
          attempts.push({ categoryId: category.id, method: method.set, ok: false, error: error.message });
        }
      }
    }
    return attempts;
  }

  async function bindPlacement(placement, params) {
    await callMethod("placement.unbind", { PLACEMENT: placement }).catch(() => null);
    try {
      return await callMethod("placement.bind", { PLACEMENT: placement, ...params });
    } catch (error) {
      if (/already|exist|PLACEMENT_MAX|уже/i.test(error.message || "")) return { alreadyBound: true };
      throw error;
    }
  }

  async function install() {
    setStatus("Создаю поле сделки...");
    const field = await ensureUniqueField();
    write({ step: "field", field });

    setStatus("Определяю воронки...");
    const categories = await loadCategories();
    write({ step: "categories", categories });

    setStatus("Добавляю поле в основной раздел карточки...");
    const layout = await configureDealCard(categories);
    write({ step: "deal-card-layout", layout });

    setStatus("Регистрирую интерфейсы приложения...");
    const appHandler = fileUrl("index.html");
    const workerHandler = fileUrl("worker.html");
    const workerErrorHandler = fileUrl("worker-error.html");
    const placements = [
      await bindPlacement("CRM_DEAL_DETAIL_TAB", { HANDLER: appHandler, TITLE: "Нумератор" }),
      await bindPlacement("PAGE_BACKGROUND_WORKER", { HANDLER: workerHandler, OPTIONS: { errorHandlerUrl: workerErrorHandler } }),
    ];
    write({ step: "placements", placements, appHandler, workerHandler });

    const defaultSettings = await ensureInitialSettings(categories);
    write({ step: "default-settings", defaultSettings });

    setStatus("Установка завершена.");
    finishButton.disabled = false;
    write({ ok: true, appVersion, note: "В настройках приложения выберите стадии запуска для каждой воронки." });
    window.BX24.installFinish();
  }

  function boot() {
    finishButton.addEventListener("click", () => window.BX24?.installFinish?.());
    if (!window.BX24?.init) {
      setStatus("Откройте установку внутри Bitrix24.");
      return;
    }
    window.BX24.init(() => {
      install().catch((error) => {
        setStatus(`Ошибка установки: ${error.message}`);
        write({ ok: false, error: error.message });
        finishButton.disabled = false;
      });
    });
  }

  boot();
})();

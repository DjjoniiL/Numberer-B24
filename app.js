(function () {
  "use strict";

  const appVersion = "Numberer B24 v.3.15";
  const settingsOption = "numbererB24Settings";
  const sequenceOption = "numbererB24SequenceState";
  const renumberJobOption = "numbererB24RenumberJob";
  const prefixMissingCommentsOption = "numbererB24PrefixMissingComments";
  const logStorageKey = "numbererB24LastLog";
  const uniqueFieldName = "UF_CRM_UNIQUE_NUMBER";
  const uniqueFieldShortName = "UNIQUE_NUMBER";
  const uniqueFieldTitle = "Уникальный номер";
  const supportWidgetUrl = "https://cdn-ru.bitrix24.ru/b31051/crm/site_button/loader_9_no7zeu.js";
  const core = window.NumbererCore;
  let supportWidgetLoading = null;

  const state = {
    settings: core.normalizeSettings(),
    categories: [],
    stagesByEntity: new Map(),
    stringFields: [],
    userFields: [],
    isAdmin: false,
  };

  const nodes = {
    appVersionNode: document.querySelector("#appVersion"),
    form: document.querySelector("#settingsForm"),
    settingsStatus: document.querySelector("#settingsStatus"),
    adminNotice: document.querySelector("#adminNotice"),
    prefixMode: document.querySelector("#prefixMode"),
    appShell: document.querySelector(".app-shell"),
    manualPrefixWrap: document.querySelector("#manualPrefixWrap"),
    prefixFieldWrap: document.querySelector("#prefixFieldWrap"),
    prefixField: document.querySelector("#prefixField"),
    manualPrefix: document.querySelector("#manualPrefix"),
    customStartEnabled: document.querySelector("#customStartEnabled"),
    customStartStatus: document.querySelector("#customStartStatus"),
    customStartWrap: document.querySelector("#customStartWrap"),
    customStartValue: document.querySelector("#customStartValue"),
    startDate: document.querySelector("#startDate"),
    digitsChoices: document.querySelector("#digitsChoices"),
    letterChoices: document.querySelector("#letterChoices"),
    stageMatrix: document.querySelector("#stageMatrix"),
    numberPreview: document.querySelector("#numberPreview"),
    logPanel: document.querySelector("#logPanel"),
    log: document.querySelector("#log"),
    toggleLog: document.querySelector("#toggleLog"),
    refresh: document.querySelector("#refresh"),
    supportHelp: document.querySelector("#supportHelp"),
    supportBackdrop: document.querySelector("#supportBackdrop"),
    supportModal: document.querySelector("#supportModal"),
    closeSupport: document.querySelector("#closeSupport"),
    helpModal: document.querySelector("#helpModal"),
    helpText: document.querySelector("#helpText"),
    closeHelp: document.querySelector("#closeHelp"),
  };

  function callMethod(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!window.BX24?.callMethod) {
        reject(new Error("Bitrix24 SDK недоступен"));
        return;
      }
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

  function setStatus(text, tone = "neutral") {
    nodes.settingsStatus.textContent = text;
    nodes.settingsStatus.dataset.tone = tone;
  }

  function setLogVisible(visible) {
    nodes.logPanel.hidden = !visible;
    nodes.toggleLog.setAttribute("aria-expanded", String(visible));
    document.body.classList.toggle("log-visible-page", visible);
  }

  function write(value, reveal = true) {
    if (reveal) setLogVisible(true);
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    nodes.log.textContent = text;
    localStorage.setItem(logStorageKey, text);
  }

  function restoreLastLog() {
    const text = localStorage.getItem(logStorageKey);
    if (!text) return;
    nodes.log.textContent = text;
  }

  function optionJson(value, fallback) {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function labelValue(value) {
    if (!value) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value !== "object") return String(value).trim();
    for (const key of ["ru", "RU", "ua", "UA", "en", "EN", "text", "value"]) {
      const label = labelValue(value[key]);
      if (label) return label;
    }
    for (const item of Object.values(value)) {
      const label = labelValue(item);
      if (label) return label;
    }
    return "";
  }

  function isFieldCode(label, name) {
    const value = String(label || "").trim().toUpperCase();
    return !value || value === String(name || "").trim().toUpperCase() || /^UF_CRM(_|_DEAL_)?[A-Z0-9_]+$/.test(value);
  }

  function fieldTitle(field, name) {
    const labels = [
      field?.EDIT_FORM_LABEL,
      field?.LIST_COLUMN_LABEL,
      field?.LIST_FILTER_LABEL,
      field?.TITLE,
      field?.FORM_LABEL,
      field?.LIST_LABEL,
      field?.FILTER_LABEL,
      field?.LABEL,
      field?.NAME,
      field?.title,
      field?.formLabel,
      field?.listLabel,
      field?.filterLabel,
      field?.label,
      field?.name,
      field?.caption,
      field?.CAPTION,
      field?.settings?.label,
      field?.SETTINGS?.LABEL,
      name,
    ].map(labelValue).filter(Boolean);
    return labels.find((label) => !isFieldCode(label, name)) || labels[0] || name;
  }

  function fieldOptionText(field) {
    return isFieldCode(field.title, field.name) ? field.name : `${field.title} (${field.name})`;
  }

  function mergeStringFields(fields) {
    const byName = new Map();
    for (const field of fields) {
      if (!field.name || String(field.name).toUpperCase() === uniqueFieldName) continue;
      const existing = byName.get(field.name);
      if (!existing || (isFieldCode(existing.title, existing.name) && !isFieldCode(field.title, field.name))) {
        byName.set(field.name, field);
      }
    }
    return [...byName.values()];
  }

  async function loadSettings() {
    const data = await callMethod("app.option.get", { option: settingsOption }).catch(() => null);
    state.settings = core.normalizeSettings(optionJson(data, core.defaultSettings));
    return state.settings;
  }

  async function loadSettingsWithDefaults() {
    const data = await callMethod("app.option.get", { option: settingsOption }).catch(() => null);
    if (data) {
      state.settings = core.normalizeSettings(optionJson(data, core.defaultSettings));
      if (!state.settings.startDate) {
        state.settings = core.normalizeSettings({ ...state.settings, startDate: core.dateDaysAgo(14) });
        if (state.isAdmin) {
          await callMethod("app.option.set", { options: { [settingsOption]: JSON.stringify(state.settings) } });
          return { settings: state.settings, created: false, migratedStartDate: true };
        }
      }
      return { settings: state.settings, created: false };
    }
    state.settings = await buildDefaultSettings();
    if (state.isAdmin) {
      await callMethod("app.option.set", { options: { [settingsOption]: JSON.stringify(state.settings) } });
      return { settings: state.settings, created: true };
    }
    return { settings: state.settings, created: false, unsavedDefault: true };
  }

  async function saveSettings(settings) {
    state.settings = core.normalizeSettings(settings);
    await callMethod("app.option.set", { options: { [settingsOption]: JSON.stringify(state.settings) } });
    return state.settings;
  }

  async function loadSequenceState() {
    const data = await callMethod("app.option.get", { option: sequenceOption }).catch(() => null);
    return optionJson(data, {});
  }

  async function saveSequenceState(sequenceState) {
    await callMethod("app.option.set", { options: { [sequenceOption]: JSON.stringify(sequenceState || {}) } });
  }

  async function loadPrefixMissingComments() {
    const data = await callMethod("app.option.get", { option: prefixMissingCommentsOption }).catch(() => null);
    return optionJson(data, {});
  }

  async function savePrefixMissingComments(stateMap) {
    const entries = Object.entries(stateMap || {}).slice(-200);
    await callMethod("app.option.set", { options: { [prefixMissingCommentsOption]: JSON.stringify(Object.fromEntries(entries)) } });
  }

  function prefixMissingCommentKey(settings, dealId, fieldName) {
    return [Number(dealId), fieldName, settings.settingsRevision || "current"].join("|");
  }

  async function addPrefixMissingTimelineCommentOnce(dealId, fieldName) {
    const comments = await loadPrefixMissingComments();
    const key = prefixMissingCommentKey(state.settings, dealId, fieldName);
    if (comments[key]) return false;
    await callMethod("crm.timeline.comment.add", {
      fields: {
        ENTITY_ID: Number(dealId),
        ENTITY_TYPE: "deal",
        COMMENT: `Номер сделки не создан: выбранное поле для префикса (${fieldName}) пустое. Заполните поле и повторите сохранение/перенумерацию.`,
      },
    });
    comments[key] = new Date().toISOString();
    await savePrefixMissingComments(comments);
    return true;
  }

  async function loadRenumberJob() {
    const data = await callMethod("app.option.get", { option: renumberJobOption }).catch(() => null);
    return optionJson(data, null);
  }

  async function saveRenumberJob(job) {
    await callMethod("app.option.set", { options: { [renumberJobOption]: JSON.stringify(job || {}) } });
  }

  function normalizeCategory(category) {
    const id = Number(category.id ?? category.ID);
    if (!Number.isFinite(id)) return null;
    return { id, name: category.name || category.NAME || (id === 0 ? "Основная" : `Воронка #${id}`) };
  }

  async function loadCategories() {
    const response = await callMethod("crm.category.list", { entityTypeId: 2 }).catch(() => ({ categories: [] }));
    const custom = (response?.categories || response?.result?.categories || []).map(normalizeCategory).filter(Boolean);
    state.categories = [{ id: 0, name: "Основная" }, ...custom]
      .filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index);
    return state.categories;
  }

  function stageEntityId(categoryId) {
    return Number(categoryId) === 0 ? "DEAL_STAGE" : `DEAL_STAGE_${categoryId}`;
  }

  async function loadStagesForCategory(categoryId) {
    const entityId = stageEntityId(categoryId);
    const stages = await callList("crm.status.list", {
      filter: { ENTITY_ID: entityId },
      order: { SORT: "ASC" },
    }).catch(() => []);
    const normalized = stages.map((stage) => ({
      id: stage.STATUS_ID || stage.ID,
      name: stage.NAME || stage.NAME_INIT || stage.STATUS_ID || "Стадия",
      semantics: stage.SEMANTICS || stage.SEMANTIC_ID || "",
    })).filter((stage) => stage.id);
    state.stagesByEntity.set(entityId, normalized);
    return normalized;
  }

  async function loadAllStages() {
    state.stagesByEntity.clear();
    await Promise.all(state.categories.map((category) => loadStagesForCategory(category.id)));
  }

  function successStageId(stages) {
    const success = stages.find((stage) => String(stage.semantics || stage.SEMANTICS || "").toUpperCase() === "S")
      || stages.find((stage) => /WON|SUCCESS/i.test(String(stage.id || stage.STATUS_ID || stage.ID || "")))
      || stages[stages.length - 1];
    return success ? String(success.id || success.STATUS_ID || success.ID || "") : "";
  }

  async function buildDefaultSettings() {
    const stagesByCategory = {};
    for (const category of state.categories) {
      const stages = state.stagesByEntity.get(stageEntityId(category.id)) || [];
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

  async function loadAdminAccess() {
    if (typeof window.BX24?.isAdmin === "function") {
      state.isAdmin = Boolean(window.BX24.isAdmin());
      return state.isAdmin;
    }
    const result = await callMethod("user.admin").catch(() => false);
    state.isAdmin = result === true || result === "Y" || result?.admin === true;
    return state.isAdmin;
  }

  function applyAccessControl() {
    const controls = nodes.form.querySelectorAll("input, select, button");
    controls.forEach((control) => {
      control.disabled = !state.isAdmin;
    });
    nodes.refresh.disabled = false;
    if (!state.isAdmin) {
      nodes.adminNotice.hidden = false;
      setStatus("Настройки доступны только администратору", "warning");
    } else {
      nodes.adminNotice.hidden = true;
    }
  }

  async function loadDealFields() {
    const [fields, userFields] = await Promise.all([
      callMethod("crm.deal.fields").catch(() => ({})),
      callList("crm.deal.userfield.list").catch(() => []),
    ]);
    state.userFields = userFields;
    const regularStringFields = Object.entries(fields || {})
      .filter(([, field]) => field?.type === "string" && field?.isReadOnly !== true)
      .map(([name, field]) => ({ name, title: fieldTitle(field, name) }));
    const customStringFields = userFields
      .filter((field) => String(field.USER_TYPE_ID || "").toLowerCase() === "string")
      .map((field) => ({ name: field.FIELD_NAME, title: fieldTitle(field, field.FIELD_NAME) }));
    state.stringFields = mergeStringFields([...customStringFields, ...regularStringFields]);
    return state.stringFields;
  }

  async function ensureUniqueField() {
    const rows = await callList("crm.deal.userfield.list").catch(() => []);
    state.userFields = rows;
    const existing = rows.find((field) => String(field.FIELD_NAME || "").toUpperCase() === uniqueFieldName);
    const fields = {
      EDIT_FORM_LABEL: uniqueFieldTitle,
      LIST_COLUMN_LABEL: uniqueFieldTitle,
      LIST_FILTER_LABEL: uniqueFieldTitle,
      HELP_MESSAGE: "Автоматически созданный номер сделки",
      EDIT_IN_LIST: "N",
      SHOW_IN_CARD: "Y",
      MANDATORY: "N",
    };
    if (existing?.ID) {
      await callMethod("crm.deal.userfield.update", { id: existing.ID, fields });
      return { id: existing.ID, created: false };
    }
    const id = await callMethod("crm.deal.userfield.add", {
      fields: {
        FIELD_NAME: uniqueFieldShortName,
        USER_TYPE_ID: "string",
        XML_ID: uniqueFieldName,
        ...fields,
      },
    });
    return { id, created: true };
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

  async function configureDealCard() {
    const attempts = [];
    const methods = [
      { get: "crm.item.details.configuration.get", set: "crm.item.details.configuration.set", baseParams: { entityTypeId: 2 } },
      { get: "crm.deal.details.configuration.get", set: "crm.deal.details.configuration.set", baseParams: {} },
    ];
    for (const category of state.categories) {
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

  function renderSegmented(container, name, values, suffix, selected) {
    container.replaceChildren(...values.map((value) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      const span = document.createElement("span");
      input.type = "radio";
      input.name = name;
      input.value = String(value);
      input.checked = Number(selected) === Number(value);
      span.textContent = suffix(value);
      label.append(input, span);
      return label;
    }));
  }

  function renderPrefixFields() {
    const useField = nodes.prefixMode.value === "field";
    nodes.manualPrefixWrap.hidden = useField;
    nodes.prefixFieldWrap.hidden = !useField;
  }

  function setRadioValue(name, value) {
    const input = nodes.form.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  }

  function syncCustomStartControls() {
    const enabled = nodes.customStartEnabled.checked;
    nodes.customStartStatus.textContent = enabled ? "Свой стартовый номер" : "По умолчанию";
    nodes.customStartWrap.hidden = !enabled;
    nodes.customStartValue.disabled = !enabled || !state.isAdmin;
  }

  function syncNumberOptionsFromCustomStart() {
    if (!nodes.customStartEnabled.checked) return;
    const pattern = core.parseStartNumberPattern(nodes.customStartValue.value);
    if (!pattern) return;
    nodes.customStartValue.value = pattern.value;
    setRadioValue("letterLength", pattern.letterLength);
    setRadioValue("digits", pattern.digits);
    nodes.form.elements.generationMode.value = "sequential";
  }

  function renderFields(selectedValue = state.settings.prefixField) {
    const options = state.stringFields.map((field) => {
      const option = document.createElement("option");
      option.value = field.name;
      option.textContent = fieldOptionText(field);
      return option;
    });
    if (!options.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Строковые поля не найдены";
      options.push(option);
    }
    nodes.prefixField.replaceChildren(...options);
    if (selectedValue && state.stringFields.some((field) => field.name === selectedValue)) {
      nodes.prefixField.value = selectedValue;
    }
  }

  function renderStages() {
    const compactStages = state.categories.length > 0 && state.categories.length <= 2;
    document.body.classList.toggle("compact-stages-page", compactStages);
    nodes.appShell.classList.toggle("compact-stages", compactStages);
    nodes.stageMatrix.replaceChildren(...state.categories.map((category) => {
      const row = document.createElement("label");
      row.className = "stage-row";
      const title = document.createElement("span");
      title.textContent = category.name;
      const select = document.createElement("select");
      select.name = `stage_${category.id}`;
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Не создавать в этой воронке";
      select.append(empty);
      const stages = state.stagesByEntity.get(stageEntityId(category.id)) || [];
      for (const stage of stages) {
        const option = document.createElement("option");
        option.value = stage.id;
        option.textContent = stage.name;
        option.selected = String(state.settings.stagesByCategory[String(category.id)] || "") === String(stage.id);
        select.append(option);
      }
      row.append(title, select);
      return row;
    }));
  }

  function renderSettings() {
    const settings = state.settings;
    nodes.prefixMode.value = settings.prefixMode;
    nodes.manualPrefix.value = settings.manualPrefix;
    nodes.customStartEnabled.checked = Boolean(settings.customStartEnabled);
    nodes.customStartValue.value = settings.customStartValue;
    nodes.startDate.value = settings.startDate;
    renderFields(settings.prefixField);
    nodes.form.elements.generationMode.value = settings.generationMode;
    renderSegmented(nodes.digitsChoices, "digits", core.digitOptions, (value) => `${value} цифры`, settings.digits);
    renderSegmented(nodes.letterChoices, "letterLength", core.letterOptions, (value) => "A".repeat(value), settings.letterLength);
    renderPrefixFields();
    syncCustomStartControls();
    renderStages();
    updatePreview();
  }

  function settingsFromForm() {
    const data = new FormData(nodes.form);
    const stagesByCategory = {};
    for (const category of state.categories) {
      const value = data.get(`stage_${category.id}`);
      if (value) stagesByCategory[String(category.id)] = String(value);
    }
    return core.normalizeSettings({
      prefixMode: data.get("prefixMode"),
      prefixField: data.get("prefixField"),
      manualPrefix: data.get("manualPrefix"),
      digits: Number(data.get("digits")),
      letterLength: Number(data.get("letterLength")),
      generationMode: data.get("generationMode"),
      customStartEnabled: data.get("customStartEnabled"),
      customStartValue: data.get("customStartValue"),
      startDate: data.get("startDate"),
      stagesByCategory,
    });
  }

  function updatePreview() {
    const settings = settingsFromForm();
    const prefix = settings.prefixMode === "field" ? "LTE" : settings.manualPrefix || "LTE";
    const deal = { [settings.prefixField]: prefix };
    const sequenceState = {};
    const key = core.sequenceKey(settings, 0);
    if (!settings.customStartEnabled) sequenceState[key] = 1;
    const result = core.buildNumber(settings, deal, sequenceState, 0);
    nodes.numberPreview.textContent = result.value || `${"A".repeat(settings.letterLength)}${"0".repeat(settings.digits)}`;
  }

  async function uniqueNumberExists(value, exceptDealId) {
    const rows = await callItemList({
      filter: { [`=${uniqueFieldName}`]: value },
      select: ["id", uniqueFieldName],
    }).catch(() => []);
    return rows.some((deal) => Number(deal.ID) !== Number(exceptDealId));
  }

  function normalizeCrmItemDeal(item) {
    if (!item || !item.id) return null;
    return {
      ...item,
      ID: item.id,
      TITLE: item.title,
      CATEGORY_ID: item.categoryId,
      STAGE_ID: item.stageId,
      DATE_CREATE: item.createdTime,
    };
  }

  async function loadActiveDeal(dealId) {
    const data = await callMethod("crm.item.get", {
      entityTypeId: 2,
      id: Number(dealId),
      useOriginalUfNames: "Y",
    }).catch((error) => {
      if (/not.?found|not_found/i.test(error.message || "")) return null;
      throw error;
    });
    return normalizeCrmItemDeal(data?.item || data);
  }

  async function generateForDeal(dealId, { overwrite = false } = {}) {
    const deal = await loadActiveDeal(dealId);
    if (!deal) return { ok: false, skipped: true, check: { reason: "deal-not-found-or-deleted" }, dealId };
    const check = core.shouldGenerateForDeal(state.settings, deal, uniqueFieldName);
    if (!check.ok && !(overwrite && check.reason === "already-numbered")) return { ok: false, skipped: true, check, dealId };
    const prefixProblem = core.prefixFieldProblem(state.settings, deal);
    if (prefixProblem) {
      await addPrefixMissingTimelineCommentOnce(dealId, prefixProblem.field || state.settings.prefixField);
      return { ok: false, skipped: true, check: prefixProblem, dealId };
    }

    let sequenceState = await loadSequenceState();
    let result = null;
    let foundUnique = false;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      result = core.buildNumber(state.settings, deal, sequenceState, core.dealCategoryId(deal));
      if (state.settings.generationMode === "sequential") {
        sequenceState[result.key] = result.nextSequence;
      }
      const exists = await uniqueNumberExists(result.value, dealId);
      if (!exists) {
        foundUnique = true;
        break;
      }
      result = null;
    }
    if (!result || !foundUnique) throw new Error("Не удалось подобрать уникальный номер за 25 попыток");
    await callMethod("crm.deal.update", { id: Number(dealId), fields: { [uniqueFieldName]: result.value } });
    await saveSequenceState(sequenceState);
    return { ok: true, dealId, number: result.value };
  }

  function configuredStageEntries(settings) {
    return Object.entries(settings.stagesByCategory || {}).filter(([, stageId]) => stageId);
  }

  function dealListPage(params, start = 0) {
    return new Promise((resolve, reject) => {
      window.BX24.callMethod("crm.deal.list", { ...params, start }, (result) => {
        if (result.error()) {
          reject(new Error(result.error_description() || result.error()));
          return;
        }
        resolve({
          rows: Array.isArray(result.data()) ? result.data() : [],
          next: result.more() ? result.next() : null,
        });
      });
    });
  }

  function itemListPage(params, start = 0) {
    return new Promise((resolve, reject) => {
      window.BX24.callMethod("crm.item.list", {
        ...params,
        entityTypeId: 2,
        useOriginalUfNames: "Y",
        start,
      }, (result) => {
        if (result.error()) {
          reject(new Error(result.error_description() || result.error()));
          return;
        }
        const data = result.data() || {};
        resolve({
          rows: Array.isArray(data.items) ? data.items.map(normalizeCrmItemDeal).filter(Boolean) : [],
          next: data.next ?? (result.more() ? result.next() : null),
        });
      });
    });
  }

  async function callItemList(params = {}) {
    const rows = [];
    let start = 0;
    do {
      const page = await itemListPage(params, start);
      rows.push(...page.rows);
      start = page.next;
    } while (start !== null && start !== undefined);
    return rows;
  }

  function configuredDealFilter(categoryId, stageId, settings) {
    const filter = {
      "=categoryId": Number(categoryId),
      "=stageId": stageId,
    };
    const startDate = core.dateFilterValue(settings.startDate);
    if (startDate) filter[">=createdTime"] = startDate;
    return filter;
  }

  function configuredDealSelect(settings) {
    return ["id", "title", "categoryId", "stageId", "createdTime", uniqueFieldName, settings.prefixField].filter(Boolean);
  }

  function selectionLog(settings) {
    return configuredStageEntries(settings).map(([categoryId, stageId]) => ({
      categoryId: Number(categoryId),
      stageId,
      filter: configuredDealFilter(categoryId, stageId, settings),
      select: configuredDealSelect(settings),
    }));
  }

  async function startRenumberJob(settings) {
    const revision = settings.settingsRevision || new Date().toISOString();
    await saveSequenceState({});
    const job = {
      active: true,
      revision,
      phase: "clear",
      categoryIndex: 0,
      start: 0,
      clearProcessed: 0,
      cleared: 0,
      processed: 0,
      updated: 0,
      startedAt: new Date().toISOString(),
    };
    await saveRenumberJob(job);
    return job;
  }

  async function processRenumberJobBatch(settings, limit = 30) {
    const entries = configuredStageEntries(settings);
    let job = await loadRenumberJob();
    if (!settings.settingsRevision || !entries.length) {
      job = { active: false, revision: settings.settingsRevision || "", completedAt: new Date().toISOString(), phase: "done", clearProcessed: 0, cleared: 0, processed: 0, updated: 0 };
      await saveRenumberJob(job);
      return { active: false, phase: "done", cleared: 0, processed: 0, updated: 0, done: true };
    }
    if (job && job.revision === settings.settingsRevision && job.active === false) {
      return { active: false, phase: job.phase || "done", processed: 0, updated: 0, totalClearProcessed: job.clearProcessed || 0, totalCleared: job.cleared || 0, totalProcessed: job.processed || 0, totalUpdated: job.updated || 0, done: true, revision: job.revision };
    }
    if (!job || job.revision !== settings.settingsRevision) {
      job = await startRenumberJob(settings);
    }
    job.phase = job.phase || "number";

    const results = [];
    while (results.length < limit && job.active !== false) {
      if (job.phase === "clear") {
        if (job.categoryIndex >= entries.length) {
          job.phase = "number";
          job.categoryIndex = 0;
          job.start = 0;
          await saveRenumberJob(job);
          continue;
        }
        const [categoryId, stageId] = entries[job.categoryIndex];
        const page = await itemListPage({
          order: { id: "ASC" },
          filter: configuredDealFilter(categoryId, stageId, settings),
          select: configuredDealSelect(settings),
        }, Number(job.start || 0));
        const deals = page.rows.filter((deal) => core.isDealAfterStartDate(settings, deal));
        let batchCleared = 0;
        for (const deal of deals) {
          if (String(deal[uniqueFieldName] || "").trim()) {
            await callMethod("crm.deal.update", { id: Number(deal.ID), fields: { [uniqueFieldName]: "" } });
            batchCleared += 1;
            results.push({ ok: true, dealId: deal.ID, cleared: true });
          }
        }
        job.clearProcessed = (job.clearProcessed || 0) + deals.length;
        job.cleared = (job.cleared || 0) + batchCleared;
        if (page.next !== null && page.next !== undefined) {
          job.start = page.next;
        } else {
          job.categoryIndex += 1;
          job.start = 0;
        }
        await saveRenumberJob(job);
        continue;
      }

      if (job.categoryIndex >= entries.length) break;
      const [categoryId, stageId] = entries[job.categoryIndex];
      const page = await itemListPage({
        order: { id: "ASC" },
        filter: configuredDealFilter(categoryId, stageId, settings),
        select: configuredDealSelect(settings),
      }, Number(job.start || 0));
      const deals = page.rows.filter((deal) => core.isDealAfterStartDate(settings, deal));
      let batchUpdated = 0;
      for (const deal of deals) {
        const result = await generateForDeal(deal.ID, { overwrite: true });
        if (result.ok) batchUpdated += 1;
        results.push(result);
      }
      job.processed += deals.length;
      job.updated += batchUpdated;
      if (page.next !== null && page.next !== undefined) {
        job.start = page.next;
      } else {
        job.categoryIndex += 1;
        job.start = 0;
      }
      await saveRenumberJob(job);
    }

    if (job.phase === "clear" && job.categoryIndex >= entries.length) {
      job.phase = "number";
      job.categoryIndex = 0;
      job.start = 0;
      await saveRenumberJob(job);
    }

    if (job.phase !== "clear" && job.categoryIndex >= entries.length) {
      job.active = false;
      job.phase = "done";
      job.completedAt = new Date().toISOString();
      await saveRenumberJob(job);
    }
    return {
      active: job.active,
      phase: job.phase,
      processed: results.length,
      updated: results.filter((item) => item.ok && !item.cleared).length,
      cleared: results.filter((item) => item.cleared).length,
      totalClearProcessed: job.clearProcessed || 0,
      totalCleared: job.cleared || 0,
      totalProcessed: job.processed,
      totalUpdated: job.updated,
      done: !job.active,
      revision: job.revision,
    };
  }

  async function findDealsForConfiguredStages(settings, { includeNumbered = false } = {}) {
    const deals = [];
    for (const [categoryId, stageId] of Object.entries(settings.stagesByCategory || {})) {
      if (!stageId) continue;
      const rows = await callItemList({
        order: { id: "ASC" },
        filter: configuredDealFilter(categoryId, stageId, settings),
        select: configuredDealSelect(settings),
      }).catch(() => []);
      deals.push(...rows.filter((deal) => (includeNumbered || !String(deal[uniqueFieldName] || "").trim()) && core.isDealAfterStartDate(settings, deal)));
    }
    return deals.filter((deal, index, list) => list.findIndex((item) => Number(item.ID) === Number(deal.ID)) === index);
  }

  async function processConfiguredStageDeals({ overwrite = false } = {}) {
    const deals = await findDealsForConfiguredStages(state.settings, { includeNumbered: overwrite });
    if (overwrite) await saveSequenceState({});
    const results = [];
    for (const deal of deals) {
      results.push(await generateForDeal(deal.ID, { overwrite }));
    }
    return {
      scanned: deals.length,
      created: results.filter((item) => item.ok).length,
      skipped: results.filter((item) => item.skipped).length,
      results,
    };
  }

  async function setupFieldAndCard() {
    const field = await ensureUniqueField();
    await loadDealFields();
    renderFields(nodes.prefixField.value || state.settings.prefixField);
    const layout = await configureDealCard();
    return { field, layout };
  }

  async function reloadReferenceData() {
    setStatus("Обновляю справочники...");
    const selectedField = nodes.prefixField.value || state.settings.prefixField;
    state.settings = settingsFromForm();
    await Promise.all([loadCategories(), loadDealFields()]);
    await loadAllStages();
    renderFields(selectedField);
    renderStages();
    renderPrefixFields();
    updatePreview();
    setStatus("Справочники обновлены", "success");
    write({ appVersion, operation: "refresh", stringFields: state.stringFields.length, categories: state.categories.length }, false);
  }

  function showHelp() {
    const settings = settingsFromForm();
    nodes.helpText.textContent = core.helpText(settings.digits, settings.letterLength).text;
    nodes.helpModal.showModal();
  }

  function loadSupportWidget() {
    if (supportWidgetLoading) return supportWidgetLoading;
    supportWidgetLoading = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-support-widget="open-line"]`);
      if (existing) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.async = true;
      script.dataset.supportWidget = "open-line";
      script.src = `${supportWidgetUrl}?${Date.now() / 60000 | 0}`;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", reject, { once: true });
      const firstScript = document.getElementsByTagName("script")[0];
      firstScript.parentNode.insertBefore(script, firstScript);
    });
    return supportWidgetLoading;
  }

  function openSupportWidget() {
    const candidates = [
      () => window.B24?.SiteButton?.show?.(),
      () => window.B24?.SiteButton?.open?.(),
      () => window.Bitrix24SiteButton?.show?.(),
      () => window.Bitrix24SiteButton?.open?.(),
    ];
    for (const open of candidates) {
      try {
        const result = open();
        if (result !== undefined) return true;
      } catch {
        // Widget APIs differ between loader versions; fall through to DOM click.
      }
    }
    const button = document.querySelector(".b24-widget-button-openline, .b24-widget-button-social, .b24-widget-button-inner-container, [class*='b24-widget-button']");
    if (button instanceof HTMLElement) {
      button.click();
      return true;
    }
    return false;
  }

  function forceOpenSupportWidget(attempt = 0) {
    if (openSupportWidget()) return;
    if (attempt >= 16) return;
    window.setTimeout(() => forceOpenSupportWidget(attempt + 1), 300);
  }

  function closeSupport() {
    nodes.supportModal.close();
    nodes.supportBackdrop.hidden = true;
    document.body.classList.remove("support-modal-open");
  }

  function showSupport() {
    nodes.supportBackdrop.hidden = false;
    if (!nodes.supportModal.open) nodes.supportModal.show();
    document.body.classList.add("support-modal-open");
    loadSupportWidget()
      .then(() => forceOpenSupportWidget())
      .catch((error) => write({ appVersion, ok: false, operation: "support-widget", error: error.message }, true));
  }

  async function initApp() {
    if (!window.BX24) {
      setStatus("Откройте приложение внутри Bitrix24", "warning");
      write("Bitrix24 SDK недоступен.", true);
      return;
    }
    window.BX24.init(async () => {
      nodes.appVersionNode.textContent = appVersion;
      restoreLastLog();
      setStatus("Загрузка...");
      await loadAdminAccess();
      await Promise.all([loadCategories(), loadDealFields()]);
      await loadAllStages();
      await loadSettingsWithDefaults();
      renderSettings();
      if (state.isAdmin) {
        await setupFieldAndCard().catch((error) => write({ appVersion, operation: "auto-ensure-field", error: error.message }, true));
      }
      applyAccessControl();
      if (state.isAdmin) setStatus("Настройки загружены", "success");
    });
  }

  nodes.prefixMode.addEventListener("change", () => {
    renderPrefixFields();
    updatePreview();
  });
  nodes.customStartEnabled.addEventListener("change", () => {
    syncCustomStartControls();
    syncNumberOptionsFromCustomStart();
    updatePreview();
  });
  nodes.customStartValue.addEventListener("input", () => {
    syncNumberOptionsFromCustomStart();
    updatePreview();
  });
  nodes.form.addEventListener("input", updatePreview);
  nodes.toggleLog.addEventListener("click", () => {
    setLogVisible(nodes.logPanel.hidden);
  });
  nodes.refresh.addEventListener("click", () => {
    reloadReferenceData().catch((error) => {
      setStatus("Ошибка обновления", "warning");
      write({ appVersion, ok: false, operation: "refresh", error: error.message });
    });
  });
  document.querySelectorAll(".help-button").forEach((button) => button.addEventListener("click", showHelp));
  nodes.closeHelp.addEventListener("click", () => nodes.helpModal.close());
  nodes.supportHelp.addEventListener("click", showSupport);
  nodes.closeSupport.addEventListener("click", closeSupport);
  nodes.supportBackdrop.addEventListener("click", closeSupport);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nodes.supportModal.open) closeSupport();
  });

  nodes.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.isAdmin) {
      setStatus("Сохранение доступно только администратору", "warning");
      return;
    }
    try {
      setStatus("Сохраняю и перенумеровываю выборку...");
      await setupFieldAndCard();
      const settings = await saveSettings({ ...settingsFromForm(), settingsRevision: new Date().toISOString() });
      await startRenumberJob(settings);
      const processing = await processRenumberJobBatch(settings, 30);
      setStatus(processing.done ? `Сохранено. Очищено старых номеров: ${processing.totalCleared}, обновлено номеров: ${processing.totalUpdated}` : `Сохранено. Перенумерация запущена, очищено: ${processing.totalCleared}, обновлено: ${processing.totalUpdated}`, "success");
      write({ appVersion, ok: true, operation: "save-settings-and-start-renumber", settings, selection: selectionLog(settings), processing });
    } catch (error) {
      setStatus("Ошибка сохранения", "warning");
      write({ appVersion, ok: false, operation: "save-settings-and-number", error: error.message });
    }
  });

  initApp().catch((error) => {
    setStatus("Ошибка загрузки", "warning");
    write({ appVersion, ok: false, operation: "init", error: error.message });
  });
})();

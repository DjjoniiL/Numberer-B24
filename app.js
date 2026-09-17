(function () {
  "use strict";

  const appVersion = "Numberer B24 v.3.5";
  const settingsOption = "numbererB24Settings";
  const sequenceOption = "numbererB24SequenceState";
  const renumberJobOption = "numbererB24RenumberJob";
  const prefixMissingCommentsOption = "numbererB24PrefixMissingComments";
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
    startDate: document.querySelector("#startDate"),
    digitsChoices: document.querySelector("#digitsChoices"),
    letterChoices: document.querySelector("#letterChoices"),
    stageMatrix: document.querySelector("#stageMatrix"),
    numberPreview: document.querySelector("#numberPreview"),
    log: document.querySelector("#log"),
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

  function write(value, reveal = true) {
    nodes.log.hidden = !reveal;
    nodes.log.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
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
    const compactStages = state.categories.length > 0 && state.categories.length < 4;
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
    nodes.startDate.value = settings.startDate;
    renderFields(settings.prefixField);
    nodes.form.elements.generationMode.value = settings.generationMode;
    renderSegmented(nodes.digitsChoices, "digits", core.digitOptions, (value) => `${value} цифры`, settings.digits);
    renderSegmented(nodes.letterChoices, "letterLength", core.letterOptions, (value) => "A".repeat(value), settings.letterLength);
    renderPrefixFields();
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
    sequenceState[key] = 1;
    const result = core.buildNumber(settings, deal, sequenceState, 0);
    nodes.numberPreview.textContent = result.value || `${"A".repeat(settings.letterLength)}${"0".repeat(settings.digits)}`;
  }

  async function uniqueNumberExists(value, exceptDealId) {
    const rows = await callList("crm.deal.list", {
      filter: { [`=${uniqueFieldName}`]: value },
      select: ["ID", uniqueFieldName],
    }).catch(() => []);
    return rows.some((deal) => Number(deal.ID) !== Number(exceptDealId));
  }

  async function generateForDeal(dealId, { overwrite = false } = {}) {
    const deal = await callMethod("crm.deal.get", { id: Number(dealId) });
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

  async function startRenumberJob(settings) {
    const revision = settings.settingsRevision || new Date().toISOString();
    await saveSequenceState({});
    const job = {
      active: true,
      revision,
      categoryIndex: 0,
      start: 0,
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
      job = { active: false, revision: settings.settingsRevision || "", completedAt: new Date().toISOString(), processed: 0, updated: 0 };
      await saveRenumberJob(job);
      return { active: false, processed: 0, updated: 0, done: true };
    }
    if (job && job.revision === settings.settingsRevision && job.active === false) {
      return { active: false, processed: 0, updated: 0, totalProcessed: job.processed || 0, totalUpdated: job.updated || 0, done: true, revision: job.revision };
    }
    if (!job || job.revision !== settings.settingsRevision) {
      job = await startRenumberJob(settings);
    }

    const results = [];
    while (job.categoryIndex < entries.length && results.length < limit) {
      const [categoryId, stageId] = entries[job.categoryIndex];
      const filter = {
        "=CATEGORY_ID": Number(categoryId),
        "=STAGE_ID": stageId,
      };
      const startDate = core.dateFilterValue(settings.startDate);
      if (startDate) filter[">=DATE_CREATE"] = startDate;

      const page = await dealListPage({
        order: { ID: "ASC" },
        filter,
        select: ["ID", "TITLE", "CATEGORY_ID", "STAGE_ID", "DATE_CREATE", uniqueFieldName, settings.prefixField].filter(Boolean),
      }, Number(job.start || 0));
      const deals = page.rows.filter((deal) => core.isDealAfterStartDate(settings, deal));
      let batchUpdated = 0;
      for (const deal of deals) {
        if (results.length >= limit) break;
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

    if (job.categoryIndex >= entries.length) {
      job.active = false;
      job.completedAt = new Date().toISOString();
      await saveRenumberJob(job);
    }
    return {
      active: job.active,
      processed: results.length,
      updated: results.filter((item) => item.ok).length,
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
      const filter = {
        "=CATEGORY_ID": Number(categoryId),
        "=STAGE_ID": stageId,
      };
      const startDate = core.dateFilterValue(settings.startDate);
      if (startDate) filter[">=DATE_CREATE"] = startDate;
      const rows = await callList("crm.deal.list", {
        order: { ID: "ASC" },
        filter,
        select: ["ID", "TITLE", "CATEGORY_ID", "STAGE_ID", "DATE_CREATE", uniqueFieldName, settings.prefixField].filter(Boolean),
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
  nodes.form.addEventListener("input", updatePreview);
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
      setStatus(processing.done ? `Сохранено. Обновлено номеров: ${processing.totalUpdated}` : `Сохранено. Перенумерация запущена, обновлено: ${processing.totalUpdated}`, "success");
      write({ appVersion, ok: true, operation: "save-settings-and-start-renumber", settings, processing });
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

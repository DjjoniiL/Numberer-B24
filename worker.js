(function () {
  "use strict";

  const appVersion = "Numberer B24 worker v.3.5";
  const settingsOption = "numbererB24Settings";
  const sequenceOption = "numbererB24SequenceState";
  const renumberJobOption = "numbererB24RenumberJob";
  const prefixMissingCommentsOption = "numbererB24PrefixMissingComments";
  const uniqueFieldName = "UF_CRM_UNIQUE_NUMBER";
  const core = window.NumbererCore;
  const pollMs = 15000;

  let settings = core.normalizeSettings();
  let busy = false;
  let timer = null;

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

  function optionJson(value, fallback) {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  async function loadSettings() {
    const data = await callMethod("app.option.get", { option: settingsOption }).catch(() => null);
    settings = core.normalizeSettings(optionJson(data, core.defaultSettings));
    return settings;
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

  function prefixMissingCommentKey(dealId, fieldName) {
    return [Number(dealId), fieldName, settings.settingsRevision || "current"].join("|");
  }

  async function addPrefixMissingTimelineCommentOnce(dealId, fieldName) {
    const comments = await loadPrefixMissingComments();
    const key = prefixMissingCommentKey(dealId, fieldName);
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

  async function uniqueNumberExists(value, exceptDealId) {
    const rows = await callList("crm.deal.list", {
      filter: { [`=${uniqueFieldName}`]: value },
      select: ["ID", uniqueFieldName],
    }).catch(() => []);
    return rows.some((deal) => Number(deal.ID) !== Number(exceptDealId));
  }

  async function generateForDeal(dealId, { overwrite = false } = {}) {
    const deal = await callMethod("crm.deal.get", { id: Number(dealId) });
    const check = core.shouldGenerateForDeal(settings, deal, uniqueFieldName);
    if (!check.ok && !(overwrite && check.reason === "already-numbered")) return { ok: false, skipped: true, check, dealId };
    const prefixProblem = core.prefixFieldProblem(settings, deal);
    if (prefixProblem) {
      await addPrefixMissingTimelineCommentOnce(dealId, prefixProblem.field || settings.prefixField);
      return { ok: false, skipped: true, check: prefixProblem, dealId };
    }

    let sequenceState = await loadSequenceState();
    let result = null;
    let foundUnique = false;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      result = core.buildNumber(settings, deal, sequenceState, core.dealCategoryId(deal));
      if (settings.generationMode === "sequential") sequenceState[result.key] = result.nextSequence;
      const exists = await uniqueNumberExists(result.value, dealId);
      if (!exists) {
        foundUnique = true;
        break;
      }
      result = null;
    }
    if (!result || !foundUnique) throw new Error("Не удалось подобрать уникальный номер");
    await callMethod("crm.deal.update", { id: Number(dealId), fields: { [uniqueFieldName]: result.value } });
    await saveSequenceState(sequenceState);
    return { ok: true, dealId, number: result.value };
  }

  function configuredStageEntries() {
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

  async function startRenumberJob() {
    const revision = settings.settingsRevision || "";
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

  async function processRenumberJobBatch(limit = 20) {
    const entries = configuredStageEntries();
    if (!settings.settingsRevision || !entries.length) return { active: false, skipped: true };
    let job = await loadRenumberJob();
    if (job && job.revision === settings.settingsRevision && job.active === false) {
      return { active: false, processed: 0, updated: 0, totalProcessed: job.processed || 0, totalUpdated: job.updated || 0, done: true, revision: job.revision };
    }
    if (!job || job.revision !== settings.settingsRevision) {
      job = await startRenumberJob();
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
        select: ["ID", "CATEGORY_ID", "STAGE_ID", "DATE_CREATE", uniqueFieldName, settings.prefixField].filter(Boolean),
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

  async function findDealsForConfiguredStages() {
    const deals = [];
    for (const [categoryId, stageId] of Object.entries(settings.stagesByCategory || {})) {
      if (!stageId) continue;
      const rows = await callList("crm.deal.list", {
        order: { ID: "ASC" },
        filter: {
          "=CATEGORY_ID": Number(categoryId),
          "=STAGE_ID": stageId,
          ...(core.dateFilterValue(settings.startDate) ? { ">=DATE_CREATE": core.dateFilterValue(settings.startDate) } : {}),
        },
        select: ["ID", "CATEGORY_ID", "STAGE_ID", "DATE_CREATE", uniqueFieldName, settings.prefixField].filter(Boolean),
      }).catch(() => []);
      deals.push(...rows.filter((deal) => !String(deal[uniqueFieldName] || "").trim() && core.isDealAfterStartDate(settings, deal)));
    }
    return deals.filter((deal, index, list) => list.findIndex((item) => Number(item.ID) === Number(deal.ID)) === index);
  }

  async function processConfiguredStageDeals() {
    const deals = await findDealsForConfiguredStages();
    const limitedDeals = deals.slice(0, 20);
    const results = [];
    for (const deal of limitedDeals) {
      results.push(await generateForDeal(deal.ID));
    }
    return {
      scanned: deals.length,
      processed: limitedDeals.length,
      created: results.filter((item) => item.ok).length,
      skipped: results.filter((item) => item.skipped).length,
      results,
    };
  }

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      await loadSettings();
      const renumber = await processRenumberJobBatch();
      const result = renumber?.active || renumber?.updated ? renumber : await processConfiguredStageDeals();
      localStorage.setItem("numbererB24WorkerLastRun", JSON.stringify({ appVersion, result, at: new Date().toISOString() }));
    } catch (error) {
      localStorage.setItem("numbererB24WorkerLastRun", JSON.stringify({ appVersion, error: error.message, at: new Date().toISOString() }));
    } finally {
      busy = false;
    }
  }

  function boot() {
    if (!window.BX24?.init) return;
    window.BX24.init(async () => {
      await tick();
      timer = window.setInterval(tick, pollMs);
      window.addEventListener("beforeunload", () => {
        if (timer) window.clearInterval(timer);
      });
    });
  }

  boot();
})();

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../numbering-core");

test("formats sequential letters as base 26 with fixed length", () => {
  assert.equal(core.lettersFromIndex(0, 3), "AAA");
  assert.equal(core.lettersFromIndex(25, 3), "AAZ");
  assert.equal(core.lettersFromIndex(26, 3), "ABA");
});

test("builds sequential number with manual prefix", () => {
  const settings = core.normalizeSettings({
    prefixMode: "manual",
    manualPrefix: "CRM",
    digits: 3,
    letterLength: 3,
    generationMode: "sequential",
  });
  const first = core.buildNumber(settings, {}, {}, 0);
  assert.equal(first.value, "CRM_AAA000");
  const second = core.buildNumber(settings, {}, { [first.key]: first.nextSequence }, 0);
  assert.equal(second.value, "CRM_AAA001");
});

test("uses string field as prefix source", () => {
  const settings = core.normalizeSettings({
    prefixMode: "field",
    prefixField: "UF_CRM_PREFIX",
    digits: 4,
    letterLength: 4,
  });
  const result = core.buildNumber(settings, { UF_CRM_PREFIX: "ACME " }, {}, 0);
  assert.equal(result.value, "ACME_AAAA0000");
});

test("reads Bitrix custom fields by original and camel aliases", () => {
  assert.equal(core.fieldValue({ ufCrm1789543990987: "FSA" }, "UF_CRM_1789543990987"), "FSA");
  assert.equal(core.fieldValue({ UF_CRM_UNIQUE_NUMBER: "NUM_AA001" }, "ufCrmUniqueNumber"), "NUM_AA001");

  const settings = core.normalizeSettings({
    prefixMode: "field",
    prefixField: "UF_CRM_1789543990987",
    digits: 5,
    letterLength: 3,
  });
  const deal = { ufCrm1789543990987: "LTE", categoryId: 0, stageId: "EXECUTING" };
  assert.equal(core.buildNumber(settings, deal, {}, 0).value, "LTE_AAA00000");
});

test("uses custom start number and derives number shape", () => {
  const settings = core.normalizeSettings({
    prefixMode: "manual",
    manualPrefix: "NUM",
    customStartEnabled: true,
    customStartValue: "AAA123456",
  });
  assert.equal(settings.letterLength, 3);
  assert.equal(settings.digits, 6);
  assert.equal(settings.generationMode, "sequential");
  assert.equal(core.customStartSequence(settings), 123456);
  const first = core.buildNumber(settings, {}, {}, 0);
  assert.equal(first.value, "NUM_AAA123456");
  const second = core.buildNumber(settings, {}, { [first.key]: first.nextSequence }, 0);
  assert.equal(second.value, "NUM_AAA123457");
});

test("accepts separator inside custom start value", () => {
  const settings = core.normalizeSettings({
    prefixMode: "field",
    prefixField: "UF_CRM_PREFIX",
    customStartEnabled: true,
    customStartValue: "FSA_008791",
  });
  assert.equal(settings.customStartValue, "FSA008791");
  assert.equal(settings.letterLength, 3);
  assert.equal(settings.digits, 6);
  const first = core.buildNumber(settings, { UF_CRM_PREFIX: "LTE" }, {}, 0);
  assert.equal(first.value, "LTE_FSA008791");
});

test("detects empty selected prefix field", () => {
  const settings = core.normalizeSettings({
    prefixMode: "field",
    prefixField: "UF_CRM_PREFIX",
  });
  assert.equal(core.prefixFieldProblem(settings, { UF_CRM_PREFIX: "" }).reason, "prefix-field-empty");
  assert.equal(core.prefixFieldProblem(settings, { UF_CRM_PREFIX: "   " }).reason, "prefix-field-empty");
  assert.equal(core.prefixFieldProblem(settings, { UF_CRM_PREFIX: "ACME" }), null);
  assert.equal(core.prefixFieldProblem({ prefixMode: "manual" }, {}), null);
});

test("does not duplicate a prefix separator", () => {
  const settings = core.normalizeSettings({
    prefixMode: "manual",
    manualPrefix: "LTE_",
    digits: 4,
    letterLength: 3,
  });
  const result = core.buildNumber(settings, {}, {}, 0);
  assert.equal(result.value, "LTE_AAA0000");
});

test("explains capacities", () => {
  const info = core.helpText(3, 4);
  assert.equal(info.letterCount, 456976);
  assert.equal(info.digitCount, 1000);
  assert.match(info.text, /26\^4/);
});

test("checks configured target stage and existing number", () => {
  const settings = core.normalizeSettings({ stagesByCategory: { 0: "NEW" } });
  assert.equal(core.shouldGenerateForDeal(settings, { CATEGORY_ID: 0, STAGE_ID: "NEW" }, "UF_CRM_UNIQUE_NUMBER").ok, true);
  assert.equal(core.shouldGenerateForDeal(settings, { CATEGORY_ID: 0, STAGE_ID: "WON" }, "UF_CRM_UNIQUE_NUMBER").reason, "stage-mismatch");
  assert.equal(core.shouldGenerateForDeal(settings, { CATEGORY_ID: 0, STAGE_ID: "NEW", UF_CRM_UNIQUE_NUMBER: "A" }, "UF_CRM_UNIQUE_NUMBER").reason, "already-numbered");
  assert.equal(core.shouldGenerateForDeal(settings, { categoryId: 0, STAGE_ID: "NEW", ufCrmUniqueNumber: "A" }, "UF_CRM_UNIQUE_NUMBER").reason, "already-numbered");
});

test("skips deals created before the configured start date", () => {
  const settings = core.normalizeSettings({ stagesByCategory: { 0: "NEW" }, startDate: "2025-09-12" });
  assert.equal(core.dateFilterValue(settings.startDate), "2025-09-12T00:00:00");
  assert.equal(core.shouldGenerateForDeal(settings, { CATEGORY_ID: 0, STAGE_ID: "NEW", DATE_CREATE: "2025-09-11T23:59:59" }, "UF_CRM_UNIQUE_NUMBER").reason, "created-before-start-date");
  assert.equal(core.shouldGenerateForDeal(settings, { CATEGORY_ID: 0, STAGE_ID: "NEW", DATE_CREATE: "2025-09-12T00:00:00" }, "UF_CRM_UNIQUE_NUMBER").ok, true);
});

test("keeps requested default prefix and can calculate two week cutoff", () => {
  assert.equal(core.defaultSettings.manualPrefix, "NUM");
  assert.equal(core.defaultSettings.letterLength, 2);
  assert.equal(core.defaultSettings.digits, 4);
  assert.deepEqual(core.letterOptions, [2, 3, 4, 5]);
  assert.equal(core.dateDaysAgo(14, new Date("2025-09-16T12:00:00")), "2025-09-02");
});

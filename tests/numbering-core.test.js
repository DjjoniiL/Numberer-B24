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
  assert.equal(first.value, "CRM_AAA001");
  const second = core.buildNumber(settings, {}, { [first.key]: first.nextSequence }, 0);
  assert.equal(second.value, "CRM_AAA002");
});

test("uses string field as prefix source", () => {
  const settings = core.normalizeSettings({
    prefixMode: "field",
    prefixField: "UF_CRM_PREFIX",
    digits: 4,
    letterLength: 4,
  });
  const result = core.buildNumber(settings, { UF_CRM_PREFIX: "ACME " }, {}, 0);
  assert.equal(result.value, "ACME_AAAA0001");
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
  assert.equal(core.buildNumber(settings, deal, {}, 0).value, "LTE_AAA00001");
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

test("uses original default shape and starts from 0001", () => {
  const settings = core.normalizeSettings({
    prefixMode: "manual",
    manualPrefix: "NUM",
  });
  assert.equal(settings.letterLength, 2);
  assert.equal(settings.digits, 4);
  const first = core.buildNumber(settings, {}, {}, 0);
  assert.equal(first.value, "NUM_AA0001");
});

test("accepts numeric-only custom start with default shape", () => {
  const settings = core.normalizeSettings({
    prefixMode: "manual",
    manualPrefix: "NUM",
    customStartEnabled: true,
    customStartValue: "1",
  });
  assert.equal(settings.customStartValue, "AA0001");
  assert.equal(settings.letterLength, 2);
  assert.equal(settings.digits, 4);
  assert.equal(core.customStartSequence(settings), 1);
  assert.equal(core.buildNumber(settings, {}, {}, 0).value, "NUM_AA0001");
});

test("pads numeric-only custom start and clamps zero to 00001", () => {
  const padded = core.normalizeSettings({
    manualPrefix: "NUM",
    customStartEnabled: true,
    customStartValue: "42",
  });
  assert.equal(padded.customStartValue, "AA0042");
  assert.equal(core.buildNumber(padded, {}, {}, 0).value, "NUM_AA0042");

  const zero = core.normalizeSettings({
    manualPrefix: "NUM",
    customStartEnabled: true,
    customStartValue: "0",
  });
  assert.equal(zero.customStartValue, "AA0001");
  assert.equal(core.buildNumber(zero, {}, {}, 0).value, "NUM_AA0001");
});

test("skips all-zero numbers when sequential numbering rolls over", () => {
  const settings = core.normalizeSettings({
    prefixMode: "manual",
    manualPrefix: "CRM",
    digits: 4,
    letterLength: 2,
    generationMode: "sequential",
  });
  const key = core.sequenceKey(settings, 0);
  const lastInBlock = core.buildNumber(settings, {}, { [key]: 9999 }, 0);
  assert.equal(lastInBlock.value, "CRM_AA9999");
  assert.equal(lastInBlock.nextSequence, 10001);

  const nextBlock = core.buildNumber(settings, {}, { [key]: lastInBlock.nextSequence }, 0);
  assert.equal(nextBlock.value, "CRM_AB0001");
});

test("repairs legacy sequence state that points to an all-zero number", () => {
  const settings = core.normalizeSettings({
    prefixMode: "manual",
    manualPrefix: "CRM",
    digits: 4,
    letterLength: 2,
  });
  const key = core.sequenceKey(settings, 0);
  const repaired = core.buildNumber(settings, {}, { [key]: 10000 }, 0);
  assert.equal(repaired.value, "CRM_AB0001");
  assert.equal(repaired.number, "0001");
});

test("random mode never returns an all-zero numeric part", () => {
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const settings = core.normalizeSettings({
      prefixMode: "manual",
      manualPrefix: "CRM",
      digits: 4,
      letterLength: 2,
      generationMode: "random",
    });
    const result = core.buildNumber(settings, {}, {}, 0);
    assert.equal(result.value, "CRM_AA0001");
    assert.equal(result.number, "0001");
  } finally {
    Math.random = originalRandom;
  }
});

test("falls back to default start when custom start shape is unsupported", () => {
  const settings = core.normalizeSettings({
    manualPrefix: "NUM",
    customStartEnabled: true,
    customStartValue: "1234567",
  });
  assert.equal(settings.customStartValue, "1234567");
  assert.equal(settings.letterLength, 2);
  assert.equal(settings.digits, 4);
  assert.equal(core.buildNumber(settings, {}, {}, 0).value, "NUM_AA0001");
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

test("custom start with all-zero numeric part is normalized to one", () => {
  const settings = core.normalizeSettings({
    prefixMode: "manual",
    manualPrefix: "NUM",
    customStartEnabled: true,
    customStartValue: "AB0000",
  });
  assert.equal(settings.customStartValue, "AB0001");
  assert.equal(core.buildNumber(settings, {}, {}, 0).value, "NUM_AB0001");
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
  assert.equal(result.value, "LTE_AAA0001");
});

test("explains capacities", () => {
  const info = core.helpText(3, 4);
  assert.equal(info.letterCount, 456976);
  assert.equal(info.digitCount, 999);
  assert.match(info.text, /26\^4/);
  assert.match(info.text, /001/);
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

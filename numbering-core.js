(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NumbererCore = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  "use strict";

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digitOptions = [3, 4, 5, 6];
  const letterOptions = [2, 3, 4, 5];

  const defaultSettings = {
    prefixMode: "manual",
    prefixField: "",
    manualPrefix: "NUM",
    digits: 4,
    letterLength: 2,
    generationMode: "sequential",
    customStartEnabled: false,
    customStartValue: "",
    startDate: "",
    stagesByCategory: {},
  };

  function dateDaysAgo(days, now = new Date()) {
    const date = new Date(now);
    date.setDate(date.getDate() - Number(days || 0));
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function normalizeSettings(settings) {
    const source = settings && typeof settings === "object" ? settings : {};
    const customStartEnabled = source.customStartEnabled === true || source.customStartEnabled === "on" || source.customStartEnabled === "true";
    const customStartValue = normalizeStartNumberValue(source.customStartValue);
    const customStartPattern = customStartEnabled ? parseStartNumberPattern(customStartValue) : null;
    const digits = customStartPattern?.digits || (digitOptions.includes(Number(source.digits)) ? Number(source.digits) : defaultSettings.digits);
    const letterLength = customStartPattern?.letterLength || (letterOptions.includes(Number(source.letterLength)) ? Number(source.letterLength) : defaultSettings.letterLength);
    return {
      ...defaultSettings,
      ...source,
      prefixMode: source.prefixMode === "field" ? "field" : "manual",
      prefixField: String(source.prefixField || ""),
      manualPrefix: String(source.manualPrefix || ""),
      digits,
      letterLength,
      generationMode: customStartEnabled ? "sequential" : (source.generationMode === "random" ? "random" : "sequential"),
      customStartEnabled,
      customStartValue,
      startDate: normalizeDateOnly(source.startDate),
      stagesByCategory: source.stagesByCategory && typeof source.stagesByCategory === "object" ? source.stagesByCategory : {},
    };
  }

  function normalizeDateOnly(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return "";
    const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00`);
    return Number.isNaN(date.getTime()) ? "" : `${match[1]}-${match[2]}-${match[3]}`;
  }

  function dateFilterValue(value) {
    const date = normalizeDateOnly(value);
    return date ? `${date}T00:00:00` : "";
  }

  function cleanPrefix(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^0-9A-Za-zА-Яа-яЁё_-]/g, "")
      .slice(0, 32);
  }

  function pow26(length) {
    return Math.pow(26, Number(length) || 0);
  }

  function numberCapacity(digits) {
    return Math.pow(10, Number(digits) || 0);
  }

  function formatNumber(value, digits) {
    const size = numberCapacity(digits);
    const normalized = ((Number(value) || 0) % size + size) % size;
    return String(normalized).padStart(Number(digits), "0");
  }

  function lettersFromIndex(index, length) {
    const total = pow26(length);
    let value = ((Number(index) || 0) % total + total) % total;
    let out = "";
    for (let i = 0; i < length; i += 1) {
      const code = value % 26;
      out = alphabet[code] + out;
      value = Math.floor(value / 26);
    }
    return out;
  }

  function lettersToIndex(letters) {
    const value = String(letters || "").toUpperCase();
    let index = 0;
    for (let i = 0; i < value.length; i += 1) {
      const code = alphabet.indexOf(value[i]);
      if (code < 0) return null;
      index = index * 26 + code;
    }
    return index;
  }

  function normalizeStartNumberValue(value) {
    return String(value || "").trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
  }

  function parseStartNumberPattern(value) {
    const normalized = normalizeStartNumberValue(value);
    const match = normalized.match(/^([A-Z]+)(\d+)$/);
    if (!match) return null;
    const letterLength = match[1].length;
    const digits = match[2].length;
    if (!letterOptions.includes(letterLength) || !digitOptions.includes(digits)) return null;
    return {
      value: normalized,
      letters: match[1],
      number: match[2],
      letterLength,
      digits,
    };
  }

  function customStartSequence(settings) {
    const normalized = normalizeSettings({ ...settings, customStartEnabled: false });
    if (!settings?.customStartEnabled) return 0;
    const pattern = parseStartNumberPattern(settings.customStartValue);
    if (!pattern) return 0;
    const letterIndex = lettersToIndex(pattern.letters);
    if (letterIndex === null) return 0;
    const sequence = letterIndex * numberCapacity(normalized.digits) + Number(pattern.number);
    const capacity = pow26(normalized.letterLength) * numberCapacity(normalized.digits);
    return sequence % capacity;
  }

  function randomInt(max) {
    return Math.floor(Math.random() * Math.max(1, Number(max) || 1));
  }

  function randomLetters(length) {
    let out = "";
    for (let i = 0; i < length; i += 1) out += alphabet[randomInt(26)];
    return out;
  }

  function sequenceKey(settings, categoryId) {
    const normalized = normalizeSettings(settings);
    const prefixKey = normalized.prefixMode === "field" ? `field:${normalized.prefixField}` : `manual:${cleanPrefix(normalized.manualPrefix)}`;
    const startKey = normalized.customStartEnabled ? `start:${normalized.customStartValue}` : "start:default";
    return [String(categoryId ?? "0"), prefixKey, normalized.digits, normalized.letterLength, startKey].join("|");
  }

  function buildNumber(settings, deal, sequenceState, categoryId) {
    const normalized = normalizeSettings(settings);
    const prefixSource = normalized.prefixMode === "field" ? deal?.[normalized.prefixField] : normalized.manualPrefix;
    const prefix = cleanPrefix(prefixSource);
    const key = sequenceKey(normalized, categoryId);
    const state = sequenceState && typeof sequenceState === "object" ? sequenceState : {};
    const letterCapacity = pow26(normalized.letterLength);
    const numericCapacity = numberCapacity(normalized.digits);
    const sequenceCapacity = letterCapacity * numericCapacity;
    const configuredStart = customStartSequence(normalized);
    const current = state[key] === undefined || state[key] === null ? configuredStart : Number(state[key] || 0);

    let letters;
    let number;
    let nextSequence = current;
    if (normalized.generationMode === "random") {
      letters = randomLetters(normalized.letterLength);
      number = formatNumber(randomInt(numericCapacity), normalized.digits);
    } else {
      letters = lettersFromIndex(Math.floor(current / numericCapacity), normalized.letterLength);
      number = formatNumber(current % numericCapacity, normalized.digits);
      nextSequence = (current + 1) % sequenceCapacity;
    }

    const separator = prefix && !/[_-]$/.test(prefix) ? "_" : "";
    return {
      value: `${prefix}${separator}${letters}${number}`,
      prefix,
      letters,
      number,
      key,
      nextSequence,
      capacity: sequenceCapacity,
    };
  }

  function prefixFieldProblem(settings, deal) {
    const normalized = normalizeSettings(settings);
    if (normalized.prefixMode !== "field") return null;
    if (!normalized.prefixField) return { reason: "prefix-field-not-selected" };
    const rawValue = deal?.[normalized.prefixField];
    if (cleanPrefix(rawValue)) return null;
    return {
      reason: "prefix-field-empty",
      field: normalized.prefixField,
    };
  }

  function helpText(digits, letterLength) {
    const letterCount = pow26(letterLength);
    const digitCount = numberCapacity(digits);
    const total = letterCount * digitCount;
    return {
      letterCount,
      digitCount,
      total,
      text: `В латинском алфавите 26 букв. Формат ${"A".repeat(letterLength)} дает 26^${letterLength} = ${letterCount.toLocaleString("ru-RU")} буквенных вариантов. Формат из ${digits} цифр дает ${digitCount.toLocaleString("ru-RU")} числовых вариантов от ${"0".repeat(digits)} до ${"9".repeat(digits)}. Вместе это до ${total.toLocaleString("ru-RU")} комбинаций на один префикс.`,
    };
  }

  function dealCategoryId(deal) {
    const raw = deal?.CATEGORY_ID ?? deal?.categoryId ?? 0;
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  }

  function dealCreatedAt(deal) {
    const raw = deal?.DATE_CREATE ?? deal?.dateCreate ?? "";
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function isDealAfterStartDate(settings, deal) {
    const normalized = normalizeSettings(settings);
    const startDate = dateFilterValue(normalized.startDate);
    if (!startDate) return true;
    const createdAt = dealCreatedAt(deal);
    if (!createdAt) return false;
    return createdAt.getTime() >= new Date(startDate).getTime();
  }

  function shouldGenerateForDeal(settings, deal, uniqueField) {
    const normalized = normalizeSettings(settings);
    const categoryId = dealCategoryId(deal);
    const targetStage = normalized.stagesByCategory[String(categoryId)];
    if (!targetStage) return { ok: false, reason: "stage-not-configured", categoryId };
    if (String(deal?.STAGE_ID || "") !== String(targetStage)) return { ok: false, reason: "stage-mismatch", categoryId, targetStage };
    if (!isDealAfterStartDate(normalized, deal)) return { ok: false, reason: "created-before-start-date", categoryId, targetStage, startDate: normalized.startDate };
    if (uniqueField && String(deal?.[uniqueField] || "").trim()) return { ok: false, reason: "already-numbered", categoryId, targetStage };
    return { ok: true, categoryId, targetStage };
  }

  return {
    alphabet,
    digitOptions,
    letterOptions,
    defaultSettings,
    dateDaysAgo,
    normalizeSettings,
    normalizeDateOnly,
    dateFilterValue,
    cleanPrefix,
    prefixFieldProblem,
    pow26,
    numberCapacity,
    formatNumber,
    lettersFromIndex,
    lettersToIndex,
    normalizeStartNumberValue,
    parseStartNumberPattern,
    customStartSequence,
    randomLetters,
    sequenceKey,
    buildNumber,
    helpText,
    dealCategoryId,
    dealCreatedAt,
    isDealAfterStartDate,
    shouldGenerateForDeal,
  };
});

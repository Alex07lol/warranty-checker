"use strict";

const MONTH_NAMES = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11
};

/**
 * Parses price and extracts currency when unambiguous.
 * Returns { purchasePrice, currency, warning }
 */
function normalizePrice(rawPrice, existingCurrency) {
  if (rawPrice === undefined || rawPrice === null || rawPrice === "") {
    return { purchasePrice: undefined, currency: existingCurrency };
  }

  if (typeof rawPrice === "number") {
    return { purchasePrice: rawPrice, currency: existingCurrency };
  }

  let str = String(rawPrice).trim();
  let detectedCurrency = existingCurrency;

  // Check currency prefix / suffix
  if (/(?:^₹|INR|Rs\.?)/i.test(str)) {
    if (!detectedCurrency) detectedCurrency = "INR";
    str = str.replace(/₹|INR|Rs\.?/gi, "");
  } else if (/(?:^\$|USD)/i.test(str)) {
    if (!detectedCurrency) detectedCurrency = "USD";
    str = str.replace(/\$|USD/gi, "");
  } else if (/(?:^€|EUR)/i.test(str)) {
    if (!detectedCurrency) detectedCurrency = "EUR";
    str = str.replace(/€|EUR/gi, "");
  } else if (/(?:^£|GBP)/i.test(str)) {
    if (!detectedCurrency) detectedCurrency = "GBP";
    str = str.replace(/£|GBP/gi, "");
  }

  // Remove commas used as thousand separators e.g. "89,999.00"
  str = str.replace(/,/g, "").trim();

  // Parse as float
  const parsed = Number(str);
  return {
    purchasePrice: Number.isNaN(parsed) ? NaN : parsed,
    currency: detectedCurrency
  };
}

/**
 * Deterministic date parser.
 * Supports:
 * - YYYY-MM-DD or YYYY/MM/DD
 * - DD/MM/YYYY or MM/DD/YYYY
 * - "10 May 2025" or "May 10, 2025"
 *
 * Returns { date: Date | null, warning?: string }
 */
function normalizeDate(rawDate, fieldName = "date", preferredFormat = "DD/MM/YYYY") {
  if (rawDate === undefined || rawDate === null || rawDate === "") {
    return { date: undefined };
  }

  if (rawDate instanceof Date) {
    return { date: rawDate };
  }

  const str = String(rawDate).trim();
  if (!str) return { date: undefined };

  // 1. ISO format: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(str);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    const d = new Date(year, month, day);
    if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
      return { date: d };
    }
    return { date: new Date(NaN) };
  }

  // 2. Textual month format: "10 May 2025", "May 10 2025", "10-May-2025", "May 10, 2025"
  const textMatch = /^(\d{1,2})[-/\s]+([a-zA-Z]+)[-/\s,]+(\d{4})$/.exec(str) ||
                    /^([a-zA-Z]+)[-/\s]+(\d{1,2})[-/\s,]+(\d{4})$/.exec(str);
  if (textMatch) {
    let day;
    let monthStr;
    let year;
    if (isNaN(Number(textMatch[1]))) {
      // Month first: "May 10, 2025"
      monthStr = textMatch[1].toLowerCase();
      day = Number(textMatch[2]);
      year = Number(textMatch[3]);
    } else {
      // Day first: "10 May 2025"
      day = Number(textMatch[1]);
      monthStr = textMatch[2].toLowerCase();
      year = Number(textMatch[3]);
    }

    const month = MONTH_NAMES[monthStr];
    if (month !== undefined) {
      const d = new Date(year, month, day);
      if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
        return { date: d };
      }
    }
    return { date: new Date(NaN) };
  }

  // 3. Numeric slash/dash format: "12/03/2025" or "03/12/2025"
  const numMatch = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(str);
  if (numMatch) {
    const part1 = Number(numMatch[1]);
    const part2 = Number(numMatch[2]);
    const year = Number(numMatch[3]);

    let day;
    let month;
    let warning;

    if (part1 > 12 && part2 <= 12) {
      // Definitely DD/MM/YYYY
      day = part1;
      month = part2 - 1;
    } else if (part2 > 12 && part1 <= 12) {
      // Definitely MM/DD/YYYY
      month = part1 - 1;
      day = part2;
    } else if (part1 <= 12 && part2 <= 12) {
      // Ambiguous!
      if (preferredFormat === "MM/DD/YYYY") {
        month = part1 - 1;
        day = part2;
        warning = `Ambiguous numeric date '${str}' in field '${fieldName}' interpreted as MM/DD/YYYY`;
      } else {
        // Default DD/MM/YYYY
        day = part1;
        month = part2 - 1;
        warning = `Ambiguous numeric date '${str}' in field '${fieldName}' interpreted as DD/MM/YYYY`;
      }
    } else {
      return { date: new Date(NaN) };
    }

    const d = new Date(year, month, day);
    if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
      return { date: d, warning };
    }
    return { date: new Date(NaN) };
  }

  // Fallback: standard Date.parse
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return { date: parsed };
  }

  // Return Invalid Date object so Joi/business validation can flag it as fatal error
  return { date: new Date(NaN) };
}

/**
 * Normalizes tags from string (separated by , or ;) or array.
 */
function normalizeTags(rawTags) {
  if (rawTags === undefined || rawTags === null || rawTags === "") {
    return [];
  }

  let tagArray = [];
  if (Array.isArray(rawTags)) {
    tagArray = rawTags;
  } else if (typeof rawTags === "string") {
    tagArray = rawTags.split(/[;,]/);
  } else {
    tagArray = [String(rawTags)];
  }

  const seen = new Set();
  return tagArray
    .map((t) => String(t || "").trim().toLowerCase())
    .filter((t) => t !== "")
    .filter((t) => {
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    })
    .slice(0, 20);
}

/**
 * Normalizes a mapped record into WarrantyVault format.
 *
 * @param {Object} mappedRecord
 * @param {Object} [options={}] - e.g. { dateFormat: "DD/MM/YYYY" }
 * @returns {{ normalized: Object, warnings: string[] }}
 */
function normalizeRecord(mappedRecord, options = {}) {
  const warnings = [];
  const normalized = {};

  if (!mappedRecord || typeof mappedRecord !== "object") {
    return { normalized, warnings };
  }

  // String fields: trim, don't lowercase user-facing names, drop if empty
  const stringFields = [
    "productName",
    "brand",
    "model",
    "category",
    "purchaseStore",
    "serialNumber",
    "warrantyProvider",
    "warrantyContact",
    "warrantyWebsite",
    "notes"
  ];

  for (const field of stringFields) {
    if (mappedRecord[field] !== undefined && mappedRecord[field] !== null) {
      const trimmed = String(mappedRecord[field]).trim();
      if (trimmed !== "") {
        normalized[field] = trimmed;
      }
    }
  }

  // Currency
  let existingCurrency;
  if (mappedRecord.currency && typeof mappedRecord.currency === "string") {
    const cTrimmed = mappedRecord.currency.trim().toUpperCase();
    if (cTrimmed) {
      existingCurrency = cTrimmed;
      normalized.currency = cTrimmed;
    }
  }

  // Price
  if (mappedRecord.purchasePrice !== undefined) {
    const { purchasePrice, currency: detectedCurrency } = normalizePrice(
      mappedRecord.purchasePrice,
      existingCurrency
    );
    normalized.purchasePrice = purchasePrice;
    if (detectedCurrency) {
      normalized.currency = detectedCurrency;
    }
  }

  // Dates
  if (mappedRecord.purchaseDate !== undefined) {
    const { date, warning } = normalizeDate(
      mappedRecord.purchaseDate,
      "purchaseDate",
      options.dateFormat
    );
    normalized.purchaseDate = date;
    if (warning) warnings.push(warning);
  }

  if (mappedRecord.warrantyExpiryDate !== undefined) {
    const { date, warning } = normalizeDate(
      mappedRecord.warrantyExpiryDate,
      "warrantyExpiryDate",
      options.dateFormat
    );
    normalized.warrantyExpiryDate = date;
    if (warning) warnings.push(warning);
  }

  // Tags
  if (mappedRecord.tags !== undefined) {
    normalized.tags = normalizeTags(mappedRecord.tags);
  } else {
    normalized.tags = [];
  }

  // Lifecycle status
  if (mappedRecord.lifecycleStatus !== undefined && mappedRecord.lifecycleStatus !== null) {
    const status = String(mappedRecord.lifecycleStatus).trim().toLowerCase();
    if (status) {
      normalized.lifecycleStatus = status;
    }
  }

  // Warranty Provider Type
  if (mappedRecord.warrantyProviderType !== undefined && mappedRecord.warrantyProviderType !== null) {
    const pType = String(mappedRecord.warrantyProviderType).trim().toLowerCase();
    if (pType) {
      normalized.warrantyProviderType = pType;
    }
  }

  // Warranty Period Months
  if (mappedRecord.warrantyPeriodMonths !== undefined && mappedRecord.warrantyPeriodMonths !== null) {
    const parsedMonths = parseInt(mappedRecord.warrantyPeriodMonths, 10);
    normalized.warrantyPeriodMonths = Number.isNaN(parsedMonths) ? mappedRecord.warrantyPeriodMonths : parsedMonths;
  }

  return {
    normalized,
    warnings
  };
}

module.exports = {
  normalizePrice,
  normalizeDate,
  normalizeTags,
  normalizeRecord
};

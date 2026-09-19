"use strict";

const DETERMINISTIC_FIELDS = [
  "productName",
  "brand",
  "model",
  "category",
  "purchaseDate",
  "purchasePrice",
  "currency",
  "purchaseStore",
  "serialNumber",
  "warrantyExpiryDate",
  "warrantyPeriodMonths",
  "warrantyProvider",
  "warrantyProviderType",
  "lifecycleStatus",
  "tags",
  "notes"
];

function toIsoDate(d) {
  if (!d) return null;
  const dateObj = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dateObj.getTime())) return null;
  return dateObj.toISOString().slice(0, 10);
}

function areValuesEqual(field, expected, actual) {
  if (expected === actual) return true;
  if (expected === undefined || expected === null) {
    return actual === undefined || actual === null;
  }

  // Date comparison
  if (field === "purchaseDate" || field === "warrantyExpiryDate") {
    return toIsoDate(expected) === toIsoDate(actual);
  }

  // Number comparison
  if (field === "purchasePrice" || field === "warrantyPeriodMonths") {
    return Number(expected) === Number(actual);
  }

  // Tags array comparison
  if (field === "tags") {
    const arr1 = Array.isArray(expected) ? expected.slice().sort() : [];
    const arr2 = Array.isArray(actual) ? actual.slice().sort() : [];
    if (arr1.length !== arr2.length) return false;
    return arr1.every((val, idx) => val === arr2[idx]);
  }

  // String comparison (case-preserving, trimmed)
  return String(expected).trim() === String(actual).trim();
}

/**
 * Calculates field accuracy between normalized source record and resulting Product document.
 *
 * @param {Object} normalizedRecord - input source record
 * @param {Object} productDoc - resulting mongoose document or plain object
 * @returns {{ fieldsExpected: number, fieldsImported: number, fieldsCorrect: number, fieldComparisons: Array<Object> }}
 */
function verifyRecordAccuracy(normalizedRecord, productDoc) {
  const comparisons = [];
  let fieldsExpected = 0;
  let fieldsImported = 0;
  let fieldsCorrect = 0;

  for (const field of DETERMINISTIC_FIELDS) {
    const expected = normalizedRecord[field];

    // Ignore optional fields that were genuinely not present in source
    if (expected === undefined || expected === null || (Array.isArray(expected) && expected.length === 0)) {
      continue;
    }

    fieldsExpected++;

    const actual = productDoc[field];
    const isPresent = actual !== undefined && actual !== null && (!Array.isArray(actual) || actual.length > 0);
    if (isPresent) {
      fieldsImported++;
    }

    const isMatch = areValuesEqual(field, expected, actual);
    if (isMatch) {
      fieldsCorrect++;
    }

    comparisons.push({
      field,
      expected,
      actual,
      isMatch
    });
  }

  return {
    fieldsExpected,
    fieldsImported,
    fieldsCorrect,
    fieldComparisons: comparisons
  };
}

/**
 * Calculates overall migration summary metrics.
 *
 * @param {Object} params
 * @param {number} params.validRecordCount
 * @param {number} params.importedRecordCount
 * @param {Array<Object>} params.records
 * @returns {{ importSuccessRate: number, dataAccuracy: number, totalExpectedFields: number, totalCorrectFields: number }}
 */
function calculateMigrationMetrics({ validRecordCount, importedRecordCount, records }) {
  // Import Success Rate = successfully imported valid records / total valid records * 100
  let importSuccessRate = 0;
  if (validRecordCount > 0) {
    importSuccessRate = Number(((importedRecordCount / validRecordCount) * 100).toFixed(2));
  }

  // Data Accuracy = correctly imported expected fields / expected fields across successfully imported records * 100
  let totalExpectedFields = 0;
  let totalCorrectFields = 0;

  for (const r of records) {
    if (r.outcome === "imported" && r.accuracyChecks) {
      totalExpectedFields += r.accuracyChecks.fieldsExpected || 0;
      totalCorrectFields += r.accuracyChecks.fieldsCorrect || 0;
    }
  }

  let dataAccuracy = 100.0;
  if (totalExpectedFields > 0) {
    dataAccuracy = Number(((totalCorrectFields / totalExpectedFields) * 100).toFixed(2));
  }

  return {
    importSuccessRate,
    dataAccuracy,
    totalExpectedFields,
    totalCorrectFields
  };
}

module.exports = {
  DETERMINISTIC_FIELDS,
  areValuesEqual,
  verifyRecordAccuracy,
  calculateMigrationMetrics
};

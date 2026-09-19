"use strict";

const DAY_MS = 86400000;

function startOfDay(d) {
  if (!d) return null;
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Checks if a candidate record matches a target record or product.
 * Returns { isDuplicate: boolean, matchReason: string, matchedFields: string[] }
 */
function compareRecordsForDuplicate(candidate, target) {
  const cSerial = (candidate.serialNumber || "").trim().toLowerCase();
  const tSerial = (target.serialNumber || "").trim().toLowerCase();

  // Strong duplicate: identical non-empty serial number
  if (cSerial && tSerial && cSerial === tSerial) {
    return {
      isDuplicate: true,
      matchReason: `Identical serial number (${candidate.serialNumber})`,
      matchedFields: ["serialNumber"]
    };
  }

  // Weaker duplicate: same brand, model, purchaseStore (all non-empty)
  const cBrand = (candidate.brand || "").trim().toLowerCase();
  const tBrand = (target.brand || "").trim().toLowerCase();
  const cModel = (candidate.model || "").trim().toLowerCase();
  const tModel = (target.model || "").trim().toLowerCase();
  const cStore = (candidate.purchaseStore || "").trim().toLowerCase();
  const tStore = (target.purchaseStore || "").trim().toLowerCase();

  if (cBrand && tBrand && cBrand === tBrand &&
      cModel && tModel && cModel === tModel &&
      cStore && tStore && cStore === tStore) {
    const cPurchase = startOfDay(candidate.purchaseDate);
    const tPurchase = startOfDay(target.purchaseDate);

    if (cPurchase && tPurchase) {
      const diffDays = Math.round(Math.abs((cPurchase - tPurchase) / DAY_MS));
      if (diffDays <= 90) {
        return {
          isDuplicate: true,
          matchReason: `Same brand, model, and store, purchased ${diffDays} days apart`,
          matchedFields: ["brand", "model", "purchaseStore", "purchaseDate"]
        };
      }
    } else {
      return {
        isDuplicate: true,
        matchReason: "Same brand, model, and store",
        matchedFields: ["brand", "model", "purchaseStore"]
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Detects duplicates in a batch of records.
 * Compares each valid record against:
 * 1. Preceding valid records in the same batch
 * 2. Existing active products for the user in the database
 *
 * @param {Array<Object>} records - array of { sourceRowNumber, normalizedRecord, isValid }
 * @param {Array<Object>} existingProducts - active products owned by user
 * @returns {Array<Object>} annotated records with duplicate status
 */
function detectDuplicates(records, existingProducts = []) {
  const processedRecords = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    // If record is not valid, skip duplicate check (invalid takes precedence)
    if (!record.isValid) {
      processedRecords.push({
        ...record,
        isDuplicate: false,
        duplicateOf: null
      });
      continue;
    }

    let duplicateFound = false;

    // 1. Check against preceding valid records in the batch
    for (let j = 0; j < i; j++) {
      const prev = records[j];
      // Only compare against records that were valid and not rejected
      if (!prev.isValid) continue;

      const result = compareRecordsForDuplicate(record.normalizedRecord, prev.normalizedRecord);
      if (result.isDuplicate) {
        processedRecords.push({
          ...record,
          isDuplicate: true,
          duplicateOf: {
            type: "batch",
            matchedRow: prev.sourceRowNumber,
            matchReason: `${result.matchReason} (matches Row ${prev.sourceRowNumber})`,
            matchedFields: result.matchedFields
          }
        });
        duplicateFound = true;
        break;
      }
    }

    if (duplicateFound) continue;

    // 2. Check against existing active products for this user
    for (const existing of existingProducts) {
      const result = compareRecordsForDuplicate(record.normalizedRecord, existing);
      if (result.isDuplicate) {
        processedRecords.push({
          ...record,
          isDuplicate: true,
          duplicateOf: {
            type: "existing",
            matchedProductId: existing._id,
            matchedProductName: existing.productName,
            matchReason: `${result.matchReason} (matches existing product "${existing.productName}")`,
            matchedFields: result.matchedFields
          }
        });
        duplicateFound = true;
        break;
      }
    }

    if (!duplicateFound) {
      processedRecords.push({
        ...record,
        isDuplicate: false,
        duplicateOf: null
      });
    }
  }

  return processedRecords;
}

module.exports = {
  compareRecordsForDuplicate,
  detectDuplicates
};

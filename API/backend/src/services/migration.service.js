"use strict";

const mongoose = require("mongoose");
const Migration = require("../models/Migration");
const Product = require("../models/Product");
const AppError = require("../utils/AppError");
const { parseSource } = require("../utils/migration/csvParser");
const { mapRecord } = require("../utils/migration/fieldMapper");
const { normalizeRecord } = require("../utils/migration/normalizer");
const { validateMigrationRecord } = require("../validators/migration.validator");
const { detectDuplicates } = require("../utils/migration/duplicateDetector");
const { verifyRecordAccuracy, calculateMigrationMetrics } = require("../utils/migration/accuracy");
const { createProduct } = require("./product.service");

function assertObjectId(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError("Invalid migration ID", 400);
  }
}

/**
 * Creates a migration preview from uploaded file buffer/string.
 * Preserves raw input, performs mapping, normalization, validation, and duplicate detection.
 */
async function createMigrationPreview(userId, fileBuffer, fileName = "import.csv", options = {}) {
  if (!fileBuffer || (Buffer.isBuffer(fileBuffer) && fileBuffer.length === 0)) {
    throw new AppError("Uploaded file is empty", 400);
  }

  // 1. Parse input
  const { headers, rows, sourceFormat } = parseSource(fileBuffer, options.formatHint);

  if (!rows || rows.length === 0) {
    throw new AppError("No data rows found in uploaded file", 400);
  }

  // 2. Map and normalize each row
  const stagedRecords = [];
  for (const row of rows) {
    const mapped = mapRecord(row.rawRecord, options.customMapping);
    const { normalized, warnings: normWarnings } = normalizeRecord(mapped, {
      dateFormat: options.dateFormat
    });
    const { isValid, errors: valErrors, warnings: valWarnings } = validateMigrationRecord(normalized);

    stagedRecords.push({
      sourceRowNumber: row.sourceRowNumber,
      rawRecord: row.rawRecord,
      mappedRecord: mapped,
      normalizedRecord: normalized,
      isValid,
      errors: valErrors,
      warnings: [...normWarnings, ...valWarnings]
    });
  }

  // 3. Retrieve user's existing active products for duplicate comparison
  const existingProducts = await Product.find({
    userId,
    isDeleted: false
  }).lean();

  // 4. Run duplicate detection
  const annotatedRecords = detectDuplicates(stagedRecords, existingProducts);

  // 5. Finalize preliminary outcomes for preview
  const finalRecords = annotatedRecords.map((r) => {
    let outcome = "pending";
    if (!r.isValid) {
      outcome = "rejected";
    } else if (r.isDuplicate) {
      outcome = "duplicate";
    }

    return {
      sourceRowNumber: r.sourceRowNumber,
      rawRecord: r.rawRecord,
      mappedRecord: r.mappedRecord,
      normalizedRecord: r.normalizedRecord,
      outcome,
      errors: r.errors || [],
      warnings: r.warnings || [],
      duplicateOf: r.duplicateOf || null,
      importedProductId: null,
      accuracyChecks: {
        fieldsExpected: 0,
        fieldsImported: 0,
        fieldsCorrect: 0,
        fieldComparisons: []
      }
    };
  });

  const sourceRecordCount = finalRecords.length;
  const validRecordCount = finalRecords.filter((r) => r.errors.length === 0).length;
  const rejectedRecordCount = finalRecords.filter((r) => r.outcome === "rejected").length;
  const duplicateRecordCount = finalRecords.filter((r) => r.outcome === "duplicate").length;
  const importableRecordCount = finalRecords.filter((r) => r.outcome === "pending").length;

  // 6. Save migration audit document in preview status
  const migration = await Migration.create({
    userId,
    fileName,
    sourceFormat,
    startedAt: new Date(),
    status: "preview",
    sourceRecordCount,
    validRecordCount,
    rejectedRecordCount,
    duplicateRecordCount,
    importedRecordCount: 0,
    importSuccessRate: 0,
    dataAccuracy: 0,
    records: finalRecords
  });

  return {
    migrationId: migration._id,
    fileName: migration.fileName,
    sourceFormat: migration.sourceFormat,
    status: migration.status,
    sourceRecordCount,
    validRecordCount,
    rejectedRecordCount,
    duplicateRecordCount,
    importableRecordCount,
    headers,
    records: migration.records
  };
}

/**
 * Executes import for all pending valid records in a migration.
 * Converts pending records to Product documents via product.service.createProduct.
 * Handles race conditions and calculates exact evidence metrics.
 */
async function executeMigrationImport(migrationId, userId) {
  assertObjectId(migrationId);

  const migration = await Migration.findOne({ _id: migrationId, userId });
  if (!migration) {
    throw new AppError("Migration not found", 404);
  }

  if (migration.status === "completed") {
    throw new AppError("Migration has already been imported", 400);
  }

  migration.status = "in_progress";
  await migration.save();

  // Process all pending records
  for (const record of migration.records) {
    if (record.outcome !== "pending") {
      continue;
    }

    try {
      // Re-use existing Product service to enforce canonical normalization & validation
      const product = await createProduct(userId, record.normalizedRecord);

      record.outcome = "imported";
      record.importedProductId = product._id;

      // Verify and record field-level accuracy evidence
      record.accuracyChecks = verifyRecordAccuracy(record.normalizedRecord, product.toObject ? product.toObject() : product);
    } catch (err) {
      // Handle E11000 duplicate serial race condition gracefully
      if (err.code === 11000 || /duplicate/i.test(err.message)) {
        record.outcome = "duplicate";
        record.duplicateOf = {
          type: "existing",
          matchReason: "Duplicate key race: serial number already registered by another process",
          matchedFields: ["serialNumber"]
        };
        record.warnings.push("Duplicate serial number conflict on database write");
      } else {
        record.outcome = "rejected";
        record.errors.push(err.message || "Failed to create product");
      }
    }
  }

  // Recalculate tallies
  const sourceRecordCount = migration.records.length;
  const validRecordCount = migration.records.filter((r) => r.errors.length === 0).length;
  const importedRecordCount = migration.records.filter((r) => r.outcome === "imported").length;
  const rejectedRecordCount = migration.records.filter((r) => r.outcome === "rejected").length;
  const duplicateRecordCount = migration.records.filter((r) => r.outcome === "duplicate").length;

  const { importSuccessRate, dataAccuracy, totalExpectedFields, totalCorrectFields } =
    calculateMigrationMetrics({
      validRecordCount,
      importedRecordCount,
      records: migration.records
    });

  migration.sourceRecordCount = sourceRecordCount;
  migration.validRecordCount = validRecordCount;
  migration.importedRecordCount = importedRecordCount;
  migration.rejectedRecordCount = rejectedRecordCount;
  migration.duplicateRecordCount = duplicateRecordCount;
  migration.importSuccessRate = importSuccessRate;
  migration.dataAccuracy = dataAccuracy;
  migration.status = "completed";
  migration.completedAt = new Date();

  await migration.save();

  return {
    migrationId: migration._id,
    fileName: migration.fileName,
    sourceFormat: migration.sourceFormat,
    status: migration.status,
    completedAt: migration.completedAt,
    sourceRecordCount,
    validRecordCount,
    importedRecordCount,
    rejectedRecordCount,
    duplicateRecordCount,
    importSuccessRate,
    dataAccuracy,
    totalExpectedFields,
    totalCorrectFields,
    records: migration.records
  };
}

/**
 * Combined one-step upload and import.
 */
async function createAndExecuteMigration(userId, fileBuffer, fileName = "import.csv", options = {}) {
  const preview = await createMigrationPreview(userId, fileBuffer, fileName, options);
  return executeMigrationImport(preview.migrationId, userId);
}

/**
 * Gets a migration by ID with user ownership check.
 */
async function getMigrationById(migrationId, userId) {
  assertObjectId(migrationId);

  const migration = await Migration.findOne({ _id: migrationId, userId }).lean();
  if (!migration) {
    throw new AppError("Migration not found", 404);
  }

  return migration;
}

/**
 * Lists user's migration audit history.
 */
async function listMigrations(userId, page = 1, limit = 20) {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const filter = { userId };

  const [migrations, total] = await Promise.all([
    Migration.find(filter)
      .select("fileName sourceFormat startedAt completedAt status sourceRecordCount validRecordCount importedRecordCount rejectedRecordCount duplicateRecordCount importSuccessRate dataAccuracy createdAt")
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    Migration.countDocuments(filter)
  ]);

  return {
    migrations,
    total,
    page: safePage,
    limit: safeLimit
  };
}

/**
 * Extracts structured before-and-after evidence for a migration.
 */
async function getMigrationEvidence(migrationId, userId) {
  assertObjectId(migrationId);

  const migration = await Migration.findOne({ _id: migrationId, userId }).lean();
  if (!migration) {
    throw new AppError("Migration not found", 404);
  }

  // Collect imported product IDs
  const importedProductIds = migration.records
    .filter((r) => r.importedProductId)
    .map((r) => r.importedProductId);

  const products = await Product.find({
    _id: { $in: importedProductIds },
    userId
  }).lean();

  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const evidenceRecords = migration.records.map((r) => ({
    sourceRowNumber: r.sourceRowNumber,
    rawRecord: r.rawRecord,
    mappedRecord: r.mappedRecord,
    normalizedRecord: r.normalizedRecord,
    outcome: r.outcome,
    errors: r.errors,
    warnings: r.warnings,
    duplicateOf: r.duplicateOf,
    accuracyChecks: r.accuracyChecks,
    resultingProduct: r.importedProductId ? productMap.get(String(r.importedProductId)) || null : null
  }));

  return {
    migrationId: migration._id,
    fileName: migration.fileName,
    sourceFormat: migration.sourceFormat,
    status: migration.status,
    completedAt: migration.completedAt,
    summary: {
      sourceRecordCount: migration.sourceRecordCount,
      validRecordCount: migration.validRecordCount,
      importedRecordCount: migration.importedRecordCount,
      rejectedRecordCount: migration.rejectedRecordCount,
      duplicateRecordCount: migration.duplicateRecordCount,
      importSuccessRate: migration.importSuccessRate,
      dataAccuracy: migration.dataAccuracy
    },
    evidenceRecords
  };
}

module.exports = {
  createMigrationPreview,
  executeMigrationImport,
  createAndExecuteMigration,
  getMigrationById,
  listMigrations,
  getMigrationEvidence
};

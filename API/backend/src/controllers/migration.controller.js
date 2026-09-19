"use strict";

const path = require("node:path");
const migrationService = require("../services/migration.service");
const { sendSuccess } = require("../utils/response");
const AppError = require("../utils/AppError");

function extractFileContentAndName(req) {
  let fileBuffer = null;
  let fileName = "import.csv";

  if (req.file) {
    fileBuffer = req.file.buffer;
    // Sanitize filename to prevent directory traversal or unsafe characters
    fileName = path.basename(req.file.originalname || "import.csv").replace(/[^\w.-]/g, "_");
  } else if (req.body && (req.body.content || req.body.csv || req.body.data)) {
    const raw = req.body.content || req.body.csv || req.body.data;
    fileBuffer = Buffer.from(typeof raw === "string" ? raw : JSON.stringify(raw), "utf-8");
    if (req.body.fileName) {
      fileName = path.basename(String(req.body.fileName)).replace(/[^\w.-]/g, "_");
    }
  } else if (req.body && Array.isArray(req.body)) {
    fileBuffer = Buffer.from(JSON.stringify(req.body), "utf-8");
    fileName = "data.json";
  }

  return { fileBuffer, fileName };
}

function parseOptions(req) {
  const options = {};
  if (req.body) {
    if (req.body.dateFormat) {
      options.dateFormat = String(req.body.dateFormat).trim();
    }
    if (req.body.formatHint) {
      options.formatHint = String(req.body.formatHint).trim().toLowerCase();
    }
    if (req.body.customMapping) {
      try {
        options.customMapping = typeof req.body.customMapping === "string"
          ? JSON.parse(req.body.customMapping)
          : req.body.customMapping;
      } catch {
        // Ignore malformed custom mapping
      }
    }
  }
  return options;
}

async function createPreview(req, res, next) {
  try {
    const { fileBuffer, fileName } = extractFileContentAndName(req);
    if (!fileBuffer) {
      throw new AppError("No file or data provided. Upload a file or send content in body", 400);
    }

    const options = parseOptions(req);
    const data = await migrationService.createMigrationPreview(
      req.user.userId,
      fileBuffer,
      fileName,
      options
    );

    return sendSuccess(res, data, "Migration preview generated", 201);
  } catch (error) {
    return next(error);
  }
}

async function executeImport(req, res, next) {
  try {
    const data = await migrationService.executeMigrationImport(
      req.params.id,
      req.user.userId
    );
    return sendSuccess(res, data, "Migration imported successfully", 200);
  } catch (error) {
    return next(error);
  }
}

async function createMigration(req, res, next) {
  try {
    const { fileBuffer, fileName } = extractFileContentAndName(req);
    if (!fileBuffer) {
      throw new AppError("No file or data provided. Upload a file or send content in body", 400);
    }

    const options = parseOptions(req);
    const data = await migrationService.createAndExecuteMigration(
      req.user.userId,
      fileBuffer,
      fileName,
      options
    );

    return sendSuccess(res, data, "Migration completed successfully", 201);
  } catch (error) {
    return next(error);
  }
}

async function listMigrations(req, res, next) {
  try {
    const data = await migrationService.listMigrations(
      req.user.userId,
      req.query.page,
      req.query.limit
    );
    return sendSuccess(res, data, "Migrations retrieved", 200);
  } catch (error) {
    return next(error);
  }
}

async function getMigrationById(req, res, next) {
  try {
    const data = await migrationService.getMigrationById(
      req.params.id,
      req.user.userId
    );
    return sendSuccess(res, data, "Migration retrieved", 200);
  } catch (error) {
    return next(error);
  }
}

async function getMigrationEvidence(req, res, next) {
  try {
    const data = await migrationService.getMigrationEvidence(
      req.params.id,
      req.user.userId
    );
    return sendSuccess(res, data, "Migration evidence retrieved", 200);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createPreview,
  executeImport,
  createMigration,
  listMigrations,
  getMigrationById,
  getMigrationEvidence
};

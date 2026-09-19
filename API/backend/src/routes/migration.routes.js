"use strict";

const express = require("express");
const auth = require("../middleware/auth");
const { uploadMigrationFile } = require("../middleware/migrationUpload");
const migrationController = require("../controllers/migration.controller");

const router = express.Router();

// All migration routes require authentication
router.use(auth);

// Preview migration transformation before committing products
router.post("/preview", uploadMigrationFile, migrationController.createPreview);

// Import valid records from a previously generated preview
router.post("/:id/import", migrationController.executeImport);

// One-step upload & import
router.post("/", uploadMigrationFile, migrationController.createMigration);

// List user's past migrations
router.get("/", migrationController.listMigrations);

// Get migration detail
router.get("/:id", migrationController.getMigrationById);

// Get structured before-and-after audit evidence
router.get("/:id/evidence", migrationController.getMigrationEvidence);

module.exports = router;

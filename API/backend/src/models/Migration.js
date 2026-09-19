"use strict";

const mongoose = require("mongoose");

const fieldComparisonSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    expected: { type: mongoose.Schema.Types.Mixed },
    actual: { type: mongoose.Schema.Types.Mixed },
    isMatch: { type: Boolean, default: false }
  },
  { _id: false }
);

const accuracyChecksSchema = new mongoose.Schema(
  {
    fieldsExpected: { type: Number, default: 0 },
    fieldsImported: { type: Number, default: 0 },
    fieldsCorrect: { type: Number, default: 0 },
    fieldComparisons: { type: [fieldComparisonSchema], default: [] }
  },
  { _id: false }
);

const duplicateInfoSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["batch", "existing"], default: "batch" },
    matchedRow: { type: Number },
    matchedProductId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    matchedProductName: { type: String },
    matchReason: { type: String },
    matchedFields: { type: [String], default: [] }
  },
  { _id: false }
);

const migrationRecordItemSchema = new mongoose.Schema(
  {
    sourceRowNumber: { type: Number, required: true },
    rawRecord: { type: mongoose.Schema.Types.Mixed, default: {} },
    mappedRecord: { type: mongoose.Schema.Types.Mixed, default: {} },
    normalizedRecord: { type: mongoose.Schema.Types.Mixed, default: {} },

    outcome: {
      type: String,
      enum: ["pending", "imported", "rejected", "duplicate"],
      default: "pending"
    },

    errors: { type: [String], default: [] },
    warnings: { type: [String], default: [] },

    duplicateOf: { type: duplicateInfoSchema, default: null },

    importedProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null
    },

    accuracyChecks: { type: accuracyChecksSchema, default: () => ({}) }
  },
  { _id: true, suppressReservedKeysWarning: true }
);

const migrationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    fileName: {
      type: String,
      required: true
    },
    sourceFormat: {
      type: String,
      enum: ["csv", "json"],
      default: "csv"
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    completedAt: {
      type: Date
    },

    sourceRecordCount: {
      type: Number,
      default: 0
    },
    validRecordCount: {
      type: Number,
      default: 0
    },
    importedRecordCount: {
      type: Number,
      default: 0
    },
    rejectedRecordCount: {
      type: Number,
      default: 0
    },
    duplicateRecordCount: {
      type: Number,
      default: 0
    },

    importSuccessRate: {
      type: Number,
      default: 0
    },
    dataAccuracy: {
      type: Number,
      default: 0
    },

    status: {
      type: String,
      enum: ["preview", "in_progress", "completed", "failed"],
      default: "preview"
    },

    records: {
      type: [migrationRecordItemSchema],
      default: []
    }
  },
  {
    timestamps: true
  }
);

migrationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Migration", migrationSchema);

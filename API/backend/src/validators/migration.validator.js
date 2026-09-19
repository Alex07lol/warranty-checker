"use strict";

const Joi = require("joi");

const LIFECYCLE_STATUSES = [
  "owned",
  "in_use",
  "stored",
  "under_repair",
  "sold",
  "gifted",
  "disposed"
];

const WARRANTY_PROVIDER_TYPES = [
  "manufacturer",
  "retailer",
  "third_party",
  "extended",
  "unknown"
];

/**
 * Joi schema for validating normalized migration product data.
 */
const migrationProductSchema = Joi.object({
  productName: Joi.string().trim().min(1).required().messages({
    "any.required": "Product name is required",
    "string.empty": "Product name cannot be empty"
  }),
  brand: Joi.string().trim().allow(""),
  model: Joi.string().trim().allow(""),
  category: Joi.string().trim().allow(""),
  purchaseDate: Joi.date().iso().allow(null).messages({
    "date.base": "Purchase date is invalid"
  }),
  purchasePrice: Joi.number().min(0).allow(null).messages({
    "number.base": "Purchase price must be a valid number",
    "number.min": "Purchase price cannot be negative"
  }),
  currency: Joi.string().trim().max(10).allow(""),
  purchaseStore: Joi.string().trim().allow(""),
  serialNumber: Joi.string().trim().allow(""),
  warrantyExpiryDate: Joi.date().iso().allow(null).messages({
    "date.base": "Warranty expiry date is invalid"
  }),
  warrantyPeriodMonths: Joi.number().integer().min(1).allow(null).messages({
    "number.base": "Warranty period months must be a number",
    "number.min": "Warranty period months must be at least 1"
  }),
  warrantyProvider: Joi.string().trim().allow(""),
  warrantyProviderType: Joi.string().valid(...WARRANTY_PROVIDER_TYPES).allow("").messages({
    "any.only": "Warranty provider type is invalid"
  }),
  warrantyContact: Joi.string().trim().allow(""),
  warrantyWebsite: Joi.string().trim().allow(""),
  lifecycleStatus: Joi.string().valid(...LIFECYCLE_STATUSES).allow("").messages({
    "any.only": "Lifecycle status is invalid"
  }),
  tags: Joi.array().items(Joi.string().trim().max(50)).max(20),
  notes: Joi.string().trim().allow("")
}).unknown(true);

/**
 * Validates a normalized record against WarrantyVault schema and business rules.
 * Distinguishes between fatal errors (which reject the record) and non-fatal warnings.
 *
 * @param {Object} record - normalized record
 * @returns {{ isValid: boolean, errors: string[], warnings: string[] }}
 */
function validateMigrationRecord(record) {
  const errors = [];
  const warnings = [];

  if (!record || typeof record !== "object") {
    return {
      isValid: false,
      errors: ["Record is empty or not an object"],
      warnings
    };
  }

  // 1. Explicit check for Invalid Date objects (which Joi might treat oddly)
  if (record.purchaseDate instanceof Date && Number.isNaN(record.purchaseDate.getTime())) {
    errors.push("Purchase date is invalid");
  }
  if (record.warrantyExpiryDate instanceof Date && Number.isNaN(record.warrantyExpiryDate.getTime())) {
    errors.push("Warranty expiry date is invalid");
  }

  // 2. Check for NaN numbers
  if (typeof record.purchasePrice === "number" && Number.isNaN(record.purchasePrice)) {
    errors.push("Purchase price must be a valid number");
  }
  if (typeof record.warrantyPeriodMonths === "number" && Number.isNaN(record.warrantyPeriodMonths)) {
    errors.push("Warranty period months must be a number");
  }

  // 3. Joi schema validation
  const { error } = migrationProductSchema.validate(record, { abortEarly: false });
  if (error) {
    for (const detail of error.details) {
      if (!errors.includes(detail.message)) {
        errors.push(detail.message);
      }
    }
  }

  // 4. Cross-field business rule validations
  const now = new Date();
  // Buffer today's date to end of day to prevent timezone boundary issues
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  if (record.purchaseDate instanceof Date && !Number.isNaN(record.purchaseDate.getTime())) {
    if (record.purchaseDate > todayEnd) {
      errors.push("Purchase date cannot be in the future");
    }
  }

  if (
    record.purchaseDate instanceof Date && !Number.isNaN(record.purchaseDate.getTime()) &&
    record.warrantyExpiryDate instanceof Date && !Number.isNaN(record.warrantyExpiryDate.getTime())
  ) {
    if (record.warrantyExpiryDate <= record.purchaseDate) {
      errors.push("Warranty expiry date must be after purchase date");
    }
  }

  // 5. Non-fatal warnings (advisory only)
  if (!record.brand) {
    warnings.push("Brand is missing");
  }
  if (!record.model) {
    warnings.push("Model is missing");
  }
  if (!record.purchaseStore) {
    warnings.push("Purchase store is missing");
  }
  if (!record.warrantyExpiryDate) {
    warnings.push("No warranty expiry date specified");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

module.exports = {
  validateMigrationRecord,
  migrationProductSchema
};

const Joi = require("joi");

const warrantyProviderTypes = ["manufacturer", "retailer", "third_party", "extended", "unknown"];
const lifecycleStatuses = ["owned", "in_use", "stored", "under_repair", "sold", "gifted", "disposed"];

// Phase 4: additional warranty/coverage period.
const warrantyPeriodSchema = Joi.object({
  type: Joi.string().max(100).allow(""),
  provider: Joi.string().max(200).allow(""),
  startDate: Joi.date().iso().allow(null),
  expiryDate: Joi.date().iso().allow(null),
  coverage: Joi.string().max(500).allow(""),
  status: Joi.string().valid("not_started", "active", "expiring_soon", "expired", "unknown"),
  notes: Joi.string().max(2000).allow("")
});

const productFields = {
  productName: Joi.string().min(1),
  brand: Joi.string().max(100),
  model: Joi.string().max(100),
  category: Joi.string().max(100),
  purchaseDate: Joi.date().iso().max("now"),
  purchasePrice: Joi.number().min(0),
  currency: Joi.string().max(10),
  purchaseStore: Joi.string().max(200),
  serialNumber: Joi.string().max(200),
  warrantyExpiryDate: Joi.date().iso(),
  warrantyPeriodMonths: Joi.number().integer().positive(),
  // Phase 4: warranty provider / manufacturer info.
  warrantyProvider: Joi.string().max(200),
  warrantyProviderType: Joi.string().valid(...warrantyProviderTypes),
  warrantyContact: Joi.string().max(200),
  warrantyWebsite: Joi.string().uri().allow(""),
  // Phase 4: lifecycle state.
  lifecycleStatus: Joi.string().valid(...lifecycleStatuses),
  // Phase 4: additional coverage periods.
  warranties: Joi.array().items(warrantyPeriodSchema).max(20),
  // Phase 4 §12: user-scoped tags (max 20, each ≤ 30 chars, trimmed
  // server-side). `allow("")` so a trailing empty entry from the UI doesn't
  // 422 — the service drops blanks.
  tags: Joi.array().items(Joi.string().trim().allow("").max(30)).max(20),
  notes: Joi.string().max(2000),
  thumbnailUrl: Joi.string().uri().allow("")
};

const createProductSchema = Joi.object({
  ...productFields,
  productName: productFields.productName.required()
});

const updateProductSchema = Joi.object(productFields).min(1);

module.exports = {
  warrantyProviderTypes,
  lifecycleStatuses,
  warrantyPeriodSchema,
  createProductSchema,
  updateProductSchema
};

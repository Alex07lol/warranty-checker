const Joi = require("joi");

const uploadDocumentSchema = Joi.object({
  documentType: Joi.string()
    .valid("receipt", "warranty_card", "product_photo", "manual", "other")
    .required(),
  notes: Joi.string().max(2000).allow("")
});

// Payload for the edit-and-confirm step: the user-reviewed product fields
// taken from a standalone document's OCR data. Empty form fields are
// allowed (they just mean "don't set this on the product").
const confirmProductSchema = Joi.object({
  productName: Joi.string().trim().min(1).max(120).required(),
  brand: Joi.string().trim().max(80).allow(""),
  model: Joi.string().trim().max(120).allow(""),
  serialNumber: Joi.string().trim().max(120).allow(""),
  purchasePrice: Joi.number().min(0).allow(null),
  purchaseStore: Joi.string().trim().max(200).allow(""),
  purchaseDate: Joi.date().allow(null),
  warrantyExpiryDate: Joi.date().allow(null)
});

module.exports = {
  uploadDocumentSchema,
  confirmProductSchema
};

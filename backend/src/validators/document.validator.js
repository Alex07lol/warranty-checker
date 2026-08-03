const Joi = require("joi");

const uploadDocumentSchema = Joi.object({
  documentType: Joi.string()
    .valid("receipt", "warranty_card", "product_photo", "manual", "other")
    .required(),
  notes: Joi.string().max(2000).allow("")
});

module.exports = {
  uploadDocumentSchema
};

const Joi = require("joi");

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
  notes: Joi.string().max(2000),
  thumbnailUrl: Joi.string().uri().allow("")
};

const createProductSchema = Joi.object({
  ...productFields,
  productName: productFields.productName.required()
});

const updateProductSchema = Joi.object(productFields).min(1);

module.exports = {
  createProductSchema,
  updateProductSchema
};

const Joi = require("joi");

const createServiceHistorySchema = Joi.object({
  serviceDate: Joi.date().iso().required(),
  serviceType: Joi.string()
    .valid("repair", "maintenance", "inspection", "replacement", "other")
    .required(),
  serviceProvider: Joi.string().max(200),
  cost: Joi.number().min(0),
  currency: Joi.string().max(10),
  description: Joi.string().max(2000),
  documentIds: Joi.array().items(Joi.string().hex().length(24)),
  nextServiceDate: Joi.date().iso()
});

const updateServiceHistorySchema = Joi.object({
  serviceDate: Joi.date().iso(),
  serviceType: Joi.string().valid("repair", "maintenance", "inspection", "replacement", "other"),
  serviceProvider: Joi.string().max(200),
  cost: Joi.number().min(0),
  currency: Joi.string().max(10),
  description: Joi.string().max(2000),
  documentIds: Joi.array().items(Joi.string().hex().length(24)),
  nextServiceDate: Joi.date().iso()
}).min(1);

module.exports = {
  createServiceHistorySchema,
  updateServiceHistorySchema
};

const Joi = require("joi");

// Phase 4 §17 — create a share link. Expiry is optional (1–90 days); an
// omitted/null value means the link never expires (it stays revocable).
const createShareSchema = Joi.object({
  expiresInDays: Joi.number().integer().min(1).max(90).allow(null)
});

module.exports = { createShareSchema };

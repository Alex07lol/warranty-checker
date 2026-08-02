const Joi = require("joi");

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  confirmPassword: Joi.any().valid(Joi.ref("password")).required()
    .messages({ "any.only": "Passwords do not match", "any.required": "Confirm password is required" })
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
  confirmNewPassword: Joi.any().valid(Joi.ref("newPassword")).required()
    .messages({ "any.only": "Passwords do not match", "any.required": "Confirm new password is required" })
});

module.exports = {
  registerSchema,
  loginSchema,
  changePasswordSchema
};

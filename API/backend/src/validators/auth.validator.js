const Joi = require("joi");

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  confirmPassword: Joi.any().valid(Joi.ref("password")).required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
  confirmNewPassword: Joi.any().valid(Joi.ref("newPassword")).required()
});

// Phase 4 §6/§23: user-configurable notification preferences. At least one
// field must be present; unknown fields are rejected by Joi's default behavior.
const updatePreferencesSchema = Joi.object({
  expiryAlerts: Joi.boolean(),
  maintenanceAlerts: Joi.boolean(),
  documentAlerts: Joi.boolean(),
  sharedAccessAlerts: Joi.boolean(),
  emailAlerts: Joi.boolean(),
  reminderDays: Joi.array().items(Joi.number().integer().min(1).max(365)).max(10)
}).min(1);

const verifyEmailSchema = Joi.object({
  email: Joi.string().email().required(),
  code: Joi.string().trim().length(6).pattern(/^\d{6}$/).required().messages({
    "string.length": "Verification code must be exactly 6 digits",
    "string.pattern.base": "Verification code must contain digits only"
  })
});

const resendVerificationSchema = Joi.object({
  email: Joi.string().email().required()
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required()
});

const resetPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
  code: Joi.string().trim().length(6).pattern(/^\d{6}$/).required().messages({
    "string.length": "Reset code must be exactly 6 digits",
    "string.pattern.base": "Reset code must contain digits only"
  }),
  newPassword: Joi.string().min(8).required(),
  confirmNewPassword: Joi.any().valid(Joi.ref("newPassword")).required().messages({
    "any.only": "Password confirmation does not match"
  })
});

const confirmDeleteAccountSchema = Joi.object({
  code: Joi.string().trim().length(6).pattern(/^\d{6}$/).required().messages({
    "string.length": "Deletion code must be exactly 6 digits",
    "string.pattern.base": "Deletion code must contain digits only"
  })
});

module.exports = {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  updatePreferencesSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  confirmDeleteAccountSchema
};

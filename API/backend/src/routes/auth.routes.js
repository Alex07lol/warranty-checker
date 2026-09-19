"use strict";

const express = require("express");
const rateLimit = require("express-rate-limit");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const controller = require("../controllers/auth.controller");
const {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  updatePreferencesSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  confirmDeleteAccountSchema
} = require("../validators/auth.validator");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT) || 20,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

router.post("/register", authLimiter, validate(registerSchema), controller.register);
router.post("/verify-email", authLimiter, validate(verifyEmailSchema), controller.verifyEmail);
router.post("/resend-verification", authLimiter, validate(resendVerificationSchema), controller.resendVerification);
router.post("/forgot-password", authLimiter, validate(forgotPasswordSchema), controller.forgotPassword);
router.post("/reset-password", authLimiter, validate(resetPasswordSchema), controller.resetPassword);
router.post("/login", authLimiter, validate(loginSchema), controller.login);
router.post("/logout", auth, controller.logout);
router.get("/me", auth, controller.getMe);
router.put("/preferences", auth, validate(updatePreferencesSchema), controller.updatePreferences);
// change-password is a credential-sensitive endpoint: same per-IP limiter as
// login/register so a leaked session can't be used to brute-force a new
// password either.
router.put(
  "/change-password",
  auth,
  authLimiter,
  validate(changePasswordSchema),
  controller.changePassword
);

// Account deletion with email verification and MongoDB cascading cleanup
router.post("/request-delete-account", auth, authLimiter, controller.requestDeleteAccount);
router.post(
  "/confirm-delete-account",
  auth,
  authLimiter,
  validate(confirmDeleteAccountSchema),
  controller.confirmDeleteAccount
);

module.exports = router;

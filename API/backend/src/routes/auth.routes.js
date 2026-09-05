const express = require("express");
const rateLimit = require("express-rate-limit");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const controller = require("../controllers/auth.controller");
const {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  verifyLoginSchema,
  resendVerificationSchema,
  changePasswordSchema,
  updatePreferencesSchema
} = require("../validators/auth.validator");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT) || 10,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

router.post("/register", authLimiter, validate(registerSchema), controller.register);
router.post("/verify-email", authLimiter, validate(verifyEmailSchema), controller.verifyEmail);
router.post("/login", authLimiter, validate(loginSchema), controller.login);
router.post("/verify-login", authLimiter, validate(verifyLoginSchema), controller.verifyLogin);
router.post("/resend-verification", authLimiter, validate(resendVerificationSchema), controller.resendVerification);
router.post("/logout", auth, controller.logout);
router.get("/me", auth, controller.getMe);
router.put("/preferences", auth, validate(updatePreferencesSchema), controller.updatePreferences);
router.put(
  "/change-password",
  auth,
  authLimiter,
  validate(changePasswordSchema),
  controller.changePassword
);

module.exports = router;

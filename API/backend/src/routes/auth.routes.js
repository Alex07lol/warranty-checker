const express = require("express");
const rateLimit = require("express-rate-limit");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const controller = require("../controllers/auth.controller");
const {
  registerSchema,
  loginSchema,
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

module.exports = router;

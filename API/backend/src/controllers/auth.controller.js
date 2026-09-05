const authService = require("../services/auth.service");
const { sendSuccess } = require("../utils/response");

async function register(req, res, next) {
  try {
    const data = await authService.registerUser(req.body.name, req.body.email, req.body.password);
    return sendSuccess(res, data, data.message || "Registration initiated. Please verify your email.", 201);
  } catch (error) {
    return next(error);
  }
}

async function verifyEmail(req, res, next) {
  try {
    const data = await authService.verifyEmail(req.body.email, req.body.code);
    return sendSuccess(res, data, "Email verified successfully");
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const data = await authService.loginUser(req.body.email, req.body.password, req.body.code);
    const msg = data.requiresVerification
      ? data.message || "Verification code sent to your email"
      : "Login successful";
    return sendSuccess(res, data, msg);
  } catch (error) {
    return next(error);
  }
}

async function verifyLogin(req, res, next) {
  try {
    const data = await authService.verifyLogin(req.body.email, req.body.code);
    return sendSuccess(res, data, "Login verified successfully");
  } catch (error) {
    return next(error);
  }
}

async function resendVerification(req, res, next) {
  try {
    const data = await authService.resendVerification(req.body.email, req.body.type);
    return sendSuccess(res, data, data.message || "Verification code sent");
  } catch (error) {
    return next(error);
  }
}

async function logout(req, res) {
  return sendSuccess(res, null, "Logged out successfully");
}

async function getMe(req, res, next) {
  try {
    const data = await authService.getUserById(req.user.userId);
    return sendSuccess(res, data, "User profile retrieved");
  } catch (error) {
    return next(error);
  }
}

async function changePassword(req, res, next) {
  try {
    await authService.changePassword(
      req.user.userId,
      req.body.currentPassword,
      req.body.newPassword
    );
    return sendSuccess(res, null, "Password updated successfully");
  } catch (error) {
    return next(error);
  }
}

async function updatePreferences(req, res, next) {
  try {
    const data = await authService.updateNotificationPreferences(
      req.user.userId,
      req.body
    );
    return sendSuccess(res, data, "Notification preferences updated");
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  register,
  verifyEmail,
  login,
  verifyLogin,
  resendVerification,
  logout,
  getMe,
  changePassword,
  updatePreferences
};

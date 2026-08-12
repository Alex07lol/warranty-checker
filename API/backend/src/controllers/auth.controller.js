const authService = require("../services/auth.service");
const { sendSuccess, sendError } = require("../utils/response");

async function register(req, res, next) {
  try {
    const data = await authService.registerUser(req.body.name, req.body.email, req.body.password);
    return sendSuccess(res, data, "Registration successful", 201);
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const data = await authService.loginUser(req.body.email, req.body.password);
    return sendSuccess(res, data, "Login successful");
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
  login,
  logout,
  getMe,
  changePassword,
  updatePreferences
};

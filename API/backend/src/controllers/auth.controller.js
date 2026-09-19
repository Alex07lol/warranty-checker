"use strict";

const authService = require("../services/auth.service");
const { sendSuccess } = require("../utils/response");

async function register(req, res, next) {
  try {
    const data = await authService.registerUser(req.body.name, req.body.email, req.body.password);
    return sendSuccess(res, data, data.message || "Registration successful", 201);
  } catch (error) {
    return next(error);
  }
}

async function verifyEmail(req, res, next) {
  try {
    const data = await authService.verifyEmail(req.body.email, req.body.code);
    return sendSuccess(res, data, data.message || "Email verified successfully");
  } catch (error) {
    return next(error);
  }
}

async function resendVerification(req, res, next) {
  try {
    const data = await authService.resendVerificationCode(req.body.email);
    return sendSuccess(res, data, data.message || "Verification code sent");
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const data = await authService.loginUser(req.body.email, req.body.password);
    return sendSuccess(res, data, "Login successful");
  } catch (error) {
    if (error.requiresVerification) {
      return res.status(403).json({
        success: false,
        message: error.message,
        data: {
          requiresVerification: true,
          email: error.email
        }
      });
    }
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

async function forgotPassword(req, res, next) {
  try {
    const data = await authService.requestPasswordReset(req.body.email);
    return sendSuccess(res, data, data.message || "Password reset code sent");
  } catch (error) {
    return next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    const data = await authService.resetPassword(
      req.body.email,
      req.body.code,
      req.body.newPassword
    );
    return sendSuccess(res, data, data.message || "Password reset successfully");
  } catch (error) {
    return next(error);
  }
}

async function requestDeleteAccount(req, res, next) {
  try {
    const data = await authService.requestAccountDeletion(req.user.userId);
    return sendSuccess(res, data, data.message || "Deletion code sent");
  } catch (error) {
    return next(error);
  }
}

async function confirmDeleteAccount(req, res, next) {
  try {
    const data = await authService.confirmAccountDeletion(
      req.user.userId,
      req.body.code
    );
    return sendSuccess(res, data, data.message || "Account deleted successfully");
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  login,
  logout,
  getMe,
  changePassword,
  updatePreferences,
  forgotPassword,
  resetPassword,
  requestDeleteAccount,
  confirmDeleteAccount
};

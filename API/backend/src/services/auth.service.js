"use strict";

const crypto = require("node:crypto");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const { generateToken } = require("../utils/jwtHelper");
const { sendVerificationEmail } = require("./email.service");

function generateVerificationCode() {
  // Generates a cryptographically random 6-digit number between 100000 and 999999
  return crypto.randomInt(100000, 1000000).toString();
}

function hashCode(code) {
  return crypto.createHash("sha256").update(String(code).trim()).digest("hex");
}

async function registerUser(name, email, password) {
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });

  if (existing) {
    if (existing.isEmailVerified) {
      throw new AppError("Email address is already registered", 409);
    }

    // Account exists but is unverified — refresh credentials and send a new OTP
    existing.name = name;
    existing.passwordHash = password;
    const code = generateVerificationCode();
    existing.verificationCodeHash = hashCode(code);
    existing.verificationCodeExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    existing.verificationAttempts = 0;
    existing.lastVerificationSentAt = new Date();
    await existing.save();

    await sendVerificationEmail({
      to: existing.email,
      name: existing.name,
      code,
      expiresMinutes: 15
    });

    return {
      user: {
        _id: existing._id,
        name: existing.name,
        email: existing.email,
        isEmailVerified: false,
        createdAt: existing.createdAt
      },
      email: existing.email,
      requiresVerification: true,
      message: "Verification code sent to your email"
    };
  }

  const code = generateVerificationCode();
  const user = await User.create({
    name,
    email: normalizedEmail,
    passwordHash: password,
    isEmailVerified: false,
    verificationCodeHash: hashCode(code),
    verificationCodeExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    verificationAttempts: 0,
    lastVerificationSentAt: new Date()
  });

  await sendVerificationEmail({
    to: user.email,
    name: user.name,
    code,
    expiresMinutes: 15
  });

  return {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      isEmailVerified: false,
      createdAt: user.createdAt
    },
    email: user.email,
    requiresVerification: true,
    message: "Verification code sent to your email"
  };
}

async function verifyEmail(email, code) {
  const normalizedEmail = String(email || "").toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail }).select(
    "+verificationCodeHash +verificationCodeExpiresAt +verificationAttempts"
  );

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (user.isEmailVerified) {
    const token = generateToken(user._id);
    return {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isEmailVerified: true,
        createdAt: user.createdAt
      },
      token,
      message: "Email is already verified"
    };
  }

  if (user.verificationAttempts >= 5) {
    throw new AppError("Too many failed attempts. Please request a new verification code.", 429);
  }

  if (!user.verificationCodeExpiresAt || user.verificationCodeExpiresAt < new Date()) {
    throw new AppError("Verification code has expired. Please request a new one.", 400);
  }

  const providedHash = hashCode(code);
  if (user.verificationCodeHash !== providedHash) {
    user.verificationAttempts = (user.verificationAttempts || 0) + 1;
    await user.save();
    const remaining = Math.max(0, 5 - user.verificationAttempts);
    throw new AppError(
      `Invalid verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      400
    );
  }

  user.isEmailVerified = true;
  user.verificationCodeHash = undefined;
  user.verificationCodeExpiresAt = undefined;
  user.verificationAttempts = 0;
  await user.save();

  const token = generateToken(user._id);

  return {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      isEmailVerified: true,
      createdAt: user.createdAt
    },
    token,
    message: "Email verified successfully"
  };
}

async function resendVerificationCode(email) {
  const normalizedEmail = String(email || "").toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail }).select(
    "+verificationCodeHash +verificationCodeExpiresAt +lastVerificationSentAt"
  );

  if (!user) {
    // Avoid email enumeration
    return {
      message: "If an account exists with this email, a verification code has been sent."
    };
  }

  if (user.isEmailVerified) {
    return {
      alreadyVerified: true,
      message: "This email address is already verified. You can sign in."
    };
  }

  // 60-second cooldown check
  if (user.lastVerificationSentAt) {
    const elapsedMs = Date.now() - new Date(user.lastVerificationSentAt).getTime();
    if (elapsedMs < 60000) {
      const waitSec = Math.ceil((60000 - elapsedMs) / 1000);
      throw new AppError(
        `Please wait ${waitSec} second${waitSec === 1 ? "" : "s"} before requesting another code.`,
        429
      );
    }
  }

  const code = generateVerificationCode();
  user.verificationCodeHash = hashCode(code);
  user.verificationCodeExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  user.verificationAttempts = 0;
  user.lastVerificationSentAt = new Date();
  await user.save();

  await sendVerificationEmail({
    to: user.email,
    name: user.name,
    code,
    expiresMinutes: 15
  });

  return {
    email: user.email,
    message: "A new verification code has been sent to your email."
  };
}

async function loginUser(email, password) {
  const user = await User.findOne({ email: email.toLowerCase().trim() });

  if (!user?.isActive || !(await user.comparePassword(password))) {
    throw new AppError("Invalid email or password", 401);
  }

  if (!user.isEmailVerified) {
    const err = new AppError("Please verify your email address to continue.", 403);
    err.requiresVerification = true;
    err.email = user.email;
    throw err;
  }

  return {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt
    },
    token: generateToken(user._id)
  };
}

async function getUserById(id) {
  const user = await User.findById(id).select("-passwordHash");

  if (!user) {
    throw new AppError("User not found", 404);
  }

  return user;
}

async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId);

  if (!user || !(await user.comparePassword(currentPassword))) {
    throw new AppError("Current password is incorrect", 400);
  }

  user.passwordHash = newPassword;
  await user.save();
}

// Phase 4 §6: update reminder preferences
async function updateNotificationPreferences(userId, prefs) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (typeof prefs.expiryAlerts === "boolean") {
    user.notificationPreferences.expiryAlerts = prefs.expiryAlerts;
  }
  if (typeof prefs.maintenanceAlerts === "boolean") {
    user.notificationPreferences.maintenanceAlerts = prefs.maintenanceAlerts;
  }
  if (typeof prefs.documentAlerts === "boolean") {
    user.notificationPreferences.documentAlerts = prefs.documentAlerts;
  }
  if (typeof prefs.sharedAccessAlerts === "boolean") {
    user.notificationPreferences.sharedAccessAlerts = prefs.sharedAccessAlerts;
  }
  if (Array.isArray(prefs.reminderDays)) {
    user.notificationPreferences.reminderDays = prefs.reminderDays;
  }

  await user.save();
  return user;
}

module.exports = {
  registerUser,
  verifyEmail,
  resendVerificationCode,
  loginUser,
  getUserById,
  changePassword,
  updateNotificationPreferences
};

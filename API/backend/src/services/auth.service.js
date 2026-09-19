"use strict";

const crypto = require("node:crypto");
const User = require("../models/User");
const Product = require("../models/Product");
const Document = require("../models/Document");
const ServiceHistory = require("../models/ServiceHistory");
const Share = require("../models/Share");
const Notification = require("../models/Notification");
const AppError = require("../utils/AppError");
const { generateToken } = require("../utils/jwtHelper");
const cloudinary = require("../config/cloudinary");
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendAccountDeletionEmail
} = require("./email.service");

function generateVerificationCode() {
  // Generates a cryptographically random 6-digit number between 100000 and 999999
  return crypto.randomInt(100000, 1000000).toString();
}

function hashCode(code) {
  return crypto.createHash("sha256").update(String(code).trim()).digest("hex");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Gmail (and Googlemail) ignore dots inside the local part and everything from a
// "+" onwards, so john.doe+receipts@gmail.com, johndoe@googlemail.com and
// johndoe@gmail.com all belong to one mailbox — and therefore one user. Reduce
// an address to that canonical identity; every other domain is left untouched.
function canonicalEmail(email) {
  const raw = String(email || "").trim().toLowerCase();
  const at = raw.lastIndexOf("@");
  if (at < 1) return raw;
  let local = raw.slice(0, at);
  let domain = raw.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain !== "gmail.com") return local + "@" + domain;
  local = local.split("+")[0].replace(/\./g, "");
  return local + "@gmail.com";
}

// Matches the address exactly plus every Gmail spelling of the same mailbox
// that may already be stored (rows created before this rule existed are not
// canonicalised, so the regex is the only way to find them).
function emailMatchQuery(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const canonical = canonicalEmail(normalized);
  if (!canonical.endsWith("@gmail.com")) return { email: normalized };
  // "jdoe" -> ^j\.?d\.?o\.?e(\+.+)?@(gmail|googlemail)\.com$
  const local = canonical.slice(0, -"@gmail.com".length);
  const dotted = local.split("").map(escapeRegex).join("\\.?");
  const pattern = new RegExp("^" + dotted + "(\\+.+)?@(gmail|googlemail)\\.com$", "i");
  return { $or: [{ email: normalized }, { email: pattern }] };
}

// Sign-in tolerates the alias spellings above. Legacy databases can already
// hold several rows for one mailbox, so every candidate is tried and the one
// whose password actually matches wins (instead of failing on an arbitrary row).
async function findUserByCredentials(email, password) {
  const candidates = await User.find(emailMatchQuery(email)).limit(10);
  for (const candidate of candidates) {
    if (candidate.isActive && (await candidate.comparePassword(password))) {
      return candidate;
    }
  }
  return null;
}

async function registerUser(name, email, password) {
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.findOne(emailMatchQuery(normalizedEmail));

  if (existing) {
    if (existing.isEmailVerified) {
      // 409 is what the web client turns into the "this email already exists"
      // popup, so the message must keep saying the address is already taken.
      throw new AppError("This email address already exists in the database", 409);
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
  const user = await findUserByCredentials(email, password);

  if (!user) {
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
    email: user.email,
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

async function requestPasswordReset(email) {
  const normalizedEmail = String(email || "").toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail }).select(
    "+lastResetPasswordSentAt"
  );

  if (!user) {
    // Avoid email enumeration
    return {
      message: "If an account exists with this email, a password reset code has been sent."
    };
  }

  if (user.lastResetPasswordSentAt) {
    const elapsedMs = Date.now() - new Date(user.lastResetPasswordSentAt).getTime();
    if (elapsedMs < 60000) {
      const waitSec = Math.ceil((60000 - elapsedMs) / 1000);
      throw new AppError(
        `Please wait ${waitSec} second${waitSec === 1 ? "" : "s"} before requesting another reset code.`,
        429
      );
    }
  }

  const code = generateVerificationCode();
  user.resetPasswordCodeHash = hashCode(code);
  user.resetPasswordExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  user.resetPasswordAttempts = 0;
  user.lastResetPasswordSentAt = new Date();
  await user.save();

  await sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    code,
    expiresMinutes: 15
  });

  return {
    email: user.email,
    message: "A password reset code has been sent to your email."
  };
}

async function resetPassword(email, code, newPassword) {
  const normalizedEmail = String(email || "").toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail }).select(
    "+passwordHash +resetPasswordCodeHash +resetPasswordExpiresAt +resetPasswordAttempts"
  );

  if (!user) {
    throw new AppError("Invalid or expired password reset code.", 400);
  }

  if (user.resetPasswordAttempts >= 5) {
    throw new AppError(
      "Too many failed attempts. Please request a new password reset code.",
      429
    );
  }

  if (!user.resetPasswordExpiresAt || user.resetPasswordExpiresAt < new Date()) {
    throw new AppError(
      "Password reset code has expired. Please request a new one.",
      400
    );
  }

  const providedHash = hashCode(code);
  if (user.resetPasswordCodeHash !== providedHash) {
    user.resetPasswordAttempts = (user.resetPasswordAttempts || 0) + 1;
    await user.save();
    const remaining = Math.max(0, 5 - user.resetPasswordAttempts);
    throw new AppError(
      `Invalid reset code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      400
    );
  }

  user.passwordHash = newPassword;
  user.resetPasswordCodeHash = undefined;
  user.resetPasswordExpiresAt = undefined;
  user.resetPasswordAttempts = 0;
  await user.save();

  return {
    message: "Password has been successfully reset. You can now log in with your new password."
  };
}

async function requestAccountDeletion(userId) {
  const user = await User.findById(userId).select("+lastDeleteAccountSentAt");

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (user.lastDeleteAccountSentAt) {
    const elapsedMs = Date.now() - new Date(user.lastDeleteAccountSentAt).getTime();
    if (elapsedMs < 60000) {
      const waitSec = Math.ceil((60000 - elapsedMs) / 1000);
      throw new AppError(
        `Please wait ${waitSec} second${waitSec === 1 ? "" : "s"} before requesting another deletion code.`,
        429
      );
    }
  }

  const code = generateVerificationCode();
  user.deleteAccountCodeHash = hashCode(code);
  user.deleteAccountExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  user.deleteAccountAttempts = 0;
  user.lastDeleteAccountSentAt = new Date();
  await user.save();

  await sendAccountDeletionEmail({
    to: user.email,
    name: user.name,
    code,
    expiresMinutes: 15
  });

  return {
    email: user.email,
    message: "An account deletion confirmation code has been sent to your email."
  };
}

async function confirmAccountDeletion(userId, code) {
  const user = await User.findById(userId).select(
    "+deleteAccountCodeHash +deleteAccountExpiresAt +deleteAccountAttempts"
  );

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (user.deleteAccountAttempts >= 5) {
    throw new AppError(
      "Too many failed attempts. Please request a new deletion code.",
      429
    );
  }

  if (!user.deleteAccountExpiresAt || user.deleteAccountExpiresAt < new Date()) {
    throw new AppError(
      "Account deletion code has expired. Please request a new one.",
      400
    );
  }

  const providedHash = hashCode(code);
  if (user.deleteAccountCodeHash !== providedHash) {
    user.deleteAccountAttempts = (user.deleteAccountAttempts || 0) + 1;
    await user.save();
    const remaining = Math.max(0, 5 - user.deleteAccountAttempts);
    throw new AppError(
      `Invalid deletion code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      400
    );
  }

  // Cloudinary asset cleanup (best effort, non-blocking)
  if (typeof cloudinary.isConfigured === "function" && cloudinary.isConfigured()) {
    try {
      const userDocs = await Document.find({ userId }).select("publicId");
      const destroyPromises = userDocs
        .filter((doc) => Boolean(doc.publicId))
        .map((doc) =>
          cloudinary.uploader.destroy(doc.publicId, { resource_type: "image" })
        );
      await Promise.allSettled(destroyPromises);
    } catch {
      // Non-blocking cleanup
    }
  }

  // Cascade deletion across MongoDB collections
  await Promise.all([
    Product.deleteMany({ userId }),
    Document.deleteMany({ userId }),
    ServiceHistory.deleteMany({ userId }),
    Share.deleteMany({ userId }),
    Notification.deleteMany({ userId }),
    User.findByIdAndDelete(userId)
  ]);

  return {
    message: "Your account and all associated data have been permanently deleted."
  };
}

module.exports = {
  registerUser,
  verifyEmail,
  resendVerificationCode,
  loginUser,
  getUserById,
  changePassword,
  updateNotificationPreferences,
  // Exported so the Gmail-alias duplicate rule is unit-testable on its own.
  canonicalEmail,
  emailMatchQuery,
  requestPasswordReset,
  resetPassword,
  requestAccountDeletion,
  confirmAccountDeletion
};

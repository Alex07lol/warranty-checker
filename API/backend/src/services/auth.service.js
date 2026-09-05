const User = require("../models/User");
const AppError = require("../utils/AppError");
const { generateToken } = require("../utils/jwtHelper");
const {
  generateCode,
  sendVerificationEmail,
  sendLoginVerificationEmail
} = require("./email.service");

async function registerUser(name, email, password) {
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });

  if (existing) {
    throw new AppError("Email address is already registered", 409);
  }

  const verificationCode = generateCode();
  const verificationExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

  const user = await User.create({
    name,
    email: normalizedEmail,
    passwordHash: password,
    isEmailVerified: false,
    emailVerificationCode: verificationCode,
    emailVerificationExpires: verificationExpires
  });

  await sendVerificationEmail(user.email, user.name, verificationCode);

  return {
    requiresVerification: true,
    verificationType: "email",
    message: "Registration initiated. Please verify your email with the code sent to your inbox.",
    email: user.email,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      isEmailVerified: false,
      createdAt: user.createdAt
    },
    ...(process.env.NODE_ENV !== "production" ? { verificationCode } : {})
  };
}

async function verifyEmail(email, code) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

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

  if (!user.emailVerificationCode || user.emailVerificationCode !== code.trim()) {
    throw new AppError("Invalid verification code", 400);
  }

  if (!user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
    throw new AppError("Verification code has expired. Please request a new code.", 400);
  }

  user.isEmailVerified = true;
  user.emailVerificationCode = null;
  user.emailVerificationExpires = null;
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
    token
  };
}

async function resendVerification(email, type = "email") {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  const code = generateCode();

  if (type === "login") {
    user.loginVerificationCode = code;
    user.loginVerificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
    await user.save();
    await sendLoginVerificationEmail(user.email, user.name, code);
    return {
      message: "Login verification code resent to your email",
      email: user.email,
      ...(process.env.NODE_ENV !== "production" ? { verificationCode: code } : {})
    };
  }

  if (user.isEmailVerified) {
    throw new AppError("Email is already verified", 400);
  }

  user.emailVerificationCode = code;
  user.emailVerificationExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
  await user.save();
  await sendVerificationEmail(user.email, user.name, code);

  return {
    message: "Verification code resent to your email",
    email: user.email,
    ...(process.env.NODE_ENV !== "production" ? { verificationCode: code } : {})
  };
}

async function loginUser(email, password, code = null) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user?.isActive || !(await user.comparePassword(password))) {
    throw new AppError("Invalid email or password", 401);
  }

  // 1. If email is not verified from signup, require email verification
  if (!user.isEmailVerified) {
    if (code) {
      if (!user.emailVerificationCode || user.emailVerificationCode !== code.trim()) {
        throw new AppError("Invalid verification code", 400);
      }
      if (!user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
        throw new AppError("Verification code has expired. Please request a new code.", 400);
      }
      user.isEmailVerified = true;
      user.emailVerificationCode = null;
      user.emailVerificationExpires = null;
      await user.save();
      return {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          isEmailVerified: true,
          createdAt: user.createdAt
        },
        token: generateToken(user._id)
      };
    }

    const verificationCode = generateCode();
    user.emailVerificationCode = verificationCode;
    user.emailVerificationExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();
    await sendVerificationEmail(user.email, user.name, verificationCode);

    return {
      requiresVerification: true,
      verificationType: "email",
      email: user.email,
      message: "Please verify your email before logging in. A verification code has been sent to your email.",
      ...(process.env.NODE_ENV !== "production" ? { verificationCode } : {})
    };
  }

  // 2. Verified user -> Login verification (email OTP)
  if (code) {
    if (!user.loginVerificationCode || user.loginVerificationCode !== code.trim()) {
      throw new AppError("Invalid verification code", 400);
    }
    if (!user.loginVerificationExpires || user.loginVerificationExpires < new Date()) {
      throw new AppError("Verification code has expired. Please request a new code.", 400);
    }

    user.loginVerificationCode = null;
    user.loginVerificationExpires = null;
    await user.save();

    return {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isEmailVerified: true,
        createdAt: user.createdAt
      },
      token: generateToken(user._id)
    };
  }

  if (process.env.REQUIRE_LOGIN_VERIFICATION === "false") {
    return {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isEmailVerified: true,
        createdAt: user.createdAt
      },
      token: generateToken(user._id)
    };
  }

  const loginCode = generateCode();
  user.loginVerificationCode = loginCode;
  user.loginVerificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
  await user.save();
  await sendLoginVerificationEmail(user.email, user.name, loginCode);

  return {
    requiresVerification: true,
    verificationType: "login",
    email: user.email,
    message: "A login verification code has been sent to your email.",
    ...(process.env.NODE_ENV !== "production" ? { verificationCode: loginCode } : {})
  };
}

async function verifyLogin(email, code) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (!user.loginVerificationCode || user.loginVerificationCode !== code.trim()) {
    throw new AppError("Invalid verification code", 400);
  }

  if (!user.loginVerificationExpires || user.loginVerificationExpires < new Date()) {
    throw new AppError("Verification code has expired. Please request a new code.", 400);
  }

  user.loginVerificationCode = null;
  user.loginVerificationExpires = null;
  await user.save();

  const token = generateToken(user._id);

  return {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt
    },
    token
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
  resendVerification,
  loginUser,
  verifyLogin,
  getUserById,
  changePassword,
  updateNotificationPreferences
};

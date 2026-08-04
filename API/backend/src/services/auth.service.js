const User = require("../models/User");
const AppError = require("../utils/AppError");
const { generateToken } = require("../utils/jwtHelper");

async function registerUser(name, email, password) {
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });

  if (existing) {
    throw new AppError("Email address is already registered", 409);
  }

  const user = await User.create({
    name,
    email: normalizedEmail,
    passwordHash: password
  });

  const token = generateToken(user._id);

  return {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt
    },
    token
  };
}

async function loginUser(email, password) {
  const user = await User.findOne({ email: email.toLowerCase().trim() });

  if (!user || !user.isActive || !(await user.comparePassword(password))) {
    throw new AppError("Invalid email or password", 401);
  }

  return {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
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

module.exports = {
  registerUser,
  loginUser,
  getUserById,
  changePassword
};

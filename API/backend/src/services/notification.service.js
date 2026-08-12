const Notification = require("../models/Notification");
const Product = require("../models/Product");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const mongoose = require("mongoose");
const { paginate, paginationMeta } = require("../utils/pagination");

async function getNotifications(userId, unreadOnly = false, page, limit) {
  const filter = { userId };
  if (unreadOnly) {
    filter.isRead = false;
  }
  const { page: safePage, limit: safeLimit, skip } = paginate(page, limit);
  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .populate("productId", "productName warrantyExpiryDate")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    Notification.countDocuments(filter)
  ]);
  return { notifications, pagination: paginationMeta(total, safePage, safeLimit) };
}

async function markAsRead(notificationId, userId) {
  if (!mongoose.isValidObjectId(notificationId)) {
    throw new AppError("Invalid notification ID", 400);
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { isRead: true },
    { new: true }
  );

  if (!notification) {
    throw new AppError("Notification not found", 404);
  }

  return notification;
}

async function markAllAsRead(userId) {
  await Notification.updateMany(
    { userId, isRead: false },
    { isRead: true }
  );
}

async function deleteNotification(notificationId, userId) {
  if (!mongoose.isValidObjectId(notificationId)) {
    throw new AppError("Invalid notification ID", 400);
  }

  const result = await Notification.deleteOne({
    _id: notificationId,
    userId
  });

  if (!result.deletedCount) {
    throw new AppError("Notification not found", 404);
  }
}

async function createExpiryNotifications() {
  const users = await User.find({
    isActive: true,
    "notificationPreferences.expiryAlerts": true
  }).select("_id notificationPreferences.reminderDays");

  // Each user's own reminder days (schema default is [30, 7, 1] when the
  // preference is unset; an explicit empty array means no reminders).
  const userDays = new Map();
  let maxDay = 0;
  for (const user of users) {
    const days = new Set(
      (user.notificationPreferences.reminderDays || [30, 7, 1]).filter(
        (day) => Number.isInteger(day) && day > 0
      )
    );
    if (days.size > 0) maxDay = Math.max(maxDay, ...days);
    userDays.set(String(user._id), days);
  }
  if (maxDay === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + maxDay);
  windowEnd.setHours(23, 59, 59, 999);

  // One query for every live product expiring inside the reminder window,
  // regardless of user — served by the { userId, isDeleted, warrantyExpiryDate }
  // compound index. (Previously this was a per-user, per-day product query.)
  const products = await Product.find({
    isDeleted: false,
    warrantyExpiryDate: { $gte: today, $lte: windowEnd }
  })
    .select("_id userId productName warrantyExpiryDate")
    .lean();

  if (products.length === 0) return 0;

  // Map each product to the reminder day(s) its expiry lands on — matched
  // against the *owner's* own reminder days, never another user's.
  const candidates = [];
  const userIds = new Set();
  const productIds = new Set();
  for (const product of products) {
    const ownerDays = userDays.get(String(product.userId));
    if (!ownerDays) continue;
    const expiry = product.warrantyExpiryDate;
    for (const day of ownerDays) {
      const dayStart = new Date(today);
      dayStart.setDate(dayStart.getDate() + day);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      if (expiry >= dayStart && expiry <= dayEnd) {
        candidates.push({
          userId: product.userId,
          productId: product._id,
          day,
          title: `Warranty expires in ${day} day${day === 1 ? "" : "s"}`,
          message: `${product.productName} warranty expires on ${expiry.toISOString().slice(0, 10)}.`,
          scheduledAt: dayStart
        });
        userIds.add(String(product.userId));
        productIds.add(String(product._id));
      }
    }
  }

  if (candidates.length === 0) return 0;

  // One query to learn which candidates already have a notification
  // (previously a separate exists() round-trip per product).
  const existing = await Notification.find({
    userId: { $in: [...userIds] },
    productId: { $in: [...productIds] },
    notificationType: "warranty_expiry",
    scheduledAt: { $gte: today, $lte: windowEnd }
  })
    .select("userId productId scheduledAt")
    .lean();

  const seen = new Set(existing.map((n) => `${n.userId}|${n.productId}|${+n.scheduledAt}`));
  const toCreate = candidates.filter(
    (c) => !seen.has(`${c.userId}|${c.productId}|${+c.scheduledAt}`)
  );

  if (toCreate.length === 0) return 0;

  // One bulk insert instead of one create() per product.
  await Notification.insertMany(
    toCreate.map(({ userId, productId, title, message, scheduledAt }) => ({
      userId,
      productId,
      notificationType: "warranty_expiry",
      title,
      message,
      scheduledAt
    }))
  );

  return toCreate.length;
}

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  createExpiryNotifications
};

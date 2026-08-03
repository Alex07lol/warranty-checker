const Notification = require("../models/Notification");
const Product = require("../models/Product");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const mongoose = require("mongoose");

async function getNotifications(userId, unreadOnly = false) {
  const filter = { userId };
  if (unreadOnly) {
    filter.isRead = false;
  }

  return Notification.find(filter)
    .populate("productId", "productName warrantyExpiryDate")
    .sort({ createdAt: -1 });
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
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let created = 0;

  for (const user of users) {
    const reminderDays = user.notificationPreferences.reminderDays || [30, 7, 1];

    for (const days of reminderDays) {
      const targetStart = new Date(today);
      targetStart.setDate(targetStart.getDate() + days);

      const targetEnd = new Date(targetStart);
      targetEnd.setHours(23, 59, 59, 999);

      const products = await Product.find({
        userId: user._id,
        isDeleted: false,
        warrantyExpiryDate: {
          $gte: targetStart,
          $lte: targetEnd
        }
      });

      for (const product of products) {
        const exists = await Notification.exists({
          userId: user._id,
          productId: product._id,
          notificationType: "warranty_expiry",
          scheduledAt: targetStart
        });

        if (!exists) {
          await Notification.create({
            userId: user._id,
            productId: product._id,
            notificationType: "warranty_expiry",
            title: `Warranty expires in ${days} day${days === 1 ? "" : "s"}`,
            message: `${product.productName} warranty expires on ${product.warrantyExpiryDate.toISOString().slice(0, 10)}.`,
            scheduledAt: targetStart
          });
          created += 1;
        }
      }
    }
  }

  return created;
}

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  createExpiryNotifications
};

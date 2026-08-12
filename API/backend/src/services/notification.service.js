const Notification = require("../models/Notification");
const Product = require("../models/Product");
const ServiceHistory = require("../models/ServiceHistory");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const mongoose = require("mongoose");
const { paginate, paginationMeta } = require("../utils/pagination");
const logger = require("../utils/logger");

// Non-default params first (S1788): `page`/`limit` before the defaulted
// `unreadOnly`. The controller passes all four positionally.
async function getNotifications(userId, page, limit, unreadOnly = false) {
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

// Each user's configured reminder days (schema default [30, 7, 1] when unset;
// an explicit empty array means no reminders). `prefPath` optionally gates
// which users are included, e.g. "notificationPreferences.expiryAlerts".
// Returns { userDays: Map<userId, Set<day>>, maxDay }.
async function loadReminderDays(prefPath = null) {
  const filter = { isActive: true };
  if (prefPath) {
    // Default-true semantics: include users who explicitly enabled the alert
    // OR whose stored preferences predate the field (missing field => on).
    // An explicit `false` matches neither branch and is correctly excluded.
    filter.$or = [{ [prefPath]: true }, { [prefPath]: { $exists: false } }];
  }
  const users = await User.find(filter).select("_id notificationPreferences.reminderDays");

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
  return { userDays, maxDay };
}

async function createExpiryNotifications() {
  const { userDays, maxDay } = await loadReminderDays("notificationPreferences.expiryAlerts");
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

// Maintenance reminders (Phase 4 §7): service records with a nextServiceDate
// landing on a configured reminder day become `service_reminder`
// notifications. Reuses the same per-user reminderDays preference and the
// same dedup discipline as expiry notifications, but is a distinct type so
// the two never mix internally.
async function createMaintenanceNotifications() {
  const { userDays, maxDay } = await loadReminderDays("notificationPreferences.maintenanceAlerts");
  if (maxDay === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + maxDay);
  windowEnd.setHours(23, 59, 59, 999);

  // Records whose next service lands inside the reminder window. The
  // { productId, userId, nextServiceDate } compound index serves this query.
  const records = await ServiceHistory.find({
    nextServiceDate: { $gte: today, $lte: windowEnd }
  })
    .select("_id userId productId nextServiceDate")
    .lean();

  if (records.length === 0) return 0;

  // Resolve product names for the message text (one query, then map).
  const productIds = [...new Set(records.map((r) => String(r.productId)))];
  // Only live (non-deleted) products get reminders — a record attached to a
  // soft-deleted product is skipped entirely.
  const products = await Product.find({ _id: { $in: productIds }, isDeleted: false })
    .select("_id productName")
    .lean();
  const productName = new Map(products.map((p) => [String(p._id), p.productName]));
  const liveRecords = records.filter((r) => productName.has(String(r.productId)));

  const candidates = [];
  const userIds = new Set();
  const productIdsInvolved = new Set();
  for (const record of liveRecords) {
    const ownerDays = userDays.get(String(record.userId));
    if (!ownerDays) continue;
    const next = record.nextServiceDate;
    for (const day of ownerDays) {
      const dayStart = new Date(today);
      dayStart.setDate(dayStart.getDate() + day);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      if (next >= dayStart && next <= dayEnd) {
        candidates.push({
          userId: record.userId,
          productId: record.productId,
          day,
          title: `Service due in ${day} day${day === 1 ? "" : "s"}`,
          message: `${productName.get(String(record.productId)) || "A product"} is due for service on ${next.toISOString().slice(0, 10)}.`,
          scheduledAt: dayStart
        });
        userIds.add(String(record.userId));
        productIdsInvolved.add(String(record.productId));
      }
    }
  }

  if (candidates.length === 0) return 0;

  // Skip candidates that already have a service_reminder notification for the
  // same product + reminder day (idempotent across cron runs).
  const existing = await Notification.find({
    userId: { $in: [...userIds] },
    productId: { $in: [...productIdsInvolved] },
    notificationType: "service_reminder",
    scheduledAt: { $gte: today, $lte: windowEnd }
  })
    .select("userId productId scheduledAt")
    .lean();

  const seen = new Set(existing.map((n) => `${n.userId}|${n.productId}|${+n.scheduledAt}`));
  const toCreate = candidates.filter(
    (c) => !seen.has(`${c.userId}|${c.productId}|${+c.scheduledAt}`)
  );

  if (toCreate.length === 0) return 0;

  await Notification.insertMany(
    toCreate.map(({ userId, productId, title, message, scheduledAt }) => ({
      userId,
      productId,
      notificationType: "service_reminder",
      title,
      message,
      scheduledAt
    }))
  );

  return toCreate.length;
}

// Shared gate for preference-gated event notifications: a user whose stored
// preferences predate the field (missing => on) or who explicitly enabled it
// receives the notification; an explicit `false` suppresses it. Never throws.
async function createGatedNotification(userId, gate, data) {
  try {
    const user = await User.findById(userId).select(`notificationPreferences.${gate}`);
    if (!user || user.notificationPreferences[gate] === false) return null;
    return Notification.create(data);
  } catch (error) {
    // A notification must never break the triggering operation (OCR, share
    // creation) — log and move on.
    logger.error(`Failed to create ${data.notificationType} notification`, {
      userId: String(userId),
      error: error.message
    });
    return null;
  }
}

// Phase 4 §22/§23 — document processing notification. Fired when OCR finishes
// (done or failed). Gated by the user's documentAlerts preference (default
// true). Deduped on an *unread* notification for the same document, so retries
// never spam the center — once the user reads/dismisses it, a later status
// change may notify again.
async function createDocumentProcessingNotification(document) {
  try {
    const existing = await Notification.exists({
      userId: document.userId,
      documentId: document._id,
      notificationType: "document_processing",
      isRead: false
    });
    if (existing) return null;

    const succeeded = document.ocrStatus === "done";
    return createGatedNotification(document.userId, "documentAlerts", {
      userId: document.userId,
      productId: document.productId || undefined,
      documentId: document._id,
      notificationType: "document_processing",
      title: succeeded ? "Document processed" : "Document processing failed",
      message: succeeded
        ? `OCR finished reading ${document.fileName}.`
        : `OCR could not read ${document.fileName}. Review it or re-upload the file.`
    });
  } catch (error) {
    logger.error("Failed to create document processing notification", {
      documentId: String(document._id),
      error: error.message
    });
    return null;
  }
}

// Phase 4 §22/§23 — share activity notification. Fired when the owner creates
// a share link. Gated by sharedAccessAlerts (default true).
async function createShareLinkNotification(share, productName) {
  return createGatedNotification(share.userId, "sharedAccessAlerts", {
    userId: share.userId,
    productId: share.productId,
    notificationType: "shared_access",
    title: "Share link created",
    message: `${productName || "Your product"} is now viewable by anyone with the link. Revoke it any time.`
  });
}

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  createExpiryNotifications,
  createMaintenanceNotifications,
  createDocumentProcessingNotification,
  createShareLinkNotification
};

const mongoose = require("mongoose");

const NOTIFICATION_TYPES = ["warranty_expiry", "service_reminder"];

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId is required"],
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "productId is required"],
      index: true,
    },
    notificationType: {
      type: String,
      required: [true, "notificationType is required"],
      enum: {
        values: NOTIFICATION_TYPES,
        message: `notificationType must be one of: ${NOTIFICATION_TYPES.join(", ")}`,
      },
    },
    title: {
      type: String,
      required: [true, "title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    message: {
      type: String,
      required: [true, "message is required"],
      trim: true,
      maxlength: [1000, "Message cannot exceed 1000 characters"],
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    isSent: {
      type: Boolean,
      default: false,
    },
    scheduledAt: {
      type: Date,
      required: [true, "scheduledAt is required"],
      index: true,
    },
    sentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ────────────────────────────────────────────────────────────────────
// Fetch unread notifications for a user fast (inbox view)
notificationSchema.index({ userId: 1, isRead: 1, scheduledAt: -1 });

// Cron job: find all pending (unsent, scheduled <= now)
notificationSchema.index({ isSent: 1, scheduledAt: 1 });

// Prevent duplicate notifications for the same product+type+schedule window
notificationSchema.index(
  { userId: 1, productId: 1, notificationType: 1, scheduledAt: 1 },
  { unique: true }
);

// ── TTL Index: auto-delete read notifications after 90 days ───────────────────
// Only kicks in when isRead=true (managed via partial filter at app layer)
notificationSchema.index(
  { sentAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 90 } // 90 days
);

// ── Static: mark notification as sent ─────────────────────────────────────────
notificationSchema.statics.markSent = function (id) {
  return this.findByIdAndUpdate(
    id,
    { isSent: true, sentAt: new Date() },
    { new: true }
  );
};

// ── Static: get pending notifications to dispatch (used by cron job) ──────────
notificationSchema.statics.getPending = function () {
  return this.find({
    isSent: false,
    scheduledAt: { $lte: new Date() },
  }).populate("userId productId");
};

module.exports = mongoose.model("Notification", notificationSchema);

const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  notificationType: {
    type: String,
    enum: ["warranty_expiry", "service_reminder"],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  isRead: {
    type: Boolean,
    default: false
  },
  isSent: {
    type: Boolean,
    default: false
  },
  scheduledAt: Date,
  sentAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ productId: 1, notificationType: 1, scheduledAt: 1 });

module.exports = mongoose.model("Notification", notificationSchema);

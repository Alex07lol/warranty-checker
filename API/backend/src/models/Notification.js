const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  // Optional: warranty/service reminders always carry the product; document
  // processing notifications for standalone documents may not have one yet.
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    index: true
  },
  // Optional: set for document_processing notifications so the UI can link
  // straight to the document.
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Document",
    index: true
  },
  notificationType: {
    type: String,
    enum: [
      "warranty_expiry",
      "service_reminder",
      "document_processing",
      "shared_access",
      "system"
    ],
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

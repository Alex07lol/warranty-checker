const mongoose = require("mongoose");

const SERVICE_TYPES = [
  "repair",
  "maintenance",
  "inspection",
  "replacement",
  "other",
];

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "JPY", "CAD"];

const serviceHistorySchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "productId is required"],
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId is required"],
      index: true,
    },
    serviceDate: {
      type: Date,
      required: [true, "serviceDate is required"],
      validate: {
        validator: (d) => d <= new Date(),
        message: "Service date cannot be in the future",
      },
    },
    serviceType: {
      type: String,
      required: [true, "serviceType is required"],
      enum: {
        values: SERVICE_TYPES,
        message: `serviceType must be one of: ${SERVICE_TYPES.join(", ")}`,
      },
    },
    serviceProvider: {
      type: String,
      trim: true,
      maxlength: [200, "Service provider name cannot exceed 200 characters"],
    },
    cost: {
      type: Number,
      min: [0, "Cost cannot be negative"],
      default: 0,
    },
    currency: {
      type: String,
      enum: {
        values: CURRENCIES,
        message: `Currency must be one of: ${CURRENCIES.join(", ")}`,
      },
      default: "INR",
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    documentIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Document",
      default: [],
      // Array of attached receipts / invoices
    },
    nextServiceDate: {
      type: Date,
      validate: {
        validator: function (d) {
          // nextServiceDate must be after serviceDate if provided
          return !this.serviceDate || d > this.serviceDate;
        },
        message: "nextServiceDate must be after serviceDate",
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ────────────────────────────────────────────────────────────────────
serviceHistorySchema.index({ productId: 1, serviceDate: -1 });
serviceHistorySchema.index({ userId: 1, serviceDate: -1 });
serviceHistorySchema.index({ nextServiceDate: 1 }); // used by cron to find upcoming services

// ── Virtual: days until next service ──────────────────────────────────────────
serviceHistorySchema.virtual("daysUntilNextService").get(function () {
  if (!this.nextServiceDate) return null;
  const diff = this.nextServiceDate - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

module.exports = mongoose.model("ServiceHistory", serviceHistorySchema);

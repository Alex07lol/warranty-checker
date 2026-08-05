const mongoose = require("mongoose");

const CATEGORIES = [
  "Laptop",
  "Mobile",
  "Tablet",
  "TV",
  "Appliance",
  "Camera",
  "Audio",
  "Wearable",
  "Gaming",
  "Other",
];

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "JPY", "CAD"];

const productSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId is required"],
      index: true,
    },
    productName: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      maxlength: [200, "Product name cannot exceed 200 characters"],
    },
    brand: {
      type: String,
      trim: true,
      maxlength: [100, "Brand cannot exceed 100 characters"],
    },
    model: {
      type: String,
      trim: true,
      maxlength: [100, "Model cannot exceed 100 characters"],
    },
    category: {
      type: String,
      enum: {
        values: CATEGORIES,
        message: `Category must be one of: ${CATEGORIES.join(", ")}`,
      },
      default: "Other",
    },
    purchaseDate: {
      type: Date,
      required: [true, "Purchase date is required"],
      validate: {
        validator: (d) => d <= new Date(),
        message: "Purchase date cannot be in the future",
      },
    },
    purchasePrice: {
      type: Number,
      min: [0, "Purchase price cannot be negative"],
    },
    currency: {
      type: String,
      enum: {
        values: CURRENCIES,
        message: `Currency must be one of: ${CURRENCIES.join(", ")}`,
      },
      default: "INR",
    },
    purchaseStore: {
      type: String,
      trim: true,
      maxlength: [200, "Store name cannot exceed 200 characters"],
    },
    serialNumber: {
      type: String,
      trim: true,
      maxlength: [100, "Serial number cannot exceed 100 characters"],
    },
    warrantyPeriodMonths: {
      type: Number,
      min: [0, "Warranty period cannot be negative"],
      max: [600, "Warranty period seems unrealistically large"],
    },
    warrantyExpiryDate: {
      type: Date,
      // Computed field: set by pre-save hook from purchaseDate + warrantyPeriodMonths
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [2000, "Notes cannot exceed 2000 characters"],
    },
    thumbnailUrl: {
      type: String,
      trim: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ────────────────────────────────────────────────────────────────────
productSchema.index({ userId: 1, isDeleted: 1 });
productSchema.index({ userId: 1, warrantyExpiryDate: 1 });
productSchema.index({ userId: 1, category: 1 });
productSchema.index({ warrantyExpiryDate: 1 }); // used by cron job for global scans

// ── Pre-save Hook: auto-compute warrantyExpiryDate ─────────────────────────────
productSchema.pre("save", function (next) {
  if (
    (this.isModified("purchaseDate") || this.isModified("warrantyPeriodMonths")) &&
    this.purchaseDate &&
    this.warrantyPeriodMonths != null
  ) {
    const expiry = new Date(this.purchaseDate);
    expiry.setMonth(expiry.getMonth() + this.warrantyPeriodMonths);
    this.warrantyExpiryDate = expiry;
  }
  next();
});

// ── Virtual: days until warranty expires ──────────────────────────────────────
productSchema.virtual("warrantyDaysRemaining").get(function () {
  if (!this.warrantyExpiryDate) return null;
  const diff = this.warrantyExpiryDate - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// ── Virtual: warranty status ──────────────────────────────────────────────────
productSchema.virtual("warrantyStatus").get(function () {
  const days = this.warrantyDaysRemaining;
  if (days === null) return "unknown";
  if (days < 0) return "expired";
  if (days <= 30) return "expiring_soon";
  return "active";
});

// ── Query Helpers (soft-delete filter) ────────────────────────────────────────
productSchema.statics.findActive = function (filter = {}) {
  return this.find({ ...filter, isDeleted: false });
};

module.exports = mongoose.model("Product", productSchema);

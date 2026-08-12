const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    productName: {
      type: String,
      required: true,
      minlength: 1,
      trim: true
    },
    brand: {
      type: String,
      trim: true
    },
    model: {
      type: String,
      trim: true
    },
    category: {
      type: String,
      trim: true
    },
    purchaseDate: Date,
    purchasePrice: {
      type: Number,
      min: 0
    },
    currency: String,
    purchaseStore: String,
    serialNumber: String,
    warrantyExpiryDate: Date,
    warrantyPeriodMonths: {
      type: Number,
      min: 1
    },
    notes: String,
    isDeleted: {
      type: Boolean,
      default: false
    },
    thumbnailUrl: String
  },
  {
    timestamps: true
  }
);

productSchema.index({ userId: 1 });
productSchema.index({ warrantyExpiryDate: 1 });
productSchema.index({ userId: 1, isDeleted: 1 });
// DB-level invariant backing the application-level serial deduplication:
// one active (non-deleted) product per serial number per user. Products
// without a serial are excluded (partial filter), and soft-deleted products
// don't hold their serial hostage. Duplicate-key races are handled
// gracefully in product.service (re-query and reuse instead of crashing).
productSchema.index(
  { userId: 1, serialNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { serialNumber: { $type: "string" }, isDeleted: false }
  }
);
// Compound index serving dashboard/expiry-range queries that filter on
// { userId, isDeleted, warrantyExpiryDate } and sort by expiry date.
productSchema.index({ userId: 1, isDeleted: 1, warrantyExpiryDate: 1 });
productSchema.index({ productName: "text", brand: "text", model: "text" });

module.exports = mongoose.model("Product", productSchema);

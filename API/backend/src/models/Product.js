const mongoose = require("mongoose");

// Phase 4: additional coverage periods on a product (standard + extended
// warranties, accidental-damage protection, etc.). Each period carries the
// raw dates and notes; the centralized warranty-status engine (Phase 4)
// derives `status` from those dates so it stays consistent everywhere.
const warrantyPeriodSchema = new mongoose.Schema(
  {
    type: { type: String, trim: true }, // e.g. "Standard warranty", "Extended warranty", "Accidental damage protection"
    provider: { type: String, trim: true },
    startDate: Date,
    expiryDate: Date,
    coverage: { type: String, trim: true },
    status: {
      type: String,
      enum: ["not_started", "active", "expiring_soon", "expired", "unknown"],
      default: "unknown"
    },
    notes: { type: String, trim: true }
  },
  { _id: true }
);

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
    // Primary warranty (legacy fields — kept as the single source for the
    // existing dashboard/expiry queries). Additional periods live in
    // `warranties`; both remain valid and backward compatible.
    warrantyExpiryDate: Date,
    warrantyPeriodMonths: {
      type: Number,
      min: 1
    },
    // Phase 4: warranty provider / manufacturer details.
    warrantyProvider: { type: String, trim: true },
    warrantyProviderType: {
      type: String,
      enum: ["manufacturer", "retailer", "third_party", "extended", "unknown"],
      default: undefined
    },
    warrantyContact: { type: String, trim: true },
    warrantyWebsite: { type: String, trim: true },
    // Phase 4: product lifecycle state (Owned by default). Changing this
    // never destroys warranty/document/service history.
    lifecycleStatus: {
      type: String,
      enum: ["owned", "in_use", "stored", "under_repair", "sold", "gifted", "disposed"],
      default: "owned"
    },
    // Phase 4: additional warranty/coverage periods.
    warranties: {
      type: [warrantyPeriodSchema],
      default: []
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

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
productSchema.index({ productName: "text", brand: "text", model: "text" });

module.exports = mongoose.model("Product", productSchema);

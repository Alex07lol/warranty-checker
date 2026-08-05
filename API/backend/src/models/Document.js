const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  documentType: {
    type: String,
    enum: ["receipt", "warranty_card", "product_photo", "manual", "other"],
    required: true,
    index: true
  },
  fileName: {
    type: String,
    required: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  publicId: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  notes: String,
  ocrStatus: {
    type: String,
    enum: ["pending", "processing", "done", "failed", "skipped"],
    default: "pending"
  },
  ocrText: String,
  parsedData: {
    warrantyExpiryDate: Date,
    purchasePrice: Number,
    serialNumber: String
  },
  ocrError: String
});

module.exports = mongoose.model("Document", documentSchema);

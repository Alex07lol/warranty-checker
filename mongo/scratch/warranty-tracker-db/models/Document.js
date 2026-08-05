const mongoose = require("mongoose");

const DOCUMENT_TYPES = [
  "receipt",
  "warranty_card",
  "product_photo",
  "manual",
  "other",
];

const RESOURCE_TYPES = ["image", "video", "raw"];

const documentSchema = new mongoose.Schema(
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
    documentType: {
      type: String,
      required: [true, "documentType is required"],
      enum: {
        values: DOCUMENT_TYPES,
        message: `documentType must be one of: ${DOCUMENT_TYPES.join(", ")}`,
      },
    },
    fileName: {
      type: String,
      required: [true, "fileName is required"],
      trim: true,
      maxlength: [255, "File name cannot exceed 255 characters"],
    },
    fileUrl: {
      type: String,
      required: [true, "fileUrl (Cloudinary CDN URL) is required"],
      trim: true,
    },
    publicId: {
      type: String,
      required: [true, "publicId (Cloudinary ID) is required"],
      trim: true,
    },
    resourceType: {
      type: String,
      required: [true, "resourceType is required"],
      enum: {
        values: RESOURCE_TYPES,
        message: `resourceType must be one of: ${RESOURCE_TYPES.join(", ")}`,
      },
    },
    fileSize: {
      type: Number,
      min: [0, "File size cannot be negative"],
      // stored in bytes
    },
    mimeType: {
      type: String,
      trim: true,
      // e.g. "application/pdf", "image/jpeg"
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, "Notes cannot exceed 500 characters"],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ────────────────────────────────────────────────────────────────────
documentSchema.index({ productId: 1, documentType: 1 });
documentSchema.index({ userId: 1, createdAt: -1 });
documentSchema.index({ publicId: 1 }, { unique: true }); // Cloudinary IDs are globally unique

// ── Virtual: human-readable file size ─────────────────────────────────────────
documentSchema.virtual("fileSizeFormatted").get(function () {
  if (!this.fileSize) return null;
  const units = ["B", "KB", "MB", "GB"];
  let size = this.fileSize;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(2)} ${units[i]}`;
});

module.exports = mongoose.model("Document", documentSchema);

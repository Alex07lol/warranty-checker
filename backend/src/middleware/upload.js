const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");
const AppError = require("../utils/AppError");

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
]);

const ALLOWED_DOCUMENT_TYPES = new Set([
  "receipt",
  "warranty_card",
  "product_photo",
  "manual",
  "other"
]);

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req) => {
    const docType = req.body.documentType;
    if (!docType || !ALLOWED_DOCUMENT_TYPES.has(docType)) {
      throw new AppError("Invalid or missing documentType", 422);
    }
    return {
      folder: `warrantyvault/${req.user.userId}/${req.params.productId}/${docType}`,
      resource_type: "auto"
    };
  }
});

const uploadSingle = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new AppError("Unsupported file type. Allowed: jpeg, png, webp, pdf", 415));
    }
    return cb(null, true);
  }
}).single("file");

module.exports = { uploadSingle };

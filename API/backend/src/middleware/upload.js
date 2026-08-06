const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
]);

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req) => ({
    folder: `warrantyvault/${req.user.userId}/${req.params.productId}/${req.body.documentType || "other"}`,
    resource_type: "auto"
  })
});

const uploadSingle = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "file"));
    }
    return cb(null, true);
  }
}).single("file");

module.exports = { uploadSingle };

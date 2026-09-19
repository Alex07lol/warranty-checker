const multer = require("multer");

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
]);

// Keep the uploaded bytes in memory (instead of streaming straight to
// Cloudinary) so OCR can read the original file — this works even when the
// Cloudinary account's media-delivery ACL blocks fetching the stored URL
// back. The document service uploads the buffer to Cloudinary itself.
const uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "file"));
    }
    return cb(null, true);
  }
}).single("file");

// Import uploads (bulk CSV/JSON product import). Text-only formats, 2 MB cap
// — generous for hundreds of product rows, tight enough to be harmless.
const IMPORT_MIME_TYPES = new Set([
  "text/csv",
  "application/vnd.ms-excel",
  "application/json",
  "text/plain"
]);
const uploadImport = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || "").toLowerCase();
    const okMime = IMPORT_MIME_TYPES.has(file.mimetype);
    const okExt = name.endsWith(".csv") || name.endsWith(".json");
    if (!okMime && !okExt) {
      return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "file"));
    }
    return cb(null, true);
  }
}).single("file");

module.exports = { uploadSingle, uploadImport };

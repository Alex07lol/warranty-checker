const express = require("express");
const rateLimit = require("express-rate-limit");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const { uploadSingle } = require("../middleware/upload");
const { validateFileSignature } = require("../middleware/fileSignature");
const controller = require("../controllers/document.controller");
const { uploadDocumentSchema, confirmProductSchema } = require("../validators/document.validator");

const router = express.Router({ mergeParams: true });

// Abuse protection for expensive operations, keyed per user (IP fallback):
// uploads push bytes to Cloudinary, OCR jobs burn CPU. Limits are generous
// for normal use but stop a single account from trivially generating
// hundreds of storage/CPU jobs. Overridable via env for tests.
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.UPLOAD_RATE_LIMIT) || 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId || req.ip
});
const ocrLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: Number(process.env.OCR_RATE_LIMIT) || 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId || req.ip
});

router.use(auth);
router.get("/", controller.getDocuments);
router.post(
  "/",
  uploadLimiter,
  uploadSingle,
  validateFileSignature,
  validate(uploadDocumentSchema),
  controller.uploadDocument
);
// Stream the original file bytes (server-side Admin API fetch — works even
// when the Cloudinary media delivery ACL blocks direct fileUrl access).
// Registered before /:documentId so "view" isn't captured as an id.
router.get("/:documentId/view", controller.viewDocument);
// Create a product from a standalone document's OCR data after the user has
// reviewed and corrected the extracted fields (edit-and-confirm flow).
router.post(
  "/:documentId/confirm-product",
  validate(confirmProductSchema),
  controller.confirmDocumentProduct
);
router.get("/:documentId", controller.getDocumentById);
router.post("/:documentId/ocr", ocrLimiter, controller.runDocumentOcr);
router.delete("/:documentId", controller.deleteDocument);

module.exports = router;

const express = require("express");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const { uploadSingle } = require("../middleware/upload");
const controller = require("../controllers/document.controller");
const { uploadDocumentSchema, confirmProductSchema } = require("../validators/document.validator");

const router = express.Router({ mergeParams: true });

router.use(auth);
router.get("/", controller.getDocuments);
router.post(
  "/",
  uploadSingle,
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
router.post("/:documentId/ocr", controller.runDocumentOcr);
router.delete("/:documentId", controller.deleteDocument);

module.exports = router;

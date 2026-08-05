const express = require("express");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const { uploadSingle } = require("../middleware/upload");
const controller = require("../controllers/document.controller");
const { uploadDocumentSchema } = require("../validators/document.validator");

const router = express.Router({ mergeParams: true });

router.use(auth);
router.get("/", controller.getDocuments);
router.post(
  "/",
  uploadSingle,
  validate(uploadDocumentSchema),
  controller.uploadDocument
);
router.get("/:documentId", controller.getDocumentById);
router.post("/:documentId/ocr", controller.runDocumentOcr);
router.delete("/:documentId", controller.deleteDocument);

module.exports = router;

const express = require("express");
const auth = require("../middleware/auth");
const { uploadImport } = require("../middleware/upload");
const controller = require("../controllers/export.controller");

const router = express.Router();

// Phase 4 §16: download the user's products as JSON, CSV or ODS, and bulk-
// import products from a CSV or JSON file. Ownership is enforced inside the
// service (everything is queried with req.user.userId).
router.use(auth);
router.get("/products", controller.exportProducts);
router.post("/products/import", uploadImport, controller.importProducts);

module.exports = router;

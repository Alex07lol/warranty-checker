const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/export.controller");

const router = express.Router();

// Phase 4 §16: download the user's products as JSON or CSV. Ownership is
// enforced inside the service (everything is queried with req.user.userId).
router.use(auth);
router.get("/products", controller.exportProducts);

module.exports = router;

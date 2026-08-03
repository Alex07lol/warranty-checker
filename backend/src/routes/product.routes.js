const express = require("express");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const controller = require("../controllers/product.controller");
const {
  createProductSchema,
  updateProductSchema
} = require("../validators/product.validator");

const router = express.Router();

router.use(auth);
router.get("/", controller.getAllProducts);
router.get("/search", controller.searchProducts);
router.get("/expiring-soon", controller.getExpiringProducts);
router.get("/:id", controller.getProductById);
router.post("/", validate(createProductSchema), controller.createProduct);
router.put("/:id", validate(updateProductSchema), controller.updateProduct);
router.delete("/:id", controller.deleteProduct);

module.exports = router;

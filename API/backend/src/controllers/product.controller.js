const productService = require("../services/product.service");
const intelligenceService = require("../services/intelligence.service");
const { sendSuccess } = require("../utils/response");

async function getAllProducts(req, res, next) {
  try {
    // Phase 4 §9: advanced filters come through as query params. `tags` may
    // repeat (tags=a&tags=b) and Express parses repeats into an array.
    const data = await productService.getAllProducts(
      req.user.userId,
      req.query.page,
      req.query.limit,
      req.query.sortBy,
      req.query.order,
      req.query
    );
    return sendSuccess(res, data, "Products retrieved");
  } catch (error) {
    return next(error);
  }
}

async function getProductById(req, res, next) {
  try {
    const data = await productService.getProductById(req.params.id, req.user.userId);
    return sendSuccess(res, data, "Product retrieved");
  } catch (error) {
    return next(error);
  }
}

async function createProduct(req, res, next) {
  try {
    const data = await productService.createProduct(req.user.userId, req.body);
    return sendSuccess(res, data, "Product created", 201);
  } catch (error) {
    return next(error);
  }
}

async function updateProduct(req, res, next) {
  try {
    const data = await productService.updateProduct(req.params.id, req.user.userId, req.body);
    return sendSuccess(res, data, "Product updated");
  } catch (error) {
    return next(error);
  }
}

async function deleteProduct(req, res, next) {
  try {
    await productService.softDeleteProduct(req.params.id, req.user.userId);
    return sendSuccess(res, null, "Product deleted");
  } catch (error) {
    return next(error);
  }
}

async function searchProducts(req, res, next) {
  try {
    const data = await productService.searchProducts(req.user.userId, req.query.q);
    return sendSuccess(res, data, "Products searched");
  } catch (error) {
    return next(error);
  }
}

async function getExpiringProducts(req, res, next) {
  try {
    const data = await productService.getExpiringProducts(req.user.userId);
    return sendSuccess(res, data, "Expiring products retrieved");
  } catch (error) {
    return next(error);
  }
}

// Phase 4 §19: deterministic warranty intelligence (conflicts, missing
// info, duplicate suggestions). Ownership is enforced by getProductById,
// and duplicates only ever compare against the caller's own products.
async function getProductIntelligence(req, res, next) {
  try {
    const product = await productService.getProductById(req.params.id, req.user.userId);
    const findings = await intelligenceService.analyzeProduct(product, req.user.userId);
    return sendSuccess(res, { findings }, "Product intelligence retrieved");
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  getExpiringProducts,
  getProductIntelligence
};

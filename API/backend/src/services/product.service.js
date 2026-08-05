const mongoose = require("mongoose");
const Product = require("../models/Product");
const AppError = require("../utils/AppError");

function assertObjectId(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError("Invalid resource ID", 400);
  }
}

async function getAllProducts(userId, page = 1, limit = 20, sortBy = "createdAt", order = "desc") {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const allowedSort = ["createdAt", "updatedAt", "productName", "warrantyExpiryDate"];
  const field = allowedSort.includes(sortBy) ? sortBy : "createdAt";
  const direction = order === "asc" ? 1 : -1;
  const filter = { userId, isDeleted: false };

  const [products, total] = await Promise.all([
    Product.find(filter)
      .sort({ [field]: direction })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit),
    Product.countDocuments(filter)
  ]);

  return {
    products,
    total,
    page: safePage,
    limit: safeLimit
  };
}

async function getProductById(productId, userId) {
  assertObjectId(productId);
  const product = await Product.findById(productId);

  if (!product || product.isDeleted) {
    throw new AppError("Product not found", 404);
  }

  if (product.userId.toString() !== userId.toString()) {
    throw new AppError("Product does not belong to authenticated user", 403);
  }

  return product;
}

async function createProduct(userId, data) {
  if (data.purchaseDate && data.warrantyExpiryDate) {
    if (new Date(data.warrantyExpiryDate) <= new Date(data.purchaseDate)) {
      throw new AppError("Warranty expiry date must be after purchase date", 422);
    }
  }

  return Product.create({
    ...data,
    userId
  });
}

async function updateProduct(productId, userId, data) {
  const product = await getProductById(productId, userId);

  const purchaseDate = data.purchaseDate || product.purchaseDate;
  const expiryDate = data.warrantyExpiryDate || product.warrantyExpiryDate;

  if (purchaseDate && expiryDate && new Date(expiryDate) <= new Date(purchaseDate)) {
    throw new AppError("Warranty expiry date must be after purchase date", 422);
  }

  Object.assign(product, data);
  await product.save();
  return product;
}

async function softDeleteProduct(productId, userId) {
  const product = await getProductById(productId, userId);
  product.isDeleted = true;
  await product.save();
}

async function searchProducts(userId, query) {
  const text = String(query || "").trim();

  if (!text) {
    return [];
  }

  return Product.find({
    userId,
    isDeleted: false,
    $text: { $search: text }
  }).sort({ score: { $meta: "textScore" } });
}

async function getExpiringProducts(userId) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 30);
  end.setHours(23, 59, 59, 999);

  return Product.find({
    userId,
    isDeleted: false,
    warrantyExpiryDate: {
      $gte: start,
      $lte: end
    }
  }).sort({ warrantyExpiryDate: 1 });
}

async function applyOcrToProduct(productId, parsedData) {
  if (!parsedData) return {};

  const product = await Product.findById(productId);
  if (!product || product.isDeleted) return {};

  const updates = {};
  if (
    !product.warrantyExpiryDate &&
    parsedData.warrantyExpiryDate &&
    !(
      product.purchaseDate &&
      new Date(parsedData.warrantyExpiryDate) <= new Date(product.purchaseDate)
    )
  ) {
    updates.warrantyExpiryDate = parsedData.warrantyExpiryDate;
  }
  if (product.purchasePrice == null && parsedData.purchasePrice != null) {
    updates.purchasePrice = parsedData.purchasePrice;
  }
  if (!product.serialNumber && parsedData.serialNumber) {
    updates.serialNumber = parsedData.serialNumber;
  }

  if (Object.keys(updates).length > 0) {
    Object.assign(product, updates);
    await product.save();
  }
  return updates;
}

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  softDeleteProduct,
  searchProducts,
  getExpiringProducts,
  applyOcrToProduct
};

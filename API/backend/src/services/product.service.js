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

// An empty serial is "no serial": normalize it away so the partial unique
// index ({ userId, serialNumber } for active products) never treats two
// serial-less products as duplicates of each other.
function normalizeSerial(data) {
  const clean = { ...data };
  if (clean.serialNumber === "") clean.serialNumber = undefined;
  return clean;
}

async function createProduct(userId, data) {
  data = normalizeSerial(data);
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
  data = normalizeSerial(data);

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

// Create a product pre-filled from standalone OCR results, or reuse an
// existing product carrying the same serial number (avoids duplicate products
// when multiple scans of the same item are uploaded). Returns the product.
// The serial-dedupe check is best-effort: under a rare concurrent double-scan
// the check-then-create can race, so a duplicate-key error (E11000) is
// caught and resolved by re-querying instead of crashing.
async function createProductFromOcr(userId, data) {
  data = normalizeSerial(data);
  if (data.serialNumber) {
    const existing = await Product.findOne({
      userId,
      isDeleted: false,
      serialNumber: data.serialNumber
    });
    if (existing) return existing;
  }

  // OCR noise can put the purchase date after the expiry — drop the purchase
  // date then, since the app's validation requires expiry > purchase.
  if (
    data.purchaseDate &&
    data.warrantyExpiryDate &&
    new Date(data.purchaseDate) >= new Date(data.warrantyExpiryDate)
  ) {
    data = { ...data, purchaseDate: undefined };
  }

  try {
    return await Product.create({
      ...data,
      userId
    });
  } catch (error) {
    // E11000 duplicate key (e.g. a concurrent scan created it first).
    if (error.code === 11000 && data.serialNumber) {
      const winner = await Product.findOne({
        userId,
        isDeleted: false,
        serialNumber: data.serialNumber
      });
      if (winner) return winner;
    }
    throw error;
  }
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
  if (!product.purchaseStore && parsedData.purchaseStore) {
    updates.purchaseStore = parsedData.purchaseStore;
  }
  if (!product.brand && parsedData.brand) {
    updates.brand = parsedData.brand;
  }
  if (!product.model && parsedData.model) {
    updates.model = parsedData.model;
  }
  if (
    !product.purchaseDate &&
    parsedData.purchaseDate &&
    // A purchase date must not land after the (known or incoming) expiry.
    !(
      (product.warrantyExpiryDate || updates.warrantyExpiryDate) &&
      new Date(parsedData.purchaseDate) >
        new Date(product.warrantyExpiryDate || updates.warrantyExpiryDate)
    )
  ) {
    updates.purchaseDate = parsedData.purchaseDate;
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
  createProductFromOcr,
  applyOcrToProduct
};

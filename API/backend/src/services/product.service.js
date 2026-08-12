const mongoose = require("mongoose");
const Product = require("../models/Product");
const AppError = require("../utils/AppError");
const { warrantyStatusOf, primaryWarrantyStatus } = require("./warranty.service");

function assertObjectId(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError("Invalid resource ID", 400);
  }
}

// Phase 4 §12: tags are lower-cased + trimmed, blanks dropped, deduped, and
// capped at 20 (matches the validator). Products are user-scoped already, so
// tags are implicitly user-scoped with them.
function normalizeTags(data) {
  if (!Array.isArray(data.tags)) return data;
  const seen = new Set();
  const tags = data.tags
    .map((t) => String(t || "").trim().toLowerCase())
    .filter((t) => t !== "")
    .filter((t) => {
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    })
    .slice(0, 20);
  return { ...data, tags };
}

// Build the Mongo filter for advanced product filtering (Phase 4 §9). Every
// value is defensive: unknown/empty inputs are ignored, out-of-range values
// are clamped, and the warrantyStatus filter is translated into the same
// date windows the canonical status engine uses (30-day expiring window,
// future purchase date => not_started, missing expiry => unknown).
// ─────────────────────────────────────────────────────────────────────────────
// Filter-input sanitization (SonarCloud jssecurity:S5147).
//
// Every value in `buildProductFilter` originates from user query params and
// ends up inside a MongoDB query document. Values are therefore coerced,
// length-capped and validated so operator-shaped input (e.g. `{$gt: ...}`,
// `$where`, `$regex`) or pathological values (unbounded strings, garbage
// dates, NaN prices) can never reach the query builder.
// ─────────────────────────────────────────────────────────────────────────────
const FILTER_STRING_MAX = 200; // product.service / product model string caps
const FILTER_TAG_MAX = 50;
const FILTER_TAG_COUNT_MAX = 20;
const LIFECYCLE_STATUSES = new Set([
  "owned",
  "in_use",
  "stored",
  "under_repair",
  "sold",
  "gifted",
  "disposed"
]);

// Coerce to a bounded plain string; reject anything that isn't a scalar
// (objects/arrays could smuggle MongoDB operators) and `$`-prefixed keys.
function safeFilterString(value, max = FILTER_STRING_MAX) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const s = String(value).trim();
  if (!s || s.length > max || s.startsWith("$")) return undefined;
  return s;
}

// A filter date must parse into a valid Date; garbage input is dropped
// rather than passed to MongoDB as an Invalid Date.
function safeFilterDate(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

// A filter price must be a finite, non-negative number.
function safeFilterPrice(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

function buildProductFilter(userId, q = {}) {
  const filter = { userId, isDeleted: false };

  const category = safeFilterString(q.category);
  if (category) filter.category = category;
  const brand = safeFilterString(q.brand);
  if (brand) filter.brand = brand;
  const lifecycleStatus = safeFilterString(q.lifecycleStatus);
  if (lifecycleStatus) {
    if (LIFECYCLE_STATUSES.has(lifecycleStatus)) filter.lifecycleStatus = lifecycleStatus;
  }
  const warrantyProvider = safeFilterString(q.warrantyProvider);
  if (warrantyProvider) filter.warrantyProvider = warrantyProvider;
  const purchaseStore = safeFilterString(q.purchaseStore);
  if (purchaseStore) filter.purchaseStore = purchaseStore;

  // tags=home (single) or tags=home&tags=gaming (repeat) both work. Each tag
  // is bounded and operator-free; the set is capped to match normalizeTags.
  const tags = (Array.isArray(q.tags) ? q.tags : [q.tags])
    .map((t) => safeFilterString(t, FILTER_TAG_MAX))
    .filter(Boolean)
    .slice(0, FILTER_TAG_COUNT_MAX);
  if (tags.length) filter.tags = { $all: tags };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);
  const in30 = new Date(today);
  in30.setDate(in30.getDate() + 30);
  in30.setHours(23, 59, 59, 999);

  // Windows mirror the canonical engine's day-boundary semantics exactly:
  // daysRemaining <= 0 (expiry on or before today) is expired; (today, +30]
  // is expiring_soon; beyond is active. Using end-of-day bounds keeps a
  // product expiring *today* classified as expired here, matching the badge
  // the engine renders on its card.
  switch (q.warrantyStatus) {
    case "expired":
      filter.warrantyExpiryDate = { $lte: todayEnd };
      break;
    case "expiring_soon":
      filter.warrantyExpiryDate = { $gt: todayEnd, $lte: in30 };
      break;
    case "active":
      filter.warrantyExpiryDate = { $gt: in30 };
      break;
    case "not_started":
      filter.purchaseDate = { $gt: today };
      break;
    case "unknown":
      filter.warrantyExpiryDate = null;
      break;
    default:
      break;
  }

  const dateFilter = (from, to) => {
    const range = {};
    const fromDate = safeFilterDate(from);
    const toDate = safeFilterDate(to);
    if (fromDate) range.$gte = fromDate;
    if (toDate) range.$lte = toDate;
    return Object.keys(range).length ? range : null;
  };
  const purchaseRange = dateFilter(q.purchaseFrom, q.purchaseTo);
  if (purchaseRange) filter.purchaseDate = { ...filter.purchaseDate, ...purchaseRange };
  const expiryRange = dateFilter(q.expiryFrom, q.expiryTo);
  if (expiryRange) filter.warrantyExpiryDate = { ...filter.warrantyExpiryDate, ...expiryRange };

  // Guard against empty-string params (e.g. ?maxPrice=) — Number("") is 0,
  // which would silently turn maxPrice into "free items only". Prices are
  // also bounded to finite, non-negative numbers.
  const minPrice = safeFilterPrice(q.minPrice);
  const maxPrice = safeFilterPrice(q.maxPrice);
  if (minPrice !== undefined || maxPrice !== undefined) {
    const price = {};
    if (minPrice !== undefined) price.$gte = minPrice;
    if (maxPrice !== undefined) price.$lte = maxPrice;
    filter.purchasePrice = price;
  }

  return filter;
}

async function getAllProducts(userId, page = 1, limit = 20, sortBy = "createdAt", order = "desc", filters = {}) {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const allowedSort = ["createdAt", "updatedAt", "productName", "warrantyExpiryDate", "purchasePrice"];
  const field = allowedSort.includes(sortBy) ? sortBy : "createdAt";
  const direction = order === "asc" ? 1 : -1;
  const filter = buildProductFilter(userId, filters);

  const [products, total] = await Promise.all([
    Product.find(filter)
      .sort({ [field]: direction })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit),
    Product.countDocuments(filter)
  ]);

  products.forEach(attachWarrantyStatus);

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

  attachWarrantyStatus(product);
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

// Phase 4: validate additional warranty periods. Every period with both
// dates must have expiry > start. Empty-string fields are normalized away
// so an array of blank rows doesn't persist noise, and each surviving
// period's `status` is derived by the canonical status engine (§5) rather
// than stored blind.
function normalizeWarranties(data) {
  const raw = Array.isArray(data.warranties) ? data.warranties : [];
  if (!raw.length) return data;
  const warranties = raw
    .map((w) => {
      const clean = { ...w };
      ["type", "provider", "coverage", "notes"].forEach((k) => {
        if (clean[k] === "") delete clean[k];
      });
      if (clean.startDate && clean.expiryDate) {
        if (new Date(clean.expiryDate) <= new Date(clean.startDate)) {
          throw new AppError("Each warranty period's expiry must be after its start date", 422);
        }
      }
      clean.status = warrantyStatusOf(clean).status;
      return clean;
    })
    // Drop rows that are empty after cleaning (only schema defaults remain).
    .filter((w) =>
      w.type || w.provider || w.coverage || w.notes || w.startDate || w.expiryDate
    );
  return { ...data, warranties };
}

async function createProduct(userId, data) {
  data = normalizeSerial(data);
  data = normalizeWarranties(data);
  data = normalizeTags(data);
  if (data.purchaseDate && data.warrantyExpiryDate) {
    if (new Date(data.warrantyExpiryDate) <= new Date(data.purchaseDate)) {
      throw new AppError("Warranty expiry date must be after purchase date", 422);
    }
  }

  const product = await Product.create({
    ...data,
    userId
  });
  attachWarrantyStatus(product);
  return product;
}

async function updateProduct(productId, userId, data) {
  const product = await getProductById(productId, userId);
  data = normalizeSerial(data);
  data = normalizeWarranties(data);
  data = normalizeTags(data);

  const purchaseDate = data.purchaseDate || product.purchaseDate;
  const expiryDate = data.warrantyExpiryDate || product.warrantyExpiryDate;

  if (purchaseDate && expiryDate && new Date(expiryDate) <= new Date(purchaseDate)) {
    throw new AppError("Warranty expiry date must be after purchase date", 422);
  }

  Object.assign(product, data);
  await product.save();
  attachWarrantyStatus(product);
  return product;
}

// Stamp the canonical primary warranty status onto a product document so
// every product response (create, update, list, detail) carries the same
// engine-derived fields instead of each consumer re-deriving state (§5).
function attachWarrantyStatus(product) {
  const s = primaryWarrantyStatus(product);
  product._doc.warrantyStatus = s.status;
  product._doc.warrantyStatusLabel = s.label;
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

  // Phase 4 §10: match name/brand/model (the $text-indexed fields) plus
  // serial number, purchase store, warranty provider and tags with a
  // case-insensitive substring, so a scan or a receipt fragment finds the
  // product. A pure regex $or keeps a single valid query plan (mixing $text
  // into the $or makes the planner error with "No query solutions").
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "i");

  return Product.find({
    userId,
    isDeleted: false,
    $or: [
      { productName: regex },
      { brand: regex },
      { model: regex },
      { serialNumber: regex },
      { purchaseStore: regex },
      { warrantyProvider: regex },
      { tags: regex }
    ]
  })
    .sort({ createdAt: -1 })
    .limit(100);
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
  data = normalizeTags(data);
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

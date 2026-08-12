// Phase 4 §15/§16 — warranty claim preparation + structured export.
//
// Both features are read-only and strictly user-scoped: everything is looked
// up with the authenticated userId, so one user can never export or build a
// claim for another's data. Exports include product, warranty, service and
// document *metadata* — never private file contents.
"use strict";

const Product = require("../models/Product");
const ServiceHistory = require("../models/ServiceHistory");
const Document = require("../models/Document");
const AppError = require("../utils/AppError");
const { primaryWarrantyStatus } = require("./warranty.service");

function toDateString(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// A claim-ready snapshot of one product: everything a user needs to open a
// warranty claim, plus the metadata of relevant documents and service records.
// No file contents or auth internals are included.
async function getClaimSummary(productId, userId) {
  const product = await Product.findById(productId);
  if (!product || product.isDeleted) {
    throw new AppError("Product not found", 404);
  }
  if (String(product.userId) !== String(userId)) {
    throw new AppError("Product does not belong to authenticated user", 403);
  }

  const [serviceHistory, documents] = await Promise.all([
    ServiceHistory.find({ productId: product._id, userId })
      .select("serviceDate serviceType serviceProvider cost currency description nextServiceDate")
      .sort({ serviceDate: -1 })
      .lean(),
    Document.find({ productId: product._id, userId })
      .select("fileName documentType fileSize uploadedAt ocrStatus")
      .sort({ uploadedAt: -1 })
      .lean()
  ]);

  const status = primaryWarrantyStatus(product);

  return {
    productId: product._id,
    productName: product.productName,
    brand: product.brand || null,
    model: product.model || null,
    serialNumber: product.serialNumber || null,
    category: product.category || null,
    purchaseDate: toDateString(product.purchaseDate),
    purchasePrice: product.purchasePrice ?? null,
    currency: product.currency || null,
    purchaseStore: product.purchaseStore || null,
    warrantyProvider: product.warrantyProvider || null,
    warrantyProviderType: product.warrantyProviderType || null,
    warrantyContact: product.warrantyContact || null,
    warrantyExpiryDate: toDateString(product.warrantyExpiryDate),
    warrantyStatus: status.status,
    warrantyStatusLabel: status.label,
    lifecycleStatus: product.lifecycleStatus || "owned",
    tags: product.tags || [],
    notes: product.notes || null,
    warranties: (product.warranties || []).map((w) => ({
      type: w.type || null,
      provider: w.provider || null,
      coverage: w.coverage || null,
      startDate: toDateString(w.startDate),
      expiryDate: toDateString(w.expiryDate),
      status: w.status || "unknown"
    })),
    serviceHistory: serviceHistory.map((r) => ({
      serviceDate: toDateString(r.serviceDate),
      serviceType: r.serviceType,
      serviceProvider: r.serviceProvider || null,
      cost: r.cost ?? null,
      currency: r.currency || null,
      description: r.description || null,
      nextServiceDate: toDateString(r.nextServiceDate)
    })),
    documents: documents.map((d) => ({
      fileName: d.fileName,
      documentType: d.documentType,
      fileSize: d.fileSize,
      uploadedAt: d.uploadedAt,
      ocrStatus: d.ocrStatus
    }))
  };
}

// Flatten one product into a single export row (for CSV).
function productToCsvRow(p, serviceByProduct, docsByProduct) {
  const warranties = (p.warranties || []).map((w) =>
    [w.type, w.provider, toDateString(w.startDate), toDateString(w.expiryDate), w.coverage]
      .filter(Boolean)
      .join(" | ")
  );
  const services = (serviceByProduct.get(String(p._id)) || []).map((r) =>
    [toDateString(r.serviceDate), r.serviceType, r.serviceProvider, r.cost, toDateString(r.nextServiceDate)]
      .filter(Boolean)
      .join(" | ")
  );
  const docs = (docsByProduct.get(String(p._id)) || []).map((d) => d.fileName);
  return {
    productName: p.productName,
    brand: p.brand || "",
    model: p.model || "",
    category: p.category || "",
    serialNumber: p.serialNumber || "",
    purchaseDate: toDateString(p.purchaseDate) || "",
    purchasePrice: p.purchasePrice ?? "",
    currency: p.currency || "",
    purchaseStore: p.purchaseStore || "",
    warrantyProvider: p.warrantyProvider || "",
    warrantyExpiryDate: toDateString(p.warrantyExpiryDate) || "",
    lifecycleStatus: p.lifecycleStatus || "owned",
    tags: (p.tags || []).join(" | "),
    warranties: warranties.join(" ;; "),
    serviceHistory: services.join(" ;; "),
    documents: docs.join(" | "),
    notes: p.notes || ""
  };
}

const CSV_HEADERS = [
  "productName", "brand", "model", "category", "serialNumber", "purchaseDate",
  "purchasePrice", "currency", "purchaseStore", "warrantyProvider",
  "warrantyExpiryDate", "lifecycleStatus", "tags", "warranties",
  "serviceHistory", "documents", "notes"
];

function csvEscape(value) {
  let s = String(value == null ? "" : value);
  // CSV formula injection guard: a cell beginning with =, +, -, @ or tab is
  // interpreted as a formula by Excel/Sheets (e.g. =HYPERLINK(...) or @cmd).
  // Neutralize it with a leading apostrophe. Safe here because prices are
  // min 0 and dates start with digits, so no legitimate value is harmed.
  if (/^[=+\-@\t]/.test(s)) {
    s = "'" + s;
  }
  // RFC 4180: quote when the value contains a comma, quote or newline;
  // double any embedded quotes.
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// One flattened row per product as a CSV document (headers + rows, no BOM).
// `headers` defaults to the product export columns and is overridable for
// standalone use.
function toCsv(rows, headers = CSV_HEADERS) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n");
}

// Export every live product the user owns. format: "json" (default) or "csv".
// Documents are included as metadata only (file name/type/status — never the
// stored bytes or public URLs).
async function exportProducts(userId, format = "json") {
  const products = await Product.find({ userId, isDeleted: false })
    .sort({ createdAt: 1 })
    .lean();

  const productIds = products.map((p) => p._id);
  const [services, docs] = await Promise.all([
    ServiceHistory.find({ userId, productId: { $in: productIds } })
      .select("productId serviceDate serviceType serviceProvider cost currency description nextServiceDate")
      .lean(),
    Document.find({ userId, productId: { $in: productIds } })
      .select("productId fileName documentType fileSize uploadedAt ocrStatus")
      .lean()
  ]);

  const serviceByProduct = new Map();
  for (const r of services) {
    const key = String(r.productId);
    if (!serviceByProduct.has(key)) serviceByProduct.set(key, []);
    serviceByProduct.get(key).push(r);
  }
  const docsByProduct = new Map();
  for (const d of docs) {
    const key = String(d.productId);
    if (!docsByProduct.has(key)) docsByProduct.set(key, []);
    docsByProduct.get(key).push(d);
  }

  if (String(format).toLowerCase() === "csv") {
    return {
      mimeType: "text/csv; charset=utf-8",
      extension: "csv",
      body: toCsv(products.map((p) => productToCsvRow(p, serviceByProduct, docsByProduct)))
    };
  }

  // Whitelist exported product fields — never spread the raw document, which
  // would leak internals (userId, isDeleted, __v) into the download.
  const exportRow = (p) => ({
    _id: p._id,
    productName: p.productName,
    brand: p.brand || null,
    model: p.model || null,
    category: p.category || null,
    serialNumber: p.serialNumber || null,
    purchaseDate: toDateString(p.purchaseDate),
    purchasePrice: p.purchasePrice ?? null,
    currency: p.currency || null,
    purchaseStore: p.purchaseStore || null,
    warrantyProvider: p.warrantyProvider || null,
    warrantyProviderType: p.warrantyProviderType || null,
    warrantyContact: p.warrantyContact || null,
    warrantyWebsite: p.warrantyWebsite || null,
    warrantyExpiryDate: toDateString(p.warrantyExpiryDate),
    warrantyPeriodMonths: p.warrantyPeriodMonths ?? null,
    lifecycleStatus: p.lifecycleStatus || "owned",
    tags: p.tags || [],
    warranties: (p.warranties || []).map((w) => ({
      type: w.type || null,
      provider: w.provider || null,
      startDate: toDateString(w.startDate),
      expiryDate: toDateString(w.expiryDate),
      coverage: w.coverage || null,
      status: w.status || "unknown",
      notes: w.notes || null
    })),
    serviceHistory: (serviceByProduct.get(String(p._id)) || []).map((r) => ({
      serviceDate: toDateString(r.serviceDate),
      serviceType: r.serviceType,
      serviceProvider: r.serviceProvider || null,
      cost: r.cost ?? null,
      currency: r.currency || null,
      description: r.description || null,
      nextServiceDate: toDateString(r.nextServiceDate)
    })),
    documents: (docsByProduct.get(String(p._id)) || []).map((d) => ({
      fileName: d.fileName,
      documentType: d.documentType,
      fileSize: d.fileSize,
      uploadedAt: d.uploadedAt,
      ocrStatus: d.ocrStatus
    })),
    notes: p.notes || null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  });

  return {
    mimeType: "application/json; charset=utf-8",
    extension: "json",
    body: JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        count: products.length,
        products: products.map(exportRow)
      },
      null,
      2
    )
  };
}

module.exports = {
  getClaimSummary,
  exportProducts,
  toCsv,
  csvEscape,
  CSV_HEADERS
};

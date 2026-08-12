// Phase 4 §17 — secure product sharing.
//
// Link lifecycle: owner creates (optional expiry 1–90 days) -> shares the
// unguessable token -> public GET /api/v1/shared/:token renders a read-only
// snapshot -> owner revokes at any time. Everything is scoped: management is
// ownership-checked, and the public view resolves exactly one product through
// the token with no way to reach another user's data.
"use strict";

const crypto = require("node:crypto");
const Product = require("../models/Product");
const ServiceHistory = require("../models/ServiceHistory");
const Document = require("../models/Document");
const Share = require("../models/Share");
const AppError = require("../utils/AppError");
const { primaryWarrantyStatus } = require("./warranty.service");
const { toDateString } = require("./export.service");

// Unauthorized users must not be able to distinguish a valid-but-expired
// token from a random one, so every failure looks like a plain 404.
const SHARE_NOT_FOUND = () => new AppError("Share link not found or no longer active", 404);

function isActive(share, now = new Date()) {
  if (share.revokedAt) return false;
  if (share.expiresAt && new Date(share.expiresAt) <= now) return false;
  return true;
}

// The owner-side check: the product must exist, be live and belong to the user.
async function assertProductOwner(productId, userId) {
  if (!productId || !String(productId).match(/^[0-9a-fA-F]{24}$/)) {
    throw new AppError("Invalid product ID", 400);
  }
  const product = await Product.findById(productId);
  if (!product || product.isDeleted) {
    throw new AppError("Product not found", 404);
  }
  if (String(product.userId) !== String(userId)) {
    throw new AppError("Product does not belong to authenticated user", 403);
  }
  return product;
}

async function createShareLink(productId, userId, expiresInDays) {
  await assertProductOwner(productId, userId);

  const token = crypto.randomBytes(24).toString("hex"); // 48 hex chars, unguessable
  const expiresAt =
    expiresInDays && Number.isInteger(expiresInDays) ? new Date(Date.now() + expiresInDays * 86400000) : null;

  const share = await Share.create({ productId, userId, token, expiresAt });

  return {
    shareId: share._id,
    token: share.token,
    expiresAt: share.expiresAt ? share.expiresAt.toISOString() : null,
    createdAt: share.createdAt.toISOString(),
    // Relative URL the frontend turns into an absolute share link.
    url: `/shared.html?t=${share.token}`
  };
}

async function listShareLinks(productId, userId) {
  await assertProductOwner(productId, userId);

  const shares = await Share.find({ productId, userId }).sort({ createdAt: -1 }).lean();
  const now = new Date();
  return shares.map((s) => ({
    shareId: s._id,
    token: s.token,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
    revokedAt: s.revokedAt ? s.revokedAt.toISOString() : null,
    active: isActive(s, now),
    url: `/shared.html?t=${s.token}`
  }));
}

async function revokeShareLink(productId, shareId, userId) {
  await assertProductOwner(productId, userId);

  const share = await Share.findOne({ _id: shareId, productId, userId });
  if (!share) {
    throw new AppError("Share link not found", 404);
  }
  if (!share.revokedAt) {
    share.revokedAt = new Date();
    await share.save();
  }
  return { revoked: true, shareId: share._id };
}

// Public read-only snapshot. No auth required — security comes from the
// token being unguessable (48 hex chars). The response contains product +
// warranty + service + document *metadata*; it never includes file bytes,
// Cloudinary publicIds, OCR text or account internals.
async function getSharedProduct(token) {
  if (!token || !/^[0-9a-f]{48}$/.test(token)) {
    throw SHARE_NOT_FOUND();
  }

  const share = await Share.findOne({ token }).lean();
  if (!share || !isActive(share)) {
    throw SHARE_NOT_FOUND();
  }

  const product = await Product.findById(share.productId).lean();
  if (!product || product.isDeleted) {
    throw SHARE_NOT_FOUND();
  }

  const [serviceHistory, documents] = await Promise.all([
    ServiceHistory.find({ productId: product._id, userId: product.userId })
      .select("serviceDate serviceType serviceProvider cost currency description nextServiceDate")
      .sort({ serviceDate: -1 })
      .lean(),
    Document.find({ productId: product._id, userId: product.userId })
      .select("fileName documentType fileSize uploadedAt docState verified tags parsedData")
      .sort({ uploadedAt: -1 })
      .lean()
  ]);

  const status = primaryWarrantyStatus(product);

  return {
    sharedAt: new Date().toISOString(),
    product: {
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
      warrantyWebsite: product.warrantyWebsite || null,
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
      }))
    },
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
      docState: d.docState || "unreviewed",
      verified: Boolean(d.verified),
      tags: d.tags || [],
      parsedData: d.parsedData || null
    }))
  };
}

module.exports = {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  getSharedProduct
};

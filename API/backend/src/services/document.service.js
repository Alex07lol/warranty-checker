const mongoose = require("mongoose");
const Document = require("../models/Document");
const Product = require("../models/Product");
const AppError = require("../utils/AppError");
const cloudinary = require("../config/cloudinary");
const { paginate, paginationMeta } = require("../utils/pagination");
const { isOcrEligible, processDocument } = require("./ocr.service");
const { createProductFromOcr } = require("./product.service");

// If the server dies mid-OCR, a document would sit in "processing" forever
// (the frontend polls it and never gets an answer). Anything still
// "processing" long after its upload is treated as failed so the user sees a
// Retry button instead of an infinite spinner.
//
// Note: the Document model has no timestamps/updatedAt — uploadedAt (set at
// creation) is the anchor. A doc uploaded > 10 min ago that is still
// "processing" is, by definition, stuck.
const OCR_STUCK_AFTER_MS = 10 * 60 * 1000;
const OCR_STUCK_MESSAGE = "OCR timed out — press Retry to scan again";

function isStuckProcessing(document) {
  const anchored = new Date(document.uploadedAt || Date.now()).getTime();
  return (
    document.ocrStatus === "processing" &&
    Date.now() - anchored > OCR_STUCK_AFTER_MS
  );
}

async function recoverStuckOcr(document) {
  if (isStuckProcessing(document)) {
    document.ocrStatus = "failed";
    document.ocrError = OCR_STUCK_MESSAGE;
    await document.save();
  }
  return document;
}

// Bulk recovery for list reads: flip stale "processing" docs to "failed" in
// one query (indexed on userId), so the read itself is cheap.
async function recoverStuckOcrForUser(userId, productId) {
  const cutoff = new Date(Date.now() - OCR_STUCK_AFTER_MS);
  const filter = { userId, ocrStatus: "processing", uploadedAt: { $lt: cutoff } };
  if (productId) filter.productId = productId;
  await Document.updateMany(filter, {
    $set: { ocrStatus: "failed", ocrError: OCR_STUCK_MESSAGE }
  });
}

async function assertProductOwner(productId, userId) {
  if (!mongoose.isValidObjectId(productId)) {
    throw new AppError("Invalid product ID", 400);
  }

  const product = await Product.findById(productId);

  if (!product || product.isDeleted) {
    throw new AppError("Product not found", 404);
  }

  if (product.userId.toString() !== userId.toString()) {
    throw new AppError("Forbidden", 403);
  }

  return product;
}

async function getDocumentsByProduct(productId, userId, page, limit) {
  await assertProductOwner(productId, userId);
  await recoverStuckOcrForUser(userId, productId);
  const { page: safePage, limit: safeLimit, skip } = paginate(page, limit, {
    defaultLimit: 100
  });
  const filter = { productId, userId };
  const [documents, total] = await Promise.all([
    Document.find(filter).sort({ uploadedAt: -1 }).skip(skip).limit(safeLimit).lean(),
    Document.countDocuments(filter)
  ]);
  return { documents, pagination: paginationMeta(total, safePage, safeLimit) };
}

// Upload raw bytes to Cloudinary (resource_type auto: images stay images,
// PDFs are stored as image resources). Returns the asset fields the document
// record needs. Throws on failure.
async function uploadToCloudinary(buffer, userId, productId, documentType) {
  const folder = `warrantyvault/${userId}/${productId || "unsorted"}/${documentType || "other"}`;
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "auto" },
      (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      }
    );
    stream.end(buffer);
  });
}

async function uploadDocument(productId, userId, fileData, documentType, notes) {
  // productId is optional: standalone uploads (via /api/v1/documents) have no
  // product yet; only verify ownership when a product is actually linked.
  if (productId) {
    await assertProductOwner(productId, userId);
  }

  if (!fileData) {
    throw new AppError("File is required", 400);
  }

  // Memory-storage uploads carry the original bytes; push them to Cloudinary
  // here and keep the buffer for OCR. (When the upload middleware is mocked in
  // tests, fileData already carries path/public_id and no buffer — the legacy
  // shape is used as-is.)
  let fileBuffer = fileData.buffer;
  let uploadedPublicId = null;
  if (fileBuffer) {
    const asset = await uploadToCloudinary(fileBuffer, userId, productId, documentType);
    uploadedPublicId = asset.public_id;
    fileData = {
      ...fileData,
      // Match both the v3 (public_id/secure_url/bytes) and v4 (path/filename/
      // size) shapes so downstream code stays shape-agnostic.
      public_id: asset.public_id,
      secure_url: asset.secure_url,
      path: asset.secure_url,
      filename: asset.public_id,
      bytes: asset.bytes,
      size: asset.bytes
    };
  }

  let document;
  try {
    document = await Document.create({
      productId: productId || null,
      userId,
      documentType,
      fileName: fileData.original_filename || fileData.originalname || fileData.filename || "document",
      fileUrl: fileData.path || fileData.secure_url,
      // multer-storage-cloudinary v4 only sets { path, size, filename } on
      // req.file (filename === Cloudinary public_id). Accept both v3 and v4
      // shapes so uploads don't fail on a missing public_id.
      publicId: fileData.public_id || fileData.filename,
      fileSize: fileData.bytes || fileData.size || 0,
      mimeType: fileData.mimetype || "application/octet-stream",
      notes
    });
  } catch (error) {
    // Cloudinary succeeded but the DB write failed — clean up the uploaded
    // asset so it can't be orphaned. Best-effort: a failed destroy only logs.
    // (There is no transactional guarantee across Cloudinary and MongoDB;
    // this shrinks the failure window instead of eliminating it.)
    if (uploadedPublicId) {
      cloudinary.uploader
        .destroy(uploadedPublicId, { resource_type: "image" })
        .catch(() => {});
    }
    throw error;
  }

  // A product_photo can only update a product's thumbnail when it is attached
  // to one — standalone photo uploads are stored as documents only.
  if (documentType === "product_photo" && productId) {
    await Product.findByIdAndUpdate(productId, {
      thumbnailUrl: document.fileUrl
    });
  }

  // Fire OCR asynchronously for eligible uploads (receipts and warranty
  // cards). Pass the original upload buffer so OCR never depends on the
  // Cloudinary delivery ACL. Ineligible documents are marked skipped
  // synchronously so the upload response reflects the final status.
  // processDocument never throws; on failure it sets ocrStatus="failed" +
  // ocrError.
  if (isOcrEligible(document)) {
    processDocument(document, fileBuffer ? { fileBuffer } : {}).catch(() => {});
  } else {
    document.ocrStatus = "skipped";
    await document.save();
  }

  return document;
}

async function getAllDocuments(userId, page, limit) {
  await recoverStuckOcrForUser(userId);
  const { page: safePage, limit: safeLimit, skip } = paginate(page, limit, {
    defaultLimit: 100
  });
  const filter = { userId };
  const [documents, total] = await Promise.all([
    Document.find(filter).sort({ uploadedAt: -1 }).skip(skip).limit(safeLimit).lean(),
    Document.countDocuments(filter)
  ]);
  return { documents, pagination: paginationMeta(total, safePage, safeLimit) };
}

async function getDocumentById(documentId, userId) {
  if (!mongoose.isValidObjectId(documentId)) {
    throw new AppError("Invalid document ID", 400);
  }

  const document = await Document.findById(documentId);

  if (!document) {
    throw new AppError("Document not found", 404);
  }

  if (document.userId.toString() !== userId.toString()) {
    throw new AppError("Forbidden", 403);
  }

  return recoverStuckOcr(document);
}

// Stream the original file bytes for a document. Ownership is verified first;
// the bytes are pulled through Cloudinary's Admin API download endpoint
// (API-key authenticated) rather than the CDN delivery URL, because this
// account's media delivery ACL blocks direct fileUrl access for PDFs.
async function getDocumentStream(documentId, userId) {
  const document = await getDocumentById(documentId, userId);
  if (!cloudinary.isConfigured()) {
    throw new AppError("File storage is not configured", 503);
  }
  const response = await cloudinary.fetchStoredAsset(document.publicId);
  if (response.ok === false) {
    throw new AppError(
      "Could not download the stored file from Cloudinary",
      response.status === 404 ? 404 : 502
    );
  }
  return { document, response };
}

async function deleteDocument(documentId, userId) {
  const document = await getDocumentById(documentId, userId);

  // Uploads use resource_type "auto", which stores both images AND PDFs as
  // image resources (confirmed empirically: PDF fileUrls are /image/upload/…).
  // Destroying a PDF with resource_type "raw" silently returns "not found"
  // and orphans the file, so always use "image".
  await cloudinary.uploader.destroy(document.publicId, {
    resource_type: "image"
  });

  await document.deleteOne();
}

async function runDocumentOcr(documentId, userId) {
  const document = await getDocumentById(documentId, userId);
  if (document.ocrStatus === "skipped") {
    throw new AppError("This document is not eligible for OCR", 422);
  }
  return processDocument(document);
}

// Create the product for a standalone OCR'd document after the user has
// reviewed and corrected the extracted fields (edit-and-confirm flow). The
// document must not already be linked to a product; the product is created
// (or reused when it carries the same serial number) with the user-confirmed
// values, then the document is linked to it atomically.
async function confirmProductFromDocument(documentId, userId, data, scopeProductId) {
  const document = await getDocumentById(documentId, userId);

  // On the product-scoped mount, the document must belong to that product
  // (standalone docs only make sense on the /documents route).
  if (scopeProductId && (!document.productId || document.productId.toString() !== scopeProductId)) {
    throw new AppError("Forbidden", 403);
  }

  if (document.productId) {
    throw new AppError("This document is already linked to a product", 409);
  }

  // The confirm step is the review of a finished OCR run. Requiring "done"
  // also closes a race: background OCR's final save must not be able to land
  // after the link and write its stale snapshot (productId null) back over it.
  if (document.ocrStatus !== "done") {
    throw new AppError("OCR must finish before the product can be created", 422);
  }

  const productName = String(data.productName || "").trim();
  if (!productName) {
    throw new AppError("Product name is required", 422);
  }

  const price =
    data.purchasePrice != null && Number.isFinite(Number(data.purchasePrice))
      ? Number(data.purchasePrice)
      : undefined;

  // The user explicitly confirmed these values, so an expiry on/before the
  // purchase date is a real mistake — surface it instead of silently
  // dropping the purchase date (createProductFromOcr's safety net).
  if (data.purchaseDate && data.warrantyExpiryDate) {
    if (new Date(data.warrantyExpiryDate) <= new Date(data.purchaseDate)) {
      throw new AppError("Warranty expiry date must be after purchase date", 422);
    }
  }

  const product = await createProductFromOcr(userId, {
    productName,
    brand: String(data.brand || "").trim() || undefined,
    model: String(data.model || "").trim() || undefined,
    serialNumber: String(data.serialNumber || "").trim() || undefined,
    purchasePrice: price,
    purchaseStore: String(data.purchaseStore || "").trim() || undefined,
    purchaseDate: data.purchaseDate || undefined,
    warrantyExpiryDate: data.warrantyExpiryDate || undefined
  });

  document.productId = product._id;
  await document.save();
  return { product, document };
}

module.exports = {
  getDocumentsByProduct,
  getAllDocuments,
  uploadDocument,
  getDocumentById,
  getDocumentStream,
  deleteDocument,
  runDocumentOcr,
  confirmProductFromDocument
};

const mongoose = require("mongoose");
const Document = require("../models/Document");
const Product = require("../models/Product");
const AppError = require("../utils/AppError");
const cloudinary = require("../config/cloudinary");
const { isOcrEligible, processDocument } = require("./ocr.service");

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

async function getDocumentsByProduct(productId, userId) {
  await assertProductOwner(productId, userId);
  return Document.find({ productId, userId }).sort({ uploadedAt: -1 });
}

async function uploadDocument(productId, userId, fileData, documentType, notes) {
  await assertProductOwner(productId, userId);

  if (!fileData) {
    throw new AppError("File is required", 400);
  }

  const document = await Document.create({
    productId,
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

  if (documentType === "product_photo") {
    await Product.findByIdAndUpdate(productId, {
      thumbnailUrl: document.fileUrl
    });
  }

  // Fire OCR asynchronously for eligible uploads (receipts and warranty
  // cards). Ineligible documents are marked skipped synchronously so the
  // upload response reflects the final status. processDocument never throws;
  // on failure it sets ocrStatus="failed" + ocrError.
  if (isOcrEligible(document)) {
    processDocument(document).catch(() => {});
  } else {
    document.ocrStatus = "skipped";
    await document.save();
  }

  return document;
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

  return document;
}

async function deleteDocument(documentId, userId) {
  const document = await getDocumentById(documentId, userId);
  const resourceType = document.mimeType === "application/pdf" ? "raw" : "image";

  await cloudinary.uploader.destroy(document.publicId, {
    resource_type: resourceType
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

module.exports = {
  getDocumentsByProduct,
  uploadDocument,
  getDocumentById,
  deleteDocument,
  runDocumentOcr
};

const mongoose = require("mongoose");
const Document = require("../models/Document");
const Product = require("../models/Product");
const AppError = require("../utils/AppError");
const cloudinary = require("../config/cloudinary");
const { Readable } = require("stream");

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

async function uploadFileToCloudinary(productId, userId, fileData, documentType) {
  if (!cloudinary.isConfigured()) {
    throw new AppError("Cloudinary credentials are not configured", 503);
  }

  const folder = `warrantyvault/${userId}/${productId}/${documentType}`;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
        use_filename: true,
        unique_filename: true,
        filename_override: fileData.originalname
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        return resolve(result);
      }
    );

    Readable.from(fileData.buffer).pipe(uploadStream);
  });
}

async function uploadDocument(productId, userId, fileData, documentType, notes) {
  await assertProductOwner(productId, userId);

  if (!fileData) {
    throw new AppError("File is required", 400);
  }

  const uploadedFile = await uploadFileToCloudinary(productId, userId, fileData, documentType);

  const document = await Document.create({
    productId,
    userId,
    documentType,
    fileName: fileData.originalname || uploadedFile.original_filename || "document",
    fileUrl: uploadedFile.secure_url || uploadedFile.url,
    publicId: uploadedFile.public_id,
    resourceType: uploadedFile.resource_type,
    fileSize: uploadedFile.bytes || fileData.size || 0,
    mimeType: fileData.mimetype || uploadedFile.format || "application/octet-stream",
    notes
  });

  if (documentType === "product_photo") {
    await Product.findByIdAndUpdate(productId, {
      thumbnailUrl: document.fileUrl
    });
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
  const resourceType = document.resourceType || (document.mimeType === "application/pdf" ? "raw" : "image");

  if (!cloudinary.isConfigured()) {
    throw new AppError("Cloudinary credentials are not configured", 503);
  }

  await cloudinary.uploader.destroy(document.publicId, {
    resource_type: resourceType
  });

  await document.deleteOne();
}

module.exports = {
  getDocumentsByProduct,
  uploadDocument,
  getDocumentById,
  deleteDocument
};

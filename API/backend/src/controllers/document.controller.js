const documentService = require("../services/document.service");
const { sendSuccess } = require("../utils/response");

async function getDocuments(req, res, next) {
  try {
    // Standalone /api/v1/documents has no productId param → list every
    // document for the user (linked or standalone).
    const data = req.params.productId
      ? await documentService.getDocumentsByProduct(req.params.productId, req.user.userId)
      : await documentService.getAllDocuments(req.user.userId);
    return sendSuccess(res, { documents: data }, "Documents retrieved");
  } catch (error) {
    return next(error);
  }
}

async function uploadDocument(req, res, next) {
  try {
    const data = await documentService.uploadDocument(
      req.params.productId,
      req.user.userId,
      req.file,
      req.body.documentType,
      req.body.notes
    );
    return sendSuccess(res, data, "Document uploaded", 201);
  } catch (error) {
    return next(error);
  }
}

async function getDocumentById(req, res, next) {
  try {
    const data = await documentService.getDocumentById(req.params.documentId, req.user.userId);
    // On the product-scoped routes, a document must belong to that product
    // (a standalone doc accessed through a product URL is a mismatch).
    // The standalone /api/v1/documents route skips this check (no productId).
    if (req.params.productId && (!data.productId || data.productId.toString() !== req.params.productId)) {
      return next(new Error("Forbidden"));
    }
    return sendSuccess(res, data, "Document retrieved");
  } catch (error) {
    return next(error);
  }
}

async function deleteDocument(req, res, next) {
  try {
    const data = await documentService.getDocumentById(req.params.documentId, req.user.userId);
    // Same conditional product-scope check as getDocumentById.
    if (req.params.productId && (!data.productId || data.productId.toString() !== req.params.productId)) {
      return next(new Error("Forbidden"));
    }
    await documentService.deleteDocument(req.params.documentId, req.user.userId);
    return sendSuccess(res, null, "Document deleted");
  } catch (error) {
    return next(error);
  }
}

async function runDocumentOcr(req, res, next) {
  try {
    const data = await documentService.runDocumentOcr(req.params.documentId, req.user.userId);
    return sendSuccess(res, data, "OCR completed");
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getDocuments,
  uploadDocument,
  getDocumentById,
  deleteDocument,
  runDocumentOcr
};

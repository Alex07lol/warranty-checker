const documentService = require("../services/document.service");
const { sendSuccess } = require("../utils/response");
const AppError = require("../utils/AppError");

async function getDocuments(req, res, next) {
  try {
    const data = await documentService.getDocumentsByProduct(req.params.productId, req.user.userId);
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
    if (data.productId.toString() !== req.params.productId) {
      return next(new AppError("Forbidden", 403));
    }
    return sendSuccess(res, data, "Document retrieved");
  } catch (error) {
    return next(error);
  }
}

async function deleteDocument(req, res, next) {
  try {
    const document = await documentService.getDocumentById(req.params.documentId, req.user.userId);
    if (document.productId.toString() !== req.params.productId) {
      return next(new AppError("Forbidden", 403));
    }
    await documentService.deleteDocumentRecord(document);
    return sendSuccess(res, null, "Document deleted");
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getDocuments,
  uploadDocument,
  getDocumentById,
  deleteDocument
};

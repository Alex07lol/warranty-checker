const { Readable } = require("node:stream");
const AppError = require("../utils/AppError");
const documentService = require("../services/document.service");
const { sendSuccess } = require("../utils/response");

async function getDocuments(req, res, next) {
  try {
    // Standalone /api/v1/documents has no productId param → list every
    // document for the user (linked or standalone).
    const data = req.params.productId
      ? await documentService.getDocumentsByProduct(
          req.params.productId,
          req.user.userId,
          req.query.page,
          req.query.limit
        )
      : await documentService.getAllDocuments(req.user.userId, req.query.page, req.query.limit);
    return sendSuccess(res, data, "Documents retrieved");
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
    // AppError so the mismatch surfaces as 403, not a 500 internal error.
    if (req.params.productId && (!data.productId || data.productId.toString() !== req.params.productId)) {
      return next(new AppError("Forbidden", 403));
    }
    return sendSuccess(res, data, "Document retrieved");
  } catch (error) {
    return next(error);
  }
}

// Phase 4 §13/§14 — update organization + verification fields (docState,
// verified, tags, notes, documentType) on an existing document.
async function updateDocument(req, res, next) {
  try {
    const existing = await documentService.getDocumentById(req.params.documentId, req.user.userId);
    // Same conditional product-scope check as getDocumentById/deleteDocument:
    // on the product-scoped mount a document must belong to that product.
    if (req.params.productId && (!existing.productId || existing.productId.toString() !== req.params.productId)) {
      return next(new AppError("Forbidden", 403));
    }
    const data = await documentService.updateDocument(
      req.params.documentId,
      req.user.userId,
      req.body
    );
    return sendSuccess(res, data, "Document updated");
  } catch (error) {
    return next(error);
  }
}

async function deleteDocument(req, res, next) {
  try {
    const data = await documentService.getDocumentById(req.params.documentId, req.user.userId);
    // Same conditional product-scope check as getDocumentById.
    if (req.params.productId && (!data.productId || data.productId.toString() !== req.params.productId)) {
      return next(new AppError("Forbidden", 403));
    }
    await documentService.deleteDocument(req.params.documentId, req.user.userId);
    return sendSuccess(res, null, "Document deleted");
  } catch (error) {
    return next(error);
  }
}

// Stream the document's original file bytes to the client. The bytes are
// fetched server-side through Cloudinary's Admin API (bypassing the account's
// media delivery ACL), so the PDF "View" button works even though direct
// fileUrl access is restricted.
async function viewDocument(req, res, next) {
  try {
    const { document, response } = await documentService.getDocumentStream(
      req.params.documentId,
      req.user.userId
    );
    // Same conditional product-scope check as getDocumentById.
    if (req.params.productId && (!document.productId || document.productId.toString() !== req.params.productId)) {
      return next(new AppError("Forbidden", 403));
    }

    if (!response.body) {
      return next(new AppError("Stored file has no content", 502));
    }

    const contentType =
      response.headers.get("content-type") || document.mimeType || "application/octet-stream";
    const fileName = document.fileName || "document";
    const safeName = fileName.replace(/"/g, "").replace(/[\r\n]/g, "");
    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      // RFC 5987 filename* for non-ASCII names, plus a plain fallback.
      `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    // Personal documents must not be cached by shared caches/proxies.
    res.setHeader("Cache-Control", "private, no-store");
    const contentLength = response.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);
    const stream = Readable.fromWeb(response.body);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
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

// End of the edit-and-confirm flow: create the product for a standalone
// document from the user-reviewed (and corrected) OCR data.
async function confirmDocumentProduct(req, res, next) {
  try {
    const data = await documentService.confirmProductFromDocument(
      req.params.documentId,
      req.user.userId,
      req.body,
      req.params.productId
    );
    return sendSuccess(res, data, "Product created from document", 201);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getDocuments,
  uploadDocument,
  getDocumentById,
  viewDocument,
  deleteDocument,
  updateDocument,
  runDocumentOcr,
  confirmDocumentProduct
};

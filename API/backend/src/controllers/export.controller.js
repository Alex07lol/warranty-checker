"use strict";

const exportService = require("../services/export.service");
const { sendSuccess } = require("../utils/response");

// Phase 4 §15 — structured claim snapshot for one product (owner only).
async function getClaimSummary(req, res, next) {
  try {
    const data = await exportService.getClaimSummary(req.params.id, req.user.userId);
    return sendSuccess(res, data, "Warranty claim summary prepared");
  } catch (error) {
    return next(error);
  }
}

// Phase 4 §16 — download all owned products as JSON or CSV. Downloads are
// sent as attachments so the browser never tries to render them inline.
async function exportProducts(req, res, next) {
  try {
    const format = String(req.query.format || "json").toLowerCase();
    const file = await exportService.exportProducts(req.user.userId, format);
    const filename = `warrantyvault-products-${new Date().toISOString().slice(0, 10)}.${file.extension}`;
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    return res.send(file.body);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getClaimSummary,
  exportProducts
};

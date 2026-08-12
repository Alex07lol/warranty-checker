const shareService = require("../services/share.service");
const { sendSuccess } = require("../utils/response");

// Owner-side: create a share link for one of the user's products.
async function createShare(req, res, next) {
  try {
    const data = await shareService.createShareLink(
      req.params.productId,
      req.user.userId,
      req.body.expiresInDays
    );
    return sendSuccess(res, data, "Share link created", 201);
  } catch (error) {
    return next(error);
  }
}

// Owner-side: list the user's share links for a product (active + revoked).
async function listShares(req, res, next) {
  try {
    const data = await shareService.listShareLinks(req.params.productId, req.user.userId);
    return sendSuccess(res, data, "Share links retrieved");
  } catch (error) {
    return next(error);
  }
}

// Owner-side: revoke a share link (takes effect immediately).
async function revokeShare(req, res, next) {
  try {
    const data = await shareService.revokeShareLink(
      req.params.productId,
      req.params.shareId,
      req.user.userId
    );
    return sendSuccess(res, data, "Share link revoked");
  } catch (error) {
    return next(error);
  }
}

// Public: read-only product snapshot behind a valid token (no auth).
async function getSharedProduct(req, res, next) {
  try {
    const data = await shareService.getSharedProduct(req.params.token);
    // Revocation must take effect immediately: never let browsers/CDNs serve
    // a cached snapshot after the owner revokes the link (same policy as
    // viewDocument for personal files).
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, data, "Shared product retrieved");
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createShare,
  listShares,
  revokeShare,
  getSharedProduct
};

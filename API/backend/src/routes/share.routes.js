const express = require("express");
const rateLimit = require("express-rate-limit");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const controller = require("../controllers/share.controller");
const { createShareSchema } = require("../validators/share.validator");

// ── Owner mount: /api/v1/products/:productId/shares ────────────────────────
const router = express.Router({ mergeParams: true });
router.use(auth);
router.get("/", controller.listShares);
router.post("/", validate(createShareSchema), controller.createShare);
router.delete("/:shareId", controller.revokeShare);

// ── Public mount: /api/v1/shared ────────────────────────────────────────────
// No auth — the token IS the credential (48 hex chars, unguessable). A per-IP
// rate limit keeps the endpoint from being hammered while staying far above
// any legitimate use. Overridable via env for tests.
const publicRouter = express.Router();
publicRouter.use(
  rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: Number(process.env.SHARED_VIEW_RATE_LIMIT) || 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => req.ip
  })
);
publicRouter.get("/:token", controller.getSharedProduct);

module.exports = { router, publicRouter };

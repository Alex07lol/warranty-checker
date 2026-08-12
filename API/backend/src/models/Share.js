const mongoose = require("mongoose");

// Phase 4 §17 — secure product sharing.
//
// A share link grants *read-only* access to exactly one product through an
// unguessable token. Tokens are 48 hex chars (24 random bytes), so there is
// no enumerable public URL space. Links are optional-expiry (expiresAt null
// means "never") and always revocable (revokedAt). The owner manages links;
// the public view never includes file bytes or account internals.
const shareSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
    index: true
  },
  // The owner — management (create/list/revoke) is scoped to this user.
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // null = never expires.
  expiresAt: {
    type: Date,
    default: null
  },
  // null = active; set when the owner revokes the link.
  revokedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Share", shareSchema);

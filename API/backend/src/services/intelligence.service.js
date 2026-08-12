// Deterministic warranty intelligence (Phase 4 §19) — no AI involved.
//
// analyzeProduct(product, userId) inspects a product and returns findings:
//   conflicts  — warranty dates are inconsistent (expiry before purchase,
//                coverage period expiry before its start)
//   missing    — information that would unlock reminders/status is absent
//   duplicates — another of the user's products looks like the same item
//
// Everything is a suggestion: the UI always lets the user decide. Products
// are never merged, and nothing here ever writes to the database.
"use strict";

const Product = require("../models/Product");

const DAY_MS = 86400000;

function startOfDay(d) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return x;
  x.setHours(0, 0, 0, 0);
  return x;
}

// Render a startOfDay-normalized date in LOCAL time. toISOString() would
// render UTC, which shifts the printed date back a day for timezones ahead
// of UTC (e.g. 2025-01-01 at UTC+5:30 -> "2024-12-31"). Comparisons in this
// module are unaffected (both sides normalize identically) — only the
// user-visible message text needs the local rendering.
function iso(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Finding: { type: conflict|missing|duplicate, severity: warning|info,
//            title, message, field?, action: edit|view, targetId? }

function findConflicts(product) {
  const findings = [];
  const purchase = product.purchaseDate ? startOfDay(product.purchaseDate) : null;
  const expiry = product.warrantyExpiryDate ? startOfDay(product.warrantyExpiryDate) : null;

  if (
    purchase && expiry &&
    !Number.isNaN(purchase.getTime()) && !Number.isNaN(expiry.getTime()) &&
    expiry < purchase
  ) {
    findings.push({
      type: "conflict",
      severity: "warning",
      title: "Warranty dates appear inconsistent",
      message:
        `The warranty expiry (${iso(expiry)}) is before the purchase date ` +
        `(${iso(purchase)}). Review these dates.`,
      field: "dates",
      action: "edit"
    });
  }

  (product.warranties || []).forEach((w) => {
    if (!w.startDate || !w.expiryDate) return;
    const s = startOfDay(w.startDate);
    const e = startOfDay(w.expiryDate);
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && e < s) {
      findings.push({
        type: "conflict",
        severity: "warning",
        title: "Coverage period dates are reversed",
        message:
          `The “${w.type || "Coverage"}” period expires (${iso(e)}) before it ` +
          `starts (${iso(s)}).`,
        field: "warranties",
        action: "edit"
      });
    }
  });

  return findings;
}

function findMissingInfo(product) {
  const findings = [];
  const hasAnyExpiry =
    product.warrantyExpiryDate ||
    (product.warranties || []).some((w) => w.expiryDate);

  if (!hasAnyExpiry) {
    findings.push({
      type: "missing",
      severity: "info",
      title: "No warranty expiry set",
      message:
        "Add a warranty expiry date to enable expiry reminders and status tracking.",
      field: "warrantyExpiryDate",
      action: "edit"
    });
  }

  if (hasAnyExpiry && !product.purchaseDate) {
    findings.push({
      type: "missing",
      severity: "info",
      title: "Purchase date missing",
      message:
        "Add the purchase date so the warranty timeline and progress can be shown.",
      field: "purchaseDate",
      action: "edit"
    });
  }

  return findings;
}

// Compare against the user's OTHER products. Strong match: identical serial
// number. Weaker match: same brand + model + store, purchased within ~90 days.
// Never suggests the product against itself.
function findDuplicates(product, others) {
  const serial = (product.serialNumber || "").trim().toLowerCase();
  const brand = (product.brand || "").trim().toLowerCase();
  const model = (product.model || "").trim().toLowerCase();
  const store = (product.purchaseStore || "").trim().toLowerCase();
  const purchase = product.purchaseDate ? startOfDay(product.purchaseDate) : null;

  const findings = [];
  for (const other of others) {
    if (String(other._id) === String(product._id)) continue;

    let reason = null;
    const otherSerial = (other.serialNumber || "").trim().toLowerCase();
    if (serial && otherSerial && otherSerial === serial) {
      reason = "the same serial number";
    } else if (
      brand && model && store &&
      other.brand && other.model && other.purchaseStore &&
      other.brand.trim().toLowerCase() === brand &&
      other.model.trim().toLowerCase() === model &&
      other.purchaseStore.trim().toLowerCase() === store
    ) {
      const otherPurchase = other.purchaseDate ? startOfDay(other.purchaseDate) : null;
      if (purchase && otherPurchase && !Number.isNaN(purchase.getTime()) && !Number.isNaN(otherPurchase.getTime())) {
        const diffDays = Math.round(Math.abs((purchase - otherPurchase) / DAY_MS));
        if (diffDays <= 90) {
          reason = `the same brand, model and store, purchased about ${diffDays} days apart`;
        }
      } else {
        reason = "the same brand, model and store";
      }
    }

    if (reason) {
      findings.push({
        type: "duplicate",
        severity: "info",
        title: "Possible duplicate product",
        message:
          `“${other.productName}” was registered with ${reason}. ` +
          `You may want to keep only one entry.`,
        targetId: String(other._id),
        action: "view"
      });
    }
  }
  return findings;
}

// Full analysis for one product: conflicts + missing info + duplicates
// against the user's other active products.
async function analyzeProduct(product, userId) {
  const findings = [...findConflicts(product), ...findMissingInfo(product)];

  const others = await Product.find({
    userId,
    isDeleted: false,
    _id: { $ne: product._id }
  })
    .select("_id productName brand model purchaseStore serialNumber purchaseDate")
    .lean();

  findings.push(...findDuplicates(product, others));
  return findings;
}

module.exports = {
  findConflicts,
  findMissingInfo,
  findDuplicates,
  analyzeProduct
};

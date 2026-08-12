// Canonical warranty-status engine (Phase 4 §5).
//
// This module is the SINGLE SOURCE OF TRUTH for warranty state. The frontend
// mirrors it in public/js/warranty.js (classic scripts have no shared module
// system), and tests/warranty-status.test.js runs both engines against the
// same fixtures to prove they never diverge. Change thresholds here, change
// the mirror too, and let the drift test catch you if you forget.
//
// Statuses (spec §5):
//   not_started   — start date is in the future
//   active        — expiry more than EXPIRING_SOON_DAYS away
//   expiring_soon — expiry within EXPIRING_SOON_DAYS (matches the existing
//                   dashboard 30-day expiring window)
//   expired       — expiry date has passed
//   unknown       — no usable expiry date
"use strict";

const EXPIRING_SOON_DAYS = 30;

const WARRANTY_STATUSES = ["not_started", "active", "expiring_soon", "expired", "unknown"];

function startOfDay(d) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return x;
  x.setHours(0, 0, 0, 0);
  return x;
}

// Compute the status of a single warranty period (or the legacy primary
// fields) relative to `now` (defaults to the current date).
//   { startDate, expiryDate } -> { status, daysRemaining, label }
// daysRemaining is null when unknown (no usable expiry).
function warrantyStatusOf(period, now = new Date()) {
  const expiryDate = period && period.expiryDate;
  if (!expiryDate) {
    return { status: "unknown", daysRemaining: null, label: "Unknown" };
  }
  const today = startOfDay(now);
  const expiry = startOfDay(expiryDate);
  if (Number.isNaN(expiry.getTime())) {
    return { status: "unknown", daysRemaining: null, label: "Unknown" };
  }
  const daysRemaining = Math.ceil((expiry - today) / 86400000);

  if (period && period.startDate) {
    const start = startOfDay(period.startDate);
    if (!Number.isNaN(start.getTime()) && start > today) {
      return { status: "not_started", daysRemaining, label: "Not started" };
    }
  }

  if (daysRemaining <= 0) {
    return { status: "expired", daysRemaining, label: "Expired" };
  }
  if (daysRemaining <= EXPIRING_SOON_DAYS) {
    return { status: "expiring_soon", daysRemaining, label: `${daysRemaining} days remaining` };
  }
  return { status: "active", daysRemaining, label: `${daysRemaining} days remaining` };
}

// Status of the product's primary (legacy) warranty — the expiry the
// dashboard, notifications and expiring-soon queries are built on.
// startDate is the purchase date (when known).
function primaryWarrantyStatus(product, now) {
  return warrantyStatusOf(
    { startDate: product && product.purchaseDate, expiryDate: product && product.warrantyExpiryDate },
    now
  );
}

function statusLabel(status) {
  return (
    {
      not_started: "Not started",
      active: "Active",
      expiring_soon: "Expiring soon",
      expired: "Expired",
      unknown: "Unknown"
    }[status] || "Unknown"
  );
}

module.exports = {
  EXPIRING_SOON_DAYS,
  WARRANTY_STATUSES,
  warrantyStatusOf,
  primaryWarrantyStatus,
  statusLabel
};

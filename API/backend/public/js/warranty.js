/* Warranty-status engine — FRONTEND MIRROR.
   Backend source of truth: src/services/warranty.service.js.
   Classic scripts share no module system, so this file mirrors the backend
   engine exactly; tests/warranty-status.test.js runs BOTH against the same
   fixtures and fails CI if they ever diverge. Loaded BEFORE utils.js (which
   delegates warrantyInfo() to it).

   Statuses (Phase 4 §5): not_started | active | expiring_soon | expired | unknown
*/

'use strict';

const EXPIRING_SOON_DAYS = 30;

const WARRANTY_STATUSES = ['not_started', 'active', 'expiring_soon', 'expired', 'unknown'];

function startOfDay(d) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return x;
  x.setHours(0, 0, 0, 0);
  return x;
}

// Compute the status of a warranty period (or legacy primary fields):
//   { startDate, expiryDate } -> { status, daysRemaining, label }
function warrantyStatusOf(period, now) {
  const expiryDate = period && period.expiryDate;
  if (!expiryDate) {
    return { status: 'unknown', daysRemaining: null, label: 'Unknown' };
  }
  const today = startOfDay(now || new Date());
  const expiry = startOfDay(expiryDate);
  if (Number.isNaN(expiry.getTime())) {
    return { status: 'unknown', daysRemaining: null, label: 'Unknown' };
  }
  const daysRemaining = Math.ceil((expiry - today) / 86400000);

  if (period && period.startDate) {
    const start = startOfDay(period.startDate);
    if (!Number.isNaN(start.getTime()) && start > today) {
      return { status: 'not_started', daysRemaining, label: 'Not started' };
    }
  }

  if (daysRemaining <= 0) {
    return { status: 'expired', daysRemaining, label: 'Expired' };
  }
  if (daysRemaining <= EXPIRING_SOON_DAYS) {
    return { status: 'expiring_soon', daysRemaining, label: daysRemaining + ' days remaining' };
  }
  return { status: 'active', daysRemaining, label: daysRemaining + ' days remaining' };
}

function primaryWarrantyStatus(product, now) {
  return warrantyStatusOf(
    { startDate: product && product.purchaseDate, expiryDate: product && product.warrantyExpiryDate },
    now
  );
}

function statusLabel(status) {
  return (
    {
      not_started: 'Not started',
      active: 'Active',
      expiring_soon: 'Expiring soon',
      expired: 'Expired',
      unknown: 'Unknown'
    }[status] || 'Unknown'
  );
}

"use strict";

// Parse page/limit query params into sane numbers: page >= 1, limit clamped
// to [1, max]. Used by every list endpoint so large collections can never be
// returned unbounded.
function paginate(page, limit, { max = 100, defaultLimit = 50 } = {}) {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || defaultLimit, 1), max);
  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit
  };
}

function paginationMeta(total, page, limit) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1
  };
}

module.exports = { paginate, paginationMeta };

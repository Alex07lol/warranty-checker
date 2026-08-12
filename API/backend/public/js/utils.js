/* WarrantyVault shared UI helpers — loaded BEFORE app.js.
   Functions here are used across the whole app (and from inline handlers),
   so they live at global scope as classic-script declarations. */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────
let toastTimer = null;
function toast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function fmtMoney(p) {
  if (p == null || p.purchasePrice == null) return '—';
  const c = p.currency || 'USD';
  try { return Number(p.purchasePrice).toLocaleString('en-US', { style: 'currency', currency: c }); }
  catch { return Number(p.purchasePrice).toLocaleString('en-US'); }
}

function fmtDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Animate a stat value from 0 to `target` with a smooth count-up effect.
const statAnimations = new WeakMap();
function animateCountUp(el, target, duration = 500) {
  if (!el) return; // Element may have been removed from the DOM — never crash the view.
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = Number(target).toLocaleString('en-US');
    return;
  }
  const prev = statAnimations.get(el);
  if (prev) cancelAnimationFrame(prev);
  el.classList.remove('count-up');
  el.offsetWidth; // restart the CSS pop animation
  el.classList.add('count-up');
  const start = performance.now();
  const frame = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(target * eased).toLocaleString('en-US');
    if (progress < 1) {
      statAnimations.set(el, requestAnimationFrame(frame));
    } else {
      el.textContent = Number(target).toLocaleString('en-US');
      statAnimations.delete(el);
    }
  };
  statAnimations.set(el, requestAnimationFrame(frame));
}

// Warranty status from the product's warrantyExpiryDate
function warrantyInfo(p) {
  if (!p.warrantyExpiryDate) return { status: 'none', label: 'No expiry set', badgeClass: 'badge-safe', blockClass: 'safe', valueClass: 'safe', days: Infinity };
  const expiry = new Date(p.warrantyExpiryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((expiry - today) / 86400000);
  if (days <= 0) return { status: 'expired', label: 'Expired', badgeClass: 'badge-expired', blockClass: 'expired', valueClass: 'expired', days };
  if (days <= 7) return { status: 'critical', label: days + ' days remaining', badgeClass: 'badge-critical', blockClass: 'critical', valueClass: 'critical', days };
  if (days <= 30) return { status: 'soon', label: days + ' days remaining', badgeClass: 'badge-soon', blockClass: 'critical', valueClass: 'critical', days };
  return { status: 'safe', label: days + ' days remaining', badgeClass: 'badge-safe', blockClass: 'safe', valueClass: 'safe', days };
}

function productImage(p) {
  if (p && p.thumbnailUrl) return p.thumbnailUrl;
  const q = encodeURIComponent((p && (p.brand + ' ' + p.category)) || 'product');
  return 'https://source.unsplash.com/160x160/?' + q;
}

function emptyState(icon, title, sub) {
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.innerHTML = (icon ? '<div class="empty-icon">' + icon + '</div>' : '') +
    '<div class="empty-title">' + escapeHtml(title) + '</div>' +
    (sub ? '<div class="empty-sub">' + escapeHtml(sub) + '</div>' : '');
  return el;
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton loading placeholders
// ─────────────────────────────────────────────────────────────────────────────
function skeletonBlock(cls) {
  const el = document.createElement('div');
  el.className = 'skeleton ' + cls;
  return el;
}

function skeletonProductCards(count) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.className = 'skeleton-card product';
    card.appendChild(skeletonBlock('skeleton-img'));
    const lines = document.createElement('div');
    lines.className = 'skeleton-lines';
    lines.appendChild(skeletonBlock('skeleton-line name'));
    lines.appendChild(skeletonBlock('skeleton-line meta'));
    card.appendChild(lines);
    card.appendChild(skeletonBlock('skeleton-badge'));
    frag.appendChild(card);
  }
  return frag;
}

function skeletonLineCards(count) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.className = 'skeleton-card';
    const lines = document.createElement('div');
    lines.className = 'skeleton-lines';
    lines.appendChild(skeletonBlock('skeleton-line name'));
    lines.appendChild(skeletonBlock('skeleton-line meta'));
    card.appendChild(lines);
    frag.appendChild(card);
  }
  return frag;
}

const STAT_GRID_HTML = document.getElementById('stat-grid').innerHTML;
const STAT_SKELETON_HTML =
  '<div class="stat-card"><div class="skeleton skeleton-stat-num"></div><div class="skeleton skeleton-stat-label"></div></div>' +
  '<div class="stat-card accent"><div class="skeleton skeleton-stat-num"></div><div class="skeleton skeleton-stat-label"></div></div>' +
  '<div class="stat-card"><div class="skeleton skeleton-stat-num"></div><div class="skeleton skeleton-stat-label"></div></div>' +
  '<div class="stat-card"><div class="skeleton skeleton-stat-num"></div><div class="skeleton skeleton-stat-label"></div></div>';

function setStatsSkeleton(show) {
  const grid = document.getElementById('stat-grid');
  if (!grid) return;
  grid.innerHTML = show ? STAT_SKELETON_HTML : STAT_GRID_HTML;
}

// ─────────────────────────────────────────────────────────────────────────────
// Misc helpers
// ─────────────────────────────────────────────────────────────────────────────
function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Transient permission denial etc. — fall through to execCommand.
    }
  }
  // Fallback for non-secure contexts or when the Clipboard API is denied.
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

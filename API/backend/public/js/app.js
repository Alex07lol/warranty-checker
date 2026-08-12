/* WarrantyVault app logic — extracted from public/index.html.
   Shared helpers (js/utils.js), the API layer (js/api.js) and auth flows
   (js/auth.js) live in their own files loaded BEFORE this one, in order:
   utils -> api -> auth -> app. Functions here are used from inline onclick
   handlers, so they stay at global scope. */

'use strict';

function makeProductCard(p, index) {
  const info = warrantyInfo(p);
  const card = document.createElement('div');
  card.className = 'product-card animate-in';
  card.style.animationDelay = (Math.min(index || 0, 8) * 0.05) + 's';
  card.onclick = () => openDetail(p._id);
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.addEventListener('keydown', e => { if(e.key === 'Enter') openDetail(p._id); });
  
  const expiryStr = p.warrantyExpiryDate ? fmtDate(p.warrantyExpiryDate) : 'No expiry set';
  
  card.innerHTML =
    '<img class="product-img" src="' + escapeHtml(productImage(p)) + '" alt="" ' +
    'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'" />' +
    '<div class="product-img-placeholder" style="display:none;"></div>' +
    '<div class="product-info" style="flex:1;">' +
      '<div class="product-info-name">' + escapeHtml(p.productName) + '</div>' +
      '<div class="product-info-brand">' + escapeHtml([p.brand, p.model].filter(Boolean).join(' · ') || '—') + '</div>' +
      '<div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Expires: ' + escapeHtml(expiryStr) + '</div>' +
    '</div>' +
    '<div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">' +
      '<span class="product-warranty-badge ' + info.badgeClass + '">' + info.label + '</span>' +
      '<span style="font-size: 20px; color: var(--text-muted);">›</span>' +
    '</div>';
  return card;
}

// ─────────────────────────────────────────────────────────────────────────────
// Guest mode demo data (shown when not authenticated)
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_PRODUCTS = [
  {
    _id: 'demo-1',
    productName: 'Dell XPS 15 Laptop',
    brand: 'Dell', model: 'XPS 15 9530', category: 'Laptop',
    serialNumber: 'XPS15-7G2K9', purchaseDate: '2023-11-02',
    purchasePrice: 2099, currency: 'USD', purchaseStore: 'Best Buy',
    warrantyPeriodMonths: 12, warrantyExpiryDate: daysFromNow(-35),
    notes: 'Primary work machine — extended support plan.'
  },
  {
    _id: 'demo-2',
    productName: 'Samsung Galaxy S23',
    brand: 'Samsung', model: 'SM-S911', category: 'Smartphone',
    serialNumber: 'S23-84KD2', purchaseDate: '2024-01-15',
    purchasePrice: 899, currency: 'USD', purchaseStore: 'Amazon',
    warrantyPeriodMonths: 24, warrantyExpiryDate: daysFromNow(4),
    notes: 'Screen replaced once.'
  },
  {
    _id: 'demo-3',
    productName: 'LG 4K OLED TV',
    brand: 'LG', model: 'OLED65C3', category: 'Television',
    serialNumber: 'LG65-29FL7', purchaseDate: '2024-03-20',
    purchasePrice: 1799, currency: 'USD', purchaseStore: 'Best Buy',
    warrantyPeriodMonths: 12, warrantyExpiryDate: daysFromNow(12),
    notes: ''
  },
  {
    _id: 'demo-4',
    productName: 'Sony WH-1000XM5 Headphones',
    brand: 'Sony', model: 'WH-1000XM5', category: 'Audio',
    serialNumber: 'XM5-5510Q', purchaseDate: '2025-02-10',
    purchasePrice: 399, currency: 'USD', purchaseStore: 'Sony Store',
    warrantyPeriodMonths: 12, warrantyExpiryDate: daysFromNow(190),
    notes: 'So far so good.'
  },
  {
    _id: 'demo-5',
    productName: 'Canon EOS R50 Camera',
    brand: 'Canon', model: 'EOS R50', category: 'Camera',
    serialNumber: 'R50-9CB72', purchaseDate: '2025-06-01',
    purchasePrice: 749, currency: 'USD', purchaseStore: 'B&H Photo',
    warrantyPeriodMonths: 12, warrantyExpiryDate: daysFromNow(300),
    notes: ''
  }
];

const DEMO_NOTIFICATIONS = [
  { _id: 'demo-n1', title: 'Warranty expiring soon', message: 'Samsung Galaxy S23 warranty expires in 4 days.', isRead: false, createdAt: daysFromNow(0), productId: 'demo-2' },
  { _id: 'demo-n2', title: 'Warranty expired', message: 'The warranty on your Dell XPS 15 Laptop has expired.', isRead: false, createdAt: daysFromNow(-2), productId: 'demo-1' },
  { _id: 'demo-n3', title: 'Welcome to WarrantyVault', message: 'This is guest mode — sign in to save products, receipts and service records.', isRead: true, createdAt: daysFromNow(-7) }
];

function demoProducts() { return DEMO_PRODUCTS.slice(); }
function demoNotifications() { return DEMO_NOTIFICATIONS.slice(); }
function demoUnreadCount() { return DEMO_NOTIFICATIONS.filter(n => !n.isRead).length; }

// ─────────────────────────────────────────────────────────────────────────────
// View switching
// ─────────────────────────────────────────────────────────────────────────────
function showView(target) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const viewEl = document.getElementById('view-' + target);
  if (viewEl) viewEl.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.remove('active');
    if (typeof b.removeAttribute === 'function') b.removeAttribute('aria-current');
  });
  const navBtn = document.querySelector('.nav-item[data-view="' + target + '"]');
  if (navBtn) {
    navBtn.classList.add('active');
    if (typeof navBtn.setAttribute === 'function') navBtn.setAttribute('aria-current', 'page');
  }
  closeDialog(document.getElementById('detail-overlay'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard (home)
// ─────────────────────────────────────────────────────────────────────────────
function renderExpiringProducts(products, listEl) {
  const expiring = products
    .map(p => ({ p, info: warrantyInfo(p) }))
    .filter(x => x.info.days > 0 && x.info.days <= 30)
    .sort((a, b) => a.info.days - b.info.days)
    .map(x => x.p);

  if (expiring.length) {
    expiring.forEach((p, i) => listEl.appendChild(makeProductCard(p, i)));
  } else {
    listEl.appendChild(emptyState('', 'All warranties in good standing', 'Nothing expiring in the next 30 days.'));
  }
}

function renderRecentProducts(products, listEl) {
  if (products.length) {
    products.slice().reverse().forEach((p, i) => listEl.appendChild(makeProductCard(p, i)));
  } else {
    listEl.appendChild(emptyState('', 'No products yet', 'Sign in to add your first product.'));
  }
}

function renderGuestDashboard() {
  setStatsSkeleton(false);
  const products = demoProducts();
  const expiringSoon = products
    .map(p => ({ p, info: warrantyInfo(p) }))
    .filter(x => x.info.days > 0 && x.info.days <= 30)
    .sort((a, b) => a.info.days - b.info.days)
    .map(x => x.p);

  const activeWarranties = products.filter(p => warrantyInfo(p).status !== 'expired');
  const expiredWarranties = products.filter(p => warrantyInfo(p).status === 'expired');

  animateCountUp(document.getElementById('stat-active'), activeWarranties.length);
  animateCountUp(document.getElementById('stat-expiring'), expiringSoon.length);
  animateCountUp(document.getElementById('stat-expired'), expiredWarranties.length);
  animateCountUp(document.getElementById('stat-documents'), 0);
  updateNavBadge(demoUnreadCount());

  const list = document.getElementById('attention-list');
  const recent = document.getElementById('recent-list');
  list.innerHTML = '';
  recent.innerHTML = '';

  renderExpiringProducts(expiringSoon, list);
  renderRecentProducts(products.slice().reverse(), recent);
}

async function loadDashboard() {
  const user = getUser();
  document.getElementById('greeting-name').textContent = (user && user.name) || 'Guest';
  const hour = new Date().getHours();
  let greeting = 'Good evening,';
  if (hour < 12) {
    greeting = 'Good morning,';
  } else if (hour < 17) {
    greeting = 'Good afternoon,';
  }
  document.getElementById('home-greeting').textContent = greeting;

  const list = document.getElementById('attention-list');
  const recent = document.getElementById('recent-list');
  list.innerHTML = '';
  recent.innerHTML = '';
  list.appendChild(skeletonProductCards(2));
  recent.appendChild(skeletonProductCards(2));
  setStatsSkeleton(true);

  if (isGuest()) {
    renderGuestDashboard();
    return;
  }

  try {
    const d = await api('/dashboard');
    setStatsSkeleton(false);
    list.innerHTML = '';
    recent.innerHTML = '';
    const activeCount = d.activeWarrantiesCount !== undefined ? d.activeWarrantiesCount : (d.totalProducts || 0);
    const expiredCount = d.expiredWarrantiesCount !== undefined ? d.expiredWarrantiesCount : 0;
    
    animateCountUp(document.getElementById('stat-active'), activeCount);
    animateCountUp(document.getElementById('stat-expiring'), d.expiringSoonCount || 0);
    animateCountUp(document.getElementById('stat-expired'), expiredCount);
    animateCountUp(document.getElementById('stat-documents'), d.totalDocuments || 0);
    updateNavBadge(d.unreadNotificationsCount || 0);

    renderExpiringProducts(d.expiringSoon || [], list);
    renderRecentProducts(d.recentProducts || [], recent);
  } catch (e) {
    setStatsSkeleton(false);
    list.innerHTML = '';
    recent.innerHTML = '';
    list.appendChild(emptyState('⚠️', 'Could not load dashboard', e.message));
  }
}

function updateNavBadge(count) {
  const badge = document.getElementById('nav-unread-badge');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Products: list + search + create/update/delete
// ─────────────────────────────────────────────────────────────────────────────
let productsCache = [];
let productsSearchTimer = null;

async function loadProducts() {
  const list = document.getElementById('products-list');
  list.innerHTML = '';
  list.appendChild(skeletonProductCards(3));
  if (isGuest()) {
    productsCache = demoProducts();
    renderProducts(productsCache);
    return;
  }
  try {
    const data = await api('/products?limit=100');
    productsCache = data.products || [];
    renderProducts(productsCache);
  } catch (e) {
    list.innerHTML = '';
    list.appendChild(emptyState('⚠️', 'Could not load products', e.message));
  }
}

function renderProducts(items) {
  const list = document.getElementById('products-list');
  list.innerHTML = '';
  if (!items.length) {
    list.appendChild(emptyState('', 'No products yet', 'Tap “+ Add” to register your first product.'));
    return;
  }
  items.forEach((p, i) => list.appendChild(makeProductCard(p, i)));
}

async function searchProducts(q) {
  const list = document.getElementById('products-list');
  if (!q.trim()) { renderProducts(productsCache); return; }
  if (isGuest()) {
    const term = q.trim().toLowerCase();
    const filtered = productsCache.filter(p =>
      (p.productName + ' ' + (p.brand || '') + ' ' + (p.model || '') + ' ' + (p.category || '')).toLowerCase().includes(term)
    );
    renderProducts(filtered);
    return;
  }
  try {
    const data = await api('/products/search?q=' + encodeURIComponent(q.trim()));
    renderProducts(Array.isArray(data) ? data : []);
  } catch (e) {
    list.innerHTML = '';
    list.appendChild(emptyState('⚠️', 'Search failed', e.message));
  }
}

let editingProductId = null;

function populateProductForm(product) {
  const p = product || {};
  document.getElementById('pf-name').value = p.productName || '';
  document.getElementById('pf-brand').value = p.brand || '';
  document.getElementById('pf-model').value = p.model || '';
  document.getElementById('pf-category').value = p.category || '';
  document.getElementById('pf-serial').value = p.serialNumber || '';
  document.getElementById('pf-purchase-date').value = p.purchaseDate ? new Date(p.purchaseDate).toISOString().slice(0, 10) : '';
  document.getElementById('pf-price').value = p.purchasePrice != null ? p.purchasePrice : '';
  document.getElementById('pf-currency').value = p.currency || '';
  document.getElementById('pf-store').value = p.purchaseStore || '';
  document.getElementById('pf-warranty-months').value = p.warrantyPeriodMonths != null ? p.warrantyPeriodMonths : '';
  document.getElementById('pf-expiry').value = p.warrantyExpiryDate ? new Date(p.warrantyExpiryDate).toISOString().slice(0, 10) : '';
  document.getElementById('pf-notes').value = p.notes || '';
}

function openProductForm(product) {
  if (!requireAuth('add or edit a product')) return;
  editingProductId = product ? product._id : null;
  document.getElementById('product-form-title').textContent = product ? 'Edit Product' : 'Add Product';
  populateProductForm(product);
  document.getElementById('pf-err').textContent = '';
  openDialog(document.getElementById('product-form-overlay'), {
    initialFocus: '#pf-name',
    onClose: closeProductForm
  });
}

function closeProductForm() {
  closeDialog(document.getElementById('product-form-overlay'));
  editingProductId = null;
}

async function saveProductForm() {
  if (!requireAuth('save this product')) return;
  const errEl = document.getElementById('pf-err');
  errEl.textContent = '';
  const name = document.getElementById('pf-name').value.trim();
  if (!name) { errEl.textContent = 'Product name is required.'; return; }

  const payload = {
    productName: name,
    brand: document.getElementById('pf-brand').value.trim() || undefined,
    model: document.getElementById('pf-model').value.trim() || undefined,
    category: document.getElementById('pf-category').value.trim() || undefined,
    serialNumber: document.getElementById('pf-serial').value.trim() || undefined,
    purchaseDate: document.getElementById('pf-purchase-date').value || undefined,
    purchasePrice: document.getElementById('pf-price').value ? Number(document.getElementById('pf-price').value) : undefined,
    currency: document.getElementById('pf-currency').value.trim() || undefined,
    purchaseStore: document.getElementById('pf-store').value.trim() || undefined,
    warrantyPeriodMonths: document.getElementById('pf-warranty-months').value ? Number(document.getElementById('pf-warranty-months').value) : undefined,
    warrantyExpiryDate: document.getElementById('pf-expiry').value || undefined,
    notes: document.getElementById('pf-notes').value.trim() || undefined
  };
  Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

  try {
    let savedId = null;
    if (editingProductId) {
      savedId = editingProductId;
      await api('/products/' + savedId, { method: 'PUT', body: JSON.stringify(payload) });
      toast('Product updated', 'success');
    } else {
      const created = await api('/products', { method: 'POST', body: JSON.stringify(payload) });
      toast('Product added', 'success');
      savedId = created._id;
    }
    closeProductForm();
    await Promise.all([loadProducts(), loadDashboard()]);
    if (savedId) openDetail(savedId);
  } catch (e) {
    errEl.textContent = e.message;
  }
}

async function deleteCurrentProduct() {
  if (!requireAuth('delete this product')) return;
  if (!currentProductId) return;
  if (!window.confirm('Delete this product? This can be restored later but hides it everywhere.')) return;
  try {
    await api('/products/' + currentProductId, { method: 'DELETE' });
    toast('Product deleted', 'success');
    closeDetail();
    await Promise.all([loadProducts(), loadDashboard()]);
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Product detail: specs + documents + service history
// ─────────────────────────────────────────────────────────────────────────────
let currentProductId = null;
let currentProduct = null;
let detailOcrTimer = null;
let detailDocFile = null;
let scanOcrTimer = null;
let cameraDoc = null;

function closeDetail() {
  clearTimeout(detailOcrTimer);
  closeDialog(document.getElementById('detail-overlay'));
  currentProductId = null;
  currentProduct = null;
}

async function openDetail(id) {
  currentProductId = id;
  const openDetailDialog = () => openDialog(document.getElementById('detail-overlay'), {
    initialFocus: '#detail-back-btn',
    onClose: closeDetail
  });
  if (isGuest()) {
    const p = demoProducts().find(x => x._id === id);
    if (!p) { toast('Product not found', 'error'); return; }
    currentProduct = p;
    renderDetailHeader(p);
    renderDetailSpecs(p);
    openDetailDialog();
    await Promise.all([loadDetailDocs(), loadServiceHistory()]);
    return;
  }
  try {
    const p = await api('/products/' + id);
    currentProduct = p;
    renderDetailHeader(p);
    renderDetailSpecs(p);
    openDetailDialog();
    await Promise.all([loadDetailDocs(), loadServiceHistory()]);
  } catch (e) {
    toast(e.message, 'error');
  }
}

function renderDetailHeader(p) {
  document.getElementById('detail-name').textContent = p.productName || '—';
  document.getElementById('detail-brand').textContent = [p.brand, p.model].filter(Boolean).join(' · ');
  const img = document.getElementById('detail-img');
  if (p.thumbnailUrl) { img.src = p.thumbnailUrl; img.style.display = ''; }
  else { img.style.display = 'none'; }

  const info = warrantyInfo(p);
  const block = document.getElementById('detail-warranty-block');
  block.className = 'detail-warranty-block ' + info.blockClass;
  const val = document.getElementById('detail-warranty-value');
  val.className = 'detail-warranty-value ' + info.valueClass;
  
  let iconSvg = '';
  if (info.status === 'safe') {
    iconSvg = '<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/></svg>';
  } else if (info.status === 'expired') {
    iconSvg = '<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646z"/></svg>';
  } else {
    iconSvg = '<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>';
  }
  
  val.innerHTML = '<span style="display:flex;align-items:center;gap:6px;">' + iconSvg + ' <span>' + info.label + (p.warrantyExpiryDate ? ' · ' + fmtDate(p.warrantyExpiryDate) : '') + '</span></span>';

  // Warranty progress bar container
  const progCont = document.getElementById('detail-warranty-progress-container');
  if (progCont) {
    if (p.purchaseDate && p.warrantyExpiryDate) {
      const pD = new Date(p.purchaseDate).getTime();
      const eD = new Date(p.warrantyExpiryDate).getTime();
      const nD = new Date().getTime();
      if (!Number.isNaN(pD) && !Number.isNaN(eD) && eD > pD) {
        progCont.style.display = '';
        const total = eD - pD;
        const elapsed = Math.max(0, nD - pD);
        const percent = Math.min(100, (elapsed / total) * 100);
        document.getElementById('progress-bar-fill').style.width = percent + '%';
        document.getElementById('progress-percent-label').textContent = Math.round(percent) + '%';
        document.getElementById('progress-remaining-days').textContent = info.days > 0 ? info.days + ' days remaining' : 'Expired';
        document.getElementById('progress-expiry-date').textContent = fmtDate(p.warrantyExpiryDate);
      } else {
        progCont.style.display = 'none';
      }
    } else {
      progCont.style.display = 'none';
    }
  }
}

function detailRow(label, value) {
  return '<div class="detail-row"><span class="detail-row-label">' + escapeHtml(label) + '</span>' +
    '<span class="detail-row-value">' + escapeHtml(value == null ? '—' : value) + '</span></div>';
}

// ─────────────────────────────────────────────────────────────────────────────
// OCR summary card (copy buttons)
// ─────────────────────────────────────────────────────────────────────────────
const COPY_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>' +
  '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const CHECK_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
  '<polyline points="20 6 9 17 4 12"></polyline></svg>';

// Rows currently shown in the scan-result summary (for "Copy all").
let cameraExtractedRows = [];

// Summary row: label, value and a per-field copy button. Values are OCR text
// (untrusted) so everything is HTML-escaped — including the data-copy
// attribute, which the browser decodes back to the original on read.
function summaryRow(label, value) {
  const safe = escapeHtml(value == null ? '' : value);
  return '<div class="detail-row">' +
    '<span class="detail-row-label">' + escapeHtml(label) + '</span>' +
    '<div class="detail-row-right">' +
      '<span class="detail-row-value">' + safe + '</span>' +
      '<button type="button" class="copy-btn" data-copy="' + safe + '" data-label="' + escapeHtml(label) + '" ' +
        'onclick="copyOcrValue(this)" title="Copy ' + escapeHtml(label) + '" aria-label="Copy ' + escapeHtml(label) + '">' + COPY_ICON + '</button>' +
    '</div>' +
  '</div>';
}

async function copyOcrValue(btn) {
  const label = btn.dataset.label || 'Value';
  try {
    await copyToClipboard(btn.dataset.copy || '');
    btn.classList.add('copied');
    btn.innerHTML = CHECK_ICON;
    toast(label + ' copied', 'success');
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = COPY_ICON;
    }, 1600);
  } catch {
    toast('Could not copy — copy it manually', 'error');
  }
}

async function copyAllExtracted() {
  if (!cameraExtractedRows.length) {
    toast('Nothing to copy yet', 'error');
    return;
  }
  try {
    await copyToClipboard(cameraExtractedRows.map(r => r.label + ': ' + r.value).join('\n'));
    toast('All ' + cameraExtractedRows.length + ' fields copied', 'success');
  } catch {
    toast('Could not copy — copy it manually', 'error');
  }
}

function renderDetailSpecs(p) {
  const rows = [
    ['Serial number', p.serialNumber],
    ['Model', p.model],
    ['Category', p.category],
    ['Purchased', fmtDate(p.purchaseDate)],
    ['Price', fmtMoney(p)],
    ['Store', p.purchaseStore],
    ['Warranty period', p.warrantyPeriodMonths ? p.warrantyPeriodMonths + ' months' : null],
    ['Notes', p.notes]
  ];
  document.getElementById('detail-specs').innerHTML = rows.map(r => detailRow(r[0], r[1])).join('');
}

// --- Documents ---
async function loadDetailDocs() {
  const box = document.getElementById('detail-docs');
  box.innerHTML = '';
  box.appendChild(skeletonLineCards(2));
  if (isGuest()) {
    box.innerHTML = '';
    box.appendChild(emptyState('📄', 'No documents yet', 'Sign in to upload receipts, warranty cards and manuals.'));
    return;
  }
  try {
    const data = await api('/products/' + currentProductId + '/documents');
    renderDetailDocs(data.documents || []);
  } catch (e) {
    box.innerHTML = '';
    box.appendChild(emptyState('⚠️', 'Could not load documents', e.message));
  }
}

function ocrBadgeClass(status) {
  const map = { done: 'ocr-done', failed: 'ocr-failed', processing: 'ocr-processing', skipped: 'ocr-skipped' };
  return map[status] || 'ocr-skipped';
}

function docCard(d, showProduct) {
  const parsed = [];
  // The API serializes OCR results as parsedData (ocrData is kept as a
  // legacy fallback for older clients).
  const ocr = d.parsedData || d.ocrData || {};
  if (ocr.purchasePrice != null) parsed.push('💰 ' + Number(ocr.purchasePrice).toLocaleString('en-US'));
  if (ocr.serialNumber) parsed.push('🔢 ' + ocr.serialNumber);
  if (ocr.warrantyExpiryDate) parsed.push('📅 ' + fmtDate(ocr.warrantyExpiryDate));
  if (ocr.purchaseStore) parsed.push('🏪 ' + ocr.purchaseStore);
  if (ocr.purchaseDate) parsed.push('🗓️ ' + fmtDate(ocr.purchaseDate));
  const canRetry = d.ocrStatus === 'failed' || d.ocrStatus === 'skipped';
  let actions = '<button class="btn btn-ghost btn-small" onclick="viewDoc(\'' + d._id + '\')">View</button>';
  if (canRetry) actions += '<button class="btn btn-ghost btn-small" onclick="retryDocOcr(\'' + d._id + '\')">⟳ Retry OCR</button>';
  actions += '<button class="btn btn-danger btn-small" onclick="deleteDoc(\'' + d._id + '\')">Delete</button>';

  // In the all-documents view, mark docs that are linked to a product.
  const productTag = (showProduct && d.productId)
    ? '<span class="doc-product-tag">📦 Attached to product</span>'
    : '';

  return '<div class="doc-item">' +
    '<div class="doc-item-head">' +
      '<span class="doc-type-chip">' + escapeHtml(d.documentType || 'other') + '</span>' +
      '<span class="doc-filename">' + escapeHtml(d.fileName) + '</span>' +
      '<span class="ocr-badge ' + ocrBadgeClass(d.ocrStatus) + '">' + escapeHtml(d.ocrStatus || 'skipped') + '</span>' +
    '</div>' +
    '<div class="doc-meta">' + fmtDate(d.uploadedAt || d.createdAt) + (d.fileSize ? ' · ' + Math.round(d.fileSize / 1024) + ' KB' : '') + productTag + '</div>' +
    (parsed.length ? '<div class="parsed-chips">' + parsed.map(c => '<span class="parsed-chip">' + escapeHtml(c) + '</span>').join('') + '</div>' : '') +
    '<div class="doc-actions">' + actions + '</div>' +
  '</div>';
}

function renderDetailDocs(docs) {
  const box = document.getElementById('detail-docs');
  box.innerHTML = '';
  if (!docs.length) {
    box.appendChild(emptyState('📄', 'No documents yet', 'Upload a receipt, warranty card or manual above — OCR will read it automatically.'));
    return;
  }
  docs.forEach(d => box.insertAdjacentHTML('beforeend', docCard(d)));
  clearTimeout(detailOcrTimer);
  if (docs.some(d => d.ocrStatus === 'processing')) {
    detailOcrTimer = setTimeout(loadDetailDocs, 4000);
  }
}

function resetDocFile() {
  detailDocFile = null;
  document.getElementById('doc-file-input').value = '';
  document.getElementById('doc-file-name').textContent = 'Choose file…';
}

async function uploadDoc() {
  if (!requireAuth('upload a document')) return;
  if (!detailDocFile) { toast('Choose a file first', 'error'); return; }
  const type = document.getElementById('doc-type-select').value;
  const btn = document.getElementById('doc-upload-btn');
  btn.disabled = true;
  try {
    const fd = new FormData();
    fd.append('file', detailDocFile);
    fd.append('documentType', type);
    await api('/products/' + currentProductId + '/documents', { method: 'POST', body: fd });
    toast('Document uploaded — OCR may take a few seconds', 'success');
    resetDocFile();
    await loadDetailDocs();
    loadDashboard();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// Open a document in a new tab through the server-side proxy endpoint, which
// fetches the original bytes from Cloudinary's Admin API. Direct fileUrl
// access is blocked by this account's media delivery ACL for PDFs, so the
// proxy is the only reliable way to view them.
async function viewDoc(docId) {
  if (!requireAuth('view a document')) return;
  // Open the tab synchronously (popup blockers allow this during a click),
  // then point it at the blob URL once the bytes arrive.
  const win = window.open('', '_blank');
  if (!win) {
    toast('Popup blocked — allow pop-ups to view documents', 'error');
    return;
  }
  try {
    const res = await fetch(API + '/documents/' + docId + '/view', {
      headers: { Authorization: 'Bearer ' + getToken() }
    });
    if (res.status === 401) {
      win.close();
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      openLogin('Session expired — please sign in again.');
      return;
    }
    if (!res.ok) {
      let msg = 'Could not load document';
      try { msg = (await res.json()).message || msg; } catch { /* keep default */ }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    // Note: the blob URL is intentionally NOT revoked here — browser PDF
    // viewers issue lazy range requests against it, and revoking early can
    // break rendering for slow-scrolling readers. It is freed when the tab
    // (or this page) unloads.
    win.location.href = url;
  } catch (e) {
    win.close();
    toast(e.message, 'error');
  }
}

async function retryDocOcr(docId) {
  if (!requireAuth('retry OCR')) return;
  try {
    // Standalone path works for both linked and standalone documents.
    await api('/documents/' + docId + '/ocr', { method: 'POST' });
    toast('OCR started — takes ~10 seconds', 'success');
    const refresh = [loadScanDocs().catch(() => {})];
    if (currentProductId) refresh.push(loadDetailDocs().catch(() => {}));
    await Promise.all(refresh);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteDoc(docId) {
  if (!requireAuth('delete a document')) return;
  if (!window.confirm('Delete this document?')) return;
  try {
    // Standalone path works for both linked and standalone documents.
    await api('/documents/' + docId, { method: 'DELETE' });
    toast('Document deleted', 'success');
    const refresh = [loadScanDocs().catch(() => {}), loadDashboard()];
    if (currentProductId) refresh.push(loadDetailDocs().catch(() => {}));
    await Promise.all(refresh);
  } catch (e) {
    toast(e.message, 'error');
  }
}

// --- Recent documents list (inside the Scan view; the old Docs page's
// standalone upload + list live here now) ---
async function loadScanDocs() {
  const box = document.getElementById('scan-docs-list');
  if (!box) return;
  box.innerHTML = '';
  box.appendChild(skeletonLineCards(2));
  if (isGuest()) {
    box.innerHTML = '';
    box.appendChild(emptyState('📄', 'No documents yet', 'Sign in to scan receipts, warranty cards and PDFs — no product needed.'));
    return;
  }
  try {
    const data = await api('/documents');
    renderScanDocs(data.documents || []);
  } catch (e) {
    box.innerHTML = '';
    box.appendChild(emptyState('⚠️', 'Could not load documents', e.message));
  }
}

function renderScanDocs(docs) {
  const box = document.getElementById('scan-docs-list');
  box.innerHTML = '';
  if (!docs.length) {
    box.appendChild(emptyState('📄', 'No documents yet', 'Scan a receipt, warranty card or PDF above — OCR will read it automatically.'));
    return;
  }
  docs.forEach(d => box.insertAdjacentHTML('beforeend', docCard(d, true)));
  clearTimeout(scanOcrTimer);
  if (docs.some(d => d.ocrStatus === 'processing')) {
    scanOcrTimer = setTimeout(loadScanDocs, 4000);
  }
}

// --- Service history ---
async function loadServiceHistory() {
  const box = document.getElementById('service-list');
  box.innerHTML = '';
  if (isGuest()) {
    box.appendChild(emptyState('🛠️', 'No service records', 'Sign in to add repairs and maintenance history.'));
    return;
  }
  try {
    const records = await api('/products/' + currentProductId + '/service-history');
    if (!records || !records.length) {
      box.appendChild(emptyState('🛠️', 'No service records', 'Add the first repair or maintenance record.'));
      return;
    }
    records.sort((a, b) => new Date(b.serviceDate) - new Date(a.serviceDate));
    
    const groups = {};
    records.forEach(r => {
      const year = r.serviceDate ? new Date(r.serviceDate).getFullYear() : 'Unknown';
      if (!groups[year]) groups[year] = [];
      groups[year].push(r);
    });

    Object.keys(groups).sort((a, b) => b - a).forEach(year => {
      const yearEl = document.createElement('div');
      yearEl.className = 'service-year-group';
      yearEl.innerHTML = '<div class="service-year-header">' + escapeHtml(year) + '</div>';
      
      groups[year].forEach(r => {
        const el = document.createElement('div');
        el.className = 'service-item timeline-item';
        
        let costStr = '';
        if (r.cost != null) {
          const c = currentProduct && currentProduct.currency ? currentProduct.currency : 'USD';
          try { costStr = Number(r.cost).toLocaleString('en-US', { style: 'currency', currency: c }); }
          catch { costStr = '$' + Number(r.cost).toLocaleString('en-US'); }
        }
        
        const meta = [r.provider, costStr, r.nextServiceDate ? 'Next: ' + fmtDate(r.nextServiceDate) : ''].filter(Boolean).join(' · ');
        
        el.innerHTML =
          '<div class="timeline-dot"></div>' +
          '<div class="timeline-content">' +
            '<div class="service-item-head"><span class="service-type-chip">' + escapeHtml(r.serviceType || 'other') + '</span>' +
            '<span class="service-date">' + fmtDate(r.serviceDate) + '</span></div>' +
            (r.description ? '<div class="service-desc">' + escapeHtml(r.description) + '</div>' : '') +
            (meta ? '<div class="service-meta">' + escapeHtml(meta) + '</div>' : '') +
            (r.notes ? '<div class="service-notes">' + escapeHtml(r.notes) + '</div>' : '') +
            '<div class="service-actions" style="margin-top: 8px; display: flex; gap: 8px;">' +
              '<button class="btn btn-ghost btn-small" onclick="editServiceRecord(\'' + r._id + '\')">Edit</button>' +
              '<button class="btn btn-ghost btn-small" style="color:var(--danger)" onclick="deleteServiceRecord(\'' + r._id + '\')">Delete</button>' +
            '</div>' +
          '</div>';
        yearEl.appendChild(el);
      });
      box.appendChild(yearEl);
    });
  } catch (e) {
    box.innerHTML = '';
    box.appendChild(emptyState('⚠️', 'Could not load service history', e.message));
  }
}

let editingServiceId = null;

function toggleServiceForm(show) {
  document.getElementById('service-form').style.display = show ? '' : 'none';
  document.getElementById('add-service-btn').style.display = show ? 'none' : '';
  if (!show) editingServiceId = null;
  if (show && !editingServiceId) {
    document.getElementById('svc-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('svc-provider').value = '';
    document.getElementById('svc-desc').value = '';
    document.getElementById('svc-cost').value = '';
    document.getElementById('svc-next').value = '';
  }
}

async function editServiceRecord(id) {
  if (!requireAuth('edit a service record')) return;
  try {
    const records = await api('/products/' + currentProductId + '/service-history');
    const r = records.find(x => x._id === id);
    if (!r) return;
    editingServiceId = id;
    toggleServiceForm(true);
    document.getElementById('svc-date').value = r.serviceDate ? new Date(r.serviceDate).toISOString().slice(0, 10) : '';
    document.getElementById('svc-type').value = r.serviceType || 'repair';
    document.getElementById('svc-provider').value = r.provider || '';
    document.getElementById('svc-desc').value = r.description || '';
    document.getElementById('svc-cost').value = r.cost != null ? r.cost : '';
    document.getElementById('svc-next').value = r.nextServiceDate ? new Date(r.nextServiceDate).toISOString().slice(0, 10) : '';
  } catch (e) {
    toast('Could not load record', 'error');
  }
}

async function deleteServiceRecord(id) {
  if (!requireAuth('delete a service record')) return;
  if (!window.confirm('Delete this service record?')) return;
  try {
    await api('/products/' + currentProductId + '/service-history/' + id, { method: 'DELETE' });
    toast('Service record deleted', 'success');
    await loadServiceHistory();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function saveServiceRecord() {
  if (!requireAuth('add or edit a service record')) return;
  const payload = {
    serviceDate: document.getElementById('svc-date').value || undefined,
    serviceType: document.getElementById('svc-type').value,
    provider: document.getElementById('svc-provider').value.trim() || undefined,
    description: document.getElementById('svc-desc').value.trim() || undefined,
    cost: document.getElementById('svc-cost').value ? Number(document.getElementById('svc-cost').value) : undefined,
    nextServiceDate: document.getElementById('svc-next').value || undefined
  };
  Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
  try {
    if (editingServiceId) {
      await api('/products/' + currentProductId + '/service-history/' + editingServiceId, { method: 'PUT', body: JSON.stringify(payload) });
      toast('Service record updated', 'success');
    } else {
      await api('/products/' + currentProductId + '/service-history', { method: 'POST', body: JSON.stringify(payload) });
      toast('Service record added', 'success');
    }
    editingServiceId = null;
    toggleServiceForm(false);
    await loadServiceHistory();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Camera / OCR flow
// ─────────────────────────────────────────────────────────────────────────────
async function populateCameraProducts(preselectId) {
  try {
    if (!productsCache.length) await loadProducts();
    const sel = document.getElementById('camera-product-select');
    sel.innerHTML = '';
    // Standalone scans are allowed — documents can be saved without a product
    // and linked to one later (this replaced the old Docs tab).
    const standalone = document.createElement('option');
    standalone.value = '';
    standalone.textContent = '— No product — just save the document';
    sel.appendChild(standalone);
    productsCache.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p._id;
      opt.textContent = p.productName + (p.brand ? ' (' + p.brand + ')' : '');
      sel.appendChild(opt);
    });
    if (preselectId) sel.value = preselectId;
    else if (currentProductId) sel.value = currentProductId;
  } catch (e) {
    console.warn("Non-fatal error populating product dropdown:", e);
  }
}

function resetCamera() {
  cameraDoc = null;
  document.getElementById('camera-progress').style.display = 'none';
  document.getElementById('camera-result').style.display = 'none';
  document.getElementById('camera-error').style.display = 'none';
  document.getElementById('camera-upload-area').style.display = '';
  document.getElementById('camera-file-input').value = '';
}

function showCameraError(msg) {
  document.getElementById('camera-progress').style.display = 'none';
  document.getElementById('camera-error-msg').textContent = msg;
  document.getElementById('camera-error').style.display = '';
}

function validateCameraFile(file) {
  if (!file) return false;
  const looksLikePdf = /\\.pdf$/i.test(file.name || '');
  const ok = (file.type && (file.type.startsWith('image/') || file.type === 'application/pdf'))
    || looksLikePdf;
  if (!ok) {
    toast('Please choose an image (JPEG, PNG, WEBP) or a PDF', 'error');
    return false;
  }
  return true;
}

function showCameraProgress(message, percent) {
  document.getElementById('camera-upload-area').style.display = 'none';
  document.getElementById('camera-progress').style.display = '';
  document.getElementById('camera-progress-fill').style.width = percent + '%';
  document.getElementById('camera-status-text').textContent = message;
}

async function handleCameraFile(file) {
  if (!requireAuth('scan a document')) return;
  if (!validateCameraFile(file)) return;

  resetCamera();
  
  const progressFilename = document.getElementById('ocr-progress-filename');
  const progressFilesize = document.getElementById('ocr-progress-filesize');
  if (progressFilename) progressFilename.textContent = file.name || 'document';
  if (progressFilesize) progressFilesize.textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';

  showCameraProgress('Uploading…', '18');

  const pid = document.getElementById('camera-product-select').value;
  const type = document.getElementById('camera-type-select').value;
  const isPdf = (file.type === 'application/pdf') || /\.pdf$/i.test(file.name || '');
  // A PDF can't be a product photo — fall back to "other" for that combo.
  const documentType = (isPdf && type === 'product_photo') ? 'other' : type;

  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('documentType', documentType);
    // Standalone scans (no product) upload via /documents; linked scans use
    // the product-scoped route so OCR data can be applied to the product.
    const path = pid ? '/products/' + pid + '/documents' : '/documents';
    const doc = await api(path, { method: 'POST', body: fd });
    showCameraProgress(isPdf ? 'PDF uploaded — extracting text…' : 'Uploaded — running OCR…', '45');
    await pollCameraOcr(pid, doc, document.getElementById('camera-status-text'), document.getElementById('camera-progress-fill'));
  } catch (e) {
    showCameraError(e.message);
    loadScanDocs().catch(() => {});
  }
}

async function pollCameraOcr(pid, doc, statusEl, fillEl) {
  const maxWait = 90 * 1000;
  const started = Date.now();
  let current = doc;

  while (Date.now() - started < maxWait) {
    if (current.ocrStatus === 'done') {
      fillEl.style.width = '100%';
      await renderCameraResult(current, pid);
      return;
    }
    if (current.ocrStatus === 'failed') {
      showCameraError("We couldn't extract enough information from this document.");
      loadScanDocs().catch(() => {});
      return;
    }
    await new Promise(r => setTimeout(r, 2500));
    try {
      const getPath = pid ? '/products/' + pid + '/documents/' + current._id : '/documents/' + current._id;
      current = await api(getPath);
    } catch (e) {
      showCameraError(e.message);
      return;
    }
    const progress = Math.min(45 + ((Date.now() - started) / maxWait) * 50, 95);
    fillEl.style.width = progress + '%';
    statusEl.textContent = 'Running OCR… (' + Math.round((Date.now() - started) / 1000) + 's)';
  }
  showCameraError('OCR timed out. You can retry it from the product page.');
}

async function renderCameraResult(doc, pid) {
  document.getElementById('camera-progress').style.display = 'none';
  const data = doc.parsedData || doc.ocrData || {};
  // Summary card: every field OCR found, with per-field copy buttons.
  const rows = [];
  if (data.productName) rows.push({ label: 'Name', value: data.productName });
  if (data.brand) rows.push({ label: 'Brand', value: data.brand });
  if (data.model) rows.push({ label: 'Model', value: data.model });
  if (data.purchaseStore) rows.push({ label: 'Store', value: data.purchaseStore });
  if (data.purchaseDate) rows.push({ label: 'Purchased', value: fmtDate(data.purchaseDate) });
  if (data.purchasePrice != null) rows.push({ label: 'Price', value: Number(data.purchasePrice).toLocaleString('en-US') });
  if (data.serialNumber) rows.push({ label: 'Serial number', value: data.serialNumber });
  if (data.warrantyExpiryDate) rows.push({ label: 'Warranty expires', value: fmtDate(data.warrantyExpiryDate) });
  cameraExtractedRows = rows;

  document.getElementById('camera-extracted-fields').innerHTML = rows.length
    ? rows.map(r => summaryRow(r.label, r.value)).join('')
    : '<div style="color:#888;font-size:13px;">No price, serial or expiry found in this document.</div>';
  const copyAllBtn = document.getElementById('camera-copy-all');
  if (copyAllBtn) copyAllBtn.style.display = rows.length ? '' : 'none';

  cameraDoc = doc;
  const applyBtn = document.getElementById('camera-apply-btn');
  const confirmBox = document.getElementById('camera-confirm-product');
  const createdBox = document.getElementById('camera-created-product');

  if (!pid) {
    if (doc.productId) {
      // Product was created through the confirm step — show the success
      // banner and refresh caches so the new product shows up everywhere.
      if (createdBox) {
        createdBox.style.display = '';
        document.getElementById('camera-created-product-id').value = doc.productId;
        document.getElementById('camera-created-product-name').textContent =
          'Saved from this scan — tap below to review or edit it.';
      }
      if (confirmBox) confirmBox.style.display = 'none';
      if (applyBtn) applyBtn.style.display = 'none';
      productsCache = [];
      Promise.all([
        populateCameraProducts().catch(() => {}),
        loadDashboard().catch(() => {})
      ]);
    } else if (hasConfirmableData(data)) {
      // Standalone scan with extracted data — no product yet. Show the
      // review-and-confirm form pre-filled with the OCR values so the user
      // can fix mistakes before the product is created.
      if (confirmBox) {
        fillCameraConfirmForm(data);
        confirmBox.style.display = '';
      }
      if (createdBox) createdBox.style.display = 'none';
      if (applyBtn) applyBtn.style.display = 'none';
    } else {
      if (confirmBox) confirmBox.style.display = 'none';
      if (createdBox) createdBox.style.display = 'none';
      if (applyBtn) applyBtn.style.display = 'none';
    }
  } else {
    // A product was picked up front — "Apply to Product" fills its fields.
    if (confirmBox) confirmBox.style.display = 'none';
    if (createdBox) createdBox.style.display = 'none';
    if (applyBtn) applyBtn.style.display = '';
  }
  document.getElementById('camera-result').style.display = '';
  loadScanDocs().catch(() => {});
}

// The review-and-confirm form is worth showing only when OCR extracted a
// strong product signal (price / serial / expiry) — the same gate the old
// auto-create used. The suggested name is only a pre-fill convenience.
function hasConfirmableData(data) {
  return data.purchasePrice != null || !!data.serialNumber || !!data.warrantyExpiryDate;
}

function toDateInputValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function fillCameraConfirmForm(data) {
  document.getElementById('confirm-name').value = data.productName || '';
  document.getElementById('confirm-brand').value = data.brand || '';
  document.getElementById('confirm-model').value = data.model || '';
  document.getElementById('confirm-serial').value = data.serialNumber || '';
  document.getElementById('confirm-price').value =
    data.purchasePrice != null ? data.purchasePrice : '';
  document.getElementById('confirm-store').value = data.purchaseStore || '';
  document.getElementById('confirm-purchase-date').value = toDateInputValue(data.purchaseDate);
  document.getElementById('confirm-expiry').value = toDateInputValue(data.warrantyExpiryDate);
}

// User reviewed (and corrected) the extracted fields — create the product.
async function confirmCameraProduct() {
  if (!requireAuth('create a product')) return;
  const doc = cameraDoc;
  if (!doc) return;

  const name = document.getElementById('confirm-name').value.trim();
  if (!name) { toast('Product name is required', 'error'); return; }
  const purchaseDate = document.getElementById('confirm-purchase-date').value;
  const expiry = document.getElementById('confirm-expiry').value;
  if (purchaseDate && expiry && new Date(expiry) <= new Date(purchaseDate)) {
    toast('Warranty expiry must be after the purchase date', 'error');
    return;
  }
  const priceRaw = document.getElementById('confirm-price').value;
  if (priceRaw !== '' && !Number.isFinite(Number(priceRaw))) {
    toast('Enter a valid purchase price', 'error');
    return;
  }

  const payload = {
    productName: name,
    brand: document.getElementById('confirm-brand').value.trim() || undefined,
    model: document.getElementById('confirm-model').value.trim() || undefined,
    serialNumber: document.getElementById('confirm-serial').value.trim() || undefined,
    purchasePrice: priceRaw !== '' ? Number(priceRaw) : undefined,
    purchaseStore: document.getElementById('confirm-store').value.trim() || undefined,
    purchaseDate: purchaseDate || undefined,
    warrantyExpiryDate: expiry || undefined
  };

  try {
    const result = await api('/documents/' + doc._id + '/confirm-product', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    toast('Product created from this scan', 'success');
    // Re-render with the now-linked document so the success banner appears.
    doc.productId = (result.document && result.document.productId) || result.product._id;
    productsCache = [];
    await Promise.all([
      populateCameraProducts().catch(() => {}),
      loadDashboard().catch(() => {}),
      loadScanDocs().catch(() => {})
    ]);
    await renderCameraResult(doc, '');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// User chose not to create a product — the scan is saved standalone and can
// be attached to a product later from the Docs list.
function dismissCameraConfirm() {
  const confirmBox = document.getElementById('camera-confirm-product');
  if (confirmBox) confirmBox.style.display = 'none';
  cameraDoc = null;
  toast('Scan saved — attach it to a product anytime from the Docs list');
}

async function applyCameraToProduct() {
  if (!requireAuth('apply OCR data')) return;
  const doc = cameraDoc;
  const pid = document.getElementById('camera-product-select').value;
  if (!doc || !pid) { toast('Select a product to apply the scanned data to', 'error'); return; }
  const data = doc.parsedData || doc.ocrData || {};
  const payload = {};
  if (data.purchasePrice != null) payload.purchasePrice = data.purchasePrice;
  if (data.serialNumber) payload.serialNumber = data.serialNumber;
  if (data.warrantyExpiryDate) payload.warrantyExpiryDate = data.warrantyExpiryDate;
  if (data.purchaseStore) payload.purchaseStore = data.purchaseStore;
  if (data.purchaseDate) payload.purchaseDate = data.purchaseDate;
  try {
    await api('/products/' + pid, { method: 'PUT', body: JSON.stringify(payload) });
    toast('OCR data applied to product', 'success');
    resetCamera();
    await Promise.all([loadProducts(), loadDashboard(), loadScanDocs().catch(() => {})]);
    openDetail(pid);
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────────────────────────────────────
async function loadNotifications() {
  const list = document.getElementById('notification-list');
  list.innerHTML = '';
  list.appendChild(skeletonLineCards(4));
  if (isGuest()) {
    renderNotifications(demoNotifications());
    return;
  }
  try {
    const notifs = await api('/notifications');
    // Legacy shape (plain array) and paginated shape ({ notifications, … }) are
    // both accepted so the panel works against any deployed backend.
    renderNotifications(Array.isArray(notifs) ? notifs : (notifs && notifs.notifications) || []);
  } catch (e) {
    list.innerHTML = '';
    list.appendChild(emptyState('⚠️', 'Could not load notifications', e.message));
  }
}

function renderNotifications(notifs) {
  const list = document.getElementById('notification-list');
  list.innerHTML = '';
  if (!notifs.length) {
    list.appendChild(emptyState('', 'You\'re all caught up.', ''));
    return;
  }
  notifs.forEach(n => {
    const el = document.createElement('div');
    el.className = 'notification-item' + (n.isRead ? '' : ' unread');
    
    const pIdStr = (n.productId && typeof n.productId === 'object') ? n.productId._id : (n.productId || '');
    
    let actions = '<div class="notification-actions" style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">' +
      (pIdStr ? '<button class="btn btn-primary btn-small" onclick="openDetail(\'' + pIdStr + '\')">View Warranty</button>' : '') +
      (n.isRead ? '' : '<button class="btn btn-ghost btn-small" onclick="markNotifRead(\'' + n._id + '\')">Mark read</button>') +
      '<button class="btn btn-danger btn-small" onclick="deleteNotif(\'' + n._id + '\')">Delete</button>' +
    '</div>';
    
    let message = n.message;
    if (n.notificationType === 'warranty_expiry' || (n.title && n.title.toLowerCase().includes('expir')) || (message && message.toLowerCase().includes('expires in'))) {
      const daysMatch = message && message.match(/(\d+)\s+days/i);
      if (daysMatch) {
        const prodName = (n.productId && typeof n.productId === 'object') ? n.productId.productName : 
                         (productsCache.find(p => p._id === pIdStr)?.productName || 'Your product');
        message = prodName + ' warranty expires in ' + daysMatch[1] + ' days.';
      }
    }
    
    el.innerHTML =
      '<div class="notification-title">' + escapeHtml(n.title || n.notificationType || 'Alert') + '</div>' +
      (message ? '<div class="notification-message">' + escapeHtml(message) + '</div>' : '') +
      '<div class="notification-meta">' + fmtDate(n.createdAt) + '</div>' +
      actions;
    el.onclick = (ev) => {
      if (ev.target.tagName === 'BUTTON') return;
      if (!n.isRead) markNotifRead(n._id);
    };
    list.appendChild(el);
  });
}

async function markNotifRead(id) {
  if (isGuest()) {
    const n = DEMO_NOTIFICATIONS.find(x => x._id === id);
    if (n) {
      n.isRead = true;
      loadNotifications();
      renderGuestDashboard();
    }
    return;
  }
  if (!requireAuth('mark notifications as read')) return;
  try {
    await api('/notifications/' + id + '/read', { method: 'PUT' });
    loadNotifications();
    loadDashboard();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteNotif(id) {
  if (isGuest()) {
    const idx = DEMO_NOTIFICATIONS.findIndex(x => x._id === id);
    if (idx !== -1) {
      DEMO_NOTIFICATIONS.splice(idx, 1);
      loadNotifications();
      renderGuestDashboard();
    }
    return;
  }
  if (!requireAuth('delete a notification')) return;
  try {
    await api('/notifications/' + id, { method: 'DELETE' });
    loadNotifications();
    loadDashboard();
  } catch (e) { toast(e.message, 'error'); }
}

async function markAllNotifsRead() {
  if (isGuest()) {
    DEMO_NOTIFICATIONS.forEach(n => n.isRead = true);
    toast('All notifications marked as read', 'success');
    loadNotifications();
    renderGuestDashboard();
    return;
  }
  if (!requireAuth('mark all notifications as read')) return;
  try {
    await api('/notifications/read-all', { method: 'PUT' });
    toast('All notifications marked as read', 'success');
    loadNotifications();
    loadDashboard();
  } catch (e) { toast(e.message, 'error'); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Repair centres (demo directory + geolocation)
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Repair centres (Google Places API + geolocation)
// ─────────────────────────────────────────────────────────────────────────────
// Google Places API key (for demo purposes - in production, use env var)
const GOOGLE_API_KEY = '';

// Demo repair-centre directory as fallback
const FALLBACK_CENTRES = [
  { name: 'TechCare Connaught Place', city: 'New Delhi', address: 'Block B, Connaught Place, New Delhi 110001', phone: '+91 11 4567 8901', rating: 4.6, lat: 28.6328, lng: 77.2197 },
  { name: 'FixItNow Karol Bagh', city: 'New Delhi', address: 'Ajmal Khan Road, Karol Bagh, New Delhi 110005', phone: '+91 11 2345 6789', rating: 4.3, lat: 28.6519, lng: 77.1909 },
  { name: 'ElectroServ Saket', city: 'New Delhi', address: 'Select Citywalk, Saket, New Delhi 110017', phone: '+91 11 3456 7890', rating: 4.5, lat: 28.5284, lng: 77.2189 },
  { name: 'ProRepair Hauz Khas', city: 'New Delhi', address: 'Hauz Khas Village, New Delhi 110016', phone: '+91 11 4567 8902', rating: 4.7, lat: 28.5494, lng: 77.2001 },
  { name: 'QuickFix Rohini', city: 'New Delhi', address: 'Sector 7, Rohini, New Delhi 110085', phone: '+91 11 5678 9012', rating: 4.1, lat: 28.7044, lng: 77.1025 },
  { name: 'GadgetSavers Lajpat Nagar', city: 'New Delhi', address: 'Central Market, Lajpat Nagar II, New Delhi 110024', phone: '+91 11 6789 0123', rating: 4.2, lat: 28.5677, lng: 77.2437 },
  { name: 'VoltFix Dwarka', city: 'New Delhi', address: 'Sector 12, Dwarka, New Delhi 110078', phone: '+91 11 7890 1234', rating: 4.4, lat: 28.5943, lng: 77.0308 },
  { name: 'MegaRepair Vasant Kunj', city: 'New Delhi', address: 'Vasant Kunj, New Delhi 110070', phone: '+91 11 8901 2345', rating: 4.5, lat: 28.5245, lng: 77.153 },
  { name: 'ChipWorks Janakpuri', city: 'New Delhi', address: 'C Block, Janakpuri, New Delhi 110058', phone: '+91 11 9012 3456', rating: 4.0, lat: 28.6219, lng: 77.0916 },
  { name: 'ElectroCare Noida', city: 'Noida', address: 'Sector 18, Noida, Uttar Pradesh 201301', phone: '+91 120 456 7890', rating: 4.3, lat: 28.57, lng: 77.32 }
];

// Fetch real repair/electronics shops from Google Places API.
// When a brand is provided, the search is narrowed to repair centres for that
// brand (e.g. "Apple repair"). Returns an array of centres (possibly empty).
// Throws if the API is unreachable.
async function fetchNearbyRepairCentres(lat, lng, brand) {
  // Route through backend proxy to avoid CORS issues with Google Places API
  const keyword = brand ? brand + ' repair' : 'repair';
  const url = `/api/v1/places/nearby?lat=${lat}&lng=${lng}&radius=20000&type=electronics_store&keyword=${encodeURIComponent(keyword)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return [];
    }

    // Map Google Places results to our centre format
    return data.results.slice(0, 10).map(place => ({
      name: place.name,
      city: place.vicinity || place.formatted_address || '',
      address: place.formatted_address || place.vicinity || 'Address not available',
      phone: place.formatted_phone_number || '',
      rating: place.rating || (3.5 + 0).toFixed(1),  // Placeholder rating
      lat: place.geometry.location.lat,
      lng: place.geometry.location.lng,
      // Used to open the actual store (not raw coordinates) in Google Maps
      placeId: place.place_id || '',
      // Store photo (served through the backend proxy so the API key stays server-side)
      photoRef: (place.photos && place.photos[0] && place.photos[0].photo_reference) || '',
      // "Open now" indicator — null when Google doesn't expose opening hours so
      // the chip is only rendered when the status is actually known
      openNow: place.opening_hours && typeof place.opening_hours.open_now === 'boolean'
        ? place.opening_hours.open_now
        : null,
      shopType: place.types && place.types[0] || 'electronics'
    }));

  } catch (error) {
    console.error('Google Places API error:', error);
    throw error;
  }
}

// Shorten a full address to a compact place name for the location banner
// (e.g. "Island South, Chullickal, Kochi, Ernakulam, Kerala, 682005, India"
// becomes "Island South, Chullickal").
function shortPlaceName(addr) {
  const parts = String(addr || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return '';
  let n = Math.min(parts.length, 2);
  if (parts.slice(0, n).join(', ').length < 12 && parts.length > n) n++;
  return parts.slice(0, n).join(', ');
}

// Reverse-geocode a lat/lng pair into a human-readable place name/address so
// the app can say "Near Connaught Place, New Delhi" instead of raw coordinates.
// Returns null when the lookup fails so callers can fall back gracefully.
async function reverseGeocode(lat, lng) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const response = await fetch('/api/v1/places/geocode?lat=' + lat + '&lng=' + lng, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const data = await response.json();
    if (data.status === 'OK' && data.results && data.results.length) {
      return data.results[0].formatted_address;
    }
  } catch (err) {
    console.warn('Reverse geocode failed:', err);
  }
  return null;
}

// Fetch full details (real phone number, opening hours, review count) for a
// place via the backend Google Places Details proxy. Returns null on failure.
async function fetchPlaceDetails(placeId) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const response = await fetch('/api/v1/places/details?place_id=' + encodeURIComponent(placeId), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const data = await response.json();
    if (data.status === 'OK' && data.result) return data.result;
  } catch (err) {
    console.warn('Place details failed:', err);
  }
  return null;
}

// Enrich centres with Google Place Details (real phone numbers, full opening
// hours, review counts). Best-effort: centres that can't be enriched keep
// their base Nearby Search data.
async function enrichCentres(centres) {
  const withPlaceId = centres.filter(c => c.placeId);
  if (!withPlaceId.length) return centres;
  const settled = await Promise.allSettled(withPlaceId.map(async c => ({
    placeId: c.placeId,
    details: await fetchPlaceDetails(c.placeId)
  })));
  const byId = {};
  settled.forEach(r => {
    if (r.status === 'fulfilled' && r.value.details) byId[r.value.placeId] = r.value.details;
  });
  return centres.map(c => {
    const d = byId[c.placeId];
    if (!d) return c;
    return {
      ...c,
      phone: d.formatted_phone_number || c.phone,
      // Full international number (with country code) for reliable wa.me links
      internationalPhone: d.international_phone_number || null,
      // Official website — Google Places doesn't expose email addresses, so
      // the site link is the email/contact channel on the card.
      website: d.website || null,
      openNow: (d.opening_hours && typeof d.opening_hours.open_now === 'boolean')
        ? d.opening_hours.open_now
        : c.openNow,
      hours: (d.opening_hours && d.opening_hours.weekday_text) || c.hours || null,
      reviews: d.user_ratings_total || null
    };
  });
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  // Clamp to [0,1] to prevent NaN from floating-point rounding errors
  const clampedA = Math.max(0, Math.min(1, a));
  return 2 * R * Math.asin(Math.sqrt(clampedA));
}

function geoErrorMessage(err) {
  if (err && err.code === 1) return 'Location permission denied. Enable location access in your browser to see nearby centres.';
  if (err && err.code === 2) return 'Your location is unavailable right now (GPS signal lost). Showing centres without distances.';
  if (err && err.code === 3) return 'Location request timed out. Tap "Find Repair Center" to try again.';
  return (err && err.message) || 'Could not get your location.';
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not supported by this browser (HTTPS or localhost is required).'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    });
  });
}

function showRepairCoords(type, text) {
  const el = document.getElementById('repair-coords');
  el.hidden = false;
  const classMap = { error: ' error', pending: ' pending' };
  el.className = 'repair-coords' + (classMap[type] || '');
  el.textContent = text;
}

function fmtKm(km) {
  return km < 10 ? km.toFixed(1) : String(Math.round(km));
}

function getLocateHref(c) {
  if (c.placeId) {
    return 'https://www.google.com/maps/place/?q=place_id:' + encodeURIComponent(c.placeId);
  }
  const hasCoords = c.lat != null && c.lng != null && Number.isFinite(c.lat) && Number.isFinite(c.lng);
  if (hasCoords) {
    const q = [c.name, c.city, c.address].filter(Boolean).join(', ');
    return 'https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent(q);
  }
  return '';
}

function getLocateHtml(c, href) {
  if (!href) return '';
  return '<a class="repair-card-locate" target="_blank" rel="noopener" title="Open ' + escapeHtml(c.name) + ' in Google Maps" ' +
    'href="' + href + '">' +
      '<svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">' +
        '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>' +
      '</svg>' +
    '</a>';
}

function getHoursHtml(c) {
  if (!c.hours || !c.hours.length) return '';
  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const rows = c.hours.map(line => {
    const idx = line.indexOf(':');
    const day = (idx > -1 ? line.slice(0, idx) : line).trim();
    const time = (idx > -1 ? line.slice(idx + 1) : '').trim();
    return '<div class="repair-hours-row' + (day === todayName ? ' today' : '') + '">' +
      '<span>' + escapeHtml(day) + '</span>' +
      (time ? '<span>' + escapeHtml(time) + '</span>' : '') +
    '</div>';
  }).join('');
  return '<div class="repair-card-hours">' +
      '<button type="button" class="repair-hours-btn" ' +
        'onclick="var p=this.parentNode;p.querySelector(\'.repair-hours-list\').classList.toggle(\'open\');this.classList.toggle(\'active\');">' +
        '🕒 Hours <span class="repair-hours-caret">▾</span>' +
      '</button>' +
      '<div class="repair-hours-list">' + rows + '</div>' +
    '</div>';
}

function getContactHtml(c) {
  // we will replace this entirely with the new buttons below
  return '';
}

function repairCentreCard(c) {
  const distHtml = c.distKm != null
    ? '<div class="repair-card-distance">📍 ' + fmtKm(c.distKm) + ' km away</div>'
    : '<div class="repair-card-distance unknown">📍 Distance unavailable</div>';

  const locateHref = getLocateHref(c);
  const locateHtml = getLocateHtml(c, locateHref);

  const coverHtml = c.photoRef
    ? '<span class="repair-card-cover">' +
        '<img loading="lazy" alt="Photo of ' + escapeHtml(c.name) + '" ' +
          'src="/api/v1/places/photo?reference=' + encodeURIComponent(c.photoRef) + '&amp;maxwidth=400" ' +
          'onerror="var cv=this.closest(\'.repair-card-cover\');if(cv)cv.style.display=\'none\';" />' +
      '</span>'
    : '';

  const openHtml = typeof c.openNow === 'boolean'
    ? '<span class="repair-open-chip ' + (c.openNow ? 'open' : 'closed') + '">' + (c.openNow ? 'Open now' : 'Closed') + '</span>'
    : '';
  const addressHtml = (c.address && c.address !== 'Address not available' && c.address !== c.city)
    ? '<div class="repair-card-address">' + escapeHtml(c.address) + '</div>'
    : '';

  const hoursHtml = getHoursHtml(c);

  const phoneHtml = c.phone
    ? '<span class="repair-card-phone">📞 <a href="tel:' + encodeURIComponent(c.phone) + '">' + escapeHtml(c.phone) + '</a></span>'
    : '';

  const callBtn = c.phone ? '<a href="tel:' + encodeURIComponent(c.phone) + '" class="btn btn-ghost btn-small">📞 Call</a>' : '';
  const dirBtn = getLocateHref(c) ? '<a href="' + getLocateHref(c) + '" target="_blank" class="btn btn-ghost btn-small">🗺️ Directions</a>' : '';
  const webBtn = c.website ? '<a href="' + escapeHtml(c.website) + '" target="_blank" class="btn btn-ghost btn-small">🌐 Website</a>' : '';
  
  const actionRow = '<div class="repair-card-actions" style="display:flex;gap:8px;margin-top:12px;border-top:1px solid var(--border);padding-top:12px;">' + callBtn + dirBtn + webBtn + '</div>';

  return '<div class="repair-card">' +
    coverHtml +
    '<div class="repair-card-body">' +
      '<div class="repair-card-head">' +
        '<div class="repair-card-name">' + escapeHtml(c.name) + '</div>' +
        openHtml +
      '</div>' +
      '<div class="repair-card-city">' + escapeHtml(c.city) + '</div>' +
      addressHtml +
      '<div class="repair-card-details">' +
        phoneHtml +
        '<span class="repair-card-rating">★ ' + escapeHtml(String(c.rating)) +
          (c.reviews ? '<span class="repair-card-reviews">(' + escapeHtml(String(c.reviews)) + ')</span>' : '') +
        '</span>' +
      '</div>' +
      hoursHtml +
      actionRow +
      distHtml +
    '</div>' +
  '</div>';
}

function renderRepairCentres(lat, lng, withLocation, centres = null) {
  const list = document.getElementById('repair-list');
  list.innerHTML = '';

  // Use provided centres or fallback to demo data
  let centresList = centres || [...FALLBACK_CENTRES];

  // Filter out centres missing coordinates
  centresList = centresList.filter(c =>
    c.lat != null && c.lng != null && Number.isFinite(c.lat) && Number.isFinite(c.lng)
  );

  // Validate the user's coordinates too — lat/lng can be NaN/Infinity from a
  // flaky GPS fix, which would turn every distance into NaN and leave the list
  // in the original (unsorted) array order instead of nearest-first.
  if (withLocation && Number.isFinite(lat) && Number.isFinite(lng)) {
    centresList.forEach(c => { c.distKm = haversineKm(lat, lng, c.lat, c.lng); });
    // Sort ascending by distance so the nearest centre appears first.
    centresList.sort((a, b) => (a.distKm || 0) - (b.distKm || 0));
  } else {
    centresList.forEach(c => { c.distKm = null; });
  }

  if (!centresList.length) {
    list.appendChild(emptyState('🔧', 'No repair centres found nearby', 'Try moving to a different area or check back later.'));
    return;
  }
  centresList.forEach(c => list.insertAdjacentHTML('beforeend', repairCentreCard(c)));
}

function showRepairManualSearch() {
  const container = document.getElementById('repair-manual-search');
  if (container) container.style.display = 'flex';
  const input = document.getElementById('repair-search-input');
  if (input) input.focus();
}

function showRepairErrorState() {
  const list = document.getElementById('repair-list');
  list.innerHTML = 
    '<div class="empty-state">' +
      '<div class="empty-title">Repair centres couldn\'t be loaded right now.</div>' +
      '<div style="margin-top: 12px; display: flex; gap: 8px; justify-content: center;">' +
        '<button class="btn btn-primary" onclick="openRepair()">Try Again</button>' +
        '<button class="btn btn-ghost" onclick="showRepairManualSearch()">Use Manual Search</button>' +
      '</div>' +
    '</div>';
}

async function searchRepairManual() {
  const q = document.getElementById('repair-search-input').value.trim();
  if (!q) return;
  const list = document.getElementById('repair-list');
  list.innerHTML = '<div style="text-align:center;color:#888;padding:12px;">🔍 Searching for location...</div>';
  try {
    const res = await fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=json&limit=1');
    const data = await res.json();
    if (!data || !data.length) {
      list.innerHTML = '<div style="text-align:center;color:#888;padding:12px;">Location not found. Try a different query.</div>';
      return;
    }
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    showRepairCoords('ok', '📍 ' + data[0].display_name);
    
    list.innerHTML = '<div style="text-align:center;color:#888;padding:12px;">🔍 Searching for repair shops...</div>';
    const brand = (currentProduct && currentProduct.brand) ? String(currentProduct.brand).trim() : '';
    
    let realCentres = null;
    try {
      realCentres = await fetchNearbyRepairCentres(lat, lng, brand);
    } catch (err) {
      showRepairErrorState();
      return;
    }
    
    if (realCentres && realCentres.length > 0) {
      const enriched = await enrichCentres(realCentres);
      renderRepairCentres(lat, lng, true, enriched && enriched.length ? enriched : realCentres);
    } else {
      renderRepairCentres(lat, lng, true, []);
    }
  } catch (err) {
    list.innerHTML = '<div style="text-align:center;color:red;padding:12px;">Error searching location.</div>';
  }
}

async function openRepair() {
  showView('repair');
  const container = document.getElementById('repair-manual-search');
  if (container) container.style.display = 'none';
  const p = currentProduct;
  // Brand used to filter repair centres. Falls back to all centres when the
  // Repair tab is opened directly or the product has no brand.
  const brand = (p && p.brand) ? String(p.brand).trim() : '';
  document.getElementById('repair-filter').innerHTML = brand
    ? '<span class="repair-brand-tag">🔧 ' + escapeHtml(brand) + ' repair centres</span>'
    : '';

  showRepairCoords('pending', '📍 Detecting your location…');

  const list = document.getElementById('repair-list');
  list.innerHTML = '';
  list.appendChild(emptyState('📍', 'Fetching nearby repair centres…',
    'Requesting your location and searching for ' + (brand ? brand + ' repair shops.' : 'electronics repair shops.')));

  // Guards the async reverse-geocode banner so a late resolution can never
  // overwrite the error message shown by the catch block below.
  let bannerFinal = false;
  try {
    const pos = await getPosition();
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    // Show a real place name instead of raw coordinates (falls back to coords
    // if the reverse-geocode lookup is unavailable).
    showRepairCoords('pending', '📍 Finding your area…');
    reverseGeocode(lat, lng).then(placeName => {
      if (bannerFinal) return;
      showRepairCoords('ok', placeName
        ? '📍 Near ' + shortPlaceName(placeName)
        : '📍 Location detected');
    });

    // Fetch real repair centres from Google Places (timeout + retry inside).
    list.innerHTML = '<div style="text-align:center;color:#888;padding:12px;">🔍 Searching for nearby ' +
      (brand ? brand + ' repair shops…' : 'electronics repair shops…') + '</div>';

    let realCentres = null;
    try {
      realCentres = await fetchNearbyRepairCentres(lat, lng, brand);
    } catch (err) {
      console.error('Google Places API error:', err);
      showRepairErrorState();
      return;
    }

    if (realCentres && realCentres.length > 0) {
      // Enrich with real phone numbers + full opening hours from Google Place
      // Details (best-effort) before rendering, so cards appear complete once.
      const enriched = await enrichCentres(realCentres);
      renderRepairCentres(lat, lng, true, enriched && enriched.length ? enriched : realCentres);
    } else {
      renderRepairCentres(lat, lng, true, []);
    }
  } catch (err) {
    bannerFinal = true;
    showRepairCoords('error', geoErrorMessage(err));
    showRepairManualSearch();
    // Still show fallback centres without distances
    renderRepairCentres(null, null, false);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event wiring + boot
// ─────────────────────────────────────────────────────────────────────────────
function wireEvents() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.view;
      if (v === 'home') loadDashboard();
      if (v === 'products') loadProducts();
      if (v === 'camera') { populateCameraProducts(); resetCamera(); loadScanDocs(); }
      if (v === 'notifications') loadNotifications();
      if (v === 'repair') openRepair();
      showView(v);
    });
  });

  const themeToggle = document.getElementById('theme-toggle-btn');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isDark = document.body.classList.toggle('dark-mode');
      localStorage.setItem('wv_theme', isDark ? 'dark' : 'light');
      themeToggle.textContent = isDark ? '☀️' : '🌙';
    });
  }

  document.getElementById('logout-btn').addEventListener('click', () => {
    if (isGuest()) { openLogin(''); }
    else logout();
  });
  document.getElementById('login-back-btn').addEventListener('click', () => enterApp());
  document.getElementById('add-product-btn').addEventListener('click', () => {
    if (!requireAuth('add a product')) return;
    openProductForm(null);
  });
  const dashAddBtn = document.getElementById('dash-add-btn');
  if (dashAddBtn) dashAddBtn.addEventListener('click', () => {
    if (!requireAuth('add a product')) return;
    openProductForm(null);
  });
  const dashScanBtn = document.getElementById('dash-scan-btn');
  if (dashScanBtn) dashScanBtn.addEventListener('click', () => {
    showView('camera');
    populateCameraProducts();
    resetCamera();
  });
  const repairSearchBtn = document.getElementById('repair-search-btn');
  if (repairSearchBtn) repairSearchBtn.addEventListener('click', searchRepairManual);
  const repairSearchInput = document.getElementById('repair-search-input');
  if (repairSearchInput) repairSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchRepairManual();
  });

  document.getElementById('product-form-close').addEventListener('click', closeProductForm);
  document.getElementById('pf-cancel-btn').addEventListener('click', closeProductForm);
  document.getElementById('pf-save-btn').addEventListener('click', saveProductForm);

  const search = document.getElementById('products-search');
  search.addEventListener('input', () => {
    clearTimeout(productsSearchTimer);
    productsSearchTimer = setTimeout(() => searchProducts(search.value), 300);
  });

  document.getElementById('detail-back-btn').addEventListener('click', closeDetail);
  document.getElementById('detail-edit-btn').addEventListener('click', () => openProductForm(currentProduct));
  document.getElementById('detail-delete-btn').addEventListener('click', deleteCurrentProduct);
  document.getElementById('detail-repair-btn').addEventListener('click', openRepair);
  document.getElementById('detail-scan-btn').addEventListener('click', () => {
    const pid = currentProductId;
    closeDetail();
    showView('camera');
    populateCameraProducts(pid);
    resetCamera();
  });

  document.getElementById('doc-file-input').addEventListener('change', (e) => {
    detailDocFile = e.target.files[0] || null;
    document.getElementById('doc-file-name').textContent = detailDocFile ? detailDocFile.name : 'Choose file…';
  });
  document.getElementById('doc-upload-btn').addEventListener('click', uploadDoc);

  document.getElementById('add-service-btn').addEventListener('click', () => toggleServiceForm(true));
  document.getElementById('svc-cancel-btn').addEventListener('click', () => toggleServiceForm(false));
  document.getElementById('svc-save-btn').addEventListener('click', saveServiceRecord);

  const cameraArea = document.getElementById('camera-upload-area');
  const cameraInput = document.getElementById('camera-file-input');
  cameraArea.addEventListener('click', () => cameraInput.click());
  // Native button semantics: Enter activates on keydown, Space on keyup.
  cameraArea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); cameraInput.click(); }
  });
  cameraArea.addEventListener('keyup', (e) => {
    if (e.key === ' ') { e.preventDefault(); cameraInput.click(); }
  });
  cameraInput.addEventListener('change', (e) => handleCameraFile(e.target.files[0] || null));
  document.getElementById('camera-apply-btn').addEventListener('click', applyCameraToProduct);
  document.getElementById('camera-retry-btn').addEventListener('click', resetCamera);
  document.getElementById('confirm-create-btn').addEventListener('click', confirmCameraProduct);
  document.getElementById('confirm-skip-btn').addEventListener('click', dismissCameraConfirm);

  document.getElementById('read-all-btn').addEventListener('click', markAllNotifsRead);

  ['login-email', 'login-password'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  });
  ['reg-name', 'reg-email', 'reg-password'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') doRegister(); });
  });
}

async function enterApp() {
  applyGuestMode();
  showView('home');
  await Promise.all([loadDashboard(), loadProducts()]);
  populateCameraProducts();
}

function init() {
  wireEvents();
  const savedTheme = localStorage.getItem('wv_theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    const themeToggle = document.getElementById('theme-toggle-btn');
    if (themeToggle) themeToggle.textContent = '☀️';
  }
  applyGuestMode();
  enterApp();
}

document.addEventListener('DOMContentLoaded', init);

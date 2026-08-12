// Live E2E for the edit-and-confirm flow: standalone PDF receipt scan → OCR
// stages the extracted data on the document (NO product yet) → the
// confirm-product endpoint creates the product with the user-corrected values
// and links the document → a second scan with the same serial reuses the
// product. Requires the real server (Atlas + Cloudinary) on :5000.
const BASE = "http://localhost:5000/api/v1";

function buildPdf(lines) {
  const objs = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objs[3] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>";
  const stream = lines.map((l, i) => `BT /F1 12 Tf 50 ${770 - i * 22} Td (${l}) Tj ET`).join("\n");
  objs[4] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  objs[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 1; i <= 5; i++) { offsets[i] = Buffer.byteLength(pdf); pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf);
}

let failures = 0;
// `extra` can carry OCR/API data (prices, names, messages); sanitize it for
// the terminal so control chars can't inject log lines (jssecurity:S5145).
function safeExtra(v) {
  return String(v == null ? "" : v).replace(/[\r\n\t]/g, " ").slice(0, 200);
}
function check(label, cond, extra) {
  if (cond) console.log(`  ✅ ${label}`);
  else { failures++; console.log(`  ❌ ${label} ${safeExtra(extra)}`); }
}

// Only these path shapes are ever called (all hard-coded in this script): an
// absolute API path built from word chars, digits, slashes and hyphens.
// Anything else — "..", "://", whitespace, query strings — is rejected
// before it can reach the fetch URL (jssecurity:S7044/S8476).
const API_PATH_RE = /^\/[A-Za-z0-9_\-/]*$/;

// No defaulted params (S1788/S7744): `opts` is normalized inside the body so
// callers may omit it.
async function api(path, opts, token) {
  if (typeof path !== "string" || !API_PATH_RE.test(path)) {
    throw new Error(`api(): unsafe API path ${JSON.stringify(path)}`);
  }
  const options = opts || {};
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = "Bearer " + token;
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, { ...options, headers });
  let json = {};
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function waitForDone(docId, token) {
  for (let i = 0; i < 40; i++) {
    const { json } = await api(`/documents/${docId}`, {}, token);
    const d = json.data || {};
    if (d.ocrStatus === "done" || d.ocrStatus === "failed") return d;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("OCR did not finish in time");
}

(async () => {
  const email = `confirm_e2e_${Date.now()}@example.com`;
  const reg = await api("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Confirm E2E",
      email,
      password: "password123",
      confirmPassword: "password123"
    })
  });
  check("register", reg.status === 201 || reg.status === 200, `(${reg.status})`);
  const token = reg.json.data && (reg.json.data.token || reg.json.data.accessToken);

  const pdf = buildPdf([
    "ACME STORE",
    "Purchase Date: 04/10/2026",
    "S/N: CONFIME2E-5566",
    "Expires: 12/31/2028",
    "SAMSUNG",
    "Model No: QN65S90",
    "Samsung TV   $799.99",
    "Grand Total: $799.99"
  ]);

  // 1) Standalone upload → OCR stages data, NO product created.
  const fd = new FormData();
  fd.append("file", new Blob([pdf], { type: "application/pdf" }), "tv-receipt.pdf");
  fd.append("documentType", "receipt");
  const upload = await api("/documents", { method: "POST", body: fd }, token);
  check("standalone upload", upload.status === 201, `(${upload.status})`);
  const docId = upload.json.data._id;
  const doc = await waitForDone(docId, token);
  check("OCR done", doc.ocrStatus === "done");
  check("product NOT created yet", !doc.productId, `productId=${doc.productId}`);
  const staged = doc.parsedData || {};
  check("price staged", Math.abs(staged.purchasePrice - 799.99) < 0.01, `got ${staged.purchasePrice}`);
  check("serial staged", staged.serialNumber === "CONFIME2E-5566");
  check("name suggested", typeof staged.productName === "string" && staged.productName.length > 0, `got "${staged.productName}"`);
  check("brand staged", staged.brand === "Samsung", `got "${staged.brand}"`);
  check("model staged", staged.model === "QN65S90", `got "${staged.model}"`);
  check("name split from brand", staged.productName === "TV", `got "${staged.productName}"`);
  check("store staged", staged.purchaseStore === "ACME STORE", `got "${staged.purchaseStore}"`);

  // 2) Confirm with CORRECTED data (user fixes the price + adds a brand name).
  const confirm = await api(`/documents/${docId}/confirm-product`, {
    method: "POST",
    body: JSON.stringify({
      productName: "Samsung QLED TV",   // corrected name
      brand: "Samsung",
      model: "QN65S90",
      serialNumber: "CONFIME2E-5566",
      purchasePrice: 749.99,            // corrected price
      purchaseStore: "ACME STORE",
      purchaseDate: "2026-04-10",
      warrantyExpiryDate: "2028-12-31"
    })
  }, token);
  check("confirm creates product", confirm.status === 201, `(${confirm.status}) ${confirm.json.message || ""}`);
  const product = confirm.json.data.product;
  check("corrected name saved", product.productName === "Samsung QLED TV", `got "${product.productName}"`);
  check("brand saved", product.brand === "Samsung", `got "${product.brand}"`);
  check("model saved", product.model === "QN65S90", `got "${product.model}"`);
  check("corrected price saved", Math.abs(product.purchasePrice - 749.99) < 0.01, `got ${product.purchasePrice}`);
  check("serial saved", product.serialNumber === "CONFIME2E-5566");
  check("doc linked", confirm.json.data.document.productId === product._id);

  // 3) Second scan with the same serial → confirm reuses the same product.
  const fd2 = new FormData();
  fd2.append("file", new Blob([pdf], { type: "application/pdf" }), "tv-receipt-2.pdf");
  fd2.append("documentType", "warranty_card");
  const upload2 = await api("/documents", { method: "POST", body: fd2 }, token);
  const doc2 = await waitForDone(upload2.json.data._id, token);
  check("second scan staged (no product)", !doc2.productId);
  const confirm2 = await api(`/documents/${upload2.json.data._id}/confirm-product`, {
    method: "POST",
    body: JSON.stringify({ productName: "Second scan TV", serialNumber: "CONFIME2E-5566" })
  }, token);
  check("dedupe: reused existing product", confirm2.status === 201 && confirm2.json.data.product._id === product._id);

  // 4) Guard rails.
  const again = await api(`/documents/${docId}/confirm-product`, {
    method: "POST",
    body: JSON.stringify({ productName: "Duplicate" })
  }, token);
  check("already-linked → 409", again.status === 409, `(${again.status})`);

  const fd3 = new FormData();
  fd3.append("file", new Blob([pdf], { type: "application/pdf" }), "tv-receipt-3.pdf");
  fd3.append("documentType", "receipt");
  const upload3 = await api("/documents", { method: "POST", body: fd3 }, token);
  const badDates = await api(`/documents/${upload3.json.data._id}/confirm-product`, {
    method: "POST",
    body: JSON.stringify({ productName: "X", purchaseDate: "2028-01-01", warrantyExpiryDate: "2027-01-01" })
  }, token);
  check("expiry before purchase → 422", badDates.status === 422, `(${badDates.status}) ${badDates.json.message || ""}`);

  // 5) Cleanup test user's data.
  // Fire-and-forget cleanup probe (result intentionally unused — the user is
  // registered with a throwaway identity and immediately abandoned).
  fetch(BASE + "/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "cleanup probe", email: `probe_${Date.now()}@example.com`, password: "password123" })
  }).catch(() => {});

  console.log(failures === 0 ? "\nE2E PASS — all checks green" : `\nE2E FAIL — ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("E2E ERROR:", e.message);
  process.exit(1);
});

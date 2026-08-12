#!/usr/bin/env node
/**
 * WarrantyVault API smoke test client.
 *
 * Exercises the entire backend API the same way the Flutter app does, from
 * registration through products, documents, service history, dashboard,
 * notifications, password change and logout. Prints a PASS/FAIL summary and
 * exits non-zero if any step fails, so it can be wired into CI or a handoff
 * checklist.
 *
 * Usage:
 *   node scripts/api-smoke.js
 *   BASE_URL=http://192.168.1.50:5000/api/v1 node scripts/api-smoke.js
 *   BASE_URL=... EMAIL=a@b.com PASSWORD=secret123 node scripts/api-smoke.js
 *
 * Requirements: Node.js >= 20 (uses the global fetch, FormData and Blob).
 * The document-upload step requires real Cloudinary credentials configured in
 * the backend .env. If Cloudinary is not configured, that single step reports
 * WARN instead of FAIL so the rest of the flow can still be verified.
 */

// Strip a trailing run of "/" characters without a regex so the strip stays
// linear-time and unambiguous (javascript:S8786).
function stripTrailingSlashes(value) {
  let end = value.length;
  while (end > 0 && value.codePointAt(end - 1) === 47) {
    end -= 1;
  }
  return value.slice(0, end);
}

const BASE_URL = stripTrailingSlashes(process.env.BASE_URL || "http://localhost:5000/api/v1");
// The health route lives at the root, not under /api/v1.
const ROOT_URL = BASE_URL.replace(/\/api\/v1\/?$/, "");
const EMAIL = process.env.EMAIL || `smoke-${Date.now()}@example.com`;
const PASSWORD = process.env.PASSWORD || "password123";
const NEW_PASSWORD = process.env.NEW_PASSWORD || "newpassword123";

const results = [];
let token = null;
let productId = null;
let recordId = null;
let documentId = null;

// Sanitize a detail string before it is logged: strip newlines/control
// characters and cap the length so API-provided (potentially user-controlled)
// text is never echoed verbatim (jssecurity:S5145).
function sanitizeDetail(detail) {
  const text = String(detail ?? "");
  const cleaned = text.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return cleaned.length > 160 ? `${cleaned.slice(0, 157)}...` : cleaned;
}

function record(name, ok, detail = "") {
  const safeDetail = sanitizeDetail(detail);
  results.push({ name, ok, detail: safeDetail });
  const mark = ok ? "PASS" : "FAIL";
  const icon = ok ? "✔" : "✘";
  const suffix = safeDetail ? ` — ${safeDetail}` : "";
  console.log(`  ${icon} [${mark}] ${name}${suffix}`);
}

async function request(method, path, { body, formData, auth = true, expected = 200, base = BASE_URL } = {}) {
  const headers = {};
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  // Client-side request forgery defense (jssecurity:S8476/S5144): `base` and
  // `path` may carry tainted data (IDs echoed back from API responses, or a
  // BASE_URL env var). Refuse anything that could escape the base origin
  // before the URL reaches fetch().
  let baseUrl;
  try {
    baseUrl = new URL(base);
  } catch {
    throw new Error(`Refusing request with invalid base URL: ${base}`);
  }
  if (!["http:", "https:"].includes(baseUrl.protocol)) {
    throw new Error(`Refusing request with non-http(s) base URL: ${base}`);
  }
  const safePath = String(path ?? "");
  if (safePath.includes("://") || safePath.startsWith("//")) {
    throw new Error(`Refusing request path that escapes the base origin: ${safePath}`);
  }
  const url = `${base}${safePath}`;
  if (new URL(url).origin !== baseUrl.origin) {
    throw new Error(`Refusing request URL that escapes the base origin: ${url}`);
  }

  const res = await fetch(url, { method, headers, body: payload });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }

  const ok = res.status === expected;
  return { res, json, ok };
}

function jsonBody(path, { body, auth = true, expected = 200 } = {}) {
  return request("POST", path, { body, auth, expected });
}

// Compare a floating point value to an expected value within a small epsilon
// instead of using exact equality (javascript:S1244).
function approxEqual(value, expected, epsilon = 1e-3) {
  return typeof value === "number" && Math.abs(value - expected) < epsilon;
}

// A 1x1 transparent PNG used for the document upload smoke step.
function tinyPng() {
  const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const bytes = Uint8Array.from(atob(base64), (c) => c.codePointAt(0));
  return new Blob([bytes], { type: "image/png" });
}

function expectOk(name, ok, detail = "") {
  record(name, ok, detail);
}

function expectFail(name, err) {
  record(name, false, err.message);
}

// Run a step in a guarded context so an unexpected exception is recorded as a
// FAIL for that step instead of crashing the whole smoke test.
async function runStep(name, fn) {
  try {
    await fn();
  } catch (err) {
    expectFail(name, err);
  }
}

// 1. Health ---------------------------------------------------------------
async function stepHealth() {
  try {
    const { res, json, ok } = await request("GET", "/health", { auth: false, expected: 200, base: ROOT_URL });
    expectOk("GET /health", ok && json?.success === true, json?.message || `HTTP ${res.status}`);
  } catch (err) {
    record("GET /health", false, `server unreachable: ${err.message}`);
    summarize();
    process.exit(1);
  }
}

// 2-5. Registration, login, current user, unauthorized rejection -------------
async function stepAuth() {
  // 2. Registration
  await runStep("POST /auth/register", async () => {
    const { json, ok } = await jsonBody("/auth/register", {
      body: { name: "Smoke Tester", email: EMAIL, password: PASSWORD, confirmPassword: PASSWORD },
      expected: 201
    });
    token = json?.data?.token;
    expectOk("POST /auth/register", ok && !!token, ok ? `user ${json.data.user.email}` : json?.message);
  });

  // 3. Login
  await runStep("POST /auth/login", async () => {
    const { json, ok } = await jsonBody("/auth/login", {
      body: { email: EMAIL, password: PASSWORD }
    });
    token = json?.data?.token;
    expectOk("POST /auth/login", ok && !!token, ok ? `token ${String(token).slice(0, 18)}…` : json?.message);
  });

  // 4. Current user
  await runStep("GET /auth/me", async () => {
    const { res, json, ok } = await request("GET", "/auth/me");
    expectOk("GET /auth/me", ok && json?.data?.email === EMAIL, ok ? json.data.email : `HTTP ${res.status}`);
  });

  // 5. Unauthorized access is rejected
  await runStep("GET /products without token → 401", async () => {
    const saved = token;
    token = null;
    const { res } = await request("GET", "/products", { auth: false });
    token = saved;
    expectOk("GET /products without token → 401", res.status === 401, `HTTP ${res.status}`);
  });
}

// 6-11. Product CRUD -------------------------------------------------------
async function stepProducts() {
  // 6. Create product
  await runStep("POST /products", async () => {
    const { json, ok } = await jsonBody("/products", {
      body: {
        productName: "Sony WH-1000XM5 Headphones",
        brand: "Sony",
        model: "WH-1000XM5",
        category: "Electronics",
        purchaseDate: "2025-06-01",
        purchasePrice: 349.99,
        currency: "USD",
        purchaseStore: "Best Buy",
        serialNumber: "SN-1000XM5-001",
        warrantyExpiryDate: "2027-06-01",
        warrantyPeriodMonths: 24,
        notes: "Smoke test product"
      },
      expected: 201
    });
    productId = json?.data?._id;
    expectOk("POST /products", ok && !!productId, ok ? `id ${productId}` : json?.message);
  });

  // 7. List products
  await runStep("GET /products (paginated)", async () => {
    const { json, ok } = await request("GET", "/products?page=1&limit=10&sortBy=createdAt&order=desc");
    const found = (json?.data?.products || []).some((p) => p._id === productId);
    expectOk("GET /products (paginated)", ok && found, ok ? `total ${json.data.total}` : json?.message);
  });

  // 8. Search products
  await runStep("GET /products/search", async () => {
    const { json, ok } = await request("GET", "/products/search?q=headphones");
    expectOk("GET /products/search", ok && Array.isArray(json?.data), ok ? `${json.data.length} hit(s)` : json?.message);
  });

  // 9. Expiring soon
  await runStep("GET /products/expiring-soon", async () => {
    const { json, ok } = await request("GET", "/products/expiring-soon");
    expectOk("GET /products/expiring-soon", ok && Array.isArray(json?.data), ok ? `${json.data.length} item(s)` : json?.message);
  });

  // 10. Get product by id
  await runStep("GET /products/:id", async () => {
    const { res, json, ok } = await request("GET", `/products/${productId}`);
    expectOk("GET /products/:id", ok && json?.data?._id === productId, ok ? json.data.productName : `HTTP ${res.status}`);
  });

  // 11. Update product
  await runStep("PUT /products/:id", async () => {
    const { json, ok } = await request("PUT", `/products/${productId}`, {
      body: { notes: "Updated via smoke test" }
    });
    expectOk("PUT /products/:id", ok && json?.data?.notes === "Updated via smoke test", json?.message);
  });
}

// 12-15. Service history CRUD ------------------------------------------------
async function stepServiceHistory() {
  // 12. Add service history record
  await runStep("POST /service-history", async () => {
    const { json, ok } = await jsonBody(`/products/${productId}/service-history`, {
      body: {
        serviceDate: "2026-06-15",
        serviceType: "maintenance",
        serviceProvider: "Sony Service Center",
        cost: 49.99,
        currency: "USD",
        description: "Annual checkup",
        nextServiceDate: "2027-06-15"
      },
      expected: 201
    });
    recordId = json?.data?._id;
    expectOk("POST /service-history", ok && !!recordId, ok ? `id ${recordId}` : json?.message);
  });

  // 13. List service history
  await runStep("GET /service-history", async () => {
    const { json, ok } = await request("GET", `/products/${productId}/service-history`);
    const found = (json?.data || []).some((r) => r._id === recordId);
    expectOk("GET /service-history", ok && found, ok ? `${json.data.length} record(s)` : json?.message);
  });

  // 14. Update service record
  await runStep("PUT /service-history/:recordId", async () => {
    const { json, ok } = await request("PUT", `/products/${productId}/service-history/${recordId}`, {
      body: { cost: 59.99 }
    });
    expectOk("PUT /service-history/:recordId", ok && approxEqual(json?.data?.cost, 59.99), json?.message);
  });

  // 15. Delete service record
  await runStep("DELETE /service-history/:recordId", async () => {
    const { ok } = await request("DELETE", `/products/${productId}/service-history/${recordId}`);
    expectOk("DELETE /service-history/:recordId", ok, ok ? "deleted" : "failed");
  });
}

// 16-19. Document upload / list / get / delete ---------------------------------
async function stepDocuments() {
  // 16. Upload document (multipart, needs Cloudinary)
  try {
    const fd = new FormData();
    fd.append("file", tinyPng(), "smoke-receipt.png");
    fd.append("documentType", "receipt");
    fd.append("notes", "Smoke test receipt");
    const { res, json, ok } = await request("POST", `/products/${productId}/documents`, {
      formData: fd,
      expected: 201
    });
    documentId = json?.data?._id;
    if (ok) {
      record("POST /documents (multipart)", true, `id ${documentId}`);
    } else if (res.status >= 500) {
      record("POST /documents (multipart)", true, "WARN: skipped — Cloudinary not configured? (HTTP " + res.status + ")");
    } else {
      record("POST /documents (multipart)", false, json?.message || `HTTP ${res.status}`);
    }
  } catch (err) {
    record("POST /documents (multipart)", true, `WARN: skipped — ${err.message}`);
  }

  // 17. List documents
  await runStep("GET /documents", async () => {
    const { json, ok } = await request("GET", `/products/${productId}/documents`);
    expectOk("GET /documents", ok && Array.isArray(json?.data?.documents), ok ? `${json.data.documents.length} document(s)` : json?.message);
  });

  // 18. Get document by id (only if a document was uploaded)
  if (documentId) {
    await runStep("GET /documents/:documentId", async () => {
      const { json, ok } = await request("GET", `/products/${productId}/documents/${documentId}`);
      expectOk("GET /documents/:documentId", ok && json?.data?._id === documentId, json?.message);
    });
  }

  // 19. Delete document (only if a document was uploaded)
  if (documentId) {
    await runStep("DELETE /documents/:documentId", async () => {
      const { ok } = await request("DELETE", `/products/${productId}/documents/${documentId}`);
      expectOk("DELETE /documents/:documentId", ok, ok ? "deleted" : "failed");
    });
  }
}

// 20-22. Dashboard, notifications, mark-all-read ------------------------------
async function stepDashboardNotifications() {
  // 20. Dashboard
  await runStep("GET /dashboard", async () => {
    const { json, ok } = await request("GET", "/dashboard");
    const d = json?.data;
    expectOk(
      "GET /dashboard",
      ok && typeof d?.totalProducts === "number" && typeof d?.unreadNotificationsCount === "number",
      ok ? `products=${d.totalProducts} documents=${d.totalDocuments} unread=${d.unreadNotificationsCount}` : json?.message
    );
  });

  // 21. Notifications (may be empty for a fresh user)
  await runStep("GET /notifications", async () => {
    const { json, ok } = await request("GET", "/notifications");
    // Legacy shape (array) and paginated shape ({ notifications, pagination })
    // are both accepted.
    const list = Array.isArray(json?.data) ? json.data : json?.data?.notifications || [];
    expectOk("GET /notifications", ok && Array.isArray(list), ok ? `${list.length} notification(s)` : json?.message);
  });

  // 22. Mark all as read
  await runStep("PUT /notifications/read-all", async () => {
    const { ok } = await request("PUT", "/notifications/read-all");
    expectOk("PUT /notifications/read-all", ok, ok ? "ok" : "failed");
  });
}

// 23. Change password + re-login ------------------------------------------------
async function stepPassword() {
  // Change password
  await runStep("PUT /auth/change-password", async () => {
    const { ok } = await request("PUT", "/auth/change-password", {
      body: {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmNewPassword: NEW_PASSWORD
      }
    });
    expectOk("PUT /auth/change-password", ok, ok ? "ok" : "failed");
  });

  // Re-login with the new password, only if the change succeeded.
  if (results.some((r) => r.name === "PUT /auth/change-password" && r.ok)) {
    await runStep("POST /auth/login with new password", async () => {
      const { json, ok } = await jsonBody("/auth/login", {
        body: { email: EMAIL, password: NEW_PASSWORD }
      });
      token = json?.data?.token;
      expectOk("POST /auth/login with new password", ok && !!token, ok ? "ok" : json?.message);
    });
  }
}

// 24-25. Logout + soft-delete product -------------------------------------------
async function stepCleanup() {
  // 24. Logout
  await runStep("POST /auth/logout", async () => {
    const { ok } = await request("POST", "/auth/logout");
    expectOk("POST /auth/logout", ok, ok ? "ok" : "failed");
  });

  // 25. Delete product (soft)
  await runStep("DELETE /products/:id (soft)", async () => {
    const { ok } = await request("DELETE", `/products/${productId}`);
    expectOk("DELETE /products/:id (soft)", ok, ok ? "deleted" : "failed");
  });
}

async function main() {
  console.log(`\nWarrantyVault API smoke test`);
  console.log(`  Base URL : ${BASE_URL}`);
  console.log(`  Email    : ${EMAIL}\n`);

  await stepHealth();
  await stepAuth();
  await stepProducts();
  await stepServiceHistory();
  await stepDocuments();
  await stepDashboardNotifications();
  await stepPassword();
  await stepCleanup();

  summarize();
}

function summarize() {
  // WARN steps record ok:true so the flow continues, but they should not
  // count as hard passes in the summary.
  const warned = results.filter((r) => r.detail.startsWith("WARN"));
  const passed = results.filter((r) => r.ok && !warned.includes(r)).length;
  const failed = results.filter((r) => !r.ok).length;

  const warningSuffix = warned.length ? `, ${warned.length} warned (Cloudinary)` : "";

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${passed} passed, ${failed} failed${warningSuffix}`);
  console.log(`${"=".repeat(60)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\nSmoke test crashed:", err);
  process.exit(1);
});

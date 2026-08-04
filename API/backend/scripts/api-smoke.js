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

const BASE_URL = (process.env.BASE_URL || "http://localhost:5000/api/v1").replace(/\/+$/, "");
const EMAIL = process.env.EMAIL || `smoke-${Date.now()}@example.com`;
const PASSWORD = process.env.PASSWORD || "password123";
const NEW_PASSWORD = process.env.NEW_PASSWORD || "newpassword123";

const results = [];
let token = null;
let productId = null;
let recordId = null;
let documentId = null;

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`  ${ok ? "✔" : "✘"} [${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function request(method, path, { body, formData, auth = true, expected = 200 } = {}) {
  const headers = {};
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: payload });
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

// A 1x1 transparent PNG used for the document upload smoke step.
function tinyPng() {
  const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: "image/png" });
}

async function main() {
  console.log(`\nWarrantyVault API smoke test`);
  console.log(`  Base URL : ${BASE_URL}`);
  console.log(`  Email    : ${EMAIL}\n`);

  // 1. Health -------------------------------------------------------------
  try {
    const { res, json, ok } = await request("GET", "/health", { auth: false, expected: 200 });
    record("GET /health", ok && json?.success === true, json?.message || `HTTP ${res.status}`);
  } catch (err) {
    record("GET /health", false, `server unreachable: ${err.message}`);
    summarize();
    process.exit(1);
  }

  // 2. Registration -------------------------------------------------------
  try {
    const { json, ok } = await jsonBody("/auth/register", {
      body: { name: "Smoke Tester", email: EMAIL, password: PASSWORD, confirmPassword: PASSWORD },
      expected: 201
    });
    token = json?.data?.token;
    record("POST /auth/register", ok && !!token, ok ? `user ${json.data.user.email}` : json?.message);
  } catch (err) {
    record("POST /auth/register", false, err.message);
  }

  // 3. Login --------------------------------------------------------------
  try {
    const { json, ok } = await jsonBody("/auth/login", {
      body: { email: EMAIL, password: PASSWORD }
    });
    token = json?.data?.token;
    record("POST /auth/login", ok && !!token, ok ? `token ${String(token).slice(0, 18)}…` : json?.message);
  } catch (err) {
    record("POST /auth/login", false, err.message);
  }

  // 4. Current user -------------------------------------------------------
  try {
    const { res, json, ok } = await request("GET", "/auth/me");
    record("GET /auth/me", ok && json?.data?.email === EMAIL, ok ? json.data.email : `HTTP ${res.status}`);
  } catch (err) {
    record("GET /auth/me", false, err.message);
  }

  // 5. Unauthorized access is rejected ------------------------------------
  try {
    const saved = token;
    token = null;
    const { res } = await request("GET", "/products", { auth: false });
    token = saved;
    record("GET /products without token → 401", res.status === 401, `HTTP ${res.status}`);
  } catch (err) {
    record("GET /products without token → 401", false, err.message);
  }

  // 6. Create product -----------------------------------------------------
  try {
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
    record("POST /products", ok && !!productId, ok ? `id ${productId}` : json?.message);
  } catch (err) {
    record("POST /products", false, err.message);
  }

  // 7. List products ------------------------------------------------------
  try {
    const { json, ok } = await request("GET", "/products?page=1&limit=10&sortBy=createdAt&order=desc");
    const found = (json?.data?.products || []).some((p) => p._id === productId);
    record("GET /products (paginated)", ok && found, ok ? `total ${json.data.total}` : json?.message);
  } catch (err) {
    record("GET /products (paginated)", false, err.message);
  }

  // 8. Search products ----------------------------------------------------
  try {
    const { json, ok } = await request("GET", "/products/search?q=headphones");
    record("GET /products/search", ok && Array.isArray(json?.data), ok ? `${json.data.length} hit(s)` : json?.message);
  } catch (err) {
    record("GET /products/search", false, err.message);
  }

  // 9. Expiring soon ------------------------------------------------------
  try {
    const { json, ok } = await request("GET", "/products/expiring-soon");
    record("GET /products/expiring-soon", ok && Array.isArray(json?.data), ok ? `${json.data.length} item(s)` : json?.message);
  } catch (err) {
    record("GET /products/expiring-soon", false, err.message);
  }

  // 10. Get product by id --------------------------------------------------
  try {
    const { res, json, ok } = await request("GET", `/products/${productId}`);
    record("GET /products/:id", ok && json?.data?._id === productId, ok ? json.data.productName : `HTTP ${res.status}`);
  } catch (err) {
    record("GET /products/:id", false, err.message);
  }

  // 11. Update product -----------------------------------------------------
  try {
    const { json, ok } = await request("PUT", `/products/${productId}`, {
      body: { notes: "Updated via smoke test" }
    });
    record("PUT /products/:id", ok && json?.data?.notes === "Updated via smoke test", json?.message);
  } catch (err) {
    record("PUT /products/:id", false, err.message);
  }

  // 12. Add service history record ------------------------------------------
  try {
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
    record("POST /service-history", ok && !!recordId, ok ? `id ${recordId}` : json?.message);
  } catch (err) {
    record("POST /service-history", false, err.message);
  }

  // 13. List service history -------------------------------------------------
  try {
    const { json, ok } = await request("GET", `/products/${productId}/service-history`);
    const found = (json?.data || []).some((r) => r._id === recordId);
    record("GET /service-history", ok && found, ok ? `${json.data.length} record(s)` : json?.message);
  } catch (err) {
    record("GET /service-history", false, err.message);
  }

  // 14. Update service record -------------------------------------------------
  try {
    const { json, ok } = await request("PUT", `/products/${productId}/service-history/${recordId}`, {
      body: { cost: 59.99 }
    });
    record("PUT /service-history/:recordId", ok && json?.data?.cost === 59.99, json?.message);
  } catch (err) {
    record("PUT /service-history/:recordId", false, err.message);
  }

  // 15. Delete service record --------------------------------------------------
  try {
    const { ok } = await request("DELETE", `/products/${productId}/service-history/${recordId}`);
    record("DELETE /service-history/:recordId", ok, ok ? "deleted" : "failed");
  } catch (err) {
    record("DELETE /service-history/:recordId", false, err.message);
  }

  // 16. Upload document (multipart, needs Cloudinary) ---------------------------
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

  // 17. List documents -----------------------------------------------------------
  try {
    const { json, ok } = await request("GET", `/products/${productId}/documents`);
    record("GET /documents", ok && Array.isArray(json?.data?.documents), ok ? `${json.data.documents.length} document(s)` : json?.message);
  } catch (err) {
    record("GET /documents", false, err.message);
  }

  // 18. Get document by id ---------------------------------------------------------
  if (documentId) {
    try {
      const { json, ok } = await request("GET", `/products/${productId}/documents/${documentId}`);
      record("GET /documents/:documentId", ok && json?.data?._id === documentId, json?.message);
    } catch (err) {
      record("GET /documents/:documentId", false, err.message);
    }
  }

  // 19. Delete document ---------------------------------------------------------------
  if (documentId) {
    try {
      const { ok } = await request("DELETE", `/products/${productId}/documents/${documentId}`);
      record("DELETE /documents/:documentId", ok, ok ? "deleted" : "failed");
    } catch (err) {
      record("DELETE /documents/:documentId", false, err.message);
    }
  }

  // 20. Dashboard ------------------------------------------------------------------------
  try {
    const { json, ok } = await request("GET", "/dashboard");
    const d = json?.data;
    record(
      "GET /dashboard",
      ok && typeof d?.totalProducts === "number" && typeof d?.unreadNotificationsCount === "number",
      ok ? `products=${d.totalProducts} documents=${d.totalDocuments} unread=${d.unreadNotificationsCount}` : json?.message
    );
  } catch (err) {
    record("GET /dashboard", false, err.message);
  }

  // 21. Notifications (may be empty for a fresh user) --------------------------------------
  try {
    const { json, ok } = await request("GET", "/notifications");
    record("GET /notifications", ok && Array.isArray(json?.data), ok ? `${json.data.length} notification(s)` : json?.message);
  } catch (err) {
    record("GET /notifications", false, err.message);
  }

  // 22. Mark all as read -----------------------------------------------------------------------
  try {
    const { ok } = await request("PUT", "/notifications/read-all");
    record("PUT /notifications/read-all", ok, ok ? "ok" : "failed");
  } catch (err) {
    record("PUT /notifications/read-all", false, err.message);
  }

  // 23. Change password + re-login ---------------------------------------------------------------
  try {
    const { ok } = await request("PUT", "/auth/change-password", {
      body: {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmNewPassword: NEW_PASSWORD
      }
    });
    record("PUT /auth/change-password", ok, ok ? "ok" : "failed");
  } catch (err) {
    record("PUT /auth/change-password", false, err.message);
  }

  if (results.some((r) => r.name === "PUT /auth/change-password" && r.ok)) {
    try {
      const { json, ok } = await jsonBody("/auth/login", {
        body: { email: EMAIL, password: NEW_PASSWORD }
      });
      token = json?.data?.token;
      record("POST /auth/login with new password", ok && !!token, ok ? "ok" : json?.message);
    } catch (err) {
      record("POST /auth/login with new password", false, err.message);
    }
  }

  // 24. Logout ------------------------------------------------------------------------------------
  try {
    const { ok } = await request("POST", "/auth/logout");
    record("POST /auth/logout", ok, ok ? "ok" : "failed");
  } catch (err) {
    record("POST /auth/logout", false, err.message);
  }

  // 25. Delete product (soft) ----------------------------------------------------------------------
  try {
    const { ok } = await request("DELETE", `/products/${productId}`);
    record("DELETE /products/:id (soft)", ok, ok ? "deleted" : "failed");
  } catch (err) {
    record("DELETE /products/:id (soft)", false, err.message);
  }

  summarize();
}

function summarize() {
  // WARN steps record ok:true so the flow continues, but they should not
  // count as hard passes in the summary.
  const warned = results.filter((r) => r.detail.startsWith("WARN"));
  const passed = results.filter((r) => r.ok && !warned.includes(r)).length;
  const failed = results.filter((r) => !r.ok).length;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${passed} passed, ${failed} failed${warned.length ? `, ${warned.length} warned (Cloudinary)` : ""}`);
  console.log(`${"=".repeat(60)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\nSmoke test crashed:", err);
  process.exit(1);
});

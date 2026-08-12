process.env.PORT = "5000";
process.env.NODE_ENV = "test";
process.env.MONGO_URI = "mongodb://localhost/warrantyvault_db";
process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";
process.env.CLOUDINARY_CLOUD_NAME = "test";
process.env.CLOUDINARY_API_KEY = "test";
process.env.CLOUDINARY_API_SECRET = "test";
process.env.CLIENT_URL = "*";
process.env.GOOGLE_PLACES_API_KEY = "test-google-key";

const fs = require("node:fs");
const path = require("node:path");
const jwt = require("jsonwebtoken");

// The real cloudinary module would attempt live API calls with the "test"
// placeholder credentials — mock it so uploads resolve deterministically.
const mockUploadStream = jest.fn((opts, cb) => {
  const { PassThrough } = require("node:stream");
  const stream = new PassThrough();
  stream.on("data", () => {});
  process.nextTick(() => {
    cb(null, {
      public_id: "test/security-upload",
      secure_url: "https://res.cloudinary.com/test/image/upload/v1/test/security-upload",
      bytes: 42
    });
    stream.end();
  });
  return stream;
});
jest.mock("../src/config/cloudinary", () => ({
  uploader: {
    upload_stream: mockUploadStream,
    destroy: jest.fn().mockResolvedValue({ result: "ok" })
  },
  isConfigured: () => true,
  fetchStoredAsset: jest.fn().mockResolvedValue({ ok: false, status: 401 })
}));

const { app, request, startDb, stopDb, registerUser } = require("./helpers/setup");
const Notification = require("../src/models/Notification");
const Document = require("../src/models/Document");

const PNG_1x1 = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d4944415478da63fcf4e93f000500018115f8a60000000049454e44ae426082",
  "hex"
);

describe("Security hardening", () => {
  let ownerToken;
  let otherToken;
  let ownerUserId;
  let productId;

  beforeAll(async () => {
    await startDb();
    const owner = await registerUser("SecOwner", `sec_owner_${Date.now()}@example.com`);
    ownerToken = owner.token;
    ownerUserId = owner.userId;
    const other = await registerUser("SecOther", `sec_other_${Date.now()}@example.com`);
    otherToken = other.token;

    const created = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ productName: "Owner Gadget", serialNumber: "SEC-SN-OWNER-1" });
    productId = created.body.data._id;
  });

  afterAll(async () => {
    await stopDb();
  });

  // ── Authentication / JWT edge cases ───────────────────────────────────────
  test("rejects a malformed JWT", async () => {
    const response = await request(app)
      .get("/api/v1/products")
      .set("Authorization", "Bearer not.a.jwt");
    expect(response.statusCode).toBe(401);
  });

  test("rejects an expired JWT", async () => {
    const expired = jwt.sign(
      { userId: "000000000000000000000000" },
      process.env.JWT_SECRET,
      { expiresIn: -10 }
    );
    const response = await request(app)
      .get("/api/v1/products")
      .set("Authorization", `Bearer ${expired}`);
    expect(response.statusCode).toBe(401);
  });

  // ── Cross-user authorization ──────────────────────────────────────────────
  test("denies service history access on another user's product", async () => {
    const response = await request(app)
      .get(`/api/v1/products/${productId}/service-history`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(response.statusCode).toBe(403);
  });

  test("denies reading another user's notification", async () => {
    const notification = await Notification.create({
      userId: ownerUserId,
      productId,
      notificationType: "warranty_expiry",
      title: "Owner only",
      message: "secret"
    });
    const response = await request(app)
      .put(`/api/v1/notifications/${notification._id}/read`)
      .set("Authorization", `Bearer ${otherToken}`);
    // Not found from the caller's perspective — ownership is never leaked.
    expect(response.statusCode).toBe(404);
  });

  // ── Places proxy hardening ────────────────────────────────────────────────
  test("rejects out-of-range latitude", async () => {
    const response = await request(app)
      .get("/api/v1/places/nearby")
      .query({ lat: 91, lng: 77.2 });
    expect(response.statusCode).toBe(400);
  });

  test("rejects out-of-range longitude", async () => {
    const response = await request(app)
      .get("/api/v1/places/nearby")
      .query({ lat: 28.6, lng: -181 });
    expect(response.statusCode).toBe(400);
  });

  test("rejects an excessive radius", async () => {
    const response = await request(app)
      .get("/api/v1/places/nearby")
      .query({ lat: 28.6, lng: 77.2, radius: 100000 });
    expect(response.statusCode).toBe(400);
  });

  test("rejects an unsupported place type", async () => {
    const response = await request(app)
      .get("/api/v1/places/nearby")
      .query({ lat: 28.6, lng: 77.2, type: "strip_club" });
    expect(response.statusCode).toBe(400);
  });

  test("rejects an over-long keyword", async () => {
    const response = await request(app)
      .get("/api/v1/places/nearby")
      .query({ lat: 28.6, lng: 77.2, keyword: "x".repeat(200) });
    expect(response.statusCode).toBe(400);
  });

  test("rejects a malformed place_id", async () => {
    const response = await request(app)
      .get("/api/v1/places/details")
      .query({ place_id: "tiny" });
    expect(response.statusCode).toBe(400);
  });

  test("rejects a malformed photo reference", async () => {
    const response = await request(app)
      .get("/api/v1/places/photo")
      .query({ reference: "has spaces and is bad" });
    expect(response.statusCode).toBe(400);
  });

  test("returns 503 when the Places API key is missing", async () => {
    const saved = process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_PLACES_API_KEY;
    try {
      const response = await request(app)
        .get("/api/v1/places/nearby")
        .query({ lat: 28.6, lng: 77.2 });
      expect(response.statusCode).toBe(503);
      // Never leaks internal details.
      expect(response.body.error).not.toMatch(/key|secret|undefined/i);
    } finally {
      process.env.GOOGLE_PLACES_API_KEY = saved;
    }
  });

  // ── Upload signature validation ───────────────────────────────────────────
  test("rejects a renamed HTML file claiming to be a JPEG", async () => {
    const response = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${ownerToken}`)
      .field("documentType", "manual")
      .attach("file", Buffer.from("<html><script>alert(1)</script></html>"), {
        filename: "receipt.jpg",
        contentType: "image/jpeg"
      });
    expect(response.statusCode).toBe(400);
  });

  test("rejects a file whose declared MIME contradicts its bytes", async () => {
    const response = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${ownerToken}`)
      .field("documentType", "manual")
      .attach("file", PNG_1x1, {
        filename: "receipt.pdf",
        contentType: "application/pdf"
      });
    expect(response.statusCode).toBe(400);
  });

  test("accepts a genuine PNG with a matching MIME type", async () => {
    const response = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${otherToken}`)
      .field("documentType", "manual")
      .attach("file", PNG_1x1, {
        filename: "receipt.png",
        contentType: "image/png"
      });
    expect(response.statusCode).toBe(201);
    expect(response.body.data.ocrStatus).toBe("skipped");
  });

  // ── OCR reliability: no permanently stuck "processing" states ────────────
  test("recovers a document stuck in processing for over 10 minutes", async () => {
    const stuck = await Document.create({
      userId: ownerUserId,
      documentType: "receipt",
      fileName: "stuck.jpg",
      fileUrl: "https://example.invalid/stuck.jpg",
      publicId: "test/stuck",
      fileSize: 10,
      mimeType: "image/jpeg",
      // A crashed process left this in "processing" long after upload.
      ocrStatus: "processing",
      uploadedAt: new Date(Date.now() - 11 * 60 * 1000)
    });
    const response = await request(app)
      .get(`/api/v1/documents/${stuck._id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.ocrStatus).toBe("failed");
  });

  test("leaves a fresh processing document alone", async () => {
    const fresh = await Document.create({
      userId: ownerUserId,
      documentType: "receipt",
      fileName: "fresh.jpg",
      fileUrl: "https://example.invalid/fresh.jpg",
      publicId: "test/fresh",
      fileSize: 10,
      mimeType: "image/jpeg",
      ocrStatus: "processing",
      uploadedAt: new Date()
    });
    const response = await request(app)
      .get(`/api/v1/documents/${fresh._id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.ocrStatus).toBe("processing");
  });

  // ── Serial-number deduplication (DB-level partial unique index) ───────────
  test("rejects a duplicate active serial for the same user", async () => {
    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ productName: "Duplicate", serialNumber: "SEC-SN-OWNER-1" });
    expect(response.statusCode).toBe(409);
  });

  test("allows the same serial for a different user", async () => {
    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ productName: "Same serial", serialNumber: "SEC-SN-OWNER-1" });
    expect(response.statusCode).toBe(201);
  });

  test("frees a serial when the product is soft-deleted", async () => {
    const created = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ productName: "Temp", serialNumber: "SEC-SN-TEMP" });
    expect(created.statusCode).toBe(201);

    await request(app)
      .delete(`/api/v1/products/${created.body.data._id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(created.statusCode).toBe(201);

    const recreated = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ productName: "Temp again", serialNumber: "SEC-SN-TEMP" });
    expect(recreated.statusCode).toBe(201);
  });

  // ── Frontend XSS escaping (tests the shipped escapeHtml in public/js) ─────
  test("escapeHtml neutralises malicious payloads", () => {
    const utilsSrc = fs.readFileSync(
      path.join(__dirname, "..", "public", "js", "utils.js"),
      "utf8"
    );
    const match = utilsSrc.match(/function escapeHtml\(s\) \{[\s\S]*?\n\}/);
    expect(match).toBeTruthy();
    const escapeHtml = new Function(`return (${match[0]})`)();

    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
    expect(escapeHtml("<img src=x onerror=alert(1)>")).toBe(
      "&lt;img src=x onerror=alert(1)&gt;"
    );
    expect(escapeHtml('"><svg onload=alert(1)>')).toBe(
      "&quot;&gt;&lt;svg onload=alert(1)&gt;"
    );
    expect(escapeHtml("' onfocus=alert(1) x='")).toBe(
      "&#39; onfocus=alert(1) x=&#39;"
    );
    // The escaped output must never contain an executable tag.
    expect(escapeHtml("<script>alert(1)</script>")).not.toContain("<script>");
  });

  // ── Abuse protection: uploads and OCR are rate-limited per user ───────────
  test("rate-limits document uploads per user", async () => {
    const uploader = await registerUser("Uploader", `uploader_${Date.now()}@example.com`);
    const limit = Number(process.env.UPLOAD_RATE_LIMIT) || 10;
    let lastStatus = 0;
    for (let i = 0; i <= limit; i++) {
      const response = await request(app)
        .post("/api/v1/documents")
        .set("Authorization", `Bearer ${uploader.token}`)
        .field("documentType", "manual")
        .attach("file", PNG_1x1, {
          filename: `rate-${i}.png`,
          contentType: "image/png"
        });
      lastStatus = response.statusCode;
    }
    expect(lastStatus).toBe(429);
  });

  test("rate-limits OCR retries per user", async () => {
    const scanner = await registerUser("Scanner", `scanner_${Date.now()}@example.com`);
    const doc = await Document.create({
      userId: scanner.userId,
      documentType: "receipt",
      fileName: "scan.pdf",
      fileUrl: "https://example.invalid/scan.pdf",
      publicId: "test/scan",
      fileSize: 10,
      mimeType: "application/pdf",
      ocrStatus: "failed",
      ocrError: "previous failure"
    });

    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => ({ ok: false, status: 500 }));
    try {
      const limit = Number(process.env.OCR_RATE_LIMIT) || 15;
      let lastStatus = 0;
      for (let i = 0; i <= limit; i++) {
        const response = await request(app)
          .post(`/api/v1/documents/${doc._id}/ocr`)
          .set("Authorization", `Bearer ${scanner.token}`);
        lastStatus = response.statusCode;
      }
      expect(lastStatus).toBe(429);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

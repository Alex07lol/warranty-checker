// Mock Cloudinary and the multer upload middleware so tests never hit the network.
const mockFetchStoredAsset = jest.fn();
jest.mock("../src/config/cloudinary", () => ({
  isConfigured: jest.fn(() => true),
  fetchStoredAsset: mockFetchStoredAsset,
  uploader: {
    destroy: jest.fn().mockResolvedValue({ result: "ok" })
  }
}));

// This mock mirrors the REAL req.file shape produced by multer-storage-cloudinary
// v4 (installed version). The storage engine only sets { path, size, filename }
// (filename === Cloudinary public_id); multer itself adds originalname/mimetype.
// There is deliberately NO `public_id`/`secure_url`/`bytes` field, because v4 no
// longer spreads the full Cloudinary response onto req.file. The service must
// derive publicId from `filename` — if that mapping regresses, the upload below
// fails with a 422 "Path `publicId` is required."
jest.mock("../src/middleware/upload", () => ({
  uploadSingle: (req, res, next) => {
    req.file = {
      fieldname: "file",
      originalname: "receipt.jpg",
      encoding: "7bit",
      mimetype: "image/jpeg",
      size: 1024,
      path: "https://res.cloudinary.com/test/image/upload/v1/test/receipt123",
      filename: "test/receipt123"
    };
    return next();
  }
}));

// Uploading a receipt now fires background OCR (processDocument) asynchronously.
// Mock tesseract.js and stub global.fetch so that background OCR never touches
// the real network in this suite.
jest.mock("tesseract.js", () => ({
  createWorker: jest.fn(async () => ({
    recognize: jest.fn(async () => ({ data: { text: "ACME STORE\nTotal $899.99\n" } }))
  }))
}));

const mongoose = require("mongoose");
const originalFetch = global.fetch;
const cloudinary = require("../src/config/cloudinary");
const Product = require("../src/models/Product");

const { app, request, startDb, stopDb, registerUser } = require("./helpers/setup");

describe("Document API", () => {
  let token;
  let productId;

  beforeAll(async () => {
    global.fetch = jest.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));
    await startDb();
    const user = await registerUser("Doc User", `doc_${Date.now()}@example.com`);
    token = user.token;
    const product = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "Refrigerator" });
    productId = product.body.data._id;
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    await stopDb();
  });

  test("requires authentication", async () => {
    const response = await request(app).get(
      `/api/v1/products/${productId}/documents`
    );
    expect(response.statusCode).toBe(401);
  });

  test("uploads a document", async () => {
    const response = await request(app)
      .post(`/api/v1/products/${productId}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .send({ documentType: "receipt", notes: "Original bill" });
    expect(response.statusCode).toBe(201);
    expect(response.body.data.documentType).toBe("receipt");
    // Field mapping must survive the multer-storage-cloudinary v4 req.file
    // shape (storage sets only path/size/filename).
    expect(response.body.data.fileUrl).toBe(
      "https://res.cloudinary.com/test/image/upload/v1/test/receipt123"
    );
    expect(response.body.data.fileName).toBe("receipt.jpg");
    expect(response.body.data.fileSize).toBe(1024);
    expect(response.body.data.mimeType).toBe("image/jpeg");
    // Regression guard: publicId must come from req.file.filename when the
    // v4 storage engine does not provide public_id.
    expect(response.body.data.publicId).toBe("test/receipt123");
  });

  test("validates document type", async () => {
    const response = await request(app)
      .post(`/api/v1/products/${productId}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .send({ documentType: "invalid_type" });
    expect(response.statusCode).toBe(422);
  });

  test("lists documents for a product", async () => {
    const response = await request(app)
      .get(`/api/v1/products/${productId}/documents`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.documents).toHaveLength(1);
    expect(response.body.data.documents[0].documentType).toBe("receipt");
  });

  test("deletes a document", async () => {
    const list = await request(app)
      .get(`/api/v1/products/${productId}/documents`)
      .set("Authorization", `Bearer ${token}`);
    const documentId = list.body.data.documents[0]._id;

    const response = await request(app)
      .delete(`/api/v1/products/${productId}/documents/${documentId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);

    const after = await request(app)
      .get(`/api/v1/products/${productId}/documents`)
      .set("Authorization", `Bearer ${token}`);
    expect(after.body.data.documents).toHaveLength(0);

    // The publicId persisted from the v4 filename must drive the Cloudinary
    // destroy call — this closes the loop on the v4 field mapping.
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith("test/receipt123", {
      resource_type: "image"
    });
  });

  test("uploads a document without a product", async () => {
    const response = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentType: "manual", notes: "Standalone manual" });
    expect(response.statusCode).toBe(201);
    expect(response.body.data.productId).toBeNull();
    expect(response.body.data.documentType).toBe("manual");
  });

  test("lists all documents including standalone ones", async () => {
    const response = await request(app)
      .get("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.documents).toHaveLength(1);
    expect(response.body.data.documents[0].productId).toBeNull();
  });

  test("product-scoped list excludes standalone documents", async () => {
    const response = await request(app)
      .get(`/api/v1/products/${productId}/documents`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.documents).toHaveLength(0);
  });

  test("deletes a standalone document", async () => {
    const list = await request(app)
      .get("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`);
    const documentId = list.body.data.documents[0]._id;

    const response = await request(app)
      .delete(`/api/v1/documents/${documentId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);

    const after = await request(app)
      .get("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`);
    expect(after.body.data.documents).toHaveLength(0);
  });
});

describe("Document organization + verification (Phase 4 §13/§14)", () => {
  let token;
  let otherToken;
  let documentId;

  beforeAll(async () => {
    await startDb();
    const user = await registerUser("Org User", `org_${Date.now()}@example.com`);
    token = user.token;
    const other = await registerUser("Org Other", `org_other_${Date.now()}@example.com`);
    otherToken = other.token;
    const upload = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentType: "warranty_card" });
    documentId = upload.body.data._id;
  });

  afterAll(async () => {
    await stopDb();
  });

  test("requires authentication", async () => {
    const response = await request(app).patch(`/api/v1/documents/${documentId}`).send({ verified: true });
    expect(response.statusCode).toBe(401);
  });

  test("defaults are unreviewed and not verified (OCR never auto-verifies)", async () => {
    const response = await request(app)
      .get(`/api/v1/documents/${documentId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.docState).toBe("unreviewed");
    expect(response.body.data.verified).toBe(false);
  });

  test("updates docState, verified, tags and notes", async () => {
    const response = await request(app)
      .patch(`/api/v1/documents/${documentId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        docState: "important",
        verified: true,
        tags: [" Kitchen ", "high value", "kitchen", "", "", "important"],
        notes: "Verified against the physical card"
      });
    expect(response.statusCode).toBe(200);
    expect(response.body.data.docState).toBe("important");
    expect(response.body.data.verified).toBe(true);
    // Tags are normalized: trimmed, lowercased, blanks dropped, deduped.
    expect(response.body.data.tags).toEqual(["kitchen", "high value", "important"]);
    expect(response.body.data.notes).toBe("Verified against the physical card");
  });

  test("partial update preserves untouched fields", async () => {
    const response = await request(app)
      .patch(`/api/v1/documents/${documentId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ docState: "archived" });
    expect(response.statusCode).toBe(200);
    expect(response.body.data.docState).toBe("archived");
    expect(response.body.data.verified).toBe(true); // untouched
    expect(response.body.data.tags).toEqual(["kitchen", "high value", "important"]); // untouched
  });

  test("rejects an invalid docState", async () => {
    const response = await request(app)
      .patch(`/api/v1/documents/${documentId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ docState: "shredded" });
    expect(response.statusCode).toBe(422);
  });

  test("rejects updating another user's document", async () => {
    const response = await request(app)
      .patch(`/api/v1/documents/${documentId}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ verified: true });
    expect(response.statusCode).toBe(403);
  });

  test("returns 404 for a missing document", async () => {
    const response = await request(app)
      .patch(`/api/v1/documents/000000000000000000000000`)
      .set("Authorization", `Bearer ${token}`)
      .send({ verified: true });
    expect(response.statusCode).toBe(404);
  });

  test("product-scoped PATCH rejects a standalone document (parity)", async () => {
    // The router is mounted at both /documents and /products/:productId/documents;
    // a standalone doc reached through a product URL must 403 (same rule as
    // get/delete/view on that mount).
    const response = await request(app)
      .patch(`/api/v1/products/000000000000000000000000/documents/${documentId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ docState: "reviewed" });
    expect(response.statusCode).toBe(403);
  });

  test("rejects oversize tag values and too many tags", async () => {
    const response = await request(app)
      .patch(`/api/v1/documents/${documentId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tags: ["x".repeat(31)] });
    expect(response.statusCode).toBe(422);
    const tooMany = await request(app)
      .patch(`/api/v1/documents/${documentId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tags: Array.from({ length: 21 }, (_, i) => `t${i}`) });
    expect(tooMany.statusCode).toBe(422);
  });

  test("normalizeTags trims, lowercases, dedupes, drops blanks and caps at 20", () => {
    const { normalizeTags } = require("../src/services/document.service");
    const many = Array.from({ length: 30 }, (_, i) => `tag-${i}`);
    const out = normalizeTags(many.concat([" Kitchen ", "kitchen", "", "  ", "high value"]));
    expect(out).toHaveLength(20);
    expect(out[0]).toBe("tag-0");
    expect(out).not.toContain("Kitchen");
    expect(out.slice(0, 20)).not.toContain("");
    // A short input: blanks and duplicates collapse, casing normalizes.
    expect(normalizeTags([" Home ", "HOME", "", "office"])).toEqual(["home", "office"]);
    expect(normalizeTags("not-an-array")).toEqual([]);
  });
});

describe("Document view proxy", () => {
  let token;
  let documentId;

  beforeAll(async () => {
    await startDb();
    const user = await registerUser("View User", `view_${Date.now()}@example.com`);
    token = user.token;
    const upload = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentType: "manual", notes: "For view proxy test" });
    documentId = upload.body.data._id;
  });

  afterAll(async () => {
    await stopDb();
  });

  // Background OCR from earlier receipt uploads also calls fetchStoredAsset;
  // clear call history between tests so assertions stay scoped.
  beforeEach(() => mockFetchStoredAsset.mockClear());

  test("requires authentication", async () => {
    const response = await request(app).get(`/api/v1/documents/${documentId}/view`);
    expect(response.statusCode).toBe(401);
  });

  test("streams the original file bytes with a viewable content-type", async () => {
    const pdfBytes = Buffer.from("%PDF-1.4 fake warranty pdf bytes");
    mockFetchStoredAsset.mockResolvedValue(
      new Response(pdfBytes, {
        status: 200,
        headers: { "content-type": "application/pdf" }
      })
    );

    const response = await request(app)
      .get(`/api/v1/documents/${documentId}/view`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain("inline");
    // supertest buffers binary responses into res.body.
    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect(response.body.toString("utf8")).toContain("%PDF-1.4");
    // The proxy must fetch through the Admin API (not the delivery URL).
    expect(mockFetchStoredAsset).toHaveBeenCalledWith("test/receipt123");
  });

  test("rejects viewing another user's document", async () => {
    const other = await registerUser("Other View User", `view_other_${Date.now()}@example.com`);
    const response = await request(app)
      .get(`/api/v1/documents/${documentId}/view`)
      .set("Authorization", `Bearer ${other.token}`);
    expect(response.statusCode).toBe(403);
    expect(mockFetchStoredAsset).not.toHaveBeenCalled();
  });

  test("returns 404 for a missing document", async () => {
    const response = await request(app)
      .get(`/api/v1/documents/${new mongoose.Types.ObjectId()}/view`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(404);
  });

  test("surfaces a Cloudinary download failure as a 502", async () => {
    mockFetchStoredAsset.mockResolvedValue(new Response("denied", { status: 401 }));
    const response = await request(app)
      .get(`/api/v1/documents/${documentId}/view`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(502);
  });
});

// Poll the standalone document until its background OCR finishes (confirm
// requires ocrStatus "done" — the review step only exists after OCR).
async function waitForOcrDone(docId, token, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { body } = await request(app)
      .get(`/api/v1/documents/${docId}`)
      .set("Authorization", `Bearer ${token}`);
    if (body.data.ocrStatus === "done" || body.data.ocrStatus === "failed") return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Document ${docId} OCR did not finish within ${timeoutMs}ms`);
}

describe("Document confirm-product endpoint", () => {
  let token;
  let otherToken;
  let documentId;

  beforeAll(async () => {
    // Confirm requires the background OCR to finish "done", so stub fetch
    // (used by fetchStoredFileBytes) — otherwise the OCR download fails and
    // the doc lands on "failed".
    global.fetch = jest.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));
    await startDb();
    const user = await registerUser("Confirm User", `confirm_${Date.now()}@example.com`);
    token = user.token;
    const other = await registerUser("Confirm Other", `confirm_other_${Date.now()}@example.com`);
    otherToken = other.token;
    const upload = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentType: "receipt" });
    documentId = upload.body.data._id;
    await waitForOcrDone(documentId, token);
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    await stopDb();
  });

  test("requires authentication", async () => {
    const response = await request(app).post(
      `/api/v1/documents/${documentId}/confirm-product`
    );
    expect(response.statusCode).toBe(401);
  });

  test("validates the payload (product name required)", async () => {
    const response = await request(app)
      .post(`/api/v1/documents/${documentId}/confirm-product`)
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "   " });
    expect(response.statusCode).toBe(422);
  });

  test("creates a product from the reviewed data and links the document", async () => {
    const response = await request(app)
      .post(`/api/v1/documents/${documentId}/confirm-product`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        productName: "Fridge from scan",
        serialNumber: "SN999",
        purchasePrice: 899.99,
        purchaseStore: "ACME STORE"
      });
    expect(response.statusCode).toBe(201);
    const { product, document } = response.body.data;
    expect(product.productName).toBe("Fridge from scan");
    expect(product.purchasePrice).toBe(899.99);
    expect(product.serialNumber).toBe("SN999");
    expect(product.purchaseStore).toBe("ACME STORE");
    expect(document.productId).toBe(product._id);
  });

  test("rejects confirming an already-linked document", async () => {
    const response = await request(app)
      .post(`/api/v1/documents/${documentId}/confirm-product`)
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "Again" });
    expect(response.statusCode).toBe(409);
  });

  test("rejects confirming before OCR has finished", async () => {
    // manual-type documents are never OCR'd (skipped) — confirm must refuse.
    const upload = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentType: "manual" });
    const response = await request(app)
      .post(`/api/v1/documents/${upload.body.data._id}/confirm-product`)
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "Manual" });
    expect(response.statusCode).toBe(422);
  });

  test("rejects confirming another user's document", async () => {
    const upload = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentType: "receipt" });
    const otherDocId = upload.body.data._id;
    await waitForOcrDone(otherDocId, token);

    const response = await request(app)
      .post(`/api/v1/documents/${otherDocId}/confirm-product`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ productName: "Stolen" });
    expect(response.statusCode).toBe(403);
  });

  test("rejects an expiry date on or before the purchase date", async () => {
    const upload = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentType: "receipt" });
    const docId = upload.body.data._id;
    await waitForOcrDone(docId, token);

    const response = await request(app)
      .post(`/api/v1/documents/${docId}/confirm-product`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        productName: "Fridge",
        purchaseDate: "2027-01-01",
        warrantyExpiryDate: "2026-01-01"
      });
    expect(response.statusCode).toBe(422);
  });

  test("returns 404 for a missing document", async () => {
    const response = await request(app)
      .post(`/api/v1/documents/${new mongoose.Types.ObjectId()}/confirm-product`)
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "Ghost" });
    expect(response.statusCode).toBe(404);
  });
});

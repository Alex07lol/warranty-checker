jest.mock("tesseract.js", () => ({
  createWorker: jest.fn(async () => ({
    recognize: jest.fn(async () => ({ data: { text: mockReceiptText } }))
  }))
}));

// This mock uses the LEGACY v3 req.file shape (includes public_id/secure_url/
// bytes). Kept deliberately different from documents.test.js, which mocks the
// v4 shape ({ path, size, filename } only), so the suite covers BOTH storage
// shapes end to end. Do not "harmonize" these two mocks.
jest.mock("../src/middleware/upload", () => ({
  uploadSingle: (req, res, next) => {
    req.file = {
      original_filename: "receipt.jpg",
      originalname: "receipt.jpg",
      filename: "receipt.jpg",
      path: "https://res.cloudinary.com/test/image/upload/v1/receipt.jpg",
      secure_url: "https://res.cloudinary.com/test/image/upload/v1/receipt.jpg",
      public_id: "test/receipt123",
      bytes: 1024,
      size: 1024,
      mimetype: "image/jpeg"
    };
    return next();
  }
}));

const mongoose = require("mongoose");
const Document = require("../src/models/Document");
const Product = require("../src/models/Product");
const { parseDocumentText, isOcrEligible, processDocument } = require("../src/services/ocr.service");
const { app, request, startDb, stopDb, registerUser } = require("./helpers/setup");

describe("Document OCR fields", () => {
  beforeAll(async () => {
    await startDb();
  });

  afterAll(async () => {
    await stopDb();
  });

  test("defaults ocrStatus to pending", async () => {
    const doc = await Document.create({
      productId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      documentType: "receipt",
      fileName: "receipt.jpg",
      fileUrl: "https://example.com/receipt.jpg",
      publicId: "test/receipt",
      fileSize: 10,
      mimeType: "image/jpeg"
    });
    expect(doc.ocrStatus).toBe("pending");
    expect(doc.ocrText).toBeUndefined();
  });
});

const mockReceiptText = `ACME STORE
S/N: SN1234567890
MFR DATE: 06/15/2025
EXP: 06/15/2027
Item           Price
Refrigerator   $899.99
Total          $899.99
`;

describe("parseDocumentText", () => {
  test("extracts price, serial number, and expiry date", () => {
    const parsed = parseDocumentText(mockReceiptText);
    expect(parsed.purchasePrice).toBe(899.99);
    expect(parsed.serialNumber).toBe("SN1234567890");
    expect(parsed.warrantyExpiryDate.getFullYear()).toBe(2027);
    expect(parsed.warrantyExpiryDate.getMonth()).toBe(5); // June
  });

  test("prefers the expiry-keyword date over the mfr date", () => {
    const parsed = parseDocumentText(mockReceiptText);
    expect(parsed.warrantyExpiryDate.getFullYear()).toBe(2027);
  });

  test("returns nulls when nothing matches", () => {
    const parsed = parseDocumentText("no structured data here");
    expect(parsed.purchasePrice).toBeNull();
    expect(parsed.serialNumber).toBeNull();
    expect(parsed.warrantyExpiryDate).toBeNull();
  });

  test("keeps cents on comma-thousands", () => {
    expect(parseDocumentText("Total $1,299.99").purchasePrice).toBe(1299.99);
  });

  test("prefers the total-line price over an item price", () => {
    const parsed = parseDocumentText("Item           $19.99\nGrand Total    $120.00");
    expect(parsed.purchasePrice).toBe(120);
  });

  test("prefers Total over Subtotal", () => {
    const parsed = parseDocumentText("Subtotal $19.99\nTax $1.00\nTotal $120.00");
    expect(parsed.purchasePrice).toBe(120);
  });
});

describe("isOcrEligible", () => {
  test("only image receipts and warranty cards are eligible", () => {
    expect(isOcrEligible({ documentType: "receipt", mimeType: "image/jpeg" })).toBe(true);
    expect(isOcrEligible({ documentType: "warranty_card", mimeType: "image/png" })).toBe(true);
    expect(isOcrEligible({ documentType: "receipt", mimeType: "application/pdf" })).toBe(false);
    expect(isOcrEligible({ documentType: "product_photo", mimeType: "image/jpeg" })).toBe(false);
  });
});

const originalFetch = global.fetch;

async function waitForDocument(docId, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const doc = await Document.findById(docId);
    if (doc && doc.ocrStatus !== "pending" && doc.ocrStatus !== "processing") {
      return doc;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Document ${docId} did not finish OCR within ${timeoutMs}ms`);
}

describe("processDocument", () => {
  let token;
  let userId;
  let productId;

  beforeAll(async () => {
    // The "Document OCR fields" describe above disconnects the DB in its
    // afterAll, so reconnect here before exercising the API.
    await startDb();
    global.fetch = jest.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));
    const user = await registerUser("OCR User", `ocr_${Date.now()}@example.com`);
    token = user.token;
    userId = user.userId;
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

  test("marks the document done and fills empty product fields", async () => {
    const upload = await request(app)
      .post(`/api/v1/products/${productId}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .send({ documentType: "receipt" });
    expect(upload.statusCode).toBe(201);
    const docId = upload.body.data._id;

    const doc = await waitForDocument(docId);
    expect(doc.ocrStatus).toBe("done");
    expect(doc.ocrText).toContain("ACME STORE");
    expect(doc.parsedData.purchasePrice).toBe(899.99);
    expect(doc.parsedData.serialNumber).toBe("SN1234567890");

    const updatedProduct = await Product.findById(productId);
    expect(updatedProduct.purchasePrice).toBe(899.99);
    expect(updatedProduct.serialNumber).toBe("SN1234567890");
  });

  test("does not overwrite existing product fields", async () => {
    const product = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "Fridge", purchasePrice: 500, serialNumber: "EXISTING" });
    const pid = product.body.data._id;

    const upload = await request(app)
      .post(`/api/v1/products/${pid}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .send({ documentType: "warranty_card" });
    const doc = await waitForDocument(upload.body.data._id);
    expect(doc.ocrStatus).toBe("done");

    const updatedProduct = await Product.findById(pid);
    expect(updatedProduct.purchasePrice).toBe(500);
    expect(updatedProduct.serialNumber).toBe("EXISTING");
  });

  test("does not fill an expiry date that is not after the product purchase date", async () => {
    const product = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "Fridge", purchaseDate: new Date("2025-01-01") });
    const pid = product.body.data._id;

    const doc = await Document.create({
      productId: pid,
      userId,
      documentType: "receipt",
      fileName: "receipt.jpg",
      fileUrl: "https://example.com/receipt.jpg",
      publicId: "test/receipt-ocr",
      fileSize: 10,
      mimeType: "image/jpeg"
    });

    await processDocument(doc, {
      ocrFn: async () => "MFR DATE: 01/01/2024\nEXP: 06/15/2024"
    });

    const updatedProduct = await Product.findById(pid);
    expect(updatedProduct.warrantyExpiryDate).toBeUndefined();
  });

  test("marks non-receipt uploads as skipped without processing", async () => {
    const upload = await request(app)
      .post(`/api/v1/products/${productId}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .send({ documentType: "product_photo" });
    expect(upload.body.data.ocrStatus).toBe("skipped");
  });
});

describe("retry OCR endpoint", () => {
  let token;
  let userId;
  let productId;
  let docId;

  beforeAll(async () => {
    // The "processDocument" describe above restores global.fetch and
    // disconnects the DB in its afterAll, so reconnect and re-stub fetch here.
    await startDb();
    global.fetch = jest.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));
    const user = await registerUser("Retry User", `retry_${Date.now()}@example.com`);
    token = user.token;
    userId = user.userId;
    const product = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "TV" });
    productId = product.body.data._id;
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    await stopDb();
  });

  test("requires authentication", async () => {
    const response = await request(app).post(
      `/api/v1/products/${productId}/documents/000000000000000000000000/ocr`
    );
    expect(response.statusCode).toBe(401);
  });

  test("re-runs OCR and returns the updated document", async () => {
    const upload = await request(app)
      .post(`/api/v1/products/${productId}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .send({ documentType: "receipt" });
    docId = upload.body.data._id;
    await waitForDocument(docId);

    const retry = await request(app)
      .post(`/api/v1/products/${productId}/documents/${docId}/ocr`)
      .set("Authorization", `Bearer ${token}`);
    expect(retry.statusCode).toBe(200);
    expect(retry.body.data.ocrStatus).toBe("done");
    expect(retry.body.data.ocrText).toContain("ACME STORE");
  });

  test("rejects OCR for a skipped document", async () => {
    const upload = await request(app)
      .post(`/api/v1/products/${productId}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .send({ documentType: "manual" });
    const skippedId = upload.body.data._id;

    const retry = await request(app)
      .post(`/api/v1/products/${productId}/documents/${skippedId}/ocr`)
      .set("Authorization", `Bearer ${token}`);
    expect(retry.statusCode).toBe(422);
  });
});

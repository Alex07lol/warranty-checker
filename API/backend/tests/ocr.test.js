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
const { parseDocumentText, parseProductName, parseDate, parsePrice, parseSerial, parseStore, parsePurchaseDate, parseBrand, parseModel, splitProductParts, isOcrEligible, processDocument } = require("../src/services/ocr.service");
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
    expect(parsed.purchaseStore).toBeNull();
    expect(parsed.purchaseDate).toBeNull();
  });

  test("extracts the store and purchase date", () => {
    const parsed = parseDocumentText(mockReceiptText);
    expect(parsed.purchaseStore).toBe("ACME STORE");
    expect(parsed.purchaseDate.getFullYear()).toBe(2025);
    expect(parsed.purchaseDate.getMonth()).toBe(5); // June (MFR DATE)
  });

  test("extracts brand and model", () => {
    const parsed = parseDocumentText(
      "SAMSUNG\nModel No: RF28T5\nRefrigerator   $499.99\nTotal $499.99"
    );
    expect(parsed.brand).toBe("Samsung");
    expect(parsed.model).toBe("RF28T5");
  });

  test("does not mistake the expiry date for the purchase date", () => {
    const parsed = parseDocumentText(mockReceiptText);
    expect(parsed.warrantyExpiryDate.getFullYear()).toBe(2027);
    expect(parsed.purchaseDate.getFullYear()).toBe(2025);
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

describe("parseProductName", () => {
  test("extracts an item name from a receipt line", () => {
    expect(parseProductName("ACME STORE\nRefrigerator   $899.99\nTotal $899.99", "receipt.jpg", "receipt"))
      .toBe("Refrigerator");
  });

  test("prefers a model-like line mixing letters and digits", () => {
    expect(parseProductName("SONY\nWH-1000XM5\nNoise cancelling", "scan.jpg", "warranty_card"))
      .toBe("WH-1000XM5");
  });

  test("falls back to the first plausible non-noise line", () => {
    expect(parseProductName("Thank you for shopping\nSamsung Fridge\nSerial: SN1", "scan.jpg", "receipt"))
      .toBe("Samsung Fridge");
  });

  test("falls back to the file name when OCR text is empty", () => {
    expect(parseProductName("", "sony-wh1000xm5.pdf", "receipt")).toBe("sony wh1000xm5");
  });

  test("returns a generic name as last resort", () => {
    expect(parseProductName("", "receipt.jpg", "receipt")).toBe("Receipt product");
    expect(parseProductName("", "warranty.jpg", "warranty_card")).toBe("Warranty card product");
  });
});

describe("parseBrand", () => {
  test("reads a labeled brand", () => {
    expect(parseBrand("Brand: Samsung\nTotal $5.00")).toBe("Samsung");
    expect(parseBrand("Manufacturer: Whirlpool\nModel: XYZ\nTotal $5.00")).toBe("Whirlpool");
  });

  test("finds a known brand on an item line", () => {
    expect(parseBrand("Samsung Fridge   $499.99\nTotal $499.99")).toBe("Samsung");
  });

  test("skips store-like lines", () => {
    expect(parseBrand("SAMSUNG STORE\nItem\nTotal $5.00")).toBeNull();
    expect(parseBrand("ACME STORE\nTotal $5.00")).toBeNull();
  });

  test("matches whole words only", () => {
    expect(parseBrand("Orange Electronics\nTotal $5.00")).toBeNull();
    expect(parseBrand("Apple Watch   $399.00\nTotal $399.00")).toBe("Apple");
  });

  test("returns null when no brand exists", () => {
    expect(parseBrand("no structured data here")).toBeNull();
  });

  test("ignores footer text that merely mentions brand words", () => {
    // No ":" separator — these must not be read as brand labels.
    expect(parseBrand("Please make sure to keep your receipt\nTotal $5.00")).toBeNull();
    expect(parseBrand("MANUFACTURER WARRANTY: 2 years\nTotal $5.00")).toBeNull();
  });
});

describe("parseModel", () => {
  test("reads a labeled model", () => {
    expect(parseModel("Model No: WH-1000XM5\nTotal $5.00")).toBe("WH-1000XM5");
    expect(parseModel("MODEL NUMBER: XRT-4080\nTotal $5.00")).toBe("XRT-4080");
    expect(parseModel("Item No. 12345B\nTotal $5.00")).toBe("12345B");
  });

  test("finds an unlabeled model-like token", () => {
    expect(parseModel("SONY\nWH-1000XM5\nNoise cancelling")).toBe("WH-1000XM5");
  });

  test("skips serial numbers", () => {
    expect(parseModel("S/N: SN1234567890\nTotal $5.00")).toBeNull();
  });

  test("does not match the word 'type' inside other words", () => {
    expect(parseModel("Typewriter\nTotal $5.00")).toBeNull();
  });

  test("returns null when no model exists", () => {
    expect(parseModel("no structured data here")).toBeNull();
  });
});

describe("splitProductParts", () => {
  test("strips a brand prefix from the name", () => {
    expect(splitProductParts("Samsung Fridge", "Samsung", null)).toEqual({
      productName: "Fridge",
      brand: "Samsung",
      model: null
    });
  });

  test("keeps the name when it is only the model", () => {
    expect(splitProductParts("WH-1000XM5", "Sony", "WH-1000XM5")).toEqual({
      productName: "WH-1000XM5",
      brand: "Sony",
      model: "WH-1000XM5"
    });
  });

  test("keeps a too-short remainder as the name", () => {
    expect(splitProductParts("Samsung", "Samsung", null)).toEqual({
      productName: "Samsung",
      brand: "Samsung",
      model: null
    });
  });

  test("passes through when no brand or model is found", () => {
    expect(splitProductParts("Refrigerator", null, null)).toEqual({
      productName: "Refrigerator",
      brand: null,
      model: null
    });
  });
});

describe("parseStore", () => {
  test("picks the store keyword line", () => {
    expect(parseStore(mockReceiptText)).toBe("ACME STORE");
  });

  test("reads the thank-you footer when present", () => {
    const text = "Item   $10.00\nTotal  $10.00\nThank you for shopping at Best Buy";
    expect(parseStore(text)).toBe("Best Buy");
  });

  test("falls back to the first plausible header line", () => {
    expect(parseStore("WALMART\nItem\nTotal $5.00")).toBe("WALMART");
  });

  test("returns null when no store-like line exists", () => {
    expect(parseStore("Total $5.00\nS/N: ABC123")).toBeNull();
  });
});

describe("warranty certificate formats (label on one line, value on the next)", () => {
  const certText = `Product Name
ApexBook Pro 14
Brand
NexaTech
Model Number
NBP-1402
Serial Number
NTX-84K2-19P7
Purchase Date
15 March 2026
Purchase Price
I74,999.00
Seller
TechPoint Electronics
Warranty Start
15 March 2026
Warranty End
14 March 2028`;

  test("extracts every field from a certificate with values on their own lines", () => {
    const parsed = parseDocumentText(certText);
    expect(parsed.brand).toBe("NexaTech");
    expect(parsed.model).toBe("NBP-1402");
    expect(parsed.serialNumber).toBe("NTX-84K2-19P7");
    expect(parsed.purchasePrice).toBe(74999);
    expect(parsed.purchaseStore).toBe("TechPoint Electronics");
    expect(parsed.purchaseDate.getFullYear()).toBe(2026);
    expect(parsed.purchaseDate.getMonth()).toBe(2); // March
    expect(parsed.warrantyExpiryDate.getFullYear()).toBe(2028);
    expect(parsed.warrantyExpiryDate.getMonth()).toBe(2); // March
    expect(parsed.warrantyExpiryDate.getDate()).toBe(14);
  });

  test("parseDate reads word-month dates and prefers the warranty END over START", () => {
    const d = parseDate("Warranty Start\n15 March 2026\nWarranty End\n14 March 2028");
    expect(d.getFullYear()).toBe(2028);
    expect(d.getMonth()).toBe(2); // March
    expect(d.getDate()).toBe(14);
    const mdy = parseDate("Valid Through March 15, 2028");
    expect(mdy.getFullYear()).toBe(2028);
    expect(mdy.getDate()).toBe(15);
  });

  test("parsePurchaseDate reads a label with the date on the next line", () => {
    const d = parsePurchaseDate("Purchase Date\n15 March 2026");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2); // March
  });

  test("parsePrice reads ₹/bare prices and ignores invoice numbers", () => {
    expect(parsePrice("Purchase Price\nI74,999.00")).toBe(74999);
    expect(parsePrice("TOTAL: ₹4,999.00")).toBe(4999);
    // An invoice number must not become a price.
    expect(parsePrice("Invoice Number\nTP-2026-0315-4821")).toBeNull();
  });

  test("parseSerial reads the value on the next line, not the word Number", () => {
    expect(parseSerial("Serial Number\nNTX-84K2-19P7")).toBe("NTX-84K2-19P7");
  });

  test("parseBrand reads a bare Brand label with the value on the next line", () => {
    expect(parseBrand("Brand\nNexaTech\nTotal $5.00")).toBe("NexaTech");
  });

  test("parseModel reads a bare Model Number label with the value on the next line", () => {
    expect(parseModel("Model Number\nNBP-1402\nTotal $5.00")).toBe("NBP-1402");
  });

  test("parseStore reads a Seller label with the value on the next line", () => {
    expect(parseStore("Seller\nTechPoint Electronics")).toBe("TechPoint Electronics");
  });

  test("parseProductName prefers a labeled Product Name", () => {
    expect(parseProductName("Product Name\nApexBook Pro 14", "cert.pdf", "warranty_card"))
      .toBe("ApexBook Pro 14");
  });
});

describe("parsePurchaseDate", () => {
  test("reads a labeled date (MFR/DATE/PURCHASE)", () => {
    const date = parsePurchaseDate("PURCHASE DATE: 03/15/2026\nEXP: 06/15/2028");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(2); // March
  });

  test("skips expiry lines", () => {
    const date = parsePurchaseDate("WARRANTY EXPIRES 06/15/2028\nSOLD ON 04/01/2026");
    expect(date.getFullYear()).toBe(2026);
  });

  test("prefers an explicit purchase label over an earlier manufacture date", () => {
    const date = parsePurchaseDate(
      "MFR DATE: 06/15/2025\nPURCHASE DATE: 03/15/2026\nEXP: 06/15/2028"
    );
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(2); // March
  });

  test("falls back to the first non-expiry date", () => {
    const date = parsePurchaseDate("06/10/2025\nEXP: 06/15/2028");
    expect(date.getFullYear()).toBe(2025);
  });

  test("returns null when no date exists", () => {
    expect(parsePurchaseDate("no dates here")).toBeNull();
  });
});

describe("isOcrEligible", () => {
  test("image and PDF receipts and warranty cards are eligible", () => {
    expect(isOcrEligible({ documentType: "receipt", mimeType: "image/jpeg" })).toBe(true);
    expect(isOcrEligible({ documentType: "warranty_card", mimeType: "image/png" })).toBe(true);
    expect(isOcrEligible({ documentType: "receipt", mimeType: "application/pdf" })).toBe(true);
    expect(isOcrEligible({ documentType: "warranty_card", mimeType: "application/pdf" })).toBe(true);
    expect(isOcrEligible({ documentType: "product_photo", mimeType: "image/jpeg" })).toBe(false);
    expect(isOcrEligible({ documentType: "manual", mimeType: "application/pdf" })).toBe(false);
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
    expect(updatedProduct.purchaseStore).toBe("ACME STORE");
    expect(updatedProduct.purchaseDate.getFullYear()).toBe(2025);
  });

  test("processes a PDF through the injected PDF-OCR path", async () => {
    // mupdf (the production PDF engine) is ESM-only and jest's CJS runtime
    // cannot load it, so the PDF step is injected here. The real engine is
    // exercised end to end by the live-API PDF smoke check.
    const pdfOcrFn = jest.fn(async () => mockReceiptText);
    const doc = await Document.create({
      productId,
      userId,
      documentType: "receipt",
      fileName: "receipt.pdf",
      fileUrl: "https://example.com/receipt.pdf",
      publicId: "test/receipt-pdf",
      fileSize: 10,
      mimeType: "application/pdf"
    });

    await processDocument(doc, { pdfOcrFn });

    expect(pdfOcrFn).toHaveBeenCalledTimes(1);
    expect(doc.ocrStatus).toBe("done");
    expect(doc.ocrText).toContain("ACME STORE");
    expect(doc.parsedData.purchasePrice).toBe(899.99);
    expect(doc.parsedData.serialNumber).toBe("SN1234567890");
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

  test("fills brand and model on a linked product", async () => {
    const product = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "TV" });
    const pid = product.body.data._id;

    const doc = await Document.create({
      productId: pid,
      userId,
      documentType: "receipt",
      fileName: "tv-receipt.jpg",
      fileUrl: "https://example.com/tv-receipt.jpg",
      publicId: "test/tv-ocr",
      fileSize: 10,
      mimeType: "image/jpeg"
    });

    await processDocument(doc, {
      ocrFn: async () => "SONY\nModel No: XR-65A90\nS/N: TVTEST-1\nTV   $899.99\nTotal $899.99"
    });

    const updated = await Product.findById(pid);
    expect(updated.brand).toBe("Sony");
    expect(updated.model).toBe("XR-65A90");
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

describe("standalone OCR stages product data for confirmation", () => {
  let token;
  let userId;

  beforeAll(async () => {
    await startDb();
    global.fetch = jest.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));
    const user = await registerUser("Standalone User", `standalone_${Date.now()}@example.com`);
    token = user.token;
    userId = user.userId;
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    await stopDb();
  });

  test("completes OCR with parsed data but does not create a product yet", async () => {
    const upload = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentType: "receipt" });
    expect(upload.statusCode).toBe(201);
    expect(upload.body.data.productId).toBeNull();

    const doc = await waitForDocument(upload.body.data._id);
    expect(doc.ocrStatus).toBe("done");
    // The extracted data and a suggested name are staged on the document, but
    // no product exists until the user reviews and confirms the values.
    expect(doc.productId).toBeNull();
    expect(doc.parsedData.purchasePrice).toBe(899.99);
    expect(doc.parsedData.serialNumber).toBe("SN1234567890");
    expect(doc.parsedData.productName).toBe("Refrigerator");
    expect(doc.parsedData.purchaseStore).toBe("ACME STORE");
    expect(await Product.countDocuments({ userId })).toBe(0);
  });

  test("confirm endpoint creates the product with corrected data and links the document", async () => {
    const upload = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentType: "receipt" });
    const docId = upload.body.data._id;
    await waitForDocument(docId);

    const confirm = await request(app)
      .post(`/api/v1/documents/${docId}/confirm-product`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        // The user corrected the OCR-suggested name.
        productName: "Samsung Fridge",
        brand: "Samsung",
        model: "RF28T5",
        serialNumber: "SN1234567890",
        purchasePrice: 899.99,
        purchaseStore: "ACME STORE",
        purchaseDate: "2025-06-15",
        warrantyExpiryDate: "2027-06-15"
      });
    expect(confirm.statusCode).toBe(201);
    const { product, document } = confirm.body.data;
    expect(product.productName).toBe("Samsung Fridge");
    expect(product.brand).toBe("Samsung");
    expect(product.model).toBe("RF28T5");
    expect(product.purchasePrice).toBe(899.99);
    expect(product.serialNumber).toBe("SN1234567890");
    expect(product.purchaseStore).toBe("ACME STORE");
    expect(product.userId.toString()).toBe(userId.toString());
    expect(document.productId.toString()).toBe(product._id.toString());

    const linked = await Document.findById(docId);
    expect(linked.productId.toString()).toBe(product._id.toString());
  });

  test("confirm reuses an existing product with the same serial instead of duplicating", async () => {
    // A product already exists with this serial (e.g. manually entered); the
    // confirmed scan must attach to it rather than create a duplicate.
    const existing = await Product.create({
      userId,
      productName: "Manual Fridge",
      serialNumber: "DEDUPE-12345",
      purchasePrice: 120
    });

    const first = await Document.create({
      userId,
      documentType: "receipt",
      fileName: "first.jpg",
      fileUrl: "https://example.com/first.jpg",
      publicId: "test/dedupe-1",
      fileSize: 10,
      mimeType: "image/jpeg"
    });
    await processDocument(first, { ocrFn: async () => "ACME STORE\nS/N: DEDUPE-12345\nTotal $120.00" });
    expect(first.productId).toBeUndefined(); // staged, not linked

    const confirm = await request(app)
      .post(`/api/v1/documents/${first._id}/confirm-product`)
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "From Scan", serialNumber: "DEDUPE-12345" });
    expect(confirm.statusCode).toBe(201);
    expect(confirm.body.data.product._id.toString()).toBe(existing._id.toString());

    const linked = await Document.findById(first._id);
    expect(linked.productId.toString()).toBe(existing._id.toString());
    const count = await Product.countDocuments({ userId, serialNumber: "DEDUPE-12345" });
    expect(count).toBe(1);
  });

  test("does not create a product when OCR extracts no usable data", async () => {
    const doc = await Document.create({
      userId,
      documentType: "receipt",
      fileName: "receipt.jpg",
      fileUrl: "https://example.com/receipt.jpg",
      publicId: "test/no-data",
      fileSize: 10,
      mimeType: "image/jpeg"
    });
    await processDocument(doc, { ocrFn: async () => "no structured data here" });
    expect(doc.ocrStatus).toBe("done");
    // In-memory doc: the unset path stays undefined (a DB fetch would return
    // null) — either way no product is linked.
    expect(doc.productId).toBeUndefined();
    // A suggestion is staged, but with no strong fields (price/serial/expiry)
    // the confirm step is never offered — nothing is created.
    expect(doc.parsedData.productName).toBeTruthy();
  });

  test("stages brand and model split from the suggested name", async () => {
    const doc = await Document.create({
      userId,
      documentType: "warranty_card",
      fileName: "fridge-card.jpg",
      fileUrl: "https://example.com/fridge-card.jpg",
      publicId: "test/brand-model",
      fileSize: 10,
      mimeType: "image/jpeg"
    });
    await processDocument(doc, {
      ocrFn: async () =>
        "SAMSUNG\nModel No: RF28T5\nS/N: BRANDTEST-1\nRefrigerator   $499.99\nTotal $499.99"
    });
    expect(doc.ocrStatus).toBe("done");
    expect(doc.productId).toBeUndefined();
    expect(doc.parsedData.brand).toBe("Samsung");
    expect(doc.parsedData.model).toBe("RF28T5");
    // The brand was split out of the suggested name.
    expect(doc.parsedData.productName).toBe("Refrigerator");
    expect(doc.parsedData.serialNumber).toBe("BRANDTEST-1");
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

const { app, request, startDb, stopDb, registerUser } = require("./helpers/setup");
const { toCsv, csvEscape } = require("../src/services/export.service");

describe("Warranty claim + export", () => {
  let token;
  let otherToken;
  let productId;
  let ownerUserId;

  beforeAll(async () => {
    await startDb();
    const owner = await registerUser("ExpOwner", `exp_owner_${Date.now()}@example.com`);
    token = owner.token;
    ownerUserId = owner.userId;
    const other = await registerUser("ExpOther", `exp_other_${Date.now()}@example.com`);
    otherToken = other.token;

    const product = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productName: "Bosch Washing Machine",
        brand: "Bosch",
        model: "WAW28460",
        category: "Appliances",
        serialNumber: "BOSCH-77",
        purchaseDate: "2025-02-15",
        purchasePrice: 44999,
        currency: "INR",
        purchaseStore: "Vijay Sales",
        warrantyProvider: "Bosch India",
        warrantyExpiryDate: "2028-02-15",
        lifecycleStatus: "in_use",
        tags: ["laundry", "high value"]
      });
    productId = product.body.data._id;

    await request(app)
      .post(`/api/v1/products/${productId}/service-history`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        serviceDate: "2025-06-01",
        serviceType: "maintenance",
        serviceProvider: "Bosch Care",
        cost: 1200,
        description: "Drum clean + inspection",
        nextServiceDate: "2026-06-01"
      });
  });

  afterAll(async () => {
    await stopDb();
  });

  // ── Claim summary (§15) ──

  test("builds a claim summary with product, service and document metadata", async () => {
    const response = await request(app)
      .get(`/api/v1/products/${productId}/claim`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    const c = response.body.data;
    expect(c.productName).toBe("Bosch Washing Machine");
    expect(c.serialNumber).toBe("BOSCH-77");
    expect(c.purchaseStore).toBe("Vijay Sales");
    expect(c.warrantyProvider).toBe("Bosch India");
    expect(c.warrantyStatus).toBe("active");
    expect(c.serviceHistory).toHaveLength(1);
    expect(c.serviceHistory[0].serviceProvider).toBe("Bosch Care");
    expect(c.documents).toEqual([]);
    // No internal fields leak out.
    expect(c.userId).toBeUndefined();
    expect(c.isDeleted).toBeUndefined();
  });

  test("denies claim summary for another user's product", async () => {
    const response = await request(app)
      .get(`/api/v1/products/${productId}/claim`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(response.statusCode).toBe(403);
  });

  test("requires authentication for claim summary", async () => {
    const response = await request(app).get(`/api/v1/products/${productId}/claim`);
    expect(response.statusCode).toBe(401);
  });

  // ── Export (§16) ──

  test("exports products as JSON without internal fields", async () => {
    const response = await request(app)
      .get("/api/v1/export/products?format=json")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["content-disposition"]).toContain("attachment");
    const data = JSON.parse(response.text);
    expect(data.count).toBeGreaterThanOrEqual(1);
    const product = data.products.find((p) => p._id === productId);
    expect(product.serialNumber).toBe("BOSCH-77");
    expect(product.serviceHistory).toHaveLength(1);
    // Internal fields must never leak into the download.
    expect(product.userId).toBeUndefined();
    expect(product.isDeleted).toBeUndefined();
    expect(product.__v).toBeUndefined();
  });

  test("exports products as CSV with escaped values", async () => {
    // Add a product whose name contains a comma + quotes to prove escaping.
    await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productName: "Escaped, \"quoted\" product"
      });

    const response = await request(app)
      .get("/api/v1/export/products?format=csv")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    const text = response.text;
    expect(text.split("\n")[0]).toBe(
      "productName,brand,model,category,serialNumber,purchaseDate,purchasePrice,currency,purchaseStore,warrantyExpiryDate,lifecycleStatus,serviceHistory"
    );
    expect(text).toContain('"Escaped, ""quoted"" product"');
    // Excluded fields must never appear as columns.
    expect(text).not.toContain("notes");
    expect(text).not.toContain("tags");
    expect(text).not.toContain("warranties");
    expect(text).not.toContain("documents");
    expect(text).not.toContain("warrantyProvider");
  });

  test("exports products as ODS (attachment headers + valid zip bytes)", async () => {
    const response = await request(app)
      .get("/api/v1/export/products?format=ods")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/vnd.oasis.opendocument.spreadsheet");
    expect(response.headers["content-disposition"]).toContain(".ods");

    // Byte-level validation goes through the service, whose returned body the
    // controller sends verbatim (supertest's default parser discards binary
    // bodies for this media type, so it cannot assert on the wire bytes).
    const service = require("../src/services/export.service.js");
    const file = await service.exportProducts(ownerUserId, "ods");
    expect(file.extension).toBe("ods");
    expect(file.mimeType).toBe("application/vnd.oasis.opendocument.spreadsheet");
    const buf = file.body;
    expect(Buffer.isBuffer(buf)).toBe(true);
    // ZIP local-file-header magic ("PK\x03\x04")
    expect(buf.slice(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    // End-of-central-directory magic must be present near the tail.
    expect(buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBeGreaterThan(0);
    // Entries are DEFLATE-compressed; the first entry must be the mimetype,
    // whose inflated contents state the ODS media type.
    const zlib = require("node:zlib");
    const nameLen = buf.readUInt16LE(26);
    const extraLen = buf.readUInt16LE(28);
    const compressedSize = buf.readUInt32LE(18);
    const dataStart = 30 + nameLen + extraLen;
    expect(buf.subarray(30, 30 + nameLen).toString("utf8")).toBe("mimetype");
    const mimetype = zlib.inflateRawSync(buf.subarray(dataStart, dataStart + compressedSize)).toString("utf8");
    expect(mimetype).toBe("application/vnd.oasis.opendocument.spreadsheet");
  });

  test("ODS contains bold header row and one row per product", async () => {
    const { buildOds, ODS_HEADERS, CSV_HEADERS } = require("../src/services/export.service");
    const buf = buildOds([
      { productName: "A", brand: "B", purchasePrice: 10 },
      { productName: "C", brand: "D", purchasePrice: 20 }
    ]);
    const zlib = require("node:zlib");
    // Extract content.xml from the zip by scanning local headers.
    let xml = "";
    let off = 0;
    while (off < buf.length - 4) {
      if (buf.readUInt32LE(off) !== 0x04034b50) break;
      const nameLen = buf.readUInt16LE(off + 26);
      const extraLen = buf.readUInt16LE(off + 28);
      const compSize = buf.readUInt32LE(off + 18);
      const name = buf.subarray(off + 30, off + 30 + nameLen).toString("utf8");
      const dataStart = off + 30 + nameLen + extraLen;
      if (name === "content.xml") {
        xml = zlib.inflateRawSync(buf.subarray(dataStart, dataStart + compSize)).toString("utf8");
      }
      off = dataStart + compSize;
    }
    expect(xml).toContain("fo:font-weight=\"bold\"");
    expect(xml).toContain(ODS_HEADERS[0]);
    expect(xml).toContain("table:table-row");
    expect(xml.match(/<table:table-row>/g).length).toBe(3); // header + 2 rows
    // Excluded fields never appear in the sheet.
    for (const h of ["notes", "tags", "warranties", "documents", "warrantyProvider"]) {
      expect(CSV_HEADERS).not.toContain(h);
    }
  });

  test("exports products as PDF with attachment headers and valid PDF 1.4 bytes", async () => {
    const response = await request(app)
      .get("/api/v1/export/products?format=pdf")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain(".pdf");
    expect(response.headers["content-disposition"]).toContain("attachment");

    const service = require("../src/services/export.service.js");
    const file = await service.exportProducts(ownerUserId, "pdf");
    expect(file.extension).toBe("pdf");
    expect(file.mimeType).toBe("application/pdf");
    const buf = file.body;
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 8).toString("utf8")).toBe("%PDF-1.4");
    expect(buf.toString("utf8")).toContain("%%EOF");
    expect(buf.toString("utf8")).toContain("/Type /Catalog");
    expect(buf.toString("utf8")).toContain("/Type /Pages");
    expect(buf.toString("utf8")).toContain("/Type /Page");
    // Outer box stroke and fill
    expect(buf.toString("utf8")).toContain("36 36 523.28 769.89 re f");
    expect(buf.toString("utf8")).toContain("36 36 523.28 769.89 re S");
    // Product details inside the box
    expect(buf.toString("utf8")).toContain("Bosch Washing Machine");
    expect(buf.toString("utf8")).toContain("BOSCH-77");
    expect(buf.toString("utf8")).toContain("Bosch India");
    expect(buf.toString("utf8")).toContain("Bosch Care");
  });

  test("PDF export produces multi-page document with dedicated page per product", () => {
    const { buildPdf } = require("../src/services/export.service.js");
    const serviceMap = new Map();
    serviceMap.set("1", [{ serviceDate: "2025-01-01", serviceType: "repair", serviceProvider: "FixIt", cost: 50 }]);
    const buf = buildPdf([
      { _id: "1", productName: "Item One", serialNumber: "SN-001" },
      { _id: "2", productName: "Item Two", serialNumber: "SN-002" },
      { _id: "3", productName: "Item Three", serialNumber: "SN-003" }
    ], serviceMap);

    const text = buf.toString("utf8");
    expect(text).toContain("/Count 3");
    expect(text).toContain("Item One");
    expect(text).toContain("Item Two");
    expect(text).toContain("Item Three");
    expect(text).toContain("Page 1 of 3");
    expect(text).toContain("Page 2 of 3");
    expect(text).toContain("Page 3 of 3");
    expect(text).toContain("FixIt");
  });

  test("PDF export renders clean empty-state page when vault has 0 products", async () => {
    const service = require("../src/services/export.service.js");
    const otherUser = await registerUser("EmptyVaultUser", `empty_vault_${Date.now()}@example.com`);
    const file = await service.exportProducts(otherUser.userId, "pdf");
    expect(file.mimeType).toBe("application/pdf");
    const text = file.body.toString("utf8");
    expect(text).toContain("/Count 1");
    expect(text).toContain("NO PRODUCTS IN VAULT");
    expect(text).toContain("36 36 523.28 769.89 re S");
  });

  test("pdfEscape sanitizes parenthesis, backslashes and currency symbols", () => {
    const { pdfEscape } = require("../src/services/export.service.js");
    expect(pdfEscape("Test (Value) & \\Slash\\")).toBe("Test \\(Value\\) & \\\\Slash\\\\");
    expect(pdfEscape("Price: ₹500")).toBe("Price: INR 500");
    expect(pdfEscape(null)).toBe("");
  });

  test("export defaults to JSON when format is missing or unknown", async () => {
    const defaulted = await request(app)
      .get("/api/v1/export/products")
      .set("Authorization", `Bearer ${token}`);
    expect(defaulted.headers["content-type"]).toContain("application/json");
    const unknown = await request(app)
      .get("/api/v1/export/products?format=xml")
      .set("Authorization", `Bearer ${token}`);
    expect(unknown.headers["content-type"]).toContain("application/json");
  });

  test("export never includes another user's products", async () => {
    const response = await request(app)
      .get("/api/v1/export/products?format=json")
      .set("Authorization", `Bearer ${otherToken}`);
    const data = JSON.parse(response.text);
    expect(data.count).toBe(0);
    expect(data.products).toEqual([]);
  });

  test("requires authentication for export", async () => {
    const response = await request(app).get("/api/v1/export/products");
    expect(response.statusCode).toBe(401);
  });

  // ── Import (CSV / JSON) ──

  test("imports products from a JSON file", async () => {
    const payload = {
      products: [
        { productName: "Imported A", brand: "BrandA", purchasePrice: 100, serialNumber: `IMP-A-${Date.now()}` },
        { productName: "Imported B", brand: "BrandB", purchasePrice: 200, serialNumber: `IMP-B-${Date.now()}` }
      ]
    };
    const response = await request(app)
      .post("/api/v1/export/products/import")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from(JSON.stringify(payload)), "import.json");
    expect(response.statusCode).toBe(200);
    expect(response.body.data.imported).toBe(2);
    expect(response.body.data.failed).toBe(0);
  });

  test("imports products from a CSV file and skips duplicate serials", async () => {
    const serial = `IMP-C-${Date.now()}`;
    const csv = [
      "productName,brand,serialNumber,purchasePrice,lifecycleStatus",
      `Imported C,BrandC,${serial},50,in_use`,
      `Imported D,BrandD,${serial},60,owned`,
      ",BrandE,,70,owned"
    ].join("\n");
    const response = await request(app)
      .post("/api/v1/export/products/import")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from(csv), "import.csv");
    expect(response.statusCode).toBe(200);
    expect(response.body.data.imported).toBe(1);
    expect(response.body.data.duplicates).toBe(1);
    expect(response.body.data.failed).toBe(1); // missing productName
    // Invalid lifecycle falls back to owned with a warning.
    const badLifecycle = await request(app)
      .post("/api/v1/export/products/import")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("productName,serialNumber,lifecycleStatus\nImported E,IMP-E-1,weird"), "import2.csv");
    expect(badLifecycle.body.data.imported).toBe(1);
    expect(badLifecycle.body.data.results[0].warnings[0]).toContain("lifecycleStatus");
  });

  test("import never writes into another user's vault and round-trips", async () => {
    // Import a unique product as `other`, then export as `other` and find it.
    const serial = `IMP-OTHER-${Date.now()}`;
    const response = await request(app)
      .post("/api/v1/export/products/import")
      .set("Authorization", `Bearer ${otherToken}`)
      .attach("file", Buffer.from(JSON.stringify({ productName: "Other's import", serialNumber: serial })), "import.json");
    expect(response.body.data.imported).toBe(1);

    const csvExport = await request(app)
      .get("/api/v1/export/products?format=csv")
      .set("Authorization", `Bearer ${otherToken}`);
    expect(csvExport.text).toContain("Other's import");
    // ...and the owner must NOT see it.
    const ownerExport = await request(app)
      .get("/api/v1/export/products?format=json")
      .set("Authorization", `Bearer ${token}`);
    expect(JSON.stringify(JSON.parse(ownerExport.text).products.map((p) => p.serialNumber))).not.toContain(serial);
  });

  test("rejects import without a file or with an unsupported type", async () => {
    const noFile = await request(app)
      .post("/api/v1/export/products/import")
      .set("Authorization", `Bearer ${token}`);
    expect([400, 422]).toContain(noFile.statusCode);

    const badType = await request(app)
      .post("/api/v1/export/products/import")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("MZ fake binary"), "evil.exe");
    expect([400, 422, 500]).toContain(badType.statusCode);
  });

  test("requires authentication for import", async () => {
    const response = await request(app)
      .post("/api/v1/export/products/import")
      .attach("file", Buffer.from("productName\nX"), "x.csv");
    expect(response.statusCode).toBe(401);
  });

  // ── CSV helpers (unit) ──

  test("csvEscape quotes only when needed and doubles quotes", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line\nbreak")).toBe('"line\nbreak"');
  });

  test("csvEscape neutralizes formula injection", () => {
    // Excel/Sheets treat a leading = + - @ (or tab) as a formula.
    // Value with quotes gets RFC-4180 quoted on top of the apostrophe guard;
    // the parsed cell still starts with ' so Excel treats it as text.
    expect(csvEscape("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvEscape("@cmd")).toBe("'@cmd");
    expect(csvEscape("+SUM(A1:A9)")).toBe("'+SUM(A1:A9)");
    expect(csvEscape("-2+3")).toBe("'-2+3");
    // Legitimate values are untouched.
    expect(csvEscape("2025-01-01")).toBe("2025-01-01");
    expect(csvEscape("Bosch Washing Machine")).toBe("Bosch Washing Machine");
  });

  test("toCsv emits a header row and escaped rows", () => {
    const csv = toCsv(
      [
        { name: "A", note: "x,y" },
        { name: 'B "q"', note: "z" }
      ],
      ["name", "note"]
    );
    const lines = csv.split("\n");
    expect(lines[0]).toBe("name,note");
    expect(lines[1]).toBe('A,"x,y"');
    expect(lines[2]).toBe('"B ""q""",z');
  });
});

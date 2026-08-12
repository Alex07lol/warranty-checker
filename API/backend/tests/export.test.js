const { app, request, startDb, stopDb, registerUser } = require("./helpers/setup");
const { toCsv, csvEscape } = require("../src/services/export.service");

describe("Warranty claim + export", () => {
  let token;
  let otherToken;
  let productId;

  beforeAll(async () => {
    await startDb();
    const owner = await registerUser("ExpOwner", `exp_owner_${Date.now()}@example.com`);
    token = owner.token;
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
    // Add a product whose notes contain a comma + quotes to prove escaping.
    await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productName: "Escaped, \"quoted\" product",
        notes: "needs, \"care\""
      });

    const response = await request(app)
      .get("/api/v1/export/products?format=csv")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    const text = response.text;
    expect(text.split("\n")[0]).toBe(
      "productName,brand,model,category,serialNumber,purchaseDate,purchasePrice,currency,purchaseStore,warrantyProvider,warrantyExpiryDate,lifecycleStatus,tags,warranties,serviceHistory,documents,notes"
    );
    expect(text).toContain('"Escaped, ""quoted"" product"');
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

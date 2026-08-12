const { app, request, startDb, stopDb, registerUser } = require("./helpers/setup");

describe("Product API", () => {
  let token;
  let otherToken;
  let productId;

  beforeAll(async () => {
    await startDb();
    const owner = await registerUser("Owner", `owner_${Date.now()}@example.com`);
    token = owner.token;
    const other = await registerUser("Other", `other_${Date.now()}@example.com`);
    otherToken = other.token;
  });

  afterAll(async () => {
    await stopDb();
  });

  const validProduct = () => ({
    productName: "Refrigerator",
    brand: "Samsung",
    model: "RF28",
    category: "Appliances",
    purchaseDate: "2025-01-01",
    purchasePrice: 54999.5,
    currency: "INR",
    purchaseStore: "Croma",
    serialNumber: "SN12345",
    warrantyExpiryDate: "2028-01-01",
    warrantyPeriodMonths: 36,
    notes: "Keep receipt"
  });

  test("requires authentication", async () => {
    const response = await request(app).get("/api/v1/products");
    expect(response.statusCode).toBe(401);
  });

  test("creates a product", async () => {
    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(validProduct());
    expect(response.statusCode).toBe(201);
    expect(response.body.data.productName).toBe("Refrigerator");
    productId = response.body.data._id;
  });

  test("validates product payload", async () => {
    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "" });
    expect(response.statusCode).toBe(422);
  });

  test("rejects expiry before purchase date", async () => {
    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productName: "Bad Dates",
        purchaseDate: "2025-06-01",
        warrantyExpiryDate: "2025-01-01"
      });
    expect(response.statusCode).toBe(422);
  });

  test("lists products with pagination", async () => {
    const response = await request(app)
      .get("/api/v1/products?page=1&limit=10")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.products.length).toBeGreaterThanOrEqual(1);
    expect(response.body.data.total).toBeGreaterThanOrEqual(1);
    expect(response.body.data.page).toBe(1);
  });

  test("gets a product by id", async () => {
    const response = await request(app)
      .get(`/api/v1/products/${productId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data._id).toBe(productId);
  });

  test("updates a product", async () => {
    const response = await request(app)
      .put(`/api/v1/products/${productId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ brand: "Samsung Electronics" });
    expect(response.statusCode).toBe(200);
    expect(response.body.data.brand).toBe("Samsung Electronics");
  });

  test("prevents updating another user's product", async () => {
    const response = await request(app)
      .put(`/api/v1/products/${productId}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ brand: "Hacked" });
    expect(response.statusCode).toBe(403);
  });

  test("prevents deleting another user's product", async () => {
    const response = await request(app)
      .delete(`/api/v1/products/${productId}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(response.statusCode).toBe(403);
  });

  test("searches products", async () => {
    const response = await request(app)
      .get("/api/v1/products/search?q=Refrigerator")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.length).toBeGreaterThanOrEqual(1);
  });

  test("returns empty search for unknown query", async () => {
    const response = await request(app)
      .get("/api/v1/products/search?q=zzzzzz")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data).toHaveLength(0);
  });

  test("lists expiring soon products", async () => {
    const near = new Date();
    near.setDate(near.getDate() + 7);
    await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productName: "AC Unit",
        purchaseDate: "2025-01-01",
        warrantyExpiryDate: near.toISOString()
      });

    const response = await request(app)
      .get("/api/v1/products/expiring-soon")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    expect(response.body.data[0].productName).toBe("AC Unit");
  });

  test("soft-deletes a product", async () => {
    const response = await request(app)
      .delete(`/api/v1/products/${productId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);

    const after = await request(app)
      .get(`/api/v1/products/${productId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(after.statusCode).toBe(404);
  });

  test("returns 400 for invalid product id", async () => {
    const response = await request(app)
      .get("/api/v1/products/not-a-valid-id")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(400);
  });

  // ── Phase 4: warranty provider, lifecycle state, multiple periods ──

  test("creates a product with warranty provider + lifecycle fields", async () => {
    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productName: "Sony WH-1000XM5",
        brand: "Sony",
        warrantyProvider: "Sony India",
        warrantyProviderType: "manufacturer",
        warrantyContact: "1800-123-4567",
        warrantyWebsite: "https://www.sony.co.in/electronics/support",
        lifecycleStatus: "in_use",
        purchaseDate: "2025-02-01",
        warrantyExpiryDate: "2026-02-01"
      });
    expect(response.statusCode).toBe(201);
    expect(response.body.data.warrantyProvider).toBe("Sony India");
    expect(response.body.data.warrantyProviderType).toBe("manufacturer");
    expect(response.body.data.warrantyContact).toBe("1800-123-4567");
    expect(response.body.data.warrantyWebsite).toBe("https://www.sony.co.in/electronics/support");
    expect(response.body.data.lifecycleStatus).toBe("in_use");
  });

  test("lifecycle status defaults to owned when omitted", async () => {
    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "Default Lifecycle" });
    expect(response.statusCode).toBe(201);
    expect(response.body.data.lifecycleStatus).toBe("owned");
  });

  test("rejects an invalid lifecycle status", async () => {
    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "Bad Lifecycle", lifecycleStatus: "alien" });
    expect(response.statusCode).toBe(422);
  });

  test("rejects an invalid warranty provider type", async () => {
    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "Bad Provider", warrantyProviderType: "reseller" });
    expect(response.statusCode).toBe(422);
  });

  test("creates a product with multiple warranty periods", async () => {
    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productName: "Dual Warranty Fridge",
        purchaseDate: "2025-01-15",
        warranties: [
          {
            type: "Standard warranty",
            provider: "Samsung",
            startDate: "2025-01-15",
            expiryDate: "2026-01-15",
            coverage: "Parts and labour"
          },
          {
            type: "Extended warranty",
            provider: "Croma Assure",
            startDate: "2026-01-15",
            expiryDate: "2028-01-15",
            coverage: "Compressor"
          }
        ]
      });
    expect(response.statusCode).toBe(201);
    expect(response.body.data.warranties).toHaveLength(2);
    expect(response.body.data.warranties[0].type).toBe("Standard warranty");
    expect(response.body.data.warranties[1].expiryDate).toBeDefined();
  });

  test("rejects a warranty period whose expiry precedes its start", async () => {
    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productName: "Bad Period",
        warranties: [
          { type: "Standard", startDate: "2026-01-15", expiryDate: "2025-01-15" }
        ]
      });
    expect(response.statusCode).toBe(422);
  });

  test("normalizes blank warranty rows away", async () => {
    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productName: "Blank Rows",
        warranties: [{ type: "", provider: "", coverage: "" }, { type: "Real", expiryDate: "2027-01-01" }]
      });
    expect(response.statusCode).toBe(201);
    expect(response.body.data.warranties).toHaveLength(1);
    expect(response.body.data.warranties[0].type).toBe("Real");
  });

  test("updates warranty provider + lifecycle on an existing product", async () => {
    const created = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "Updatable Product" });
    const id = created.body.data._id;

    const response = await request(app)
      .put(`/api/v1/products/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        lifecycleStatus: "sold",
        warrantyProvider: "Resale buyer",
        warranties: [{ type: "Transferred", startDate: "2025-03-01", expiryDate: "2027-03-01" }]
      });
    expect(response.statusCode).toBe(200);
    expect(response.body.data.lifecycleStatus).toBe("sold");
    expect(response.body.data.warrantyProvider).toBe("Resale buyer");
    expect(response.body.data.warranties[0].type).toBe("Transferred");
  });

  test("legacy products without Phase 4 fields still round-trip", async () => {
    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(validProduct());
    expect(response.statusCode).toBe(201);
    expect(response.body.data.warrantyExpiryDate).toBeDefined();
    expect(response.body.data.warranties).toEqual([]);
    expect(response.body.data.lifecycleStatus).toBe("owned");
  });

  // ── Phase 4 §12: user-scoped tags ──

  test("creates a product with normalized tags", async () => {
    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productName: "Tagged TV",
        tags: ["  Home ", "Living Room", "home", "", "GAMING"]
      });
    expect(response.statusCode).toBe(201);
    // Lower-cased + trimmed + deduped; blanks dropped.
    expect(response.body.data.tags).toEqual(["home", "living room", "gaming"]);
  });

  test("rejects too many tags", async () => {
    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productName: "Tag Flood",
        tags: Array.from({ length: 21 }, (_, i) => `tag${i}`)
      });
    expect(response.statusCode).toBe(422);
  });

  test("updates tags on an existing product", async () => {
    const created = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "Tag Update" });
    const id = created.body.data._id;

    const response = await request(app)
      .put(`/api/v1/products/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tags: ["Kitchen", "High Value"] });
    expect(response.statusCode).toBe(200);
    expect(response.body.data.tags).toEqual(["kitchen", "high value"]);
  });

  test("filters products by tag (repeat param ANDs tags)", async () => {
    await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "Kitchen Gadget", tags: ["kitchen", "gadget"] });

    const both = await request(app)
      .get("/api/v1/products?tags=kitchen&tags=gadget")
      .set("Authorization", `Bearer ${token}`);
    expect(both.statusCode).toBe(200);
    expect(both.body.data.products.some((p) => p.productName === "Kitchen Gadget")).toBe(true);

    // AND semantics: a product with only one of the tags must not match.
    await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "Kitchen Only", tags: ["kitchen"] });
    const kitchenOnly = await request(app)
      .get("/api/v1/products?tags=kitchen&tags=gadget")
      .set("Authorization", `Bearer ${token}`);
    expect(kitchenOnly.body.data.products.some((p) => p.productName === "Kitchen Only")).toBe(false);
  });

  // ── Phase 4 §9: advanced filtering ──

  test("filters products by lifecycle status and category", async () => {
    const response = await request(app)
      .get("/api/v1/products?lifecycleStatus=in_use&category=Appliances")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.products.every((p) => p.lifecycleStatus === "in_use" && p.category === "Appliances")).toBe(true);
  });

  test("filters products by warranty status (expiring_soon)", async () => {
    const response = await request(app)
      .get("/api/v1/products?warrantyStatus=expiring_soon")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    // Every returned product must be in the expiring window (or have no
    // matching expiry at all — filtered out entirely).
    expect(response.body.data.products.every((p) => {
      if (!p.warrantyExpiryDate) return false;
      const days = (new Date(p.warrantyExpiryDate) - Date.now()) / 86400000;
      return days >= 0 && days <= 30;
    })).toBe(true);
  });

  test("filters products by price range", async () => {
    const response = await request(app)
      .get("/api/v1/products?minPrice=1000&maxPrice=60000")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.products.every((p) =>
      p.purchasePrice == null || (p.purchasePrice >= 1000 && p.purchasePrice <= 60000)
    )).toBe(true);
  });

  test("filters products by purchase date range", async () => {
    const response = await request(app)
      .get("/api/v1/products?purchaseFrom=2025-01-01&purchaseTo=2025-12-31")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.products.every((p) => {
      if (!p.purchaseDate) return false;
      const d = new Date(p.purchaseDate).getTime();
      return d >= new Date("2025-01-01").getTime() && d <= new Date("2025-12-31T23:59:59").getTime();
    })).toBe(true);
  });

  test("filters products by brand", async () => {
    const response = await request(app)
      .get("/api/v1/products?brand=Samsung")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.products.every((p) => p.brand === "Samsung")).toBe(true);
  });

  test("combines multiple filters safely", async () => {
    // A combination that should match the expiring AC Unit created earlier
    // plus anything else that fits; assert the response is well-formed and
    // every row satisfies BOTH constraints.
    const response = await request(app)
      .get("/api/v1/products?lifecycleStatus=owned&brand=Samsung&minPrice=0&maxPrice=100000")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.products.every((p) =>
      p.lifecycleStatus === "owned" && p.brand === "Samsung"
    )).toBe(true);
  });

  test("filters never leak another user's products", async () => {
    const response = await request(app)
      .get("/api/v1/products?category=Appliances")
      .set("Authorization", `Bearer ${otherToken}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.products.length).toBe(0);
  });

  test("search finds products by serial number", async () => {
    const response = await request(app)
      .get("/api/v1/products/search?q=SN12345")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.some((p) => p.serialNumber === "SN12345")).toBe(true);
  });

  test("search finds products by tag", async () => {
    const response = await request(app)
      .get("/api/v1/products/search?q=gaming")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.some((p) => Array.isArray(p.tags) && p.tags.includes("gaming"))).toBe(true);
  });
});

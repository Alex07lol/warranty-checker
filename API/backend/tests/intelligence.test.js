// Phase 4 §19 — deterministic warranty intelligence.
// Unit tests for the pure analysis functions plus API-level ownership checks
// for GET /api/v1/products/:id/intelligence.
const { app, request, startDb, stopDb, registerUser } = require("./helpers/setup");
const {
  findConflicts,
  findMissingInfo,
  findDuplicates
} = require("../src/services/intelligence.service");

describe("Warranty intelligence — unit", () => {
  test("flags expiry before purchase date", () => {
    const findings = findConflicts({
      purchaseDate: "2025-01-12",
      warrantyExpiryDate: "2025-01-05"
    });
    expect(findings.length).toBe(1);
    expect(findings[0].type).toBe("conflict");
    expect(findings[0].severity).toBe("warning");
  });

  test("flags a coverage period whose expiry precedes its start", () => {
    const findings = findConflicts({
      warranties: [
        { type: "Extended", startDate: "2026-01-01", expiryDate: "2025-12-01" }
      ]
    });
    expect(findings.length).toBe(1);
    expect(findings[0].title).toContain("reversed");
  });

  test("finds no conflicts for consistent dates", () => {
    const findings = findConflicts({
      purchaseDate: "2025-01-01",
      warrantyExpiryDate: "2028-01-01",
      warranties: [{ startDate: "2025-01-01", expiryDate: "2026-01-01" }]
    });
    expect(findings).toEqual([]);
  });

  test("suggests adding an expiry when none exists anywhere", () => {
    const findings = findMissingInfo({ productName: "Thing", warranties: [] });
    expect(findings.some((f) => f.title === "No warranty expiry set")).toBe(true);
  });

  test("does not nag about expiry when a coverage period has one", () => {
    const findings = findMissingInfo({
      warranties: [{ expiryDate: "2027-01-01" }]
    });
    expect(findings.some((f) => f.title === "No warranty expiry set")).toBe(false);
  });

  test("suggests a purchase date when expiry exists but purchase is missing", () => {
    const findings = findMissingInfo({ warrantyExpiryDate: "2027-01-01" });
    expect(findings.some((f) => f.title === "Purchase date missing")).toBe(true);
  });

  test("detects duplicates by identical serial number", () => {
    const self = { _id: "a", productName: "Laptop", serialNumber: "SN123" };
    const others = [
      { _id: "b", productName: "Laptop (2nd)", serialNumber: "SN123", brand: "X", model: "Y", purchaseStore: "Z" }
    ];
    const findings = findDuplicates(self, others);
    expect(findings.length).toBe(1);
    expect(findings[0].type).toBe("duplicate");
    expect(findings[0].targetId).toBe("b");
  });

  test("detects duplicates by brand + model + store within 90 days", () => {
    const self = { _id: "a", brand: "Samsung", model: "RF28", purchaseStore: "Croma", purchaseDate: "2025-01-01" };
    const others = [
      { _id: "b", productName: "Samsung fridge", brand: "Samsung", model: "RF28", purchaseStore: "Croma", purchaseDate: "2025-02-01" }
    ];
    const findings = findDuplicates(self, others);
    expect(findings.length).toBe(1);
    expect(findings[0].message).toContain("days apart");
  });

  test("never flags itself or unrelated products", () => {
    const self = { _id: "a", brand: "Samsung", model: "RF28", purchaseStore: "Croma", purchaseDate: "2025-01-01" };
    const others = [
      { _id: "a", productName: "self", brand: "Samsung", model: "RF28", purchaseStore: "Croma", purchaseDate: "2025-01-01" },
      { _id: "c", productName: "LG TV", brand: "LG", model: "OLED65", purchaseStore: "Amazon", purchaseDate: "2025-01-01" }
    ];
    expect(findDuplicates(self, others)).toEqual([]);
  });
});

describe("Product intelligence API", () => {
  let token;
  let otherToken;
  let productId;

  beforeAll(async () => {
    await startDb();
    const owner = await registerUser("IntOwner", `int_owner_${Date.now()}@example.com`);
    token = owner.token;
    const other = await registerUser("IntOther", `int_other_${Date.now()}@example.com`);
    otherToken = other.token;

    // A duplicate pair: same brand + model + store, purchased ~30 days apart
    // (serials must differ — the schema enforces unique serials per user).
    const first = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productName: "Headphones", brand: "Sony", model: "WH-1000XM5",
        purchaseStore: "Croma", purchaseDate: "2025-01-10",
        serialNumber: "SN-INT-1", warrantyExpiryDate: "2027-01-01"
      });
    productId = first.body.data._id;
    await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productName: "Headphones spare", brand: "Sony", model: "WH-1000XM5",
        purchaseStore: "Croma", purchaseDate: "2025-02-10",
        serialNumber: "SN-INT-2", warrantyExpiryDate: "2027-01-01"
      });
  });

  afterAll(async () => {
    await stopDb();
  });

  test("requires authentication", async () => {
    const response = await request(app).get(`/api/v1/products/${productId}/intelligence`);
    expect(response.statusCode).toBe(401);
  });

  test("denies another user's product", async () => {
    const response = await request(app)
      .get(`/api/v1/products/${productId}/intelligence`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(response.statusCode).toBe(403);
  });

  test("returns findings for the owner", async () => {
    const response = await request(app)
      .get(`/api/v1/products/${productId}/intelligence`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    const findings = response.body.data.findings;
    expect(Array.isArray(findings)).toBe(true);
    expect(findings.some((f) => f.type === "duplicate")).toBe(true);
  });
});

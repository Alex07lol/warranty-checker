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
    expect(response.body.data.length).toBe(0);
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
});

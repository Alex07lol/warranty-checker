const { app, request, startDb, stopDb, registerUser } = require("./helpers/setup");

describe("Dashboard API", () => {
  let token;
  let userId;

  beforeAll(async () => {
    await startDb();
    const user = await registerUser("Dashboard User", `dash_${Date.now()}@example.com`);
    token = user.token;
    userId = user.userId;
  });

  afterAll(async () => {
    await stopDb();
  });

  test("requires authentication", async () => {
    const response = await request(app).get("/api/v1/dashboard");
    expect(response.statusCode).toBe(401);
  });

  test("returns dashboard metrics for empty account", async () => {
    const response = await request(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.totalProducts).toBe(0);
    expect(response.body.data.expiringSoonCount).toBe(0);
    expect(response.body.data.totalDocuments).toBe(0);
    expect(response.body.data.unreadNotificationsCount).toBe(0);
    expect(Array.isArray(response.body.data.recentProducts)).toBe(true);
    expect(Array.isArray(response.body.data.expiringSoon)).toBe(true);
  });

  test("reflects seeded products, documents and notifications", async () => {
    const near = new Date();
    near.setDate(near.getDate() + 5);

    const product = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productName: "Washing Machine",
        purchaseDate: "2025-01-01",
        warrantyExpiryDate: near.toISOString()
      });
    const productId = product.body.data._id;

    await request(app)
      .post(`/api/v1/products/${productId}/service-history`)
      .set("Authorization", `Bearer ${token}`)
      .send({ serviceDate: "2025-05-01", serviceType: "maintenance" });

    const response = await request(app)
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.totalProducts).toBe(1);
    expect(response.body.data.expiringSoonCount).toBe(1);
    expect(response.body.data.recentProducts).toHaveLength(1);
    expect(response.body.data.recentProducts[0].productName).toBe("Washing Machine");
  });
});

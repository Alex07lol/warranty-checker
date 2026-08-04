const { app, request, startDb, stopDb, registerUser } = require("./helpers/setup");

describe("Service History API", () => {
  let token;
  let productId;

  beforeAll(async () => {
    await startDb();
    const user = await registerUser("Service User", `svc_${Date.now()}@example.com`);
    token = user.token;
    const product = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "Refrigerator" });
    productId = product.body.data._id;
  });

  afterAll(async () => {
    await stopDb();
  });

  test("requires authentication", async () => {
    const response = await request(app).get(
      `/api/v1/products/${productId}/service-history`
    );
    expect(response.statusCode).toBe(401);
  });

  test("adds a service record", async () => {
    const response = await request(app)
      .post(`/api/v1/products/${productId}/service-history`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        serviceDate: "2025-05-01",
        serviceType: "maintenance",
        serviceProvider: "Authorized Center",
        cost: 1200,
        currency: "INR",
        description: "Annual service"
      });
    expect(response.statusCode).toBe(201);
    expect(response.body.data.serviceType).toBe("maintenance");
    expect(response.body.data.serviceProvider).toBe("Authorized Center");
  });

  test("validates service record payload", async () => {
    const response = await request(app)
      .post(`/api/v1/products/${productId}/service-history`)
      .set("Authorization", `Bearer ${token}`)
      .send({ serviceType: "unknown_type" });
    expect(response.statusCode).toBe(422);
  });

  test("lists service history", async () => {
    const response = await request(app)
      .get(`/api/v1/products/${productId}/service-history`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.length).toBeGreaterThanOrEqual(1);
  });

  test("updates a service record", async () => {
    const list = await request(app)
      .get(`/api/v1/products/${productId}/service-history`)
      .set("Authorization", `Bearer ${token}`);
    const recordId = list.body.data[0]._id;

    const response = await request(app)
      .put(`/api/v1/products/${productId}/service-history/${recordId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ cost: 1500, description: "Updated note" });
    expect(response.statusCode).toBe(200);
    expect(response.body.data.cost).toBe(1500);
  });

  test("deletes a service record", async () => {
    const list = await request(app)
      .get(`/api/v1/products/${productId}/service-history`)
      .set("Authorization", `Bearer ${token}`);
    const recordId = list.body.data[0]._id;

    const response = await request(app)
      .delete(`/api/v1/products/${productId}/service-history/${recordId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);

    const after = await request(app)
      .get(`/api/v1/products/${productId}/service-history`)
      .set("Authorization", `Bearer ${token}`);
    expect(after.body.data.length).toBe(0);
  });
});

const Notification = require("../src/models/Notification");
const Product = require("../src/models/Product");
const { app, request, startDb, stopDb, registerUser } = require("./helpers/setup");

describe("Notifications API", () => {
  let token;
  let userId;
  let notificationId;

  beforeAll(async () => {
    await startDb();
    const user = await registerUser("Notif User", `notif_${Date.now()}@example.com`);
    token = user.token;
    userId = user.userId;

    const product = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "TV" });
    const productId = product.body.data._id;

    const created = await request(app)
      .post(`/api/v1/products/${productId}/service-history`)
      .set("Authorization", `Bearer ${token}`)
      .send({ serviceDate: "2025-05-01", serviceType: "repair" });
    expect(created.statusCode).toBe(201);
  });

  afterAll(async () => {
    await stopDb();
  });

  test("requires authentication", async () => {
    const response = await request(app).get("/api/v1/notifications");
    expect(response.statusCode).toBe(401);
  });

  test("returns an empty notification list by default", async () => {
    const response = await request(app)
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  test("seeds notifications directly and lists them", async () => {
    const product = await Product.findOne({ userId });

    const notification = await Notification.create({
      userId,
      productId: product._id,
      notificationType: "warranty_expiry",
      title: "Warranty expires soon",
      message: "TV warranty expires soon",
      isRead: false
    });
    notificationId = notification._id;

    const response = await request(app)
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.length).toBe(1);
    expect(response.body.data[0].title).toBe("Warranty expires soon");
  });

  test("filters unread notifications", async () => {
    const response = await request(app)
      .get("/api/v1/notifications?unreadOnly=true")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.length).toBe(1);
  });

  test("marks a notification as read", async () => {
    const response = await request(app)
      .put(`/api/v1/notifications/${notificationId}/read`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.isRead).toBe(true);
  });

  test("marks all notifications as read", async () => {
    const response = await request(app)
      .put("/api/v1/notifications/read-all")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
  });

  test("deletes a notification", async () => {
    const response = await request(app)
      .delete(`/api/v1/notifications/${notificationId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);

    const after = await request(app)
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${token}`);
    expect(after.body.data.length).toBe(0);
  });
});

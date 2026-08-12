const Notification = require("../src/models/Notification");
const Product = require("../src/models/Product");
const {
  createExpiryNotifications,
  createMaintenanceNotifications
} = require("../src/services/notification.service");
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
    expect(Array.isArray(response.body.data.notifications)).toBe(true);
    expect(response.body.data.pagination.total).toBe(0);
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
    expect(response.body.data.notifications).toHaveLength(1);
    expect(response.body.data.notifications[0].title).toBe("Warranty expires soon");
    expect(response.body.data.pagination.total).toBe(1);
  });

  test("filters unread notifications", async () => {
    const response = await request(app)
      .get("/api/v1/notifications?unreadOnly=true")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.notifications).toHaveLength(1);
  });

  test("paginates notifications", async () => {
    const product = await Product.findOne({ userId });
    const extra = [
      { userId, productId: product._id, notificationType: "warranty_expiry", title: "N1", message: "m1" },
      { userId, productId: product._id, notificationType: "warranty_expiry", title: "N2", message: "m2" },
      { userId, productId: product._id, notificationType: "warranty_expiry", title: "N3", message: "m3" }
    ];
    await Notification.insertMany(extra);

    const response = await request(app)
      .get("/api/v1/notifications?page=1&limit=2")
      .set("Authorization", `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.notifications).toHaveLength(2);
    expect(response.body.data.pagination).toMatchObject({ page: 1, limit: 2, total: 4 });

    const page2 = await request(app)
      .get("/api/v1/notifications?page=2&limit=2")
      .set("Authorization", `Bearer ${token}`);
    expect(page2.body.data.notifications).toHaveLength(2);
    expect(page2.body.data.pagination.page).toBe(2);

    // Remove the extras so later tests start from a clean list again.
    await Notification.deleteMany({ title: { $in: ["N1", "N2", "N3"] } });
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
    expect(after.body.data.notifications).toHaveLength(0);
  });

  test("creates warranty expiry notifications for products expiring on a reminder day", async () => {
    // Expiry 30 days out at noon local time — guaranteed to land inside the
    // service's [00:00, 23:59:59.999] window for reminder day 30.
    const expiry = new Date();
    expiry.setHours(12, 0, 0, 0);
    expiry.setDate(expiry.getDate() + 30);

    const product = await Product.create({
      userId,
      productName: "Expiry Test Laptop",
      purchaseDate: new Date("2024-01-01"),
      warrantyExpiryDate: expiry
    });

    const count = await createExpiryNotifications();
    expect(count).toBeGreaterThanOrEqual(1);

    const notification = await Notification.findOne({
      userId,
      productId: product._id,
      notificationType: "warranty_expiry"
    });
    expect(notification).not.toBeNull();
    expect(notification.title).toBe("Warranty expires in 30 days");
    expect(notification.message).toContain("Expiry Test Laptop");
  });

  test("creates maintenance reminders from nextServiceDate", async () => {
    const product = await Product.create({
      userId,
      productName: "AC Unit",
      purchaseDate: new Date("2024-01-01")
    });
    // Next service 30 days out at noon — lands in the day-30 reminder window.
    const next = new Date();
    next.setHours(12, 0, 0, 0);
    next.setDate(next.getDate() + 30);

    await request(app)
      .post(`/api/v1/products/${product._id}/service-history`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        serviceDate: "2025-05-01",
        serviceType: "maintenance",
        nextServiceDate: next.toISOString().slice(0, 10)
      });

    const count = await createMaintenanceNotifications();
    expect(count).toBeGreaterThanOrEqual(1);

    const notification = await Notification.findOne({
      userId,
      productId: product._id,
      notificationType: "service_reminder"
    });
    expect(notification).not.toBeNull();
    expect(notification.title).toBe("Service due in 30 days");
    expect(notification.message).toContain("AC Unit");

    // Second run must not duplicate the reminder.
    const again = await createMaintenanceNotifications();
    const total = await Notification.countDocuments({
      userId,
      productId: product._id,
      notificationType: "service_reminder"
    });
    expect(total).toBe(1);
  });

  test("respects disabled maintenance alerts", async () => {
    await request(app)
      .put("/api/v1/auth/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ maintenanceAlerts: false });

    const next = new Date();
    next.setHours(12, 0, 0, 0);
    next.setDate(next.getDate() + 30);
    const product = await Product.create({
      userId,
      productName: "Purifier",
      purchaseDate: new Date("2024-01-01")
    });
    await request(app)
      .post(`/api/v1/products/${product._id}/service-history`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        serviceDate: "2025-05-01",
        serviceType: "maintenance",
        nextServiceDate: next.toISOString().slice(0, 10)
      });

    const count = await createMaintenanceNotifications();
    const total = await Notification.countDocuments({
      userId,
      productId: product._id,
      notificationType: "service_reminder"
    });
    expect(total).toBe(0);

    // Re-enable so later tests (and the user's account) behave normally.
    await request(app)
      .put("/api/v1/auth/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ maintenanceAlerts: true });
  });

  test("updates notification preferences via the API", async () => {
    const response = await request(app)
      .put("/api/v1/auth/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ expiryAlerts: false, reminderDays: [14, 7, 1] });
    expect(response.statusCode).toBe(200);
    expect(response.body.data.notificationPreferences.expiryAlerts).toBe(false);
    expect(response.body.data.notificationPreferences.reminderDays).toEqual([14, 7, 1]);

    // Restore defaults for the account.
    await request(app)
      .put("/api/v1/auth/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ expiryAlerts: true, reminderDays: [30, 7, 1] });
  });

  test("validates preference payloads", async () => {
    const bad = await request(app)
      .put("/api/v1/auth/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ reminderDays: [0, -5] });
    expect(bad.statusCode).toBe(422);

    const empty = await request(app)
      .put("/api/v1/auth/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(empty.statusCode).toBe(422);
  });
});

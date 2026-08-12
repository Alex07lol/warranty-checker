// Phase 4 §22/§23 suites upload documents and run OCR — keep every network
// touch mocked so the tests stay hermetic.
jest.mock("../src/config/cloudinary", () => ({
  isConfigured: jest.fn(() => true),
  fetchStoredAsset: jest.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })),
  uploader: {
    destroy: jest.fn().mockResolvedValue({ result: "ok" })
  }
}));
jest.mock("../src/middleware/upload", () => ({
  uploadSingle: (req, res, next) => {
    req.file = {
      fieldname: "file",
      originalname: "receipt.jpg",
      encoding: "7bit",
      mimetype: "image/jpeg",
      size: 1024,
      path: "https://res.cloudinary.com/test/image/upload/v1/test/receipt123",
      filename: "test/receipt123"
    };
    return next();
  }
}));
// The OCR engine memoizes a singleton worker (getWorker), so per-call mock
// overrides never fire after the first test. The mock exposes a mutable state
// flag (__state.failNext) the tests can flip to force a failure path.
jest.mock("tesseract.js", () => {
  const state = { failNext: false };
  return {
    __state: state,
    createWorker: jest.fn(async () => ({
      recognize: jest.fn(async () => {
        if (state.failNext) throw new Error("tesseract exploded");
        return { data: { text: "ACME STORE\nTotal $899.99\n" } };
      })
    }))
  };
});

const Notification = require("../src/models/Notification");
const Product = require("../src/models/Product");
const Document = require("../src/models/Document");
const {
  createExpiryNotifications,
  createMaintenanceNotifications
} = require("../src/services/notification.service");
const { app, request, startDb, stopDb, registerUser } = require("./helpers/setup");

const originalFetch = global.fetch;

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

describe("Notification types + preferences (Phase 4 §22/§23)", () => {
  let token;
  let userId;
  let productId;

  beforeAll(async () => {
    global.fetch = jest.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));
    await startDb();
    const user = await registerUser("Notif Types", `notiftypes_${Date.now()}@example.com`);
    token = user.token;
    userId = user.userId;
    const product = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "Fridge" });
    productId = product.body.data._id;
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    await stopDb();
  });

  async function createDocument() {
    const doc = await Document.create({
      userId,
      documentType: "receipt",
      fileName: "receipt.jpg",
      fileUrl: "https://res.cloudinary.com/test/image/upload/v1/test/r",
      publicId: "test/r",
      fileSize: 1024,
      mimeType: "image/jpeg",
      ocrStatus: "pending"
    });
    return doc;
  }

  async function runOcr(docId) {
    return request(app)
      .post(`/api/v1/documents/${docId}/ocr`)
      .set("Authorization", `Bearer ${token}`);
  }

  test("OCR completion creates a document_processing notification (default on)", async () => {
    const doc = await createDocument();
    const response = await runOcr(doc._id);
    expect(response.statusCode).toBe(200);
    expect(response.body.data.ocrStatus).toBe("done");

    const notif = await Notification.findOne({
      userId,
      documentId: doc._id,
      notificationType: "document_processing"
    });
    expect(notif).toBeTruthy();
    expect(notif.title).toBe("Document processed");
    expect(notif.isRead).toBe(false);
    expect(notif.productId).toBeUndefined(); // standalone doc has no product
  });

  test("OCR failure creates a 'processing failed' notification", async () => {
    // The memoized singleton worker reads this flag — forces the catch path
    // in processDocument deterministically.
    require("tesseract.js").__state.failNext = true;
    try {
      const doc = await createDocument();
      const response = await runOcr(doc._id);
      expect(response.statusCode).toBe(200);
      expect(response.body.data.ocrStatus).toBe("failed");
      const notif = await Notification.findOne({
        userId,
        documentId: doc._id,
        notificationType: "document_processing"
      });
      expect(notif).toBeTruthy();
      expect(notif.title).toBe("Document processing failed");
    } finally {
      require("tesseract.js").__state.failNext = false;
    }
  });

  test("retrying OCR does not spam duplicate notifications", async () => {
    const doc = await createDocument();
    await runOcr(doc._id);
    await runOcr(doc._id); // second run — deduped
    const count = await Notification.countDocuments({
      userId,
      documentId: doc._id,
      notificationType: "document_processing"
    });
    expect(count).toBe(1);
  });

  test("documentAlerts=false suppresses document processing notifications", async () => {
    await request(app)
      .put("/api/v1/auth/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentAlerts: false });
    const doc = await createDocument();
    await runOcr(doc._id);
    const count = await Notification.countDocuments({
      userId,
      documentId: doc._id,
      notificationType: "document_processing"
    });
    expect(count).toBe(0);
    // Restore for the remaining tests.
    await request(app)
      .put("/api/v1/auth/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentAlerts: true });
  });

  test("creating a share link creates a shared_access notification (default on)", async () => {
    const response = await request(app)
      .post(`/api/v1/products/${productId}/shares`)
      .set("Authorization", `Bearer ${token}`)
      .send({ expiresInDays: 7 });
    expect(response.statusCode).toBe(201);

    const notif = await Notification.findOne({
      userId,
      productId,
      notificationType: "shared_access"
    });
    expect(notif).toBeTruthy();
    expect(notif.title).toBe("Share link created");
    expect(notif.message).toContain("Fridge");
  });

  test("sharedAccessAlerts=false suppresses share notifications", async () => {
    await request(app)
      .put("/api/v1/auth/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ sharedAccessAlerts: false });
    await request(app)
      .post(`/api/v1/products/${productId}/shares`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const count = await Notification.countDocuments({
      userId,
      productId,
      notificationType: "shared_access"
    });
    expect(count).toBe(1); // only the earlier one — this one was suppressed
    // Restore for any later tests.
    await request(app)
      .put("/api/v1/auth/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ sharedAccessAlerts: true });
  });

  test("preferences round-trip the new alert keys", async () => {
    const update = await request(app)
      .put("/api/v1/auth/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentAlerts: false, sharedAccessAlerts: false });
    expect(update.statusCode).toBe(200);

    const me = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.body.data.notificationPreferences.documentAlerts).toBe(false);
    expect(me.body.data.notificationPreferences.sharedAccessAlerts).toBe(false);
    // Untouched keys survive a partial update.
    expect(me.body.data.notificationPreferences.expiryAlerts).toBe(true);
    expect(me.body.data.notificationPreferences.maintenanceAlerts).toBe(true);
  });
});

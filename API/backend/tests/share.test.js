// Phase 4 §17 — secure product sharing.
//
// Mock Cloudinary/upload/tesseract so no suite in this file touches the
// network (uploading a receipt would otherwise fire background OCR).
jest.mock("tesseract.js", () => ({
  createWorker: jest.fn(async () => ({
    recognize: jest.fn(async () => ({ data: { text: "ACME\n$99\n" } }))
  }))
}));

const mongoose = require("mongoose");
const originalFetch = global.fetch;

const { app, request, startDb, stopDb, registerUser } = require("./helpers/setup");
const Share = require("../src/models/Share");
const ServiceHistory = require("../src/models/ServiceHistory");
const Document = require("../src/models/Document");

describe("Secure product sharing (Phase 4 §17)", () => {
  let token;
  let ownerId;
  let otherToken;
  let productId;

  beforeAll(async () => {
    global.fetch = jest.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));
    await startDb();
    const user = await registerUser("Share Owner", `share_${Date.now()}@example.com`);
    token = user.token;
    ownerId = user.userId;
    const other = await registerUser("Share Other", `share_other_${Date.now()}@example.com`);
    otherToken = other.token;

    const product = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productName: "Dishwasher",
        brand: "Bosch",
        serialNumber: "SH-12345",
        purchasePrice: 899,
        purchaseStore: "BigBox",
        purchaseDate: "2025-01-10",
        warrantyExpiryDate: "2027-01-10"
      });
    productId = product.body.data._id;

    // Attach one service record + one document so the shared snapshot has
    // content to assert on. The document is created with a fileUrl/publicId
    // that MUST NOT leak through the public view.
    await ServiceHistory.create({
      productId,
      userId: user.userId,
      serviceDate: new Date("2025-06-01"),
      serviceType: "repair",
      serviceProvider: "Bosch Service",
      cost: 120,
      description: "Pump replaced"
    });
    await Document.create({
      productId,
      userId: user.userId,
      documentType: "receipt",
      fileName: "secret-receipt.pdf",
      fileUrl: "https://res.cloudinary.com/leak/file.pdf",
      publicId: "secret/public-id",
      fileSize: 2048,
      mimeType: "application/pdf",
      ocrStatus: "done",
      ocrText: "TOP SECRET OCR",
      verified: true,
      tags: ["kitchen"]
    });
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    await stopDb();
  });

  async function createShare(expiresInDays) {
    const body = expiresInDays === undefined ? {} : { expiresInDays };
    const response = await request(app)
      .post(`/api/v1/products/${productId}/shares`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);
    return response;
  }

  test("requires authentication to manage share links", async () => {
    const response = await request(app).post(`/api/v1/products/${productId}/shares`).send({});
    expect(response.statusCode).toBe(401);
  });

  test("creates a share link with an unguessable token", async () => {
    const response = await createShare();
    expect(response.statusCode).toBe(201);
    expect(response.body.data.token).toMatch(/^[0-9a-f]{48}$/);
    expect(response.body.data.expiresAt).toBeNull();
    expect(response.body.data.url).toBe(`/shared.html?t=${response.body.data.token}`);
  });

  test("creates a share link with an expiry", async () => {
    const response = await createShare(7);
    expect(response.statusCode).toBe(201);
    const expiresIn = new Date(response.body.data.expiresAt) - Date.now();
    // ~7 days out (allow a little skew).
    expect(expiresIn).toBeGreaterThan(6.9 * 86400000);
    expect(expiresIn).toBeLessThan(7.1 * 86400000);
  });

  test("rejects invalid expiry values", async () => {
    expect((await createShare(0)).statusCode).toBe(422);
    expect((await createShare(91)).statusCode).toBe(422);
    expect((await createShare(1.5)).statusCode).toBe(422);
    expect((await createShare("seven")).statusCode).toBe(422);
  });

  test("rejects creating a share link for another user's product", async () => {
    const response = await request(app)
      .post(`/api/v1/products/${productId}/shares`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ expiresInDays: 7 });
    expect(response.statusCode).toBe(403);
  });

  test("lists share links (active only marked active)", async () => {
    // One active (no expiry) from the earlier create test.
    const list = await request(app)
      .get(`/api/v1/products/${productId}/shares`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.statusCode).toBe(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(1);
    expect(list.body.data.every((s) => s.active === true)).toBe(true);
  });

  test("lists another user's shares as 403", async () => {
    const response = await request(app)
      .get(`/api/v1/products/${productId}/shares`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(response.statusCode).toBe(403);
  });

  test("public shared view needs no auth and returns a read-only snapshot", async () => {
    const created = await createShare();
    const tokenHex = created.body.data.token;

    const response = await request(app).get(`/api/v1/shared/${tokenHex}`);
    expect(response.statusCode).toBe(200);
    // Revocation must take effect immediately — never cache the snapshot.
    expect(response.headers["cache-control"]).toBe("no-store");
    const data = response.body.data;
    expect(data.product.productName).toBe("Dishwasher");
    expect(data.product.serialNumber).toBe("SH-12345");
    expect(data.product.warrantyStatus).toBe("active");
    expect(data.product.purchaseStore).toBe("BigBox");

    // Service history present.
    expect(data.serviceHistory).toHaveLength(1);
    expect(data.serviceHistory[0].serviceType).toBe("repair");
    expect(data.serviceHistory[0].description).toBe("Pump replaced");

    // Document metadata present…
    expect(data.documents).toHaveLength(1);
    expect(data.documents[0].fileName).toBe("secret-receipt.pdf");
    expect(data.documents[0].verified).toBe(true);
    expect(data.documents[0].tags).toEqual(["kitchen"]);

    // …but NEVER the private bits: no fileUrl, publicId, ocrText or ocrError.
    const doc = data.documents[0];
    expect(doc.fileUrl).toBeUndefined();
    expect(doc.publicId).toBeUndefined();
    expect(doc.ocrText).toBeUndefined();
    expect(doc.ocrError).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain("secret/public-id");
    expect(JSON.stringify(data)).not.toContain("TOP SECRET OCR");
    expect(JSON.stringify(data)).not.toContain("userId");
  });

  test("public shared view 404s for unknown/revoked/expired tokens", async () => {
    // Unknown token.
    expect((await request(app).get(`/api/v1/shared/${"a".repeat(48)}`)).statusCode).toBe(404);
    // Malformed token.
    expect((await request(app).get("/api/v1/shared/not-a-token")).statusCode).toBe(404);

    // Expired token.
    const expired = await Share.create({
      productId,
      userId: ownerId,
      token: "b".repeat(48),
      expiresAt: new Date(Date.now() - 1000)
    });
    expect((await request(app).get(`/api/v1/shared/${expired.token}`)).statusCode).toBe(404);

    // Revoked token.
    const revoked = await Share.create({
      productId,
      userId: ownerId,
      token: "c".repeat(48),
      revokedAt: new Date()
    });
    expect((await request(app).get(`/api/v1/shared/${revoked.token}`)).statusCode).toBe(404);
  });

  test("revoking a share link deactivates it and survives in the list", async () => {
    const created = await createShare();
    const shareId = created.body.data.shareId;

    const revoke = await request(app)
      .delete(`/api/v1/products/${productId}/shares/${shareId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(revoke.statusCode).toBe(200);

    // No longer publicly accessible.
    expect((await request(app).get(`/api/v1/shared/${created.body.data.token}`)).statusCode).toBe(404);

    // Still listed (so the owner sees history) but marked inactive.
    const list = await request(app)
      .get(`/api/v1/products/${productId}/shares`)
      .set("Authorization", `Bearer ${token}`);
    const found = list.body.data.find((s) => s.shareId === shareId);
    expect(found).toBeDefined();
    expect(found.active).toBe(false);
    expect(found.revokedAt).not.toBeNull();
  });

  test("rejects revoking another user's share link", async () => {
    const created = await createShare();
    const response = await request(app)
      .delete(`/api/v1/products/${productId}/shares/${created.body.data.shareId}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(response.statusCode).toBe(403);
  });

  test("does not leak a deleted product through a live share link", async () => {
    const created = await createShare();
    const tokenHex = created.body.data.token;

    // Soft-delete the product.
    await request(app)
      .delete(`/api/v1/products/${productId}`)
      .set("Authorization", `Bearer ${token}`);

    expect((await request(app).get(`/api/v1/shared/${tokenHex}`)).statusCode).toBe(404);

    // Restore for any later tests.
    await mongoose.model("Product").findByIdAndUpdate(productId, { isDeleted: false });
  });
});

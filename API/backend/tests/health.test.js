process.env.PORT = "5000";
process.env.NODE_ENV = "test";
process.env.MONGO_URI = "mongodb://localhost/warrantyvault_db";
process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";
process.env.CLOUDINARY_CLOUD_NAME = "test";
process.env.CLOUDINARY_API_KEY = "test";
process.env.CLOUDINARY_API_SECRET = "test";
process.env.CLIENT_URL = "*";

const request = require("supertest");
const app = require("../src/server");

describe("Health", () => {
  test("liveness returns success envelope with uptime and a request id", async () => {
    const response = await request(app).get("/health");
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(typeof response.body.data.uptime).toBe("number");
    expect(typeof response.body.data.requestId).toBe("string");
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  test("readiness reports db availability without leaking details", async () => {
    const response = await request(app).get("/ready");
    // The DB may be up or down depending on test ordering; the endpoint must
    // answer 200/503 with a safe shape either way.
    expect([200, 503]).toContain(response.statusCode);
    expect(["up", "down"]).toContain(response.body.data.db);
    expect(JSON.stringify(response.body)).not.toContain("mongodb+srv");
    expect(JSON.stringify(response.body)).not.toContain("admin:");
  });
});

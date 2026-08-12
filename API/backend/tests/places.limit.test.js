process.env.PORT = "5000";
process.env.NODE_ENV = "test";
process.env.MONGO_URI = "mongodb://localhost/warrantyvault_db";
process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";
process.env.CLOUDINARY_CLOUD_NAME = "test";
process.env.CLOUDINARY_API_KEY = "test";
process.env.CLOUDINARY_API_SECRET = "test";
process.env.CLIENT_URL = "*";
process.env.GOOGLE_PLACES_API_KEY = "test-google-key";
// Read by places.routes.js at require time — low so the limit is easy to hit.
process.env.PLACES_RATE_LIMIT = "3";

const request = require("supertest");
const app = require("../src/server");

const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ status: "OK", results: [] })
  }));
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe("Places rate limiting", () => {
  test("returns 429 once the per-IP budget is exhausted", async () => {
    const statuses = [];
    for (let i = 0; i < 5; i++) {
      const response = await request(app)
        .get("/api/v1/places/nearby")
        .query({ lat: 28.6, lng: 77.2 });
      statuses.push(response.statusCode);
    }
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429);
    expect(statuses[4]).toBe(429);
  });
});

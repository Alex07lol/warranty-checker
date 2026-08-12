process.env.PORT = "5000";
process.env.NODE_ENV = "test";
process.env.MONGO_URI = "mongodb://localhost/warrantyvault_db";
process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";
process.env.CLOUDINARY_CLOUD_NAME = "test";
process.env.CLOUDINARY_API_KEY = "test";
process.env.CLOUDINARY_API_SECRET = "test";
process.env.CLIENT_URL = "*";

const yaml = require("js-yaml");
const request = require("supertest");
const app = require("../src/server");

describe("API documentation", () => {
  test("GET /api/docs redirects to the rendered docs page", async () => {
    const response = await request(app).get("/api/docs");
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/docs.html");
  });

  test("GET /docs.html serves the developer page", async () => {
    const response = await request(app).get("/docs.html");
    expect(response.statusCode).toBe(200);
    expect(response.text).toContain("WarrantyVault");
    expect(response.text).toContain("OpenAPI");
  });

  test("GET /api/docs/openapi.yaml serves a valid OpenAPI 3 document", async () => {
    const response = await request(app).get("/api/docs/openapi.yaml");
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("yaml");

    const spec = yaml.load(response.text);
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBe("WarrantyVault API");
    expect(spec.components.securitySchemes.bearerAuth.type).toBe("http");
    expect(spec.security).toEqual([{ bearerAuth: [] }]);
  });

  test("OpenAPI spec covers the core API surface", async () => {
    const response = await request(app).get("/api/docs/openapi.yaml");
    const spec = yaml.load(response.text);
    const paths = Object.keys(spec.paths);
    for (const required of [
      "/api/v1/auth/register",
      "/api/v1/auth/login",
      "/api/v1/products",
      "/api/v1/products/{id}",
      "/api/v1/documents",
      "/api/v1/documents/{documentId}/ocr",
      "/api/v1/products/{productId}/service-history",
      "/api/v1/notifications",
      "/api/v1/dashboard",
      "/api/v1/places/nearby",
      "/health",
      "/ready"
    ]) {
      expect(paths).toContain(required);
    }
    // Collection endpoints must advertise pagination params.
    const notificationsGet = spec.paths["/api/v1/notifications"].get;
    const paramNames = notificationsGet.parameters.map((p) => p.name);
    expect(paramNames).toEqual(expect.arrayContaining(["page", "limit"]));
  });

  test("docs page stays in sync with the spec (no drifted endpoint lists)", async () => {
    const spec = yaml.load((await request(app).get("/api/docs/openapi.yaml")).text);
    const page = (await request(app).get("/docs.html")).text;
    // Every documented path must appear in the hand-maintained quick-reference
    // page, so adding an endpoint to the spec but forgetting the page fails CI.
    for (const p of Object.keys(spec.paths)) {
      if (p === "/api/docs/openapi.yaml") continue; // rendered as a link target
      expect(page).toContain(p);
    }
  });

  test("OpenAPI spec leaks no credentials or connection strings", async () => {
    const response = await request(app).get("/api/docs/openapi.yaml");
    const raw = response.text;
    // "password" legitimately appears as a schema property name; what must
    // never appear is hashes, connection strings, or env secret names.
    expect(raw).not.toContain("passwordHash");
    expect(raw).not.toContain("mongodb+srv://");
    expect(raw).not.toContain("CLOUDINARY_API_SECRET");
    expect(raw).not.toContain("CLOUDINARY_API_KEY");
    // Server URLs must be plain origins (no embedded userinfo).
    expect(raw).not.toMatch(/:\/\/[^/\s]*@/);
  });
});

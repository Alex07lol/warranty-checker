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

const request = require("supertest");
const app = require("../src/server");

const originalFetch = global.fetch;

function mockFetch(jsonBody) {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => jsonBody
  }));
}

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe("Places API", () => {
  test("nearby requires lat and lng", async () => {
    const response = await request(app).get("/api/v1/places/nearby");
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe("lat and lng are required");
  });

  test("nearby proxies Google Places results", async () => {
    mockFetch({
      results: [
        {
          name: "TechCare",
          vicinity: "Connaught Place, New Delhi",
          geometry: { location: { lat: 28.6328, lng: 77.2197 } },
          rating: 4.6
        }
      ]
    });

    const response = await request(app)
      .get("/api/v1/places/nearby")
      .query({ lat: 28.6139, lng: 77.209, keyword: "repair" });

    expect(response.statusCode).toBe(200);
    expect(response.body.results[0].name).toBe("TechCare");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("geocode requires lat and lng", async () => {
    const response = await request(app).get("/api/v1/places/geocode");
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe("lat and lng are required");
  });

  test("geocode returns a human-readable address", async () => {
    mockFetch({
      results: [
        {
          formatted_address: "Connaught Place, New Delhi, Delhi 110001, India"
        }
      ],
      status: "OK"
    });

    const response = await request(app)
      .get("/api/v1/places/geocode")
      .query({ lat: 28.6328, lng: 77.2197 });

    expect(response.statusCode).toBe(200);
    expect(response.body.results[0].formatted_address).toBe(
      "Connaught Place, New Delhi, Delhi 110001, India"
    );
  });

  test("photo requires a photo reference", async () => {
    const response = await request(app).get("/api/v1/places/photo");
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe("reference is required");
  });

  test("photo redirects to the Google Places photo URL with the server key", async () => {
    const response = await request(app)
      .get("/api/v1/places/photo")
      .query({ reference: "CmRa-photo-ref", maxwidth: 400 });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain(
      "https://maps.googleapis.com/maps/api/place/photo"
    );
    expect(response.headers.location).toContain("photo_reference=CmRa-photo-ref");
    expect(response.headers.location).toContain("key=test-google-key");
  });
});

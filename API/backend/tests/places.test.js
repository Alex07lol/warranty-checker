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
  test.each([
    ["/api/v1/places/nearby", "lat and lng are required"],
    ["/api/v1/places/geocode", "lat and lng are required"],
    ["/api/v1/places/photo", "reference is required"],
    ["/api/v1/places/details", "place_id is required"]
  ])("%s validation error responses", async (path, errorMsg) => {
    const response = await request(app).get(path);
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe(errorMsg);
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

  test("geocode falls back to Nominatim when Google is unavailable", async () => {
    // First call = Google (denied), second call = Nominatim (success).
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes("maps.googleapis.com")) {
        return {
          ok: true,
          json: async () => ({
            status: "REQUEST_DENIED",
            results: [],
            error_message: "This API is not activated on your API project."
          })
        };
      }
      return {
        ok: true,
        json: async () => ({ display_name: "Kochi, Kerala, India" })
      };
    });

    const response = await request(app)
      .get("/api/v1/places/geocode")
      .query({ lat: 9.9406, lng: 76.2653 });

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("OK");
    expect(response.body.results[0].formatted_address).toBe("Kochi, Kerala, India");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });



  test("details proxies Google Place Details (phone + hours)", async () => {
    mockFetch({
      status: "OK",
      result: {
        name: "TechCare",
        formatted_phone_number: "+91 11 4567 8901",
        opening_hours: {
          open_now: true,
          weekday_text: ["Monday: 10:00 AM – 8:00 PM"]
        },
        user_ratings_total: 128
      }
    });

    const response = await request(app)
      .get("/api/v1/places/details")
      .query({ place_id: "ChIJN1t_tDeuEmsRUsoyG83frY4" });

    expect(response.statusCode).toBe(200);
    expect(response.body.result.formatted_phone_number).toBe("+91 11 4567 8901");
    expect(response.body.result.opening_hours.weekday_text[0]).toContain("Monday");
    expect(response.body.result.user_ratings_total).toBe(128);
  });
});

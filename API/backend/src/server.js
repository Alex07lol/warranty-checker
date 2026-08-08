const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { PORT, NODE_ENV, CLIENT_URL } = require("./config/env");
const connectDatabase = require("./config/database");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

const authRoutes = require("./routes/auth.routes");
const productRoutes = require("./routes/product.routes");
const documentRoutes = require("./routes/document.routes");
const serviceHistoryRoutes = require("./routes/serviceHistory.routes");
const notificationRoutes = require("./routes/notification.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const cron = require("node-cron");
const { createExpiryNotifications } = require("./services/notification.service");

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      connectSrc: ["'self'"],
      // maps.googleapis.com is needed for the store-photo proxy: the /places/photo
      // route 302-redirects to a Google-hosted image, and CSP is enforced on
      // redirect targets, so the final host must be allow-listed here.
      imgSrc: ["'self'", "data:", "https://maps.googleapis.com"]
    }
  }
}));
app.use(cors({
  origin: CLIENT_URL === "*" ? true : CLIENT_URL,
  credentials: true
}));
app.use(morgan("combined"));
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "WarrantyVault API",
    data: {
      health: "/health",
      docs: "/api/v1",
      endpoints: [
        "/api/v1/auth",
        "/api/v1/products",
        "/api/v1/products/:productId/documents",
        "/api/v1/products/:productId/service-history",
        "/api/v1/documents",
        "/api/v1/notifications",
        "/api/v1/dashboard"
      ]
    }
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "WarrantyVault API is running",
    data: null
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/products/:productId/documents", documentRoutes);
// Standalone documents: upload/list/delete without requiring a product.
app.use("/api/v1/documents", documentRoutes);
app.use("/api/v1/products/:productId/service-history", serviceHistoryRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);

// Google Places API proxy to avoid CORS issues
app.get("/api/v1/places/nearby", async (req, res) => {
  const { lat, lng, radius = 10000, type = "electronics_store", keyword = "repair" } = req.query;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!lat || !lng) {
    return res.status(400).json({ error: "lat and lng are required" });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&key=${apiKey}&type=${type}&keyword=${encodeURIComponent(keyword)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json" }
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch from Google Places API", details: error.message });
  }
});

// Reverse-geocode a lat/lng into a human-readable place name/address so the
// app can show "Near Connaught Place, New Delhi" instead of raw coordinates.
// Tries Google first; if the Geocoding API is disabled/empty for this key it
// falls back to OpenStreetMap's free Nominatim reverse geocoder so the UI
// always has a place name to display.
app.get("/api/v1/places/geocode", async (req, res) => {
  const { lat, lng } = req.query;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!lat || !lng) {
    return res.status(400).json({ error: "lat and lng are required" });
  }

  try {
    let googleData = null;
    try {
      const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(lat)},${encodeURIComponent(lng)}&key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(googleUrl, {
        signal: controller.signal,
        headers: { "Accept": "application/json" }
      });
      clearTimeout(timeoutId);
      googleData = await response.json();
    } catch (err) {
      googleData = null;
    }

    if (googleData && googleData.status === "OK" && googleData.results && googleData.results.length) {
      return res.json(googleData);
    }

    // Nominatim's public instance allows ~1 req/sec — fine for one lookup per
    // repair-tab open, but keep it a fallback only (Google is the primary).
    try {
      const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&format=jsonv2&accept-language=en`;
      const nomController = new AbortController();
      const nomTimeout = setTimeout(() => nomController.abort(), 10000);
      const nomResponse = await fetch(nominatimUrl, {
        signal: nomController.signal,
        headers: {
          "Accept": "application/json",
          "User-Agent": "WarrantyVault/1.0 (warranty-tracker demo)"
        }
      });
      clearTimeout(nomTimeout);
      const nomData = await nomResponse.json();
      if (nomData && nomData.display_name) {
        return res.json({ status: "OK", results: [{ formatted_address: nomData.display_name }] });
      }
    } catch (err) {
      // Nominatim unavailable too — fall through to Google's original answer.
    }

    res.json(googleData || { status: "ERROR", results: [], error_message: "No reverse geocoding result" });
  } catch (error) {
    res.status(500).json({ error: "Failed to reverse geocode location", details: error.message });
  }
});

// Google Places Details proxy — enriches repair centres with real phone
// numbers, full opening hours, review counts and the canonical Maps URL.
app.get("/api/v1/places/details", async (req, res) => {
  const placeId = req.query.place_id;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!placeId) {
    return res.status(400).json({ error: "place_id is required" });
  }

  try {
    const fields = "formatted_phone_number,international_phone_number,website,opening_hours,user_ratings_total,rating";
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${encodeURIComponent(fields)}&key=${apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json" }
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch place details", details: error.message });
  }
});

// Serve Google Places store photos without exposing the API key to the
// browser. Redirects to the signed photo URL so <img> tags can load it
// cross-origin without any CORS concerns.
app.get("/api/v1/places/photo", (req, res) => {
  const { reference, maxwidth = 400 } = req.query;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!reference) {
    return res.status(400).json({ error: "reference is required" });
  }

  const width = Math.min(800, Math.max(100, Number(maxwidth) || 400));
  const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${width}&photo_reference=${encodeURIComponent(reference)}&key=${apiKey}`;
  res.redirect(url);
});

app.use(notFound);
app.use(errorHandler);

if (NODE_ENV !== "test") {
  connectDatabase()
    .then(() => {
      app.listen(PORT, () => {
        process.stdout.write(`WarrantyVault API listening on port ${PORT}\n`);
      });

      // Daily at midnight: scan for warranties expiring on the configured
      // reminder days and create notifications for each user.
      cron.schedule("0 0 * * *", async () => {
        try {
          const count = await createExpiryNotifications();
          process.stdout.write(`Expiry notifications created: ${count}\n`);
        } catch (err) {
          process.stderr.write(`Notification cron error: ${err.message}\n`);
        }
      });
    })
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exit(1);
    });
}

module.exports = app;

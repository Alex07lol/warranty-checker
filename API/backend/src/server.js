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
      imgSrc: ["'self'", "data:"]
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

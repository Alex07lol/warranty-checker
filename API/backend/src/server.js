const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
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
const placesRoutes = require("./routes/places.routes");
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
// gzip all text/json responses (HTML shell, API payloads, vendored JS).
// 182 KB index.html ~> ~30 KB over the wire; skip tiny bodies where the
// gzip overhead isn't worth it.
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: "1mb" }));
// Vendored, versioned-because-vendored assets never change at runtime — let
// the browser cache them forever. index.html and /api stay uncached (ETag
// revalidation) so updates always reach users.
app.use("/vendor", (req, res, next) => {
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  next();
});
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
// Google Places proxy (rate-limited + fully validated — see places.routes.js).
app.use("/api/v1/places", placesRoutes);

app.use(notFound);
app.use(errorHandler);

if (NODE_ENV !== "test") {
  connectDatabase()
    .then(() => {
      process.stdout.write("MongoDB connected successfully.\n");
    })
    .catch((error) => {
      process.stderr.write(`MongoDB connection failed: ${error.message}\nContinuing server startup (API calls requiring database will fail, but static frontend is available).\n`);
    })
    .finally(() => {
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
    });
}

module.exports = app;

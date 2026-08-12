const path = require("node:path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const mongoose = require("mongoose");
const { PORT, NODE_ENV, CLIENT_URL } = require("./config/env");
const connectDatabase = require("./config/database");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");
const requestId = require("./middleware/requestId");
const logger = require("./utils/logger");
const { getOcrMetrics } = require("./services/ocr.service");

const authRoutes = require("./routes/auth.routes");
const productRoutes = require("./routes/product.routes");
const documentRoutes = require("./routes/document.routes");
const { router: shareRoutes, publicRouter: sharedRoutes } = require("./routes/share.routes");
const serviceHistoryRoutes = require("./routes/serviceHistory.routes");
const notificationRoutes = require("./routes/notification.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const exportRoutes = require("./routes/export.routes");
const placesRoutes = require("./routes/places.routes");
const cron = require("node-cron");
const {
  createExpiryNotifications,
  createMaintenanceNotifications
} = require("./services/notification.service");

const app = express();

// Render (and similar hosts) terminate TLS at a single reverse proxy hop, so
// req.ip must read the client IP from X-Forwarded-For through that one hop;
// without this every request appears to come from the proxy and the per-IP
// rate limiters (shared-view, guest uploads/OCR) collapse into one global
// bucket. Exactly one hop is trusted — more would allow spoofing.
app.set("trust proxy", 1);

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
// Request tracing: generate/echo X-Request-ID before anything logs.
app.use(requestId);
// Structured request log (one JSON line per request with the request id,
// route, status and duration). Static assets and the root page are skipped —
// they add noise, not signal.
app.use(
  morgan((tokens, req, res) =>
    JSON.stringify({
      level: "info",
      ts: new Date().toISOString(),
      msg: "http",
      requestId: req.id,
      method: tokens.method(req, res),
      url: tokens.url(req, res),
      status: Number(tokens.status(req, res)) || 0,
      responseTimeMs:
        tokens["response-time"](req, res) != null
          ? Math.round(Number(tokens["response-time"](req, res)) * 10) / 10
          : null,
      remoteAddr: tokens["remote-addr"](req, res)
    })
  , {
    skip: (req) =>
      req.path === "/" ||
      req.path.startsWith("/js/") ||
      req.path.startsWith("/css/") ||
      req.path.startsWith("/vendor/") ||
      req.path === "/favicon.ico"
  })
);
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
      docs: "/api/docs",
      openapi: "/api/docs/openapi.yaml",
      endpoints: [
        "/api/v1/auth",
        "/api/v1/products",
        "/api/v1/products/:productId/documents",
        "/api/v1/products/:productId/service-history",
        "/api/v1/documents",
        "/api/v1/notifications",
        "/api/v1/dashboard",
        "/api/v1/places"
      ]
    }
  });
});

// Developer documentation: a rendered quick-reference page and the raw
// OpenAPI 3.0.3 document (the machine-readable source of truth).
// 302 (not 301): a permanent redirect would be cached forever by browsers,
// so moving the docs page later would strand users on a stale target.
app.get("/api/docs", (req, res) => {
  res.redirect(302, "/docs.html");
});

app.get("/api/docs/openapi.yaml", (req, res) => {
  res.type("application/yaml").sendFile(path.join(__dirname, "..", "docs", "openapi.yaml"));
});

// Liveness: the process is up. Always 200 while the process runs — this is
// what Render's health check polls to decide the instance is alive.
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "WarrantyVault API is running",
    data: {
      uptime: Math.round(process.uptime()),
      requestId: req.id,
      ocr: getOcrMetrics()
    }
  });
});

// Readiness: the process is up AND can do useful work (MongoDB reachable).
// Returns 503 (not 500) when the database is unavailable so orchestrators
// route traffic away while dependencies recover. Never leaks connection
// details or credentials.
app.get("/ready", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      throw new Error("not connected");
    }
    await mongoose.connection.db.admin().ping({ maxTimeMS: 3000 });
    res.status(200).json({
      success: true,
      message: "Ready",
      data: { db: "up" }
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: "Not ready — database unavailable",
      data: { db: "down" }
    });
  }
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/products/:productId/documents", documentRoutes);
// Standalone documents: upload/list/delete without requiring a product.
app.use("/api/v1/documents", documentRoutes);
app.use("/api/v1/products/:productId/service-history", serviceHistoryRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
// Phase 4 §16: JSON/CSV export of the user's products (ownership-scoped).
app.use("/api/v1/export", exportRoutes);
// Phase 4 §17 — secure product sharing: owner mount + public token mount.
app.use("/api/v1/products/:productId/shares", shareRoutes);
app.use("/api/v1/shared", sharedRoutes);
// Google Places proxy (rate-limited + fully validated — see places.routes.js).
app.use("/api/v1/places", placesRoutes);

app.use(notFound);
app.use(errorHandler);

if (NODE_ENV !== "test") {
  let server;
  let expiryCron;

  connectDatabase()
    .then(() => {
      logger.info("MongoDB connected");
    })
    .catch((error) => {
      logger.warn("MongoDB connection failed — continuing (static frontend available)", {
        error: error.message
      });
    })
    .finally(() => {
      server = app.listen(PORT, () => {
        logger.info("WarrantyVault API listening", { port: PORT });
      });

      // Daily at midnight: scan for warranties expiring on the configured
      // reminder days AND service records due for maintenance, creating
      // notifications for each user (Phase 4 §6/§7). Both run independently
      // so a failure in one never blocks the other.
      expiryCron = cron.schedule("0 0 * * *", async () => {
        try {
          const count = await createExpiryNotifications();
          logger.info("Expiry notifications created", { count });
        } catch (err) {
          logger.error("Expiry notification cron error", { error: err.message });
        }
        try {
          const count = await createMaintenanceNotifications();
          logger.info("Maintenance notifications created", { count });
        } catch (err) {
          logger.error("Maintenance notification cron error", { error: err.message });
        }
      });
    });

  // Graceful shutdown: stop accepting new connections, stop scheduled jobs,
  // close MongoDB, drain in-flight requests, then exit cleanly. A hard
  // timeout force-exits if something refuses to drain.
  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Shutting down", { signal });

    const forceExit = setTimeout(() => {
      logger.error("Shutdown timed out — forcing exit");
      process.exit(1);
    }, 10000);
    forceExit.unref();

    if (server) {
      server.close(async () => {
        if (expiryCron) expiryCron.stop();
        try {
          await mongoose.disconnect();
        } catch (error) {
          logger.warn("Error disconnecting MongoDB", { error: error.message });
        }
        logger.info("Shutdown complete");
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

module.exports = app;

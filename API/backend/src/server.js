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

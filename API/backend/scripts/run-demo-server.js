#!/usr/bin/env node
/**
 * Launch a throwaway FULL-FEATURED demo server: in-memory MongoDB + the real
 * Cloudinary credentials from `.env`.
 *
 * Unlike scripts/run-test-server.js — which forces dummy Cloudinary creds so
 * document uploads always fail — this script leaves Cloudinary pointing at the
 * real `.env` values, so the complete flow works end to end: register, add a
 * product, upload a receipt, OCR auto-fills price/serial/expiry, notifications,
 * dashboard, etc.
 *
 * Prerequisites:
 *   - `npm install` has been run (node_modules present).
 *   - Cloudinary credentials in `.env` (copy `.env.example` and fill in).
 *     Without them auth/products/etc. still work, but uploads + OCR will fail.
 *   - Outbound network on the first OCR use (tesseract.js downloads the ~5 MB
 *     `eng` model into ~/.cache/warrantyvault-ocr — outside the repo).
 *
 * Usage:
 *   npm run demo                      # http://localhost:5000
 *   PORT=5050 npm run demo            # custom port
 *
 * Ctrl-C stops the server and tears down the in-memory database.
 */

const { MongoMemoryServer } = require("mongodb-memory-server");
const dotenv = require("dotenv");

dotenv.config();

process.env.NODE_ENV = "development";
process.env.PORT = process.env.PORT || "5000";
process.env.MONGO_URI = "mongodb://localhost/warrantyvault_db"; // replaced below

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "dev-demo-secret";
  process.stdout.write("Note: JWT_SECRET not set — using an ephemeral dev secret.\n");
}
process.env.JWT_EXPIRES_IN ||= "7d";

const cloudinaryConfigured = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET"
].every((key) => process.env[key] && process.env[key] !== "test");

if (!cloudinaryConfigured) {
  process.stdout.write(
    "WARNING: Cloudinary credentials not found (real values missing from .env).\n" +
      "  Auth, products, service history, notifications and dashboard still work,\n" +
      "  but document uploads and OCR will fail.\n" +
      "  Copy .env.example to .env and fill in the Cloudinary values to enable them.\n\n"
  );
  // Fall back to dummy values so config/env.js doesn't abort startup.
  process.env.CLOUDINARY_CLOUD_NAME ||= "test";
  process.env.CLOUDINARY_API_KEY ||= "test";
  process.env.CLOUDINARY_API_SECRET ||= "test";
}

async function main() {
  const mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri();

  // Start the real server (listens because NODE_ENV !== "test").
  require("../src/server");

  const port = process.env.PORT;
  process.stdout.write(
    `\nDemo server running on http://localhost:${port}\n` +
      `  Mongo       : in-memory (data wiped on exit)\n` +
      `  Cloudinary  : ${cloudinaryConfigured ? "real credentials from .env" : "NOT configured (uploads disabled)"}\n` +
      `  Landing page: http://localhost:${port}/\n` +
      `  Ctrl-C to stop\n\n`
  );

  async function shutdown() {
    process.stdout.write("\nShutting down demo server…\n");
    try {
      await mongoServer.stop();
    } catch {
      /* already stopped */
    }
    process.exit(0);
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});

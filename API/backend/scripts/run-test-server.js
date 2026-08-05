#!/usr/bin/env node
/**
 * Launch a throwaway dev server backed by an in-memory MongoDB.
 *
 * Uses mongodb-memory-server so you can exercise the real API (register, login,
 * products, service history, dashboard, …) without a local/Atlas MongoDB.
 * Cloudinary stays pointed at dummy creds, so the document-upload step will
 * 500/WARN — everything else works end to end.
 *
 * Usage:
 *   node scripts/run-test-server.js            # listens on PORT (default 5000)
 *   PORT=5050 node scripts/run-test-server.js
 *
 * Ctrl-C stops the server and tears down the in-memory database.
 */

const { MongoMemoryServer } = require("mongodb-memory-server");

process.env.NODE_ENV = "development";
process.env.PORT = process.env.PORT || "5000";
process.env.MONGO_URI = "mongodb://localhost/warrantyvault_db"; // replaced below
process.env.JWT_SECRET = "dev-test-secret";
process.env.JWT_EXPIRES_IN = "7d";
process.env.CLOUDINARY_CLOUD_NAME = "test";
process.env.CLOUDINARY_API_KEY = "test";
process.env.CLOUDINARY_API_SECRET = "test";
process.env.CLIENT_URL = "*";

async function main() {
  const mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri();

  // Start the real server (listens because NODE_ENV !== "test").
  require("../src/server");

  const port = process.env.PORT;
  process.stdout.write(
    `\nTest server running on http://localhost:${port}\n` +
    `  Mongo : in-memory (${process.env.MONGO_URI})\n` +
    `  Ctrl-C to stop\n\n`
  );

  async function shutdown() {
    process.stdout.write("\nShutting down test server…\n");
    try { await mongoServer.stop(); } catch { /* already stopped */ }
    process.exit(0);
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});

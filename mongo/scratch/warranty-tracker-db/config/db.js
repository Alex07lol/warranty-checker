const mongoose = require("mongoose");

/**
 * Establishes a MongoDB connection using Mongoose.
 * Call once at app startup (e.g., in server.js / app.js).
 *
 * Required env var: MONGODB_URI
 * e.g. MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/warranty_tracker
 */
const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI environment variable is not set");

  try {
    const conn = await mongoose.connect(uri, {
      // Mongoose 6+ sets these by default, but explicit for clarity
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`✅  MongoDB connected: ${conn.connection.host}`);

    // Graceful shutdown
    process.on("SIGINT", async () => {
      await mongoose.connection.close();
      console.log("🔌  MongoDB connection closed (SIGINT)");
      process.exit(0);
    });
  } catch (err) {
    console.error("❌  MongoDB connection error:", err.message);
    process.exit(1);
  }
};

module.exports = connectDB;

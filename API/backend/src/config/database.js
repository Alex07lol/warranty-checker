const mongoose = require("mongoose");
const { MONGO_URI } = require("./env");

async function connectDatabase() {
  await mongoose.connect(MONGO_URI, {
    dbName: "warrantyvault_db",
    // Generous on purpose: on free hosts (Render/Koyeb) cold starts happen
    // after sleep, and Atlas free-tier connections can take a few seconds.
    // 3s caused boot crashes in production-like conditions.
    serverSelectionTimeoutMS: 15000
  });
}

module.exports = connectDatabase;

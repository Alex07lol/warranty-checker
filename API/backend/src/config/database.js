const mongoose = require("mongoose");
const { MONGO_URI } = require("./env");

async function connectDatabase() {
  await mongoose.connect(MONGO_URI, {
    dbName: "warrantyvault_db",
    serverSelectionTimeoutMS: 3000
  });
}

module.exports = connectDatabase;

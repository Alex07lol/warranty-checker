const mongoose = require("mongoose");
const { MONGO_URI } = require("./env");

async function connectDatabase() {
  await mongoose.connect(MONGO_URI, {
    dbName: "warrantyvault_db"
  });
}

module.exports = connectDatabase;

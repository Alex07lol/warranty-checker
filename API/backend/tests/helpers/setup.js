process.env.PORT = "5000";
process.env.NODE_ENV = "test";
process.env.MONGO_URI = "mongodb://localhost/warrantyvault_db";
process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";
process.env.CLOUDINARY_CLOUD_NAME = "test";
process.env.CLOUDINARY_API_KEY = "test";
process.env.CLOUDINARY_API_SECRET = "test";
process.env.CLIENT_URL = "*";
process.env.AUTH_RATE_LIMIT = "1000";

jest.setTimeout(20000);

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const request = require("supertest");
const app = require("../../src/server");

let mongoServer;

async function startDb() {
  if (process.env.TEST_MONGO_URI) {
    await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: "warrantyvault_db" });
  } else {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri(), { dbName: "warrantyvault_db" });
  }
  // Ensure indexes (including the $text index used by product search) exist.
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.syncIndexes())
  );
}

async function stopDb() {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
}

async function registerUser(name, email, password = "password123") {
  const response = await request(app)
    .post("/api/v1/auth/register")
    .send({ name, email, password, confirmPassword: password });

  return {
    response,
    token: response.body.data && response.body.data.token,
    userId: response.body.data && response.body.data.user && response.body.data.user._id
  };
}

module.exports = {
  app,
  request,
  startDb,
  stopDb,
  registerUser
};

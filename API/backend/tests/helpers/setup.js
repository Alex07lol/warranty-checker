process.env.PORT = "5000";
process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/warrantyvault_db";
process.env.TEST_MONGO_URI = process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017/warrantyvault_test_db";
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
    try {
      await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: "warrantyvault_db" });
    } catch (e) {
      mongoServer = await MongoMemoryServer.create();
      await mongoose.connect(mongoServer.getUri(), { dbName: "warrantyvault_db" });
    }
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
  if (mongoose.connection.readyState === 1) {
    try {
      await mongoose.connection.dropDatabase();
    } catch {
      // ignore
    }
  }
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

  let token = response.body.data?.token;
  let userId = response.body.data?.user?._id;

  if (!token && response.body.data?.requiresVerification && response.body.data?.verificationCode) {
    const verifyRes = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ email, code: response.body.data.verificationCode });
    token = verifyRes.body.data?.token;
    userId = verifyRes.body.data?.user?._id;
    if (response.body.data) {
      response.body.data.token = token;
      response.body.data.user = verifyRes.body.data?.user;
    }
  }

  return {
    response,
    token,
    userId
  };
}

module.exports = {
  app,
  request,
  startDb,
  stopDb,
  registerUser
};

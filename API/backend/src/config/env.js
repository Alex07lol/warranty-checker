const dotenv = require("dotenv");

dotenv.config();

const isTest = process.env.NODE_ENV === "test";

const defaults = {
  PORT: "5000",
  NODE_ENV: "test",
  MONGO_URI: "mongodb://127.0.0.1:27017/warrantyvault_db",
  JWT_SECRET: "test-secret",
  JWT_EXPIRES_IN: "7d",
  CLOUDINARY_CLOUD_NAME: "test",
  CLOUDINARY_API_KEY: "test",
  CLOUDINARY_API_SECRET: "test",
  CLIENT_URL: "*"
};

if (isTest) {
  for (const [key, value] of Object.entries(defaults)) {
    if (!process.env[key]) process.env[key] = value;
  }
}

const required = [
  "PORT",
  "NODE_ENV",
  "MONGO_URI",
  "JWT_SECRET",
  "JWT_EXPIRES_IN",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "CLIENT_URL"
];

const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

module.exports = {
  PORT: Number(process.env.PORT),
  NODE_ENV: process.env.NODE_ENV,
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  CLIENT_URL: process.env.CLIENT_URL
};

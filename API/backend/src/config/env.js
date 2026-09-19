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
  CLIENT_URL: "*",
  RESEND_API_KEY: "test",
  SMTP_USER: "test@example.com",
  SMTP_PASS: "test-password",
  SMTP_SERVICE: "gmail",
  EMAIL_FROM: "WarrantyVault <test@example.com>"
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

if (process.env.NODE_ENV === "production" && process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters in production");
}

// jsonwebtoken expiresIn accepts "15m", "7d", "1h", … (or plain seconds).
// Reject anything else at boot so token lifetime is never accidentally
// misconfigured (e.g. "7 days" or an empty value).
if (process.env.JWT_EXPIRES_IN && !/^\d+[smhdwy]$/.test(process.env.JWT_EXPIRES_IN)) {
  throw new Error("JWT_EXPIRES_IN must be a duration like 15m, 1h, 7d (number + s/m/h/d/w/y)");
}

// Fail fast on a nonsense connection string instead of timing out later.
if (process.env.MONGO_URI && !/^mongodb(\+srv)?:\/\//.test(process.env.MONGO_URI)) {
  throw new Error("MONGO_URI must start with mongodb:// or mongodb+srv://");
}

// Production CORS safety: `origin: true` + credentials reflects ANY origin,
// which must never ship. Fail fast at boot so the misconfiguration is
// obvious instead of silently authorizing cross-site requests.
if (process.env.NODE_ENV === "production") {
  if (process.env.CLIENT_URL === "*") {
    throw new Error(
      "CLIENT_URL must be a specific origin in production — wildcard '*' with credentials is unsafe"
    );
  }
  if (!/^https?:\/\//.test(process.env.CLIENT_URL)) {
    throw new Error("CLIENT_URL must be a valid http(s) origin in production");
  }
}

function resolveEmailFrom(user) {
  const configured = process.env.EMAIL_FROM;
  if (configured && !configured.includes("resend.dev")) {
    return configured;
  }
  if (user) {
    return `WarrantyVault <${user}>`;
  }
  return "WarrantyVault <no-reply@warrantyvault.com>";
}

const smtpUser =
  process.env.SMTP_USER ||
  process.env.GMAIL_USER ||
  process.env.EMAIL_USER;

const rawSmtpPass =
  process.env.SMTP_PASS ||
  process.env.SMTP_PASSWORD ||
  process.env.GMAIL_APP_PASSWORD ||
  process.env.GMAIL_PASS ||
  process.env.GMAIL_PASSWORD ||
  process.env.EMAIL_PASS ||
  "";

module.exports = {
  PORT: Number(process.env.PORT),
  NODE_ENV: process.env.NODE_ENV,
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  CLIENT_URL: process.env.CLIENT_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  BREVO_API_KEY: process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY,
  SMTP_USER: smtpUser,
  SMTP_PASS: rawSmtpPass.replace(/\s+/g, ""),
  SMTP_SERVICE: process.env.SMTP_SERVICE || "gmail",
  EMAIL_FROM: resolveEmailFrom(smtpUser)
};

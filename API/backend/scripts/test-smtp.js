"use strict";

const dotenv = require("dotenv");
dotenv.config();

const nodemailer = require("nodemailer");

const user =
  process.env.SMTP_USER ||
  process.env.GMAIL_USER ||
  process.env.EMAIL_USER;

const rawPass =
  process.env.SMTP_PASS ||
  process.env.SMTP_PASSWORD ||
  process.env.GMAIL_APP_PASSWORD ||
  process.env.GMAIL_PASS ||
  process.env.GMAIL_PASSWORD;

const pass = rawPass ? String(rawPass).replace(/\s+/g, "") : "";

console.log("\n── Testing SMTP Configuration ──────────────────");
console.log("SMTP_USER:", user ? `${user.substring(0, 3)}***@${user.split("@")[1] || "???"}` : "NOT SET");
console.log("SMTP_PASS:", pass ? `Set (${pass.length} chars, whitespace stripped)` : "NOT SET");

if (!user || !pass) {
  console.error("\n❌ ERROR: SMTP_USER or SMTP_PASS is missing in your environment variables!");
  console.log("Make sure to set SMTP_USER and SMTP_PASS in your .env or Render dashboard.\n");
  process.exit(1);
}

const dns = require("node:dns").promises;

async function main() {
  console.log("\nResolving IPv4 for smtp.gmail.com...");
  let host = "smtp.gmail.com";
  try {
    const ips = await dns.resolve4("smtp.gmail.com");
    if (ips && ips.length > 0) {
      host = ips[0];
      console.log(`Resolved IPv4: ${host}`);
    }
  } catch (err) {
    console.warn(`DNS resolve4 failed, using default hostname: ${err.message}`);
  }

  const transporter = nodemailer.createTransport({
    host,
    port: 465,
    secure: true,
    servername: "smtp.gmail.com",
    connectionTimeout: 10000,
    auth: { user, pass }
  });

  console.log("\nConnecting to smtp.gmail.com (verifying credentials)...");
  try {
    await transporter.verify();
    console.log("✅ SUCCESS: Gmail SMTP credentials verified successfully!\n");

    const targetEmail = process.argv[2] || user;
    console.log(`Sending test email to ${targetEmail}...`);
    const info = await transporter.sendMail({
      from: `"WarrantyVault Test" <${user}>`,
      to: targetEmail,
      subject: "WarrantyVault SMTP Test",
      text: "If you received this email, your Gmail SMTP configuration is working perfectly!",
      html: "<h3>SMTP Working!</h3><p>Your Gmail SMTP setup in WarrantyVault is working properly.</p>"
    });
    console.log(`✅ SUCCESS: Test email sent! Message ID: ${info.messageId}\n`);
  } catch (error) {
    console.error("\n❌ FAILED to send email:");
    console.error("  Error Code:    ", error.code);
    console.error("  Error Command: ", error.command);
    console.error("  Error Response:", error.response);
    console.error("  Error Message: ", error.message);

    if (error.code === "EAUTH" || (error.response && error.response.includes("535"))) {
      console.log("\n💡 Solution for 535 / EAUTH:");
      console.log("  1. Ensure you are using a 16-character Google App Password, NOT your regular account password.");
      console.log("  2. Verify 2-Step Verification is active on your Google Account.");
      console.log("  3. Create a new App Password at https://myaccount.google.com/apppasswords");
    }
    process.exit(1);
  }
}

main();

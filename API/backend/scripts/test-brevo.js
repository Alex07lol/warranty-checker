"use strict";

const dotenv = require("dotenv");
dotenv.config();

const apiKey = process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || process.argv[2];
const recipient = process.argv[3] || process.env.TEST_EMAIL || "test@example.com";
const sender = process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER || process.env.GMAIL_USER;

console.log("\n── Testing Brevo HTTPS API ──────────────────────");
console.log("BREVO_API_KEY:", apiKey ? `${apiKey.substring(0, 10)}...` : "NOT SET");
console.log("SENDER EMAIL :", sender || "NOT SET (defaults to your Brevo account email)");
console.log("RECIPIENT    :", recipient);

if (!apiKey) {
  console.error("\n❌ ERROR: BREVO_API_KEY is missing!");
  console.log("Usage: node scripts/test-brevo.js <api-key> <recipient-email>\n");
  process.exit(1);
}

if (!sender) {
  console.error("\n❌ ERROR: Sender email is missing! Set BREVO_SENDER_EMAIL or SMTP_USER in .env to the email you used on Brevo.\n");
  process.exit(1);
}

async function main() {
  console.log("\nSending test email via https://api.brevo.com/v3/smtp/email...");
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        sender: { email: sender, name: "WarrantyVault" },
        to: [{ email: recipient, name: "Test User" }],
        subject: "WarrantyVault Brevo Test",
        htmlContent: "<h3>Brevo HTTPS Working!</h3><p>Your OTP and verification emails are now powered by Brevo HTTPS API.</p>",
        textContent: "Brevo HTTPS is working! Your OTP emails will now be delivered via HTTPS."
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || `HTTP ${res.status}: ${JSON.stringify(data)}`);
    }

    console.log("✅ SUCCESS: Email sent via Brevo HTTPS API!");
    console.log("Message ID:", data.messageId, "\n");
  } catch (error) {
    console.error("\n❌ FAILED to send via Brevo:", error.message);
    process.exit(1);
  }
}

main();

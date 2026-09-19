"use strict";

const nodemailer = require("nodemailer");
const {
  SMTP_USER,
  SMTP_PASS,
  EMAIL_FROM,
  NODE_ENV,
  RESEND_API_KEY,
  BREVO_API_KEY
} = require("../config/env");
const logger = require("../utils/logger");
const AppError = require("../utils/AppError");

const dns = require("node:dns");
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

let mailTransporter = null;

async function getMailTransporter() {
  if (
    !mailTransporter &&
    SMTP_USER &&
    SMTP_PASS &&
    SMTP_USER !== "test@example.com" &&
    !SMTP_USER.startsWith("<")
  ) {
    let host = process.env.SMTP_HOST || "smtp.gmail.com";
    let servername = host;

    // Render containers have no outbound IPv6 routing. Nodemailer's built-in
    // resolver queries both IPv4 and IPv6 and picks randomly.
    // Explicitly resolving IPv4 and connecting to the IPv4 address with servername SNI
    // guarantees a fast IPv4 connection and prevents ENETUNREACH.
    if (!process.env.SMTP_HOST || process.env.SMTP_HOST === "smtp.gmail.com") {
      try {
        const ips = await dns.promises.resolve4("smtp.gmail.com");
        if (ips && ips.length > 0) {
          host = ips[0];
          servername = "smtp.gmail.com";
        }
      } catch (err) {
        logger.warn("DNS resolve4 for smtp.gmail.com failed, falling back to hostname", {
          error: err.message
        });
      }
    }

    const port = Number(process.env.SMTP_PORT) || 587;
    const isPort465 = port === 465;

    mailTransporter = nodemailer.createTransport({
      host,
      port,
      secure: isPort465,
      requireTLS: !isPort465,
      servername,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });
  }
  return mailTransporter;
}

// In-memory test store so test suites can inspect sent emails without real network calls.
const testSentEmails = [];

function getTestSentEmails() {
  return [...testSentEmails];
}

function clearTestSentEmails() {
  testSentEmails.length = 0;
}

function getLatestCodeForEmail(email) {
  const normalized = String(email || "").toLowerCase().trim();
  const match = [...testSentEmails].reverse().find((e) => e.to.toLowerCase() === normalized);
  return match ? match.code : null;
}

/**
 * Generate a responsive HTML template for 6-digit verification code emails.
 */
function buildVerificationEmailHtml({ name, code, expiresMinutes = 15 }) {
  const safeName = name ? String(name).replace(/[<>&"]/g, "") : "there";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your WarrantyVault account</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background: #151d30; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.4);">
          <!-- Header -->
          <tr>
            <td style="padding: 36px 36px 20px 36px; text-align: center;">
              <div style="display: inline-block; width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #6366f1, #3b82f6); line-height: 48px; text-align: center; margin-bottom: 16px;">
                <span style="font-size: 24px; color: #ffffff;">🛡️</span>
              </div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">WarrantyVault</h1>
              <p style="margin: 6px 0 0 0; font-size: 14px; color: #94a3b8;">Your digital ownership and warranty vault</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 10px 36px 30px 36px;">
              <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #f8fafc;">Verify your email address</h2>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #cbd5e1;">
                Hi ${safeName},<br>
                Thank you for joining WarrantyVault. Use the 6-digit verification code below to verify your email and activate your account.
              </p>

              <!-- Code Box -->
              <div style="background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: #94a3b8; margin-bottom: 8px;">Verification Code</div>
                <div style="font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 36px; font-weight: 700; letter-spacing: 10px; color: #60a5fa; margin-left: 10px;">${code}</div>
                <div style="margin-top: 10px; font-size: 13px; color: #f59e0b;">Expires in ${expiresMinutes} minutes</div>
              </div>

              <p style="margin: 0 0 16px 0; font-size: 13px; line-height: 20px; color: #94a3b8;">
                This code can only be used once. If you did not create an account on WarrantyVault, you can safely ignore this message.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 36px; background: #0c1222; border-top: 1px solid #1e293b; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #64748b;">
                &copy; ${new Date().getFullYear()} WarrantyVault. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Plain text fallback for email clients.
 */
function buildVerificationEmailText({ name, code, expiresMinutes = 15 }) {
  const safeName = name || "there";
  return [
    `WarrantyVault Email Verification`,
    `--------------------------------`,
    `Hello ${safeName},`,
    ``,
    `Your 6-digit verification code is: ${code}`,
    ``,
    `This code will expire in ${expiresMinutes} minutes.`,
    ``,
    `If you did not request this email, please ignore it.`,
    ``,
    `-- The WarrantyVault Team`
  ].join("\n");
}

/**
 * Send an email via Brevo's HTTP API (port 443 - cannot be blocked by cloud firewalls).
 */
async function sendViaBrevo({ to, name, subject, html, text }) {
  const apiKey = BREVO_API_KEY || process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY;
  let senderEmail = SMTP_USER || process.env.BREVO_SENDER_EMAIL;
  if (!senderEmail && EMAIL_FROM && EMAIL_FROM.includes("<") && EMAIL_FROM.includes(">")) {
    const start = EMAIL_FROM.indexOf("<") + 1;
    const end = EMAIL_FROM.indexOf(">");
    senderEmail = EMAIL_FROM.slice(start, end).trim();
  }
  if (!senderEmail) {
    senderEmail = "notifications@warrantyvault.com";
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: "WarrantyVault" },
      to: [{ email: to, name: name || to }],
      subject,
      htmlContent: html,
      textContent: text
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `Brevo returned HTTP ${response.status}`);
  }
  const data = await response.json();
  return data.messageId || "brevo-sent";
}

/**
 * Send an email via Resend's HTTP API (port 443).
 */
async function sendViaResend({ to, subject, html, text }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: EMAIL_FROM || "WarrantyVault <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
      text
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `Resend returned HTTP ${response.status}`);
  }
  const data = await response.json();
  return data.id || "resend-sent";
}

/**
 * Send an actual verification email to the user using Nodemailer / SMTP (Gmail),
 * or Brevo / Resend HTTPS APIs if configured.
 */
async function sendVerificationEmail({ to, name, code, expiresMinutes = 15 }) {
  const subject = `${code} is your WarrantyVault verification code`;
  const html = buildVerificationEmailHtml({ name, code, expiresMinutes });
  const text = buildVerificationEmailText({ name, code, expiresMinutes });

  // Record for test environments
  if (NODE_ENV === "test") {
    testSentEmails.push({ to, name, code, subject, html, text, sentAt: new Date() });
    logger.info("Verification email recorded in test mode", { to, code });
    return { success: true, id: "test-email-id", code };
  }

  // 1. If Brevo HTTPS API key is set, send via pure HTTPS (immune to SMTP port blocks)
  if (BREVO_API_KEY && BREVO_API_KEY !== "test" && !BREVO_API_KEY.startsWith("<")) {
    try {
      const messageId = await sendViaBrevo({ to, name, subject, html, text });
      logger.info("Verification email sent via Brevo HTTPS API", { to, messageId });
      return { success: true, id: messageId };
    } catch (err) {
      logger.error("Error sending verification email via Brevo HTTPS API", { to, error: err.message });
      throw new AppError(err.message || "Failed to send email via Brevo", 502);
    }
  }

  // 2. If Resend HTTPS API key is set, send via pure HTTPS
  if (RESEND_API_KEY && RESEND_API_KEY !== "test" && !RESEND_API_KEY.startsWith("<") && process.env.ENABLE_RESEND_FALLBACK === "true") {
    try {
      const id = await sendViaResend({ to, subject, html, text });
      logger.info("Verification email sent via Resend HTTPS API", { to, id });
      return { success: true, id };
    } catch (err) {
      logger.error("Error sending verification email via Resend HTTPS API", { to, error: err.message });
      throw new AppError(err.message || "Failed to send email via Resend", 502);
    }
  }

  const transporter = await getMailTransporter();

  // Development fallback when SMTP credentials are not configured yet
  if (!transporter) {
    if (NODE_ENV === "production") {
      logger.error("SMTP credentials (SMTP_USER / SMTP_PASS) are not configured in production");
      throw new AppError("Email service is temporarily unavailable", 503);
    }

    logger.warn(
      `[DEV EMAIL MOCK] SMTP credentials unset. Code for ${to}: [${code}] (Expires in ${expiresMinutes}m)`
    );
    testSentEmails.push({ to, name, code, subject, html, text, sentAt: new Date() });
    return { success: true, id: "dev-mock-id", code };
  }

  try {
    const fromAddress = EMAIL_FROM || `"WarrantyVault" <${SMTP_USER}>`;
    const result = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html,
      text
    });

    logger.info("Verification email sent via Nodemailer/SMTP", {
      to,
      messageId: result.messageId
    });
    return { success: true, id: result.messageId };
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error("Error sending verification email via Nodemailer/SMTP", {
      to,
      error: error.message,
      code: error.code,
      response: error.response
    });
    let message = "Failed to send verification email. Please try again later.";
    if (error.code === "EAUTH") {
      message = "Email authentication failed (EAUTH). Please check your Gmail address and 16-character App Password.";
    } else if (NODE_ENV !== "production") {
      message = `Failed to send email: ${error.message}`;
    }
    throw new AppError(message, 502);
  }
}

module.exports = {
  sendVerificationEmail,
  getTestSentEmails,
  clearTestSentEmails,
  getLatestCodeForEmail,
  buildVerificationEmailHtml,
  buildVerificationEmailText
};

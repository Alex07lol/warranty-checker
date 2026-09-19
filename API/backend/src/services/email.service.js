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

function getLatestCodeForEmail(email, type) {
  const normalized = String(email || "").toLowerCase().trim();
  const match = [...testSentEmails].reverse().find((e) => {
    const matchesEmail = e.to.toLowerCase() === normalized;
    if (!matchesEmail) return false;
    if (type) return e.type === type;
    return true;
  });
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
 * Generate a responsive HTML template for password reset emails.
 */
function buildPasswordResetEmailHtml({ name, code, expiresMinutes = 15 }) {
  const safeName = name ? String(name).replace(/[<>&"]/g, "") : "there";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your WarrantyVault password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background: #151d30; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.4);">
          <!-- Header -->
          <tr>
            <td style="padding: 36px 36px 20px 36px; text-align: center;">
              <div style="display: inline-block; width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #f59e0b, #ef4444); line-height: 48px; text-align: center; margin-bottom: 16px;">
                <span style="font-size: 24px; color: #ffffff;">🔑</span>
              </div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">WarrantyVault</h1>
              <p style="margin: 6px 0 0 0; font-size: 14px; color: #94a3b8;">Password Reset Request</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 10px 36px 30px 36px;">
              <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #f8fafc;">Reset your password</h2>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #cbd5e1;">
                Hi ${safeName},<br>
                We received a request to reset the password for your WarrantyVault account. Enter the 6-digit verification code below to set a new password.
              </p>

              <!-- Code Box -->
              <div style="background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: #94a3b8; margin-bottom: 8px;">Password Reset Code</div>
                <div style="font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 36px; font-weight: 700; letter-spacing: 10px; color: #f59e0b; margin-left: 10px;">${code}</div>
                <div style="margin-top: 10px; font-size: 13px; color: #94a3b8;">Expires in ${expiresMinutes} minutes</div>
              </div>

              <p style="margin: 0 0 16px 0; font-size: 13px; line-height: 20px; color: #94a3b8;">
                If you did not request a password reset, please ignore this email. Your current password will remain secure and unchanged.
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

function buildPasswordResetEmailText({ name, code, expiresMinutes = 15 }) {
  const safeName = name || "there";
  return [
    `WarrantyVault Password Reset`,
    `----------------------------`,
    `Hello ${safeName},`,
    ``,
    `We received a request to reset your password.`,
    `Your 6-digit password reset code is: ${code}`,
    ``,
    `This code will expire in ${expiresMinutes} minutes.`,
    ``,
    `If you did not request this change, please ignore this email.`,
    ``,
    `-- The WarrantyVault Team`
  ].join("\n");
}

/**
 * Generate a responsive HTML template for account deletion confirmation emails.
 */
function buildAccountDeletionEmailHtml({ name, code, expiresMinutes = 15 }) {
  const safeName = name ? String(name).replace(/[<>&"]/g, "") : "there";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm WarrantyVault Account Deletion</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background: #151d30; border: 1px solid #ef4444; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(239, 68, 68, 0.2);">
          <!-- Header -->
          <tr>
            <td style="padding: 36px 36px 20px 36px; text-align: center;">
              <div style="display: inline-block; width: 48px; height: 48px; border-radius: 12px; background: #ef4444; line-height: 48px; text-align: center; margin-bottom: 16px;">
                <span style="font-size: 24px; color: #ffffff;">⚠️</span>
              </div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">WarrantyVault</h1>
              <p style="margin: 6px 0 0 0; font-size: 14px; color: #ef4444; font-weight: 600;">Account Deletion Request</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 10px 36px 30px 36px;">
              <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #f8fafc;">Confirm permanent deletion</h2>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #cbd5e1;">
                Hi ${safeName},<br>
                We received a request to permanently delete your WarrantyVault account. This will erase all your products, receipts, warranty documents, service logs, and notifications.
              </p>

              <!-- Code Box -->
              <div style="background: #0f172a; border: 1px solid #ef4444; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: #fca5a5; margin-bottom: 8px;">Deletion Confirmation Code</div>
                <div style="font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 36px; font-weight: 700; letter-spacing: 10px; color: #ef4444; margin-left: 10px;">${code}</div>
                <div style="margin-top: 10px; font-size: 13px; color: #f87171;">Expires in ${expiresMinutes} minutes</div>
              </div>

              <p style="margin: 0 0 16px 0; font-size: 13px; line-height: 20px; color: #94a3b8;">
                <strong style="color: #ef4444;">Warning:</strong> This action cannot be undone. If you did not initiate this request, change your password immediately and do NOT share this code.
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

function buildAccountDeletionEmailText({ name, code, expiresMinutes = 15 }) {
  const safeName = name || "there";
  return [
    `WarrantyVault Account Deletion Confirmation`,
    `--------------------------------------------`,
    `Hello ${safeName},`,
    ``,
    `We received a request to permanently delete your WarrantyVault account.`,
    `Your 6-digit account deletion code is: ${code}`,
    ``,
    `This code will expire in ${expiresMinutes} minutes.`,
    ``,
    `WARNING: This action is permanent and cannot be undone. All warranty records, documents, and notifications will be deleted.`,
    ``,
    `If you did not request this, please secure your account immediately.`,
    ``,
    `-- The WarrantyVault Team`
  ].join("\n");
}

let cachedBrevoSender = null;

async function getBrevoSender(apiKey) {
  if (cachedBrevoSender) {
    return cachedBrevoSender;
  }
  try {
    const res = await fetch("https://api.brevo.com/v3/senders", {
      headers: { "api-key": apiKey, Accept: "application/json" }
    });
    if (res.ok) {
      const data = await res.json();
      const active = (data.senders || []).find((s) => s.active);
      if (active && active.email) {
        cachedBrevoSender = active.email;
        return active.email;
      }
    }
  } catch {
    // fallback if senders endpoint fails
  }
  return "notifications@warrantyvault.com";
}

/**
 * Send an email via Brevo's HTTP API (port 443 - cannot be blocked by cloud firewalls).
 */
async function sendViaBrevo({ to, name, subject, html, text }) {
  const apiKey = BREVO_API_KEY || process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY;
  let senderEmail = process.env.BREVO_SENDER_EMAIL || SMTP_USER;
  if (!senderEmail && EMAIL_FROM && EMAIL_FROM.includes("<") && EMAIL_FROM.includes(">")) {
    const start = EMAIL_FROM.indexOf("<") + 1;
    const end = EMAIL_FROM.indexOf(">");
    senderEmail = EMAIL_FROM.slice(start, end).trim();
  }
  if (!senderEmail || senderEmail.includes("warrantyvault.com") || senderEmail.includes("resend.dev")) {
    senderEmail = await getBrevoSender(apiKey);
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

async function dispatchEmail({
  to,
  name,
  subject,
  html,
  text,
  code,
  type = "verification",
  logLabel = "Verification email"
}) {
  // Record for test environments
  if (NODE_ENV === "test") {
    testSentEmails.push({ to, name, code, type, subject, html, text, sentAt: new Date() });
    logger.info(`${logLabel} recorded in test mode`, { to, code, type });
    return { success: true, id: "test-email-id", code };
  }

  // 1. If Brevo HTTPS API key is set, send via pure HTTPS (immune to SMTP port blocks)
  if (BREVO_API_KEY && BREVO_API_KEY !== "test" && !BREVO_API_KEY.startsWith("<")) {
    try {
      const messageId = await sendViaBrevo({ to, name, subject, html, text });
      logger.info(`${logLabel} sent via Brevo HTTPS API`, { to, messageId, type });
      return { success: true, id: messageId };
    } catch (err) {
      logger.error(`Error sending ${logLabel} via Brevo HTTPS API`, { to, error: err.message, type });
      throw new AppError(err.message || "Failed to send email via Brevo", 502);
    }
  }

  // 2. If Resend HTTPS API key is set, send via pure HTTPS
  if (RESEND_API_KEY && RESEND_API_KEY !== "test" && !RESEND_API_KEY.startsWith("<") && process.env.ENABLE_RESEND_FALLBACK === "true") {
    try {
      const id = await sendViaResend({ to, subject, html, text });
      logger.info(`${logLabel} sent via Resend HTTPS API`, { to, id, type });
      return { success: true, id };
    } catch (err) {
      logger.error(`Error sending ${logLabel} via Resend HTTPS API`, { to, error: err.message, type });
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
      `[DEV EMAIL MOCK] SMTP credentials unset. ${logLabel} for ${to}: [${code}] (Type: ${type})`
    );
    testSentEmails.push({ to, name, code, type, subject, html, text, sentAt: new Date() });
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

    logger.info(`${logLabel} sent via Nodemailer/SMTP`, {
      to,
      messageId: result.messageId,
      type
    });
    return { success: true, id: result.messageId };
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error(`Error sending ${logLabel} via Nodemailer/SMTP`, {
      to,
      error: error.message,
      code: error.code,
      response: error.response,
      type
    });
    let message = `Failed to send ${logLabel.toLowerCase()}. Please try again later.`;
    if (error.code === "EAUTH") {
      message = "Email authentication failed (EAUTH). Please check your Gmail address and 16-character App Password.";
    } else if (NODE_ENV !== "production") {
      message = `Failed to send email: ${error.message}`;
    }
    throw new AppError(message, 502);
  }
}

/**
 * Send an email verification code.
 */
async function sendVerificationEmail({ to, name, code, expiresMinutes = 15 }) {
  const subject = `${code} is your WarrantyVault verification code`;
  const html = buildVerificationEmailHtml({ name, code, expiresMinutes });
  const text = buildVerificationEmailText({ name, code, expiresMinutes });
  return dispatchEmail({
    to,
    name,
    subject,
    html,
    text,
    code,
    type: "verification",
    logLabel: "Verification email"
  });
}

/**
 * Send a password reset code.
 */
async function sendPasswordResetEmail({ to, name, code, expiresMinutes = 15 }) {
  const subject = `${code} is your WarrantyVault password reset code`;
  const html = buildPasswordResetEmailHtml({ name, code, expiresMinutes });
  const text = buildPasswordResetEmailText({ name, code, expiresMinutes });
  return dispatchEmail({
    to,
    name,
    subject,
    html,
    text,
    code,
    type: "password_reset",
    logLabel: "Password reset email"
  });
}

/**
 * Send an account deletion confirmation code.
 */
async function sendAccountDeletionEmail({ to, name, code, expiresMinutes = 15 }) {
  const subject = `${code} is your WarrantyVault account deletion code`;
  const html = buildAccountDeletionEmailHtml({ name, code, expiresMinutes });
  const text = buildAccountDeletionEmailText({ name, code, expiresMinutes });
  return dispatchEmail({
    to,
    name,
    subject,
    html,
    text,
    code,
    type: "account_deletion",
    logLabel: "Account deletion email"
  });
}

// ─── Notification email templates ────────────────────────────────────────────

/**
 * Shared header/footer chrome for notification emails.
 * @param {object} opts
 * @param {string} opts.accentColor   – hex colour for the icon circle
 * @param {string} opts.icon          – emoji for the icon
 * @param {string} opts.subtitle      – subheading beneath WarrantyVault
 * @param {string} opts.bodyHtml      – inner content between header and footer
 */
function buildNotificationEmailWrapper({ accentColor, icon, subtitle, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WarrantyVault Notification</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background: #151d30; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.4);">
          <!-- Header -->
          <tr>
            <td style="padding: 36px 36px 20px 36px; text-align: center;">
              <div style="display: inline-block; width: 48px; height: 48px; border-radius: 12px; background: ${accentColor}; line-height: 48px; text-align: center; margin-bottom: 16px;">
                <span style="font-size: 24px; color: #ffffff;">${icon}</span>
              </div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">WarrantyVault</h1>
              <p style="margin: 6px 0 0 0; font-size: 14px; color: #94a3b8;">${subtitle}</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 10px 36px 30px 36px;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 36px; background: #0c1222; border-top: 1px solid #1e293b; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #64748b;">
                &copy; ${new Date().getFullYear()} WarrantyVault. All rights reserved.<br>
                <span style="color: #475569;">You can manage your email preferences in your account settings.</span>
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

function buildWarrantyExpiryNotifHtml({ name, productName, expiryDate, daysLeft }) {
  const safeName = name ? String(name).replace(/[<>&"]/g, "") : "there";
  const safeProduct = String(productName || "Your product").replace(/[<>&"]/g, "");
  let badge = "#3b82f6";
  let urgency = `IN ${daysLeft} DAYS`;
  if (daysLeft <= 1) {
    badge = "#ef4444";
    urgency = "TODAY";
  } else if (daysLeft <= 7) {
    badge = "#f59e0b";
    urgency = "THIS WEEK";
  }
  const bodyHtml = `
    <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #f8fafc;">Warranty expiring soon</h2>
    <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 24px; color: #cbd5e1;">
      Hi ${safeName},<br>
      The warranty on one of your products is about to expire. Here are the details:
    </p>
    <div style="background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
      <div style="font-size: 13px; color: #94a3b8; margin-bottom: 4px;">Product</div>
      <div style="font-size: 17px; font-weight: 600; color: #f8fafc; margin-bottom: 14px;">${safeProduct}</div>
      <div style="font-size: 13px; color: #94a3b8; margin-bottom: 4px;">Warranty Expiry Date</div>
      <div style="font-size: 16px; font-weight: 600; color: #f8fafc; margin-bottom: 14px;">${expiryDate}</div>
      <div style="display: inline-block; background: ${badge}22; border: 1px solid ${badge}; border-radius: 6px; padding: 4px 12px; font-size: 12px; font-weight: 700; color: ${badge}; letter-spacing: 0.5px;">EXPIRES ${urgency}</div>
    </div>
    <p style="margin: 0; font-size: 13px; line-height: 20px; color: #94a3b8;">
      Log in to WarrantyVault to view your product details or take action before your warranty expires.
    </p>`;
  return buildNotificationEmailWrapper({
    accentColor: "linear-gradient(135deg, #f59e0b, #ef4444)",
    icon: "⚠️",
    subtitle: "Warranty Expiry Alert",
    bodyHtml
  });
}

function buildWarrantyExpiryNotifText({ name, productName, expiryDate, daysLeft }) {
  return [
    `WarrantyVault — Warranty Expiry Alert`,
    `--------------------------------------`,
    `Hello ${name || "there"},`,
    ``,
    `Your warranty for "${productName}" expires on ${expiryDate} (${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining).`,
    ``,
    `Log in to WarrantyVault to view details or take action.`,
    ``,
    `-- The WarrantyVault Team`
  ].join("\n");
}

function buildServiceReminderNotifHtml({ name, productName, serviceDate, daysLeft }) {
  const safeName = name ? String(name).replace(/[<>&"]/g, "") : "there";
  const safeProduct = String(productName || "Your product").replace(/[<>&"]/g, "");
  const bodyHtml = `
    <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #f8fafc;">Maintenance reminder</h2>
    <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 24px; color: #cbd5e1;">
      Hi ${safeName},<br>
      A scheduled maintenance or service is coming up for one of your products.
    </p>
    <div style="background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
      <div style="font-size: 13px; color: #94a3b8; margin-bottom: 4px;">Product</div>
      <div style="font-size: 17px; font-weight: 600; color: #f8fafc; margin-bottom: 14px;">${safeProduct}</div>
      <div style="font-size: 13px; color: #94a3b8; margin-bottom: 4px;">Next Service Date</div>
      <div style="font-size: 16px; font-weight: 600; color: #f8fafc; margin-bottom: 14px;">${serviceDate}</div>
      <div style="display: inline-block; background: #06b6d422; border: 1px solid #06b6d4; border-radius: 6px; padding: 4px 12px; font-size: 12px; font-weight: 700; color: #06b6d4; letter-spacing: 0.5px;">DUE IN ${daysLeft} DAY${daysLeft === 1 ? "" : "S"}</div>
    </div>
    <p style="margin: 0; font-size: 13px; line-height: 20px; color: #94a3b8;">
      Log in to WarrantyVault to review your service history and schedule an appointment.
    </p>`;
  return buildNotificationEmailWrapper({
    accentColor: "linear-gradient(135deg, #06b6d4, #3b82f6)",
    icon: "🔧",
    subtitle: "Maintenance Reminder",
    bodyHtml
  });
}

function buildServiceReminderNotifText({ name, productName, serviceDate, daysLeft }) {
  return [
    `WarrantyVault — Maintenance Reminder`,
    `-------------------------------------`,
    `Hello ${name || "there"},`,
    ``,
    `Scheduled service for "${productName}" is due on ${serviceDate} (${daysLeft} day${daysLeft === 1 ? "" : "s"}).`,
    ``,
    `Log in to WarrantyVault to review your service history.`,
    ``,
    `-- The WarrantyVault Team`
  ].join("\n");
}

function buildDocumentProcessingNotifHtml({ name, fileName, succeeded }) {
  const safeName = name ? String(name).replace(/[<>&"]/g, "") : "there";
  const safeFile = String(fileName || "your document").replace(/[<>&"]/g, "");
  const statusColor = succeeded ? "#22c55e" : "#ef4444";
  const statusLabel = succeeded ? "PROCESSING COMPLETE" : "PROCESSING FAILED";
  const bodyHtml = `
    <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #f8fafc;">
      Document ${succeeded ? "processed" : "processing failed"}
    </h2>
    <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 24px; color: #cbd5e1;">
      Hi ${safeName},<br>
      ${succeeded
    ? "OCR successfully extracted data from your document. The information is now available in your vault."
    : "We were unable to extract data from your document. You may want to review the file quality or re-upload it."}
    </p>
    <div style="background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
      <div style="font-size: 13px; color: #94a3b8; margin-bottom: 4px;">File</div>
      <div style="font-size: 16px; font-weight: 600; color: #f8fafc; margin-bottom: 14px;">${safeFile}</div>
      <div style="display: inline-block; background: ${statusColor}22; border: 1px solid ${statusColor}; border-radius: 6px; padding: 4px 12px; font-size: 12px; font-weight: 700; color: ${statusColor}; letter-spacing: 0.5px;">${statusLabel}</div>
    </div>
    <p style="margin: 0; font-size: 13px; line-height: 20px; color: #94a3b8;">
      Log in to WarrantyVault to ${succeeded ? "view the extracted data" : "re-upload or review the document"}.
    </p>`;
  return buildNotificationEmailWrapper({
    accentColor: succeeded ? "linear-gradient(135deg, #22c55e, #16a34a)" : "linear-gradient(135deg, #ef4444, #dc2626)",
    icon: succeeded ? "✅" : "❌",
    subtitle: "Document Processing",
    bodyHtml
  });
}

function buildDocumentProcessingNotifText({ name, fileName, succeeded }) {
  return [
    `WarrantyVault — Document ${succeeded ? "Processed" : "Processing Failed"}`,
    `----------------------------------------------`,
    `Hello ${name || "there"},`,
    ``,
    succeeded
      ? `OCR successfully processed "${fileName}". The data is now available in your vault.`
      : `We could not process "${fileName}". Please review the file and try re-uploading.`,
    ``,
    `-- The WarrantyVault Team`
  ].join("\n");
}

function buildSharedAccessNotifHtml({ name, productName }) {
  const safeName = name ? String(name).replace(/[<>&"]/g, "") : "there";
  const safeProduct = String(productName || "Your product").replace(/[<>&"]/g, "");
  const bodyHtml = `
    <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #f8fafc;">Share link created</h2>
    <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 24px; color: #cbd5e1;">
      Hi ${safeName},<br>
      A shareable link has been created for one of your products. Anyone with the link can view the product details.
    </p>
    <div style="background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
      <div style="font-size: 13px; color: #94a3b8; margin-bottom: 4px;">Shared Product</div>
      <div style="font-size: 17px; font-weight: 600; color: #f8fafc; margin-bottom: 14px;">${safeProduct}</div>
      <div style="display: inline-block; background: #a855f722; border: 1px solid #a855f7; border-radius: 6px; padding: 4px 12px; font-size: 12px; font-weight: 700; color: #a855f7; letter-spacing: 0.5px;">LINK ACTIVE</div>
    </div>
    <p style="margin: 0; font-size: 13px; line-height: 20px; color: #94a3b8;">
      If you did not create this link, log in immediately and revoke it from your product's share settings.
    </p>`;
  return buildNotificationEmailWrapper({
    accentColor: "linear-gradient(135deg, #a855f7, #6366f1)",
    icon: "🔗",
    subtitle: "Share Link Created",
    bodyHtml
  });
}

function buildSharedAccessNotifText({ name, productName }) {
  return [
    `WarrantyVault — Share Link Created`,
    `-----------------------------------`,
    `Hello ${name || "there"},`,
    ``,
    `A shareable link for "${productName}" was created. Anyone with the link can view the product details.`,
    ``,
    `If you did not create this link, log in and revoke it immediately.`,
    ``,
    `-- The WarrantyVault Team`
  ].join("\n");
}

/**
 * Send an email for an in-app notification event.
 *
 * @param {object} opts
 * @param {string} opts.to              – recipient email address
 * @param {string} opts.name            – recipient display name
 * @param {string} opts.notificationType – warranty_expiry | service_reminder | document_processing | shared_access
 * @param {object} opts.payload         – type-specific fields (productName, expiryDate, daysLeft, etc.)
 */
async function sendNotificationEmail({ to, name, notificationType, payload = {} }) {
  let subject, html, text;

  switch (notificationType) {
    case "warranty_expiry": {
      const { productName, expiryDate, daysLeft } = payload;
      subject = `⚠️ Warranty expiring in ${daysLeft} day${daysLeft === 1 ? "" : "s"}: ${productName}`;
      html = buildWarrantyExpiryNotifHtml({ name, productName, expiryDate, daysLeft });
      text = buildWarrantyExpiryNotifText({ name, productName, expiryDate, daysLeft });
      break;
    }
    case "service_reminder": {
      const { productName, serviceDate, daysLeft } = payload;
      subject = `🔧 Service reminder in ${daysLeft} day${daysLeft === 1 ? "" : "s"}: ${productName}`;
      html = buildServiceReminderNotifHtml({ name, productName, serviceDate, daysLeft });
      text = buildServiceReminderNotifText({ name, productName, serviceDate, daysLeft });
      break;
    }
    case "document_processing": {
      const { fileName, succeeded } = payload;
      subject = succeeded
        ? `✅ Document processed: ${fileName}`
        : `❌ Document processing failed: ${fileName}`;
      html = buildDocumentProcessingNotifHtml({ name, fileName, succeeded });
      text = buildDocumentProcessingNotifText({ name, fileName, succeeded });
      break;
    }
    case "shared_access": {
      const { productName } = payload;
      subject = `🔗 Share link created for: ${productName}`;
      html = buildSharedAccessNotifHtml({ name, productName });
      text = buildSharedAccessNotifText({ name, productName });
      break;
    }
    default:
      // Unknown type — skip silently
      return { success: false, reason: "unknown_type" };
  }

  return dispatchEmail({
    to,
    name,
    subject,
    html,
    text,
    type: notificationType,
    logLabel: `Notification email (${notificationType})`
  });
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendAccountDeletionEmail,
  sendNotificationEmail,
  getTestSentEmails,
  clearTestSentEmails,
  getLatestCodeForEmail,
  buildVerificationEmailHtml,
  buildVerificationEmailText,
  buildPasswordResetEmailHtml,
  buildPasswordResetEmailText,
  buildAccountDeletionEmailHtml,
  buildAccountDeletionEmailText,
  buildWarrantyExpiryNotifHtml,
  buildServiceReminderNotifHtml,
  buildDocumentProcessingNotifHtml,
  buildSharedAccessNotifHtml
};

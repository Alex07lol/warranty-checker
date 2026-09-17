"use strict";

const { Resend } = require("resend");
const { RESEND_API_KEY, EMAIL_FROM, NODE_ENV } = require("../config/env");
const logger = require("../utils/logger");
const AppError = require("../utils/AppError");

let resendClient = null;

function getResendClient() {
  if (!resendClient && RESEND_API_KEY && RESEND_API_KEY !== "test" && !RESEND_API_KEY.startsWith("<")) {
    resendClient = new Resend(RESEND_API_KEY);
  }
  return resendClient;
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
 * Send an actual verification email to the user using the Resend API.
 */
async function sendVerificationEmail({ to, name, code, expiresMinutes = 15 }) {
  const client = getResendClient();
  const subject = `${code} is your WarrantyVault verification code`;
  const html = buildVerificationEmailHtml({ name, code, expiresMinutes });
  const text = buildVerificationEmailText({ name, code, expiresMinutes });

  // Record for test environments
  if (NODE_ENV === "test") {
    testSentEmails.push({ to, name, code, subject, html, text, sentAt: new Date() });
    logger.info("Verification email recorded in test mode", { to, code });
    return { success: true, id: "test-email-id", code };
  }

  // Development fallback when RESEND_API_KEY is not configured yet
  if (!client) {
    if (NODE_ENV === "production") {
      logger.error("RESEND_API_KEY is not configured in production");
      throw new AppError("Email service is temporarily unavailable", 503);
    }

    logger.warn(
      `[DEV EMAIL MOCK] RESEND_API_KEY is unset. Code for ${to}: [${code}] (Expires in ${expiresMinutes}m)`
    );
    testSentEmails.push({ to, name, code, subject, html, text, sentAt: new Date() });
    return { success: true, id: "dev-mock-id", code };
  }

  try {
    const fromAddress = EMAIL_FROM || "WarrantyVault <onboarding@resend.dev>";
    const result = await client.emails.send({
      from: fromAddress,
      to,
      subject,
      html,
      text
    });

    if (result.error) {
      logger.error("Resend API returned an error", {
        to,
        error: result.error.message || result.error
      });
      throw new AppError(
        result.error.message || "Failed to deliver verification email via Resend API",
        502
      );
    }

    logger.info("Verification email sent via Resend", { to, emailId: result.data?.id });
    return { success: true, id: result.data?.id };
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error("Error sending verification email via Resend", {
      to,
      error: error.message
    });
    throw new AppError("Failed to send verification email. Please try again later.", 502);
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

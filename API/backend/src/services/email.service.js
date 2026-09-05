const nodemailer = require("nodemailer");
const logger = require("../utils/logger");

let transporter = null;
const sentEmails = [];

function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true" || Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        : undefined
    });
  }

  return transporter;
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendMail({ to, subject, text, html }) {
  const from = process.env.EMAIL_FROM || "WarrantyVault <no-reply@warrantyvault.app>";
  const mailOptions = { from, to, subject, text, html };

  sentEmails.push({ ...mailOptions, date: new Date() });
  if (sentEmails.length > 50) sentEmails.shift();

  const activeTransporter = getTransporter();

  if (activeTransporter && process.env.NODE_ENV !== "test") {
    try {
      const info = await activeTransporter.sendMail(mailOptions);
      logger.info("Email sent via SMTP", { messageId: info.messageId, to, subject });
      return info;
    } catch (err) {
      logger.error("Failed to send email via SMTP", { error: err.message, to, subject });
    }
  } else {
    logger.info("Mock email dispatched (no SMTP configured or in test mode)", {
      to,
      subject,
      textSnippet: text.slice(0, 100)
    });
  }

  return { accepted: [to], response: "Logged/Mocked" };
}

async function sendVerificationEmail(to, name, code) {
  const greeting = name ? `Hi ${name},` : "Hello,";
  const subject = "Verify your email - WarrantyVault";
  const text = `${greeting}\n\nThank you for signing up for WarrantyVault. Your verification code is:\n\n${code}\n\nThis code will expire in 15 minutes.\n\nIf you did not create an account, please ignore this email.`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #0f172a; margin: 0 0 6px 0;">Verify Your Email</h2>
        <p style="color: #64748b; margin: 0; font-size: 14px;">WarrantyVault — Digital Ownership Companion</p>
      </div>
      <p style="color: #334155; font-size: 15px; line-height: 1.5;">${greeting}</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.5;">Thank you for registering with WarrantyVault. Please enter the verification code below to verify your email address:</p>
      <div style="background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0;">
        <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #2563eb; font-family: monospace;">${code}</span>
      </div>
      <p style="color: #64748b; font-size: 13px; line-height: 1.5;">This code will expire in <strong>15 minutes</strong>. If you did not create an account, you can safely ignore this email.</p>
    </div>
  `;

  return sendMail({ to, subject, text, html });
}

async function sendLoginVerificationEmail(to, name, code) {
  const greeting = name ? `Hi ${name},` : "Hello,";
  const subject = "Your login verification code - WarrantyVault";
  const text = `${greeting}\n\nA sign-in attempt was initiated for your WarrantyVault account. Your verification code is:\n\n${code}\n\nThis code will expire in 10 minutes.\n\nIf you did not attempt to sign in, please change your password immediately.`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #0f172a; margin: 0 0 6px 0;">Login Verification</h2>
        <p style="color: #64748b; margin: 0; font-size: 14px;">WarrantyVault Sign-in Security</p>
      </div>
      <p style="color: #334155; font-size: 15px; line-height: 1.5;">${greeting}</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.5;">A login request was made for your WarrantyVault account. Use the code below to complete your sign in:</p>
      <div style="background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0;">
        <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #2563eb; font-family: monospace;">${code}</span>
      </div>
      <p style="color: #64748b; font-size: 13px; line-height: 1.5;">This code is valid for <strong>10 minutes</strong>. If you did not attempt to sign in, please change your password immediately to protect your account.</p>
    </div>
  `;

  return sendMail({ to, subject, text, html });
}

function getLastEmail() {
  return sentEmails[sentEmails.length - 1] || null;
}

function clearEmails() {
  sentEmails.length = 0;
}

module.exports = {
  generateCode,
  sendVerificationEmail,
  sendLoginVerificationEmail,
  getLastEmail,
  clearEmails
};

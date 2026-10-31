import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * EmailService Class (OOP Email Delivery & Notification Engine)
 * Handles sending OTP verification codes and password reset emails.
 * Supports SMTP (Gmail, Brevo, SendGrid, custom) and gracefully falls back to console simulation in dev/test.
 */
export class EmailService {
  constructor() {
    this.transporter = null;
    this.#initializeTransporter();
  }

  #initializeTransporter() {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, GMAIL_USER, GMAIL_APP_PASS } = process.env;

    if (GMAIL_USER && GMAIL_APP_PASS) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: GMAIL_USER,
          pass: GMAIL_APP_PASS
        }
      });
      return;
    }

    if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT) || 587,
        secure: Number(SMTP_PORT) === 465,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS
        }
      });
    }
  }

  /**
   * Send Password Reset OTP Code Email
   * @param {Object} param0
   * @param {string} param0.email - Recipient email
   * @param {string} param0.code - 6-digit OTP code
   * @param {string} [param0.baseUrl] - Web app base URL for direct reset link
   * @returns {Promise<{ delivered: boolean, previewCode?: string }>}
   */
  async sendPasswordResetOtp({ email, code, baseUrl = '' }) {
    let safeOrigin = 'http://localhost:3000';
    try {
      const parsed = new URL(baseUrl || config.PUBLIC_BASE_URL);
      safeOrigin = parsed.origin;
    } catch {
      safeOrigin = config.PUBLIC_BASE_URL || 'http://localhost:3000';
    }

    const resetUrl = `${safeOrigin}/reset-password?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`;
    const subject = `[C.AI Universe] Password Reset Code: ${code}`;
    const safeEmail = escapeHtml(email);
    const safeResetUrl = escapeHtml(resetUrl);
    const safeCode = escapeHtml(code);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0b10; color: #e8e8ed; margin: 0; padding: 24px; }
          .container { max-width: 520px; margin: 0 auto; background: #13131b; border: 1px solid #282838; border-radius: 12px; padding: 32px 28px; }
          .brand { font-size: 18px; font-weight: 700; color: #c9b037; letter-spacing: 0.05em; margin-bottom: 24px; display: inline-block; }
          h2 { font-size: 20px; font-weight: 600; margin-top: 0; color: #ffffff; }
          p { font-size: 14px; line-height: 1.6; color: #a2a2b5; margin-bottom: 20px; }
          .otp-badge { display: inline-block; background: #1a1a28; border: 1px solid #3c3c54; border-radius: 8px; padding: 12px 24px; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #ffffff; font-family: monospace; margin: 16px 0; }
          .btn { display: inline-block; background: #c9b037; color: #0b0b10; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 8px; margin-top: 16px; }
          .footer { font-size: 12px; color: #62627a; margin-top: 32px; border-top: 1px solid #20202e; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="brand">C.AI UNIVERSE</div>
          <h2>Password Reset Request</h2>
          <p>We received a request to reset the password for the account associated with <strong>${safeEmail}</strong>.</p>
          <p>Your 6-digit security verification code is:</p>
          <div class="otp-badge">${safeCode}</div>
          <p>This code is valid for <strong>15 minutes</strong>. Please do not share this code with anyone.</p>
          <p>You can also click the button below to proceed directly to the new password page:</p>
          <a class="btn" href="${safeResetUrl}">Reset Password</a>
          <div class="footer">
            If you did not request a password reset, you can safely ignore this email. Your account remains secure.
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `C.AI Universe - Password Reset Request\n\nYour verification code is: ${code}\nThis code is valid for 15 minutes.\nOr open: ${resetUrl}\nIf you did not request this, please ignore this email.`;

    if (this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from: process.env.EMAIL_FROM || '"C.AI Universe" <noreply@c-ai-universe.local>',
          to: email,
          subject,
          text,
          html
        });
        console.log(`[EmailService] OTP email sent successfully to ${email} (MessageID: ${info.messageId})`);
        return { delivered: true };
      } catch (err) {
        console.error(`[EmailService] Failed to send email via SMTP to ${email}:`, err.message);
        if (config.IS_TEST) {
          return { delivered: false, error: err.message, previewCode: code };
        }
        return { delivered: false, error: err.message };
      }
    }

    // Dev/Test mode: simulated delivery
    console.log(`\n📨 [EmailService:Dev] Verification email for ${email} with OTP code: [${code}]`);
    console.log(`🔗 [EmailService:Dev] Direct reset URL: ${resetUrl}\n`);
    if (config.IS_TEST) {
      return { delivered: false, simulated: true, previewCode: code };
    }
    return { delivered: false, simulated: true };
  }
}

export const emailService = new EmailService();

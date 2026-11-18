/**
 * Email Utility — ApexPOS Platform
 * Uses nodemailer with Gmail (App Password) or any SMTP provider.
 *
 * Required .env variables:
 *   EMAIL_FROM      — sender address, e.g. noreply@yourbusiness.com
 *   EMAIL_USER      — SMTP auth username (usually same as EMAIL_FROM for Gmail)
 *   EMAIL_PASS      — Gmail App Password (NOT your Gmail login password)
 *                     Generate at: https://myaccount.google.com/apppasswords
 *   EMAIL_HOST      — SMTP host (default: smtp.gmail.com)
 *   EMAIL_PORT      — SMTP port (default: 587)
 */

let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  console.log('nodemailer module not installed in node_modules, email sending disabled.');
}

// ── Create transporter ───────────────────────────────────────────────────────
const createTransporter = () => {
  const user = (process.env.EMAIL_USER || '').trim();
  const pass = (process.env.EMAIL_PASS || '').replace(/\s+/g, '');

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: user,
      pass: pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
};

// ── Send password reset code ──────────────────────────────────────────────────
const sendPasswordResetEmail = async (toEmail, resetCode, userName) => {
  if (!nodemailer || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    // Fail loudly instead of printing a live, usable reset code to server logs
    // (readable by anyone with hosting-panel/log-aggregator access) while
    // telling the actual user their email was sent. The caller (authController
    // .forgotPassword) already turns this into a proper error response.
    throw new Error('Email service is not configured (EMAIL_USER/EMAIL_PASS missing).');
  }

  const transporter = createTransporter();
  const fromName = process.env.EMAIL_FROM_NAME || 'ApexPOS Platform';
  const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;

  const mailOptions = {
    from: `"${fromName}" <${fromAddress}>`,
    to: toEmail,
    subject: 'Password Reset Code — ApexPOS',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0;padding:0;background:#F8FAFC;font-family:Arial,sans-serif;">
        <div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <div style="background:#16A34A;padding:32px 40px;text-align:center;">
            <div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-1px;">ApexPOS</div>
            <div style="color:#BBF7D0;font-size:14px;margin-top:4px;">Password Reset Request</div>
          </div>

          <!-- Body -->
          <div style="padding:40px;">
            <p style="margin:0 0 16px;font-size:16px;color:#1E293B;">
              Hello${userName ? ` <strong>${userName}</strong>` : ''},
            </p>
            <p style="margin:0 0 24px;font-size:14px;color:#64748B;line-height:1.6;">
              We received a request to reset the password for your ApexPOS account.
              Use the 6-digit code below to complete your password reset.
              This code expires in <strong>15 minutes</strong>.
            </p>

            <!-- Code box -->
            <div style="background:#F0FDF4;border:2px solid #BBF7D0;border-radius:12px;padding:28px;text-align:center;margin:0 0 24px;">
              <div style="font-size:12px;font-weight:700;color:#16A34A;text-transform:uppercase;letter-spacing:2px;margin-bottom:12px;">
                Your Reset Code
              </div>
              <div style="font-size:42px;font-weight:900;color:#15803D;letter-spacing:12px;font-family:'Courier New',monospace;">
                ${resetCode}
              </div>
            </div>

            <p style="margin:0 0 8px;font-size:13px;color:#94A3B8;">
              ⏱ This code expires in <strong>15 minutes</strong>.
            </p>
            <p style="margin:0 0 24px;font-size:13px;color:#94A3B8;">
              If you did not request a password reset, you can safely ignore this email.
              Your password will not change.
            </p>

            <div style="border-top:1px solid #F1F5F9;padding-top:20px;font-size:12px;color:#94A3B8;text-align:center;">
              This email was sent by ApexPOS Platform • Do not reply to this email.
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
    // Plain text fallback
    text: `
ApexPOS — Password Reset

Hello ${userName || ''},

Your password reset code is: ${resetCode}

This code expires in 15 minutes.

If you did not request a password reset, ignore this email.
    `.trim(),
  };

  await transporter.sendMail(mailOptions);
  console.log(`[EMAIL] Password reset code sent to ${toEmail}`);
  return true;
};

// ── Generic mail sender (scheduled reports etc.) ──────────────────────────────
// Same configuration contract as the reset-code sender: throws when email is
// not configured so callers can surface a real status instead of pretending
// the mail went out.
const sendMail = async (to, subject, html, text) => {
  if (!nodemailer || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Email service is not configured (EMAIL_USER/EMAIL_PASS missing).');
  }
  const transporter = createTransporter();
  const fromName = process.env.EMAIL_FROM_NAME || 'ApexPOS Platform';
  const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  await transporter.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    html,
    text: text || undefined,
  });
  return true;
};

module.exports = { sendPasswordResetEmail, sendMail };

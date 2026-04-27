const nodemailer = require('nodemailer');

/**
 * STUDY-HUB — Email Service
 * Handles sending password reset emails via Gmail SMTP
 */

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendPasswordResetEmail = async (email, name, resetUrl) => {
  const mailOptions = {
    from: `"Study-Hub" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Reset your Study-Hub password',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #333;">Hello ${name},</h2>
        <p style="color: #555; line-height: 1.6;">
          You requested to reset your password for Study-Hub. Click the button below to set a new password. 
          This link will expire in 1 hour.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #6c63ff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Reset Password
          </a>
        </div>
        <p style="color: #777; font-size: 12px;">
          If you didn't request this, you can safely ignore this email.
        </p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 11px; text-align: center;">
          Study-Hub — Your AI Study Companion
        </p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
};

module.exports = { sendPasswordResetEmail };

const nodemailer = require('nodemailer');

// Email templates
const emailTemplates = {
  emailVerification: (data) => ({
    subject: 'Verify Your Email Address - Audix',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1db954, #1ed760); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #1db954; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎵 Audix</h1>
            <h2>Welcome, ${data.name}!</h2>
          </div>
          <div class="content">
            <p>Thank you for signing up for Audix! We're excited to have you join our community of music lovers.</p>
            <p>To complete your registration and start enjoying unlimited music, please verify your email address by clicking the button below:</p>
            <div style="text-align: center;">
              <a href="${data.verificationUrl}" class="button">Verify Email Address</a>
            </div>
            <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #1db954;">${data.verificationUrl}</p>
            <p><strong>This verification link will expire in 24 hours.</strong></p>
            <p>If you didn't create an account with Audix, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>© 2024 Audix. All rights reserved.</p>
            <p>This email was sent to verify your account. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Welcome to Audix, ${data.name}!
      
      Thank you for signing up! To complete your registration, please verify your email address by visiting:
      ${data.verificationUrl}
      
      This verification link will expire in 24 hours.
      
      If you didn't create an account with Audix, please ignore this email.
      
      © 2024 Audix. All rights reserved.
    `
  }),

  passwordReset: (data) => ({
    subject: 'Password Reset Request - Audix',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1db954, #1ed760); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #1db954; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎵 Audix</h1>
            <h2>Password Reset Request</h2>
          </div>
          <div class="content">
            <p>Hello ${data.name},</p>
            <p>We received a request to reset your password for your Audix account. If you made this request, click the button below to reset your password:</p>
            <div style="text-align: center;">
              <a href="${data.resetUrl}" class="button">Reset Password</a>
            </div>
            <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #1db954;">${data.resetUrl}</p>
            <div class="warning">
              <p><strong>⚠️ Important Security Information:</strong></p>
              <ul>
                <li>This password reset link will expire in ${data.expiresIn}</li>
                <li>If you didn't request this password reset, please ignore this email</li>
                <li>For security reasons, this link can only be used once</li>
              </ul>
            </div>
            <p>If you continue to have problems, please contact our support team.</p>
          </div>
          <div class="footer">
            <p>© 2024 Audix. All rights reserved.</p>
            <p>This email was sent in response to a password reset request. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Password Reset Request - Audix
      
      Hello ${data.name},
      
      We received a request to reset your password for your Audix account. If you made this request, visit this link to reset your password:
      ${data.resetUrl}
      
      This password reset link will expire in ${data.expiresIn}.
      
      If you didn't request this password reset, please ignore this email.
      
      © 2024 Audix. All rights reserved.
    `
  }),

  welcomeEmail: (data) => ({
    subject: 'Welcome to Audix! 🎵',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Music App</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1db954, #1ed760); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .feature { background: white; padding: 20px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #1db954; }
          .button { display: inline-block; background: #1db954; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎵 Welcome to Music App!</h1>
            <p>Your musical journey starts here, ${data.name}!</p>
          </div>
          <div class="content">
            <p>Congratulations! Your email has been verified and your account is now active. You're all set to explore millions of songs, create playlists, and discover new music.</p>
            
            <h3>What you can do now:</h3>
            
            <div class="feature">
              <h4>🎧 Stream Unlimited Music</h4>
              <p>Access millions of songs from your favorite artists and discover new ones.</p>
            </div>
            
            <div class="feature">
              <h4>📝 Create Playlists</h4>
              <p>Organize your favorite tracks into custom playlists for every mood and occasion.</p>
            </div>
            
            <div class="feature">
              <h4>❤️ Like & Save</h4>
              <p>Build your personal music library by liking songs and following artists.</p>
            </div>
            
            <div class="feature">
              <h4>🔍 Discover New Music</h4>
              <p>Get personalized recommendations based on your listening habits.</p>
            </div>
            
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}" class="button">Start Listening Now</a>
            </div>
            
            <p>Need help getting started? Check out our <a href="${process.env.FRONTEND_URL}/help">Help Center</a> or contact our support team.</p>
            
            <p>Happy listening!</p>
            <p>The Audix Team</p>
          </div>
          <div class="footer">
            <p>© 2024 Audix. All rights reserved.</p>
            <p>You're receiving this email because you created an account with Audix.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Welcome to Audix, ${data.name}!
      
      Congratulations! Your email has been verified and your account is now active.
      
      What you can do now:
      • Stream unlimited music
      • Create custom playlists
      • Like and save your favorite songs
      • Discover new music with personalized recommendations
      
      Start listening now: ${process.env.FRONTEND_URL}
      
      Need help? Visit our Help Center: ${process.env.FRONTEND_URL}/help
      
      Happy listening!
      The Audix Team
      
      © 2024 Audix. All rights reserved.
    `
  }),

  // OTP Verification Email Template
  otpVerification: (data) => ({
    subject: 'Verify Your Email - Audix',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
          .header { background: linear-gradient(135deg, #1db954, #1ed760); color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; }
          .header h2 { margin: 10px 0 0 0; font-size: 18px; font-weight: normal; }
          .content { padding: 30px; }
          .otp-code { background-color: #f8f9fa; border: 2px dashed #1db954; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0; }
          .otp-code h3 { margin: 0 0 10px 0; color: #1db954; font-size: 24px; }
          .otp-code .code { font-size: 36px; font-weight: bold; color: #1db954; letter-spacing: 8px; font-family: 'Courier New', monospace; }
          .footer { background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎵 Audix</h1>
            <h2>Email Verification</h2>
          </div>
          <div class="content">
            <p>Hello ${data.name},</p>
            <p>Thank you for signing up for Audix! To complete your registration, please verify your email address using the verification code below:</p>
            
            <div class="otp-code">
              <h3>Your Verification Code</h3>
              <div class="code">${data.otp}</div>
            </div>
            
            <p><strong>This verification code will expire in 10 minutes.</strong></p>
            <p>If you didn't create an account with Audix, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>© 2024 Audix. All rights reserved.</p>
            <p>This email was sent to verify your account. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Email Verification - Audix
      
      Hello ${data.name},
      
      Thank you for signing up for Audix! To complete your registration, please verify your email address using the verification code below:
      
      Your Verification Code: ${data.otp}
      
      This verification code will expire in 10 minutes.
      
      If you didn't create an account with Audix, please ignore this email.
      
      © 2024 Audix. All rights reserved.
    `
  })
};

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_PORT == 465, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

// Send email function
const sendEmail = async (options) => {
  try {
    const transporter = createTransporter();

    // Get template if specified
    let emailContent = {};
    if (options.template && emailTemplates[options.template]) {
      emailContent = emailTemplates[options.template](options.data || {});
    }

    const mailOptions = {
      from: `"Audix" <${process.env.EMAIL_FROM}>`,
      to: options.to,
      subject: options.subject || emailContent.subject,
      text: options.text || emailContent.text,
      html: options.html || emailContent.html
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    
    console.log('Email sent successfully:', {
      messageId: info.messageId,
      to: options.to,
      subject: mailOptions.subject
    });

    return {
      success: true,
      messageId: info.messageId
    };

  } catch (error) {
    console.error('Email sending failed:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

// Test email configuration
const testEmailConfig = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('✅ Email configuration is valid');
    return true;
  } catch (error) {
    console.error('❌ Email configuration error:', error.message);
    return false;
  }
};

module.exports = {
  sendEmail,
  testEmailConfig,
  emailTemplates
};
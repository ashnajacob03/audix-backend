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

// Add account activation template
emailTemplates.accountActivated = (data) => ({
  subject: 'Your Audix Account Has Been Activated 🎉',
  html: `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Account Activated</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #1db954, #1ed760); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #1db954; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        .success-box { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎵 Audix</h1>
          <h2>Account Activated!</h2>
        </div>
        <div class="content">
          <div class="success-box">
            <strong>Great news!</strong> Your Audix account has been activated by our support team.
          </div>
          <p>Hello ${data.name},</p>
          <p>We're pleased to inform you that your Audix account has been successfully activated. You can now access all features and enjoy unlimited music streaming.</p>
          <p>What you can do now:</p>
          <ul>
            <li>🎵 Stream unlimited music</li>
            <li>📱 Access on all your devices</li>
            <li>🎧 Create and manage playlists</li>
            <li>🔍 Discover new artists and songs</li>
            <li>💾 Download music for offline listening (Premium users)</li>
          </ul>
          <div style="text-align: center;">
            <a href="${data.loginUrl || 'https://audix.com/login'}" class="button">Login to Audix</a>
          </div>
          <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
          <p>Welcome back to Audix!</p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Audix. All rights reserved.</p>
          <p>This email was sent regarding your account status. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `,
  text: `
    Account Activated - Audix
    
    Hello ${data.name},
    
    Great news! Your Audix account has been activated by our support team.
    
    You can now access all features and enjoy unlimited music streaming:
    - Stream unlimited music
    - Access on all your devices
    - Create and manage playlists
    - Discover new artists and songs
    - Download music for offline listening (Premium users)
    
    Login to Audix: ${data.loginUrl || 'https://audix.com/login'}
    
    If you have any questions or need assistance, please contact our support team.
    
    Welcome back to Audix!
    
    © ${new Date().getFullYear()} Audix. All rights reserved.
  `
});

// Add account deactivation template
emailTemplates.accountDeactivated = (data) => ({
  subject: 'Your Audix Account Has Been Deactivated',
  html: `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Account Deactivated</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #dc3545, #e74c3c); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        .warning-box { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 15px; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎵 Audix</h1>
          <h2>Account Deactivated</h2>
        </div>
        <div class="content">
          <div class="warning-box">
            <strong>Important Notice:</strong> Your Audix account has been deactivated by our support team.
          </div>
          <p>Hello ${data.name},</p>
          <p>We're writing to inform you that your Audix account has been deactivated. This means you will no longer be able to access your account or use our services.</p>
          <p>What this means:</p>
          <ul>
            <li>🚫 You cannot log in to your account</li>
            <li>🚫 You cannot stream music</li>
            <li>🚫 You cannot access your playlists or saved music</li>
            <li>🚫 All premium features are disabled</li>
          </ul>
          <p>If you believe this deactivation was made in error, or if you have questions about your account status, please contact our support team immediately.</p>
          <div style="text-align: center;">
            <a href="${data.supportUrl || 'https://audix.com/support'}" class="button">Contact Support</a>
          </div>
          <p>We're here to help resolve any issues and get you back to enjoying music on Audix.</p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Audix. All rights reserved.</p>
          <p>This email was sent regarding your account status. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `,
  text: `
    Account Deactivated - Audix
    
    Hello ${data.name},
    
    Important Notice: Your Audix account has been deactivated by our support team.
    
    This means you will no longer be able to access your account or use our services:
    - You cannot log in to your account
    - You cannot stream music
    - You cannot access your playlists or saved music
    - All premium features are disabled
    
    If you believe this deactivation was made in error, or if you have questions about your account status, please contact our support team immediately.
    
    Contact Support: ${data.supportUrl || 'https://audix.com/support'}
    
    We're here to help resolve any issues and get you back to enjoying music on Audix.
    
    © ${new Date().getFullYear()} Audix. All rights reserved.
  `
});

// Add invoice paid template
emailTemplates.invoicePaid = (data) => ({
  subject: `Your Audix invoice ${data.invoiceId ? `#${String(data.invoiceId).slice(-6)}` : ''}`.trim(),
  html: `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Audix Invoice</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #111827; background: #f9fafb; }
        .container { max-width: 640px; margin: 0 auto; padding: 20px; }
        .card { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #1db954, #1ed760); color: white; padding: 28px; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 24px; }
        .row { display: flex; justify-content: space-between; margin: 8px 0; color: #374151; }
        .label { color: #6b7280; font-size: 12px; }
        .value { font-weight: 600; font-size: 14px; }
        .button { display: inline-block; background: #111827; color: white !important; text-decoration: none; padding: 10px 16px; border-radius: 8px; margin-top: 16px; }
        .muted { color: #6b7280; font-size: 12px; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; padding: 16px 24px 24px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="header">
            <h1>Payment received — thank you!</h1>
            <div style="opacity:0.9">Your Audix Premium subscription is active.</div>
          </div>
          <div class="content">
            <p>Hello ${data.name || 'there'},</p>
            <p>We've received your payment for the <strong>${String(data.plan || '').toUpperCase()}</strong> plan.</p>

            <div class="row"><div class="label">Invoice ID</div><div class="value">${data.invoiceId}</div></div>
            <div class="row"><div class="label">Amount</div><div class="value">${data.currency || ''} ${data.amountFormatted || data.amount}</div></div>
            <div class="row"><div class="label">Billing period</div><div class="value">${data.periodStart} → ${data.periodEnd}</div></div>
            <div class="row"><div class="label">Status</div><div class="value">Paid</div></div>

            ${data.downloadUrl ? `<a class="button" href="${data.downloadUrl}">Download invoice (PDF)</a>` : ''}

            <p class="muted">A copy of your invoice is attached to this email for your records.</p>
          </div>
          <div class="footer">© ${new Date().getFullYear()} Audix. All rights reserved.</div>
        </div>
      </div>
    </body>
    </html>
  `,
  text: `
    Payment received — thank you!

    Invoice ID: ${data.invoiceId}
    Plan: ${data.plan}
    Amount: ${data.currency || ''} ${data.amountFormatted || data.amount}
    Billing period: ${data.periodStart} -> ${data.periodEnd}
    Status: Paid

    ${data.downloadUrl ? `Download invoice: ${data.downloadUrl}` : ''}

    A copy of your invoice is attached to this email.
  `
});

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
    html: options.html || emailContent.html,
    attachments: options.attachments || undefined
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
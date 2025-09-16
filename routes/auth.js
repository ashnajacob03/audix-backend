const express = require('express');

const { body, validationResult } = require('express-validator');

const { OAuth2Client } = require('google-auth-library');

const jwt = require('jsonwebtoken');

const crypto = require('crypto');

const User = require('../models/User');

const { auth } = require('../middleware/auth');

const { sendEmail } = require('../utils/sendEmail');



const router = express.Router();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);



// Add a test route to verify the server is running

router.get('/test', (req, res) => {

  res.json({ message: 'Auth routes are working!' });

});


// Test route to verify authentication
router.get('/test-auth', auth, (req, res) => {
  res.json({ 
    message: 'Authentication successful!',
    user: {
      id: req.user.id,
      email: req.user.email,
      accountType: req.user.accountType
    }
  });
});


// Test User model

router.get('/test-user', async (req, res) => {

  try {

    console.log('Testing User model...');

    const userCount = await User.countDocuments();

    res.json({ success: true, message: 'User model working', userCount });

  } catch (error) {

    console.error('User model test error:', error);

    res.status(500).json({ success: false, error: error.message });

  }

});



// Test email configuration

router.get('/test-email', async (req, res) => {

  try {

    console.log('Testing email configuration...');

    const { testEmailConfig } = require('../utils/sendEmail');

    const isValid = await testEmailConfig();

    

    if (isValid) {

      res.json({ 

        success: true, 

        message: 'Email configuration is valid',

        config: {

          host: process.env.EMAIL_HOST,

          port: process.env.EMAIL_PORT,

          user: process.env.EMAIL_USER,

          from: process.env.EMAIL_FROM

        }

      });

    } else {

      res.status(500).json({ 

        success: false, 

        message: 'Email configuration is invalid' 

      });

    }

  } catch (error) {

    console.error('Email test error:', error);

    res.status(500).json({ 

      success: false, 

      error: error.message,

      message: 'Failed to test email configuration'

    });

  }

});











// Validation middleware

const validateSignup = [

  body('firstName')

    .trim()

    .isLength({ min: 1, max: 50 })

    .withMessage('First name is required and must be less than 50 characters')

    .matches(/^[a-zA-Z\s]+$/)

    .withMessage('First name can only contain letters and spaces'),

  

  body('lastName')

    .trim()

    .isLength({ min: 1, max: 50 })

    .withMessage('Last name is required and must be less than 50 characters')

    .matches(/^[a-zA-Z\s]+$/)

    .withMessage('Last name can only contain letters and spaces'),

  

  body('email')

    .isEmail()

    .normalizeEmail()

    .withMessage('Please provide a valid email address'),

  

  body('password')

    .isLength({ min: 8 })

    .withMessage('Password must be at least 8 characters long'),

];



const validateLogin = [

  body('email')

    .isEmail()

    .normalizeEmail()

    .withMessage('Please provide a valid email address'),

  

  body('password')

    .notEmpty()

    .withMessage('Password is required')

];



const validateForgotPassword = [

  body('email')

    .isEmail()

    .normalizeEmail()

    .withMessage('Please provide a valid email address')

];



const validateResetPassword = [

  body('token')

    .notEmpty()

    .withMessage('Reset token is required'),

  

  body('password')

    .isLength({ min: 8 })

    .withMessage('Password must be at least 8 characters long')

    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)

    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),

];



// Temporary in-memory store for pending signups (for demo; use Redis for production)

const pendingSignups = {};



// @route   POST /api/auth/signup

// @desc    Register a new user (OTP step only, do not save user yet)

// @access  Public

router.post('/signup', validateSignup, async (req, res) => {

  console.log('=== SIGNUP ROUTE HIT ===');

  try {

    // Check for validation errors

    const errors = validationResult(req);

    if (!errors.isEmpty()) {

      return res.status(400).json({

        success: false,

        message: 'Validation failed',

        errors: errors.array()

      });

    }



    const { firstName, lastName, email, password, gender, agreeToTerms } = req.body;

    // Check if user already exists in MongoDB

    const existingMongoUser = await User.findOne({ email: email.toLowerCase() });

    if (existingMongoUser) {

      return res.status(409).json({

        success: false,

        message: 'This email address is already registered. Please sign in instead or use a different email address.'

      });

    }



    // Generate OTP

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store signup data and OTP in memory (for demo; use Redis for production)

    pendingSignups[email.toLowerCase()] = {

      firstName,

      lastName,

      email,

      password,

      gender,

      agreeToTerms,

      otp,

      otpExpires: Date.now() + 10 * 60 * 1000 // 10 minutes

    };



    // Send OTP email

    try {

      const { sendEmail } = require('../utils/sendEmail');

      await sendEmail({

        to: email,

        template: 'otpVerification',

        data: {

          name: `${firstName} ${lastName}`.trim() || firstName,

          otp: otp

        }

      });

      console.log('OTP verification email sent successfully to:', email);

    } catch (emailError) {

      console.error('Failed to send OTP email:', emailError);

      delete pendingSignups[email.toLowerCase()];

      return res.status(500).json({

        success: false,

        message: 'Failed to send verification email. Please try again.',

        error: process.env.NODE_ENV === 'development' ? emailError.message : undefined

      });

    }



    res.status(201).json({

      success: true,

      message: 'Registration step 1 successful! Please check your email for the verification code.',

      data: {

        user: {

          firstName,

          lastName,

          email,

          isEmailVerified: false

        },

        requiresVerification: true

      }

    });

  } catch (error) {

    console.error('Signup error:', error);

    res.status(500).json({

      success: false,

      message: 'Internal server error'

    });

  }

});



// @route   POST /api/auth/login

// @desc    Login user

// @access  Public

router.post('/login', validateLogin, async (req, res) => {

  try {

    // Check for validation errors

    const errors = validationResult(req);

    if (!errors.isEmpty()) {

      return res.status(400).json({

        success: false,

        message: 'Validation failed',

        errors: errors.array()

      });

    }



    const { email, password, rememberMe } = req.body;



    // Find user and include password for comparison

    const user = await User.findOne({ email }).select('+password');

    if (!user) {

      return res.status(401).json({

        success: false,

        message: 'No account found with this email address. Please check your email or sign up for a new account.',

        code: 'USER_NOT_FOUND'

      });

    }



    // Check if account is active

    if (!user.isActive) {

      return res.status(401).json({

        success: false,

        message: 'Account has been deactivated. Please contact support.'

      });

    }



    // Check if email is verified

    // if (!user.isEmailVerified) {

    //   return res.status(401).json({

    //     success: false,

    //     message: 'Please verify your email address before logging in.',

    //     requiresVerification: true,

    //     email: user.email

    //   });

    // }



    // Check password

    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {

      return res.status(401).json({

        success: false,

        message: 'The password you entered is incorrect. Please try again or reset your password.',

        code: 'INVALID_PASSWORD'

      });

    }



    // Generate tokens

    const tokenExpiry = rememberMe ? '30d' : (process.env.JWT_EXPIRE || '7d');

    const token = user.generateAuthToken(tokenExpiry);

    const refreshToken = user.generateRefreshToken();



    // Update login info

    await user.updateLastActivity(req.ip, req.get('User-Agent'));



    res.json({

      success: true,

      message: 'Login successful',

      data: {

        user: {

          id: user._id,

          firstName: user.firstName,

          lastName: user.lastName,

          name: user.fullName,

          given_name: user.firstName,

          family_name: user.lastName,

          email: user.email,

          picture: user.picture, // Use virtual field

          isEmailVerified: user.isEmailVerified,

          accountType: user.accountType,

          lastLogin: user.lastLogin

        },

        tokens: {

          accessToken: token,

          refreshToken: refreshToken,

          expiresIn: tokenExpiry

        }

      }

    });



  } catch (error) {

    console.error('Login error:', error);

    res.status(500).json({

      success: false,

      message: 'Internal server error during login'

    });

  }

});



// @route   POST /api/auth/google

// @desc    Google OAuth login/signup

// @access  Public

// Helper function to process Google profile image URL

const processGoogleProfileImage = (imageUrl) => {

  if (!imageUrl) return null;

  

  try {

    // If it's a Google profile image URL, ensure it has proper size parameter

    if (imageUrl.includes('googleusercontent.com')) {

      // Remove existing size parameters and add our own

      const baseUrl = imageUrl.split('=')[0];

      return `${baseUrl}=s400-c`; // s400 = 400px, c = crop to square

    }

    

    // For other URLs, return as-is

    return imageUrl;

  } catch (error) {

    console.error('Error processing image URL:', error);

    return imageUrl;

  }

};



router.post('/google', async (req, res) => {

  try {

    const { email, firstName, lastName, picture, googleId } = req.body;

    

    // Process the Google profile image URL

    const processedPicture = processGoogleProfileImage(picture);



    if (!email) {

      return res.status(400).json({

        success: false,

        message: 'Email is required'

      });

    }



    // Check if user exists in MongoDB

    let user = await User.findOne({ 

      $or: [

        { email: email },

        { googleId: googleId }

      ]

    });



    let isNewUser = false;



    if (user) {

      // Update existing user with Google info if not already set

      if (!user.googleId && googleId) {

        user.googleId = googleId;

        user.isEmailVerified = true;

        user.authMethod = 'google'; // Update auth method to google

        if (!user.profilePicture && processedPicture) user.profilePicture = processedPicture;

        await user.save();

      }

    } else {

      // Create new user in MongoDB

      isNewUser = true;

      

      // First create user in MongoDB

      console.log('Creating new user with Google authentication in MongoDB...');

      console.log('Original picture URL:', picture);

      console.log('Processed picture URL:', processedPicture);

      user = new User({

        firstName: firstName || 'User',

        lastName: lastName || '',

        email,

        googleId,

        profilePicture: processedPicture,

        isEmailVerified: true,

        authMethod: 'google',

        termsAcceptedAt: new Date(),

        privacyPolicyAcceptedAt: new Date(),

        isAdmin: email === process.env.ADMIN_EMAIL

      });

      await user.save();

    }



    // Generate tokens

    const token = user.generateAuthToken(process.env.JWT_EXPIRE || '7d');

    const refreshToken = user.generateRefreshToken();

    
    console.log('Google Auth: Generated tokens for user:', {
      userId: user._id,
      email: user.email,
      tokenLength: token.length,
      refreshTokenLength: refreshToken.length,
      isNewUser
    });


    // Update login info

    await user.updateLastActivity(req.ip, req.get('User-Agent'));



    res.json({

      success: true,

      message: isNewUser ? 'Account created successfully' : 'Login successful',

      data: {

        user: {

          id: user._id,

          firstName: user.firstName,

          lastName: user.lastName,

          name: user.fullName,

          email: user.email,

          picture: user.picture, // Use virtual field

          isEmailVerified: user.isEmailVerified,

          accountType: user.accountType,

          lastLogin: user.lastLogin

        },

        tokens: {

          accessToken: token,

          refreshToken: refreshToken,

          expiresIn: process.env.JWT_EXPIRE || '7d'

        }

      }

    });



  } catch (error) {

    console.error('Google auth error:', error);

    console.error('Error stack:', error.stack);

    res.status(500).json({

      success: false,

      message: 'Internal server error during Google authentication',

      error: process.env.NODE_ENV === 'development' ? error.message : undefined

    });

  }

});



// @route   POST /api/auth/forgot-password

// @desc    Send password reset email

// @access  Public

router.post('/forgot-password', validateForgotPassword, async (req, res) => {

  try {

    // Check for validation errors

    const errors = validationResult(req);

    if (!errors.isEmpty()) {

      return res.status(400).json({

        success: false,

        message: 'Validation failed',

        errors: errors.array()

      });

    }



    const { email } = req.body;



    const user = await User.findOne({ email });

    if (!user) {

      // Don't reveal if user exists or not for security

      return res.json({

        success: true,

        message: 'If an account with that email exists, a password reset link has been sent.'

      });

    }



    // Generate reset token

    const resetToken = user.generatePasswordResetToken();

    await user.save();



    // Send reset email

    try {

      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;



      // Check if email is configured

      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {

        console.log('📧 EMAIL NOT CONFIGURED - Development Mode');

        console.log('🔗 Password Reset URL:', resetUrl);

        console.log('👤 User:', user.email);

        console.log('⏰ Expires in 10 minutes');



        // For development: return success with the reset URL in response

        return res.json({

          success: true,

          message: 'Password reset link generated successfully.',

          developmentMode: true,

          resetUrl: resetUrl, // Only include this in development

          note: 'Email not configured. Check server console for reset link.'

        });

      }



      await sendEmail({

        to: user.email,

        subject: 'Password Reset Request',

        template: 'passwordReset',

        data: {

          name: user.firstName,

          resetUrl,

          expiresIn: '10 minutes'

        }

      });

    } catch (emailError) {

      console.error('Failed to send reset email:', emailError);

      user.passwordResetToken = undefined;

      user.passwordResetExpires = undefined;

      await user.save();



      return res.status(500).json({

        success: false,

        message: 'Failed to send password reset email. Please try again.',

        error: process.env.NODE_ENV === 'development' ? emailError.message : undefined

      });

    }



    res.json({

      success: true,

      message: 'If an account with that email exists, a password reset link has been sent.'

    });



  } catch (error) {

    console.error('Forgot password error:', error);

    res.status(500).json({

      success: false,

      message: 'Internal server error'

    });

  }

});



// @route   POST /api/auth/reset-password

// @desc    Reset password with token

// @access  Public

router.post('/reset-password', validateResetPassword, async (req, res) => {

  try {

    console.log('🔄 Reset password request received:', { 

      body: req.body,

      hasToken: !!req.body.token,

      hasPassword: !!req.body.password,

      tokenLength: req.body.token?.length,

      passwordLength: req.body.password?.length

    });



    // Check for validation errors

    const errors = validationResult(req);

    if (!errors.isEmpty()) {

      console.log('❌ Validation errors:', errors.array());

      return res.status(400).json({

        success: false,

        message: 'Validation failed',

        errors: errors.array()

      });

    }



    const { token, password } = req.body;



    // Hash the token to compare with stored hash

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    console.log('🔑 Token processing:', {

      originalToken: token,

      hashedToken: hashedToken,

      tokenLength: token?.length

    });



    const user = await User.findOne({

      passwordResetToken: hashedToken,

      passwordResetExpires: { $gt: Date.now() }

    });



    if (!user) {

      console.log('❌ User not found with reset token');

      return res.status(400).json({

        success: false,

        message: 'Invalid or expired reset token'

      });

    }



    console.log('✅ User found:', {

      userId: user._id,

      email: user.email,

      hasPasswordResetToken: !!user.passwordResetToken,

      tokenExpires: user.passwordResetExpires

    });



    // Set new password

    console.log('🔐 Setting new password for user');

    user.password = password;

    user.passwordResetToken = undefined;

    user.passwordResetExpires = undefined;

    

    try {

      await user.save();

      console.log('✅ User saved successfully with new password');

    } catch (saveError) {

      console.error('❌ Error saving user:', saveError);

      throw saveError;

    }



    // Generate new tokens

    const authToken = user.generateAuthToken(process.env.JWT_EXPIRE || '7d');

    const refreshToken = user.generateRefreshToken();



    res.json({

      success: true,

      message: 'Password reset successful',

      data: {

        user: {

          id: user._id,

          firstName: user.firstName,

          lastName: user.lastName,

          name: user.fullName,

          email: user.email,

          picture: user.profilePicture

        },

        tokens: {

          accessToken: authToken,

          refreshToken: refreshToken,

          expiresIn: process.env.JWT_EXPIRE || '7d'

        }

      }

    });



  } catch (error) {

    console.error('Reset password error:', error);

    res.status(500).json({

      success: false,

      message: 'Internal server error'

    });

  }

});



// @route   POST /api/auth/refresh-token

// @desc    Refresh access token

// @access  Public

router.post('/refresh-token', async (req, res) => {

  try {

    const { refreshToken } = req.body;



    if (!refreshToken) {

      return res.status(401).json({

        success: false,

        message: 'Refresh token is required'

      });

    }



    // Verify refresh token

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'default-jwt-secret-change-in-production');

    

    if (decoded.type !== 'refresh') {

      return res.status(401).json({

        success: false,

        message: 'Invalid token type'

      });

    }



    const user = await User.findById(decoded.id);

    if (!user || !user.isActive) {

      return res.status(401).json({

        success: false,

        message: 'User not found or inactive'

      });

    }



    // Generate new tokens

    const newAccessToken = user.generateAuthToken(process.env.JWT_EXPIRE || '7d');

    const newRefreshToken = user.generateRefreshToken();



    res.json({

      success: true,

      message: 'Tokens refreshed successfully',

      data: {

        tokens: {

          accessToken: newAccessToken,

          refreshToken: newRefreshToken,

          expiresIn: process.env.JWT_EXPIRE || '7d'

        }

      }

    });



  } catch (error) {

    console.error('Refresh token error:', error);

    res.status(401).json({

      success: false,

      message: 'Invalid or expired refresh token'

    });

  }

});



// @route   POST /api/auth/logout

// @desc    Logout user (client-side token removal)

// @access  Private

router.post('/logout', auth, async (req, res) => {

  try {

    // In a more advanced setup, you might want to blacklist the token

    // For now, we'll just send a success response

    res.json({

      success: true,

      message: 'Logged out successfully'

    });

  } catch (error) {

    console.error('Logout error:', error);

    res.status(500).json({

      success: false,

      message: 'Internal server error'

    });

  }

});



// @route   POST /api/auth/verify-otp

// @desc    Verify email with OTP and create user in DB

// @access  Public

router.post('/verify-otp', async (req, res) => {

  try {

    const { email, otp } = req.body;

    if (!email || !otp) {

      return res.status(400).json({

        success: false,

        message: 'Email and OTP are required'

      });

    }

    const pending = pendingSignups[email.toLowerCase()];

    if (!pending) {

      return res.status(404).json({

        success: false,

        message: 'No pending signup found for this email.'

      });

    }

    if (pending.otp !== otp || Date.now() > pending.otpExpires) {

      return res.status(400).json({

        success: false,

        message: 'Invalid or expired OTP'

      });

    }

    // Create user in DB

    const userData = {

      firstName: pending.firstName,

      lastName: pending.lastName,

      email: pending.email,

      password: pending.password,

      authMethod: 'regular',

      termsAcceptedAt: new Date(),

      privacyPolicyAcceptedAt: new Date(),

      isAdmin: pending.email === process.env.ADMIN_EMAIL,

      gender: pending.gender

    };

    const user = new User(userData);

    user.isEmailVerified = true;

    await user.save();

    delete pendingSignups[email.toLowerCase()];

    // Send welcome email (optional)

    try {

      const { sendEmail } = require('../utils/sendEmail');

      await sendEmail({

        to: user.email,

        template: 'welcomeEmail',

        data: {

          name: `${user.firstName} ${user.lastName}`.trim() || user.firstName

        }

      });

    } catch (emailError) {

      console.error('Failed to send welcome email:', emailError);

    }

    res.json({

      success: true,

      message: 'Email verified and account created successfully! You can now login with your credentials.',

      data: {

        user: {

          id: user._id,

          firstName: user.firstName,

          lastName: user.lastName,

          name: user.fullName,

          email: user.email,

          picture: user.picture,

          isEmailVerified: user.isEmailVerified,

          accountType: user.accountType

        },

        redirectToLogin: true

      }

    });

  } catch (error) {

    console.error('OTP verification error:', error);

    res.status(500).json({

      success: false,

      message: 'Internal server error'

    });

  }

});



// @route   POST /api/auth/resend-otp

// @desc    Resend OTP for email verification

// @access  Public

router.post('/resend-otp', async (req, res) => {

  try {

    const { email } = req.body;



    if (!email) {

      return res.status(400).json({

        success: false,

        message: 'Email is required'

      });

    }



    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {

      return res.status(404).json({

        success: false,

        message: 'User not found'

      });

    }



    if (user.isEmailVerified) {

      return res.status(400).json({

        success: false,

        message: 'Email is already verified'

      });

    }



    // Generate new OTP

    const otp = user.generateEmailVerificationOTP();

    await user.save();



    // Send OTP email

    try {

      const { sendEmail } = require('../utils/sendEmail');

      await sendEmail({

        to: user.email,

        template: 'otpVerification',

        data: {

          name: `${user.firstName} ${user.lastName}`.trim() || user.firstName,

          otp: otp

        }

      });

      console.log('OTP resent successfully to:', user.email);

    } catch (emailError) {

      console.error('Failed to resend OTP email:', emailError);

      return res.status(500).json({

        success: false,

        message: 'Failed to send verification email. Please try again.',

        error: process.env.NODE_ENV === 'development' ? emailError.message : undefined

      });

    }



    res.json({

      success: true,

      message: 'Verification code sent successfully! Please check your email.'

    });



  } catch (error) {

    console.error('Resend OTP error:', error);

    res.status(500).json({

      success: false,

      message: 'Internal server error'

    });

  }

});



// @route   GET /api/auth/verify-email/:token

// @desc    Verify email address (legacy token-based verification)

// @access  Public

router.get('/verify-email/:token', async (req, res) => {

  try {

    const { token } = req.params;



    // Hash the token to compare with stored hash

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');



    const user = await User.findOne({

      emailVerificationToken: hashedToken,

      emailVerificationExpires: { $gt: Date.now() }

    });



    if (!user) {

      return res.status(400).json({

        success: false,

        message: 'Invalid or expired verification token'

      });

    }



    // Verify email

    user.isEmailVerified = true;

    user.emailVerificationToken = undefined;

    user.emailVerificationExpires = undefined;

    await user.save();



    res.json({

      success: true,

      message: 'Email verified successfully'

    });



  } catch (error) {

    console.error('Email verification error:', error);

    res.status(500).json({

      success: false,

      message: 'Internal server error'

    });

  }

});



// @route   DELETE /api/auth/cleanup-user/:email

// @desc    Delete user from both MongoDB and Clerk (for development/testing)

// @access  Public (should be protected in production)

router.delete('/cleanup-user/:email', async (req, res) => {

  try {

    const { email } = req.params;



    if (!email) {

      return res.status(400).json({

        success: false,

        message: 'Email is required'

      });

    }



    console.log(`Starting cleanup for email: ${email}`);



    // Step 1: Find and delete user from MongoDB

    const mongoUser = await User.findOneAndDelete({ email: email.toLowerCase() });

    console.log('MongoDB user deleted:', mongoUser ? 'Yes' : 'No');



    res.json({

      success: true,

      message: 'User cleanup completed',

      details: {

        mongoUserDeleted: !!mongoUser,

        email: email

      }

    });



  } catch (error) {

    console.error('Cleanup error:', error);

    res.status(500).json({

      success: false,

      message: 'Error during cleanup',

      error: process.env.NODE_ENV === 'development' ? error.message : undefined

    });

  }

});



// Dynamic validation config endpoint

const validationConfig = {

  name: {

    minLength: 3,

    maxLength: 30,

    allowedPattern: "^[a-zA-Z\s\-']+$",

    noNumbers: true,

    noConsecutiveSpecial: true,

  },

  email: {

    blockDisposable: true,

    disposableDomains: [

      'mailinator.com', '10minutemail.com', 'guerrillamail.com', 'tempmail.com', 'yopmail.com', 'trashmail.com'

    ],

  },

  password: {

    minLength: 8,

    maxLength: 128,

    requireLower: true,

    requireUpper: true,

    requireNumber: true,

    requireSpecial: true,

    blockCommon: true,

  },

};



// @route   GET /api/config/validation

// @desc    Get dynamic validation config for registration

// @access  Public

router.get('/config/validation', (req, res) => {

  res.json({ success: true, data: validationConfig });

});



// @route   GET /api/auth/check-email

// @desc    Check if email is already registered

// @access  Public

router.get('/check-email', async (req, res) => {

  const { email } = req.query;

  if (!email || typeof email !== 'string') {

    return res.status(400).json({ success: false, message: 'Email is required' });

  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {

    return res.status(400).json({ success: false, message: 'Invalid email format' });

  }

  const user = await User.findOne({ email: email.toLowerCase() });

  res.json({ exists: !!user });

});



module.exports = router;


const express = require('express');
const { body, validationResult } = require('express-validator');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { sendEmail } = require('../utils/sendEmail');
const { clerkClient } = require('@clerk/clerk-sdk-node');

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Add a test route to verify the server is running
router.get('/test', (req, res) => {
  res.json({ message: 'Auth routes are working!' });
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
    .withMessage('Password must be at least 8 characters long')
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
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
];

// @route   POST /api/auth/signup
// @desc    Register a new user
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

    console.log('Signup request received:', req.body);

    const { firstName, lastName, email, password, gender, agreeToTerms } = req.body;
    console.log('Creating user with:', { firstName, lastName, email, gender, agreeToTerms });

    // Check if user already exists in MongoDB
    const existingMongoUser = await User.findOne({ email: email.toLowerCase() });
    if (existingMongoUser) {
      return res.status(409).json({
        success: false,
        message: 'This email address is already registered. Please sign in instead or use a different email address.'
      });
    }

    console.log('Creating new user with regular authentication...');
    // Create new user with minimal fields (MongoDB only)
    const userData = {
      firstName,
      lastName,
      email,
      password,
      authMethod: 'regular',
      termsAcceptedAt: new Date(),
      privacyPolicyAcceptedAt: new Date(),
      isAdmin: email === process.env.ADMIN_EMAIL
    };

    // Only add gender if it's provided
    if (gender) {
      userData.gender = gender;
    }

    const user = new User(userData);

    console.log('Saving user...');
    await user.save();
    console.log('User saved successfully');

    // Generate and send OTP for email verification
    try {
      const otp = user.generateEmailVerificationOTP();
      await user.save(); // Save the OTP to database
      
      const { sendEmail } = require('../utils/sendEmail');
      await sendEmail({
        to: user.email,
        template: 'otpVerification',
        data: {
          name: `${user.firstName} ${user.lastName}`.trim() || user.firstName,
          otp: otp
        }
      });
      console.log('OTP verification email sent successfully to:', user.email);
    } catch (emailError) {
      console.error('Failed to send OTP email:', emailError);
      // Delete the user if email fails since they can't verify
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please try again.',
        error: process.env.NODE_ENV === 'development' ? emailError.message : undefined
      });
    }

    // Response without tokens - user needs to verify OTP first
    res.status(201).json({
      success: true,
      message: 'Registration successful! Please check your email for the verification code.',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          isEmailVerified: false
        },
        requiresVerification: true
      }
    });

  } catch (error) {
    console.error('Signup error:', error);
    console.error('Error stack:', error.stack);

    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'This email address is already registered. Please sign in instead or use a different email address.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
        message: 'Invalid email or password'
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
    if (!user.isEmailVerified) {
      return res.status(401).json({
        success: false,
        message: 'Please verify your email address before logging in.',
        requiresVerification: true,
        email: user.email
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate tokens
    const tokenExpiry = rememberMe ? '30d' : (process.env.JWT_EXPIRE || '7d');
    const token = user.generateAuthToken();
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
          picture: user.profilePicture,
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
router.post('/google', async (req, res) => {
  try {
    const { email, firstName, lastName, picture, googleId } = req.body;

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

    let clerkUser = null;
    let isNewUser = false;

    if (user) {
      // Update existing user with Google info if not already set
      if (!user.googleId && googleId) {
        user.googleId = googleId;
        user.isEmailVerified = true;
        user.authMethod = 'google'; // Update auth method to google
        if (!user.profilePicture && picture) user.profilePicture = picture;
        await user.save();
      }

      // Check if user exists in Clerk and create if not
      try {
        const clerkUsers = await clerkClient.users.getUserList({
          emailAddress: [email.toLowerCase()]
        });
        clerkUser = clerkUsers.length > 0 ? clerkUsers[0] : null;

        if (!clerkUser) {
          // Create user in Clerk (without triggering emails)
          clerkUser = await clerkClient.users.createUser({
            emailAddress: [email.toLowerCase()],
            firstName: user.firstName,
            lastName: user.lastName,
            externalId: user._id.toString(),
            skipPasswordRequirement: true,
            skipPasswordChecks: true,
            emailAddressVerified: true // Mark as verified to skip verification emails
          });
          console.log('Created user in Clerk for existing MongoDB user:', clerkUser.id);
        }
      } catch (clerkError) {
        console.error('Error handling Clerk user for existing user:', clerkError);
        // Continue without Clerk integration
      }
    } else {
      // Create new user in both MongoDB and Clerk
      isNewUser = true;
      
      // First create user in MongoDB
      console.log('Creating new user with Google authentication in MongoDB and Clerk...');
      user = new User({
        firstName: firstName || 'User',
        lastName: lastName || '',
        email,
        googleId,
        profilePicture: picture,
        isEmailVerified: true,
        authMethod: 'google',
        termsAcceptedAt: new Date(),
        privacyPolicyAcceptedAt: new Date(),
        isAdmin: email === process.env.ADMIN_EMAIL
      });
      await user.save();

      // Then create user in Clerk
      try {
        clerkUser = await clerkClient.users.createUser({
          emailAddress: [email.toLowerCase()],
          firstName: user.firstName,
          lastName: user.lastName,
          externalId: user._id.toString(),
          skipPasswordRequirement: true,
          skipPasswordChecks: true,
          emailAddressVerified: true // Mark as verified to skip verification emails
        });
        console.log('Created user in Clerk for new Google user:', clerkUser.id);
      } catch (clerkError) {
        console.error('Error creating Clerk user for Google signup:', clerkError);
        // Continue without Clerk integration - user is still created in MongoDB
      }
    }

    // Generate tokens
    const token = user.generateAuthToken();
    const refreshToken = user.generateRefreshToken();

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
          picture: user.profilePicture,
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
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { token, password } = req.body;

    // Hash the token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Set new password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // Generate new tokens
    const authToken = user.generateAuthToken();
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
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    
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
    const newAccessToken = user.generateAuthToken();
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
// @desc    Verify email with OTP
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

    // Verify OTP
    if (!user.verifyOTP(otp)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    // Mark email as verified and clear OTP
    user.isEmailVerified = true;
    user.emailVerificationOTP = undefined;
    user.emailVerificationOTPExpires = undefined;
    await user.save();

    // Send welcome email after successful verification
    try {
      const { sendEmail } = require('../utils/sendEmail');
      await sendEmail({
        to: user.email,
        template: 'welcomeEmail',
        data: {
          name: `${user.firstName} ${user.lastName}`.trim() || user.firstName
        }
      });
      console.log('Welcome email sent successfully to:', user.email);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail the verification if welcome email fails
    }

    res.json({
      success: true,
      message: 'Email verified successfully! You can now login with your credentials.',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          name: user.fullName,
          email: user.email,
          picture: user.profilePicture,
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

    // Step 2: Find and delete user from Clerk
    let clerkUserDeleted = false;
    try {
      // Get all users from Clerk and find by email
      const clerkUsers = await clerkClient.users.getUserList({
        emailAddress: [email.toLowerCase()]
      });

      if (clerkUsers.length > 0) {
        // Delete each user found (should typically be just one)
        for (const clerkUser of clerkUsers) {
          await clerkClient.users.deleteUser(clerkUser.id);
          console.log(`Deleted Clerk user: ${clerkUser.id}`);
          clerkUserDeleted = true;
        }
      }
    } catch (clerkError) {
      console.error('Error deleting from Clerk:', clerkError);
      // Continue even if Clerk deletion fails
    }

    res.json({
      success: true,
      message: 'User cleanup completed',
      details: {
        mongoUserDeleted: !!mongoUser,
        clerkUserDeleted,
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

module.exports = router;

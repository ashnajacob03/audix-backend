const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // Check if token starts with 'Bearer '
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token format.'
      });
    }

    // Extract token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-jwt-secret-change-in-production');
      
      // Check if it's a refresh token (should not be used for API access)
      if (decoded.type === 'refresh') {
        return res.status(401).json({
          success: false,
          message: 'Access denied. Invalid token type.'
        });
      }

      // Get user from database
      const user = await User.findById(decoded.id);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. User not found.'
        });
      }

      // Check if user account is active
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. Account has been deactivated.'
        });
      }

      // Add user info to request object
      req.user = {
        id: user._id,
        email: user.email,
        accountType: user.accountType,
        isEmailVerified: user.isEmailVerified
      };

      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Access denied. Token has expired.',
          code: 'TOKEN_EXPIRED'
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Access denied. Invalid token.',
          code: 'INVALID_TOKEN'
        });
      } else {
        throw jwtError;
      }
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during authentication.'
    });
  }
};

// Middleware to check if user is verified
const requireVerification = (req, res, next) => {
  if (!req.user.isEmailVerified) {
    return res.status(403).json({
      success: false,
      message: 'Email verification required to access this resource.',
      code: 'EMAIL_NOT_VERIFIED'
    });
  }
  next();
};

// Middleware to check account type
const requireAccountType = (requiredTypes) => {
  return (req, res, next) => {
    if (!requiredTypes.includes(req.user.accountType)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required account type: ${requiredTypes.join(' or ')}`,
        code: 'INSUFFICIENT_ACCOUNT_TYPE'
      });
    }
    next();
  };
};

// Middleware for optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without authentication
    }

    const token = authHeader.substring(7);
    
    if (!token) {
      return next(); // Continue without authentication
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-jwt-secret-change-in-production');
      
      if (decoded.type === 'refresh') {
        return next(); // Continue without authentication
      }

      const user = await User.findById(decoded.id);
      
      if (user && user.isActive) {
        req.user = {
          id: user._id,
          email: user.email,
          accountType: user.accountType,
          isEmailVerified: user.isEmailVerified
        };
      }
    } catch (jwtError) {
      // Ignore JWT errors for optional auth
    }

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    next(); // Continue without authentication on error
  }
};

module.exports = {
  auth,
  requireVerification,
  requireAccountType,
  optionalAuth
};
const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const Notification = require('../models/Notification');
const ArtistVerification = require('../models/ArtistVerification');

const router = express.Router();

// Admin middleware to check if user is admin
const adminAuth = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user || !user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard statistics
// @access  Admin
router.get('/dashboard', [auth, adminAuth], async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ isActive: true });
    const premiumUsers = await User.countDocuments({ 
      isActive: true, 
      accountType: { $in: ['premium', 'family', 'student'] } 
    });
    const newUsersToday = await User.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    const activeUsersToday = await User.countDocuments({
      lastLogin: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    const stats = {
      users: {
        total: totalUsers,
        premium: premiumUsers,
        newToday: newUsersToday,
        activeToday: activeUsersToday
      },
      revenue: {
        monthly: 127450,
        growthRate: 15.8
      },
      engagement: {
        totalStreams: 1247892,
        avgSessionTime: '24m 32s'
      }
    };

    res.json({
      success: true,
      data: { stats }
    });
  } catch (error) {
    console.error('Get admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users with pagination
// @access  Admin
router.get('/users', [auth, adminAuth], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const skip = (page - 1) * limit;

    const filter = {};
    
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(filter)
      .select('firstName lastName email profilePicture accountType createdAt lastLogin isEmailVerified isAdmin isActive')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(filter);

    const formattedUsers = users.map(user => ({
      id: user._id,
      name: user.fullName,
      email: user.email,
      avatar: user.profilePicture,
      accountType: user.accountType,
      isEmailVerified: user.isEmailVerified,
      isAdmin: user.isAdmin,
      joinedAt: user.createdAt,
      lastLogin: user.lastLogin,
      // Online activity indicator (last 7 days)
      isActive: user.lastLogin && (Date.now() - new Date(user.lastLogin).getTime()) < 7 * 24 * 60 * 60 * 1000,
      // Actual account activation state (soft-deleted if false)
      isAccountActive: !!user.isActive
    }));

    res.json({
      success: true,
      data: {
        users: formattedUsers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get admin users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// ===== Artist Verification Admin =====
// List pending verifications
router.get('/artist-verifications', [auth, adminAuth], async (req, res) => {
  try {
    const items = await ArtistVerification.find({ status: 'pending' })
      .populate('user', 'firstName lastName email');
    res.json({ success: true, data: { items } });
  } catch (error) {
    console.error('List artist verifications error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Approve verification
router.post('/artist-verifications/:id/approve', [auth, adminAuth], async (req, res) => {
  try {
    const item = await ArtistVerification.findById(req.params.id);
    if (!item || item.status !== 'pending') {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    item.status = 'approved';
    item.reviewedAt = new Date();
    item.reviewedBy = req.user.id;
    await item.save();

    // Mark user as artist
    const user = await User.findById(item.user);
    if (user) {
      user.isArtist = true;
      await user.save();
      // Notify user and send email
      await Notification.create({
        recipient: user._id,
        sender: req.user.id,
        type: 'system',
        title: 'You are now an Artist',
        message: 'Your artist verification was approved. Enjoy your artist features!'
      });
      try {
        const { sendEmail } = require('../utils/sendEmail');
        await sendEmail({
          to: user.email,
          subject: 'Audix — You are now an Artist 🎉',
          text: 'Your artist verification was approved. Enjoy your artist features on Audix!',
          html: '<p>Your artist verification was approved. Enjoy your artist features on Audix!</p>'
        });
      } catch (e) { console.error('Email send failed:', e.message); }
    }

    res.json({ success: true, message: 'Artist approved' });
  } catch (error) {
    console.error('Approve artist error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Reject verification
router.post('/artist-verifications/:id/reject', [auth, adminAuth], async (req, res) => {
  try {
    const item = await ArtistVerification.findById(req.params.id);
    if (!item || item.status !== 'pending') {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    item.status = 'rejected';
    item.reviewedAt = new Date();
    item.reviewedBy = req.user.id;
    item.notes = req.body?.notes || '';
    await item.save();

    await Notification.create({
      recipient: item.user,
      sender: req.user.id,
      type: 'system',
      title: 'Artist verification rejected',
      message: 'Your artist verification was rejected. Please review and resubmit.'
    });

    res.json({ success: true, message: 'Artist rejected' });
  } catch (error) {
    console.error('Reject artist error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   POST /api/admin/users
// @desc    Create new user by admin
// @access  Admin
router.post('/users', [
  auth, 
  adminAuth,
  body('firstName')
    .notEmpty()
    .withMessage('First name is required')
    .isLength({ max: 50 })
    .withMessage('First name cannot exceed 50 characters'),
  
  body('lastName')
    .notEmpty()
    .withMessage('Last name is required')
    .isLength({ max: 50 })
    .withMessage('Last name cannot exceed 50 characters'),
  
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  
  body('password')
    .optional()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long'),
  
  body('accountType')
    .optional()
    .isIn(['free', 'premium', 'family', 'student'])
    .withMessage('Invalid account type'),
  
  body('isAdmin')
    .optional()
    .isBoolean()
    .withMessage('isAdmin must be boolean'),
  
  body('isEmailVerified')
    .optional()
    .isBoolean()
    .withMessage('isEmailVerified must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { firstName, lastName, email, password, accountType, isAdmin, isEmailVerified } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Create new user
    const userData = {
      firstName,
      lastName,
      email,
      accountType: accountType || 'free',
      isAdmin: isAdmin || false,
      isEmailVerified: isEmailVerified || false
    };

    // Add password if provided
    if (password) {
      userData.password = password;
    }

    const user = new User(userData);
    await user.save();

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: { 
        user: {
          id: user._id,
          name: user.fullName,
          email: user.email,
          accountType: user.accountType,
          isAdmin: user.isAdmin,
          isEmailVerified: user.isEmailVerified,
          joinedAt: user.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Create admin user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/admin/users/:userId
// @desc    Update user by admin
// @access  Admin
router.put('/users/:userId', [
  auth, 
  adminAuth,
  body('firstName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('First name cannot exceed 50 characters'),
  
  body('lastName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Last name cannot exceed 50 characters'),
  
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  
  body('accountType')
    .optional()
    .isIn(['free', 'premium', 'family', 'student'])
    .withMessage('Invalid account type'),
  
  body('isAdmin')
    .optional()
    .isBoolean()
    .withMessage('isAdmin must be boolean'),
  
  body('isEmailVerified')
    .optional()
    .isBoolean()
    .withMessage('isEmailVerified must be boolean'),
  
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be boolean')
], async (req, res) => {
  try {
    console.log('Update user request:', req.params.userId, req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { userId } = req.params;
    const updates = req.body;

    const user = await User.findById(userId);
    if (!user) {
      console.log('User not found:', userId);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if email is being changed and if it already exists
    if (updates.email && updates.email !== user.email) {
      const existingUser = await User.findOne({ email: updates.email });
      if (existingUser) {
        console.log('Email already exists:', updates.email);
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists'
        });
      }
    }

    // Update allowed fields
    const allowedFields = ['firstName', 'lastName', 'email', 'accountType', 'isAdmin', 'isEmailVerified', 'isActive'];
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        user[field] = updates[field];
      }
    });

    await user.save();
    console.log('User updated successfully:', user._id);

    res.json({
      success: true,
      message: 'User updated successfully',
      data: { 
        user: {
          id: user._id,
          name: user.fullName,
          email: user.email,
          accountType: user.accountType,
          isAdmin: user.isAdmin,
          isEmailVerified: user.isEmailVerified,
          isActive: user.isActive
        }
      }
    });
  } catch (error) {
    console.error('Update admin user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/admin/users/:userId
// @desc    Delete user by admin
// @access  Admin
router.delete('/users/:userId', [auth, adminAuth], async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('Delete user request:', userId, 'by admin:', req.user.id);

    // Prevent admin from deleting themselves
    if (userId === req.user.id) {
      console.log('Admin trying to delete themselves');
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.log('User not found for deletion:', userId);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await User.findByIdAndDelete(userId);
    console.log('User deleted successfully:', userId);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete admin user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/admin/users/bulk
// @desc    Delete multiple users by admin
// @access  Admin
router.delete('/users/bulk', [
  auth, 
  adminAuth,
  body('userIds')
    .isArray({ min: 1 })
    .withMessage('userIds must be a non-empty array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { userIds } = req.body;

    // Prevent admin from deleting themselves
    if (userIds.includes(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    const result = await User.deleteMany({ _id: { $in: userIds } });

    res.json({
      success: true,
      message: `${result.deletedCount} users deleted successfully`,
      data: { deletedCount: result.deletedCount }
    });
  } catch (error) {
    console.error('Bulk delete admin users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/admin/users/bulk
// @desc    Update multiple users by admin
// @access  Admin
router.put('/users/bulk', [
  auth, 
  adminAuth,
  body('userIds')
    .isArray({ min: 1 })
    .withMessage('userIds must be a non-empty array'),
  
  body('updates')
    .isObject()
    .withMessage('updates must be an object')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { userIds, updates } = req.body;

    // Prevent admin from modifying themselves in bulk operations
    if (userIds.includes(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot modify your own account in bulk operations'
      });
    }

    // Only allow certain fields for bulk updates
    const allowedFields = ['accountType', 'isActive'];
    const filteredUpdates = {};
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    });

    const result = await User.updateMany(
      { _id: { $in: userIds } },
      { $set: filteredUpdates }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} users updated successfully`,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (error) {
    console.error('Bulk update admin users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router; 
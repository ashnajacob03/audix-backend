const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const Notification = require('../models/Notification');

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

    const filter = { isActive: true };
    
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(filter)
      .select('firstName lastName email profilePicture accountType createdAt lastLogin isEmailVerified isAdmin')
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
      isActive: user.lastLogin && (Date.now() - new Date(user.lastLogin).getTime()) < 7 * 24 * 60 * 60 * 1000
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

// @route   PUT /api/admin/users/:userId
// @desc    Update user by admin
// @access  Admin
router.put('/users/:userId', [
  auth, 
  adminAuth,
  body('accountType')
    .optional()
    .isIn(['free', 'premium', 'family', 'student'])
    .withMessage('Invalid account type'),
  
  body('isAdmin')
    .optional()
    .isBoolean()
    .withMessage('isAdmin must be boolean')
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

    const { userId } = req.params;
    const updates = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (updates.accountType) user.accountType = updates.accountType;
    if (updates.isAdmin !== undefined) user.isAdmin = updates.isAdmin;

    await user.save();

    res.json({
      success: true,
      message: 'User updated successfully',
      data: { user: { id: user._id, accountType: user.accountType, isAdmin: user.isAdmin } }
    });
  } catch (error) {
    console.error('Update admin user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router; 
const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/user/all
// @desc    Get all users except current user (for friends/follow suggestions)
// @access  Private
router.get('/all', auth, async (req, res) => {
  try {
    // Get current user to check following status and friend requests
    const currentUser = await User.findById(req.user.id).select('following friends friendRequestsSent friendRequestsReceived');

    // Get all users except the current user, only return necessary fields
    const users = await User.find({
      _id: { $ne: req.user.id },
      isActive: true
    })
    .select('firstName lastName email profilePicture accountType createdAt lastLogin followers friends')
    .sort({ createdAt: -1 })
    .limit(50); // Limit to 50 users for performance

    const formattedUsers = users.map(user => {
      const userId = user._id.toString();
      const currentUserId = req.user.id.toString();
      
      // Check friend request status
      const sentRequest = currentUser.friendRequestsSent.find(req => req.user.toString() === userId);
      const receivedRequest = currentUser.friendRequestsReceived.find(req => req.user.toString() === userId);
      // Check both users' friends arrays
      const currentUserHasFriend = currentUser.friends.includes(user._id);
      const targetUserHasFriend = user.friends.includes(currentUser._id);
      const isFriend = currentUserHasFriend && targetUserHasFriend;
      
      // Debug logging for specific user
      if (user.firstName === 'Alka' && user.lastName === 'Sony') {
        console.log('Friend status debug for Alka Sony:', {
          currentUserId: currentUserId,
          targetUserId: userId,
          currentUserHasFriend,
          targetUserHasFriend,
          isFriend,
          sentRequest: !!sentRequest,
          receivedRequest: !!receivedRequest,
          currentUserFriends: currentUser.friends.map(id => id.toString()),
          targetUserFriends: user.friends.map(id => id.toString())
        });
      }
      
      let friendStatus = 'none';
      if (isFriend) {
        friendStatus = 'friends';
      } else if (sentRequest) {
        friendStatus = 'request_sent';
      } else if (receivedRequest) {
        friendStatus = 'request_received';
      }

      return {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.fullName,
        email: user.email,
        picture: user.profilePicture,
        accountType: user.accountType,
        joinedAt: user.createdAt,
        lastSeen: user.lastLogin,
        isOnline: user.lastLogin && (Date.now() - new Date(user.lastLogin).getTime()) < 5 * 60 * 1000, // 5 minutes
        isFollowing: currentUser.following.includes(user._id),
        followersCount: user.followers.length,
        friendStatus: friendStatus
      };
    });

    res.json({
      success: true,
      data: {
        users: formattedUsers,
        total: formattedUsers.length
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/user/follow/:userId
// @desc    Send follow request to a user
// @access  Private
router.post('/follow/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    console.log('Follow request:', { userId, currentUserId, userIdType: typeof userId, currentUserIdType: typeof currentUserId });

    // Validate MongoDB ObjectId format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log('Error: Invalid user ID format:', userId);
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    if (userId === currentUserId.toString()) {
      console.log('Error: User trying to follow themselves');
      return res.status(400).json({
        success: false,
        message: 'You cannot follow yourself'
      });
    }

    // Check if target user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      console.log('Error: Target user not found:', userId);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const currentUser = await User.findById(currentUserId);
    console.log('Current user following:', currentUser.following.map(id => id.toString()));
    console.log('Target user ID:', userId);

    // Check if already following
    if (currentUser.following.includes(userId)) {
      console.log('Error: Already following this user');
      return res.status(400).json({
        success: false,
        message: 'You are already following this user'
      });
    }

    // Check if follow request already sent
    const existingRequest = currentUser.friendRequestsSent.find(
      req => req.user.toString() === userId
    );
    if (existingRequest) {
      console.log('Error: Follow request already sent');
      return res.status(400).json({
        success: false,
        message: 'Follow request already sent'
      });
    }

    // Check if there's a pending request from the target user
    const incomingRequest = currentUser.friendRequestsReceived.find(
      req => req.user.toString() === userId
    );
    if (incomingRequest) {
      console.log('Error: Incoming request already exists');
      return res.status(400).json({
        success: false,
        message: 'This user has already sent you a follow request'
      });
    }

    // Add follow request to both users
    await User.findByIdAndUpdate(currentUserId, {
      $addToSet: {
        friendRequestsSent: {
          user: userId,
          sentAt: new Date()
        }
      }
    });

    await User.findByIdAndUpdate(userId, {
      $addToSet: {
        friendRequestsReceived: {
          user: currentUserId,
          receivedAt: new Date()
        }
      }
    });

    // Create notification for follow request
    const Notification = require('../models/Notification');
    await Notification.createFollowRequest(currentUserId, userId);

    res.json({
      success: true,
      message: 'Follow request sent successfully'
    });
  } catch (error) {
    console.error('Send follow request error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
});

// @route   POST /api/user/follow/:userId/accept
// @desc    Accept follow request
// @access  Private
router.post('/follow/:userId/accept', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    const currentUser = await User.findById(currentUserId);
    const senderUser = await User.findById(userId);

    if (!senderUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if follow request exists
    const followRequest = currentUser.friendRequestsReceived.find(
      req => req.user.toString() === userId
    );

    if (!followRequest) {
      return res.status(400).json({
        success: false,
        message: 'No follow request found from this user'
      });
    }

    // Remove follow requests from both users and add to friends/following/followers
    await User.findByIdAndUpdate(currentUserId, {
      $pull: {
        friendRequestsReceived: { user: userId }
      },
      $addToSet: {
        friends: userId,
        followers: userId
      }
    });

    await User.findByIdAndUpdate(userId, {
      $pull: {
        friendRequestsSent: { user: currentUserId }
      },
      $addToSet: {
        friends: currentUserId,
        following: currentUserId
      }
    });

    // Update the original follow request notification
    const Notification = require('../models/Notification');
    await Notification.findOneAndUpdate(
      {
        sender: userId,
        recipient: currentUserId,
        type: 'follow_request',
        actionTaken: 'pending'
      },
      {
        actionTaken: 'accepted'
      }
    );

    // Create acceptance notification for the sender
    await Notification.createFollowRequestAccepted(currentUserId, userId);

    res.json({
      success: true,
      message: 'Follow request accepted successfully'
    });
  } catch (error) {
    console.error('Accept follow request error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/user/follow/:userId/decline
// @desc    Decline follow request
// @access  Private
router.post('/follow/:userId/decline', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    const currentUser = await User.findById(currentUserId);

    // Check if follow request exists
    const followRequest = currentUser.friendRequestsReceived.find(
      req => req.user.toString() === userId
    );

    if (!followRequest) {
      return res.status(400).json({
        success: false,
        message: 'No follow request found from this user'
      });
    }

    // Remove follow requests from both users
    await User.findByIdAndUpdate(currentUserId, {
      $pull: {
        friendRequestsReceived: { user: userId }
      }
    });

    await User.findByIdAndUpdate(userId, {
      $pull: {
        friendRequestsSent: { user: currentUserId }
      }
    });

    // Update the original follow request notification
    const Notification = require('../models/Notification');
    await Notification.findOneAndUpdate(
      {
        sender: userId,
        recipient: currentUserId,
        type: 'follow_request',
        actionTaken: 'pending'
      },
      {
        actionTaken: 'declined'
      }
    );

    res.json({
      success: true,
      message: 'Follow request declined successfully'
    });
  } catch (error) {
    console.error('Decline follow request error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/user/follow/:userId
// @desc    Unfollow a user
// @access  Private
router.delete('/follow/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    // Remove from friends/following/followers
    await User.findByIdAndUpdate(currentUserId, {
      $pull: { 
        following: userId,
        friends: userId
      }
    });

    await User.findByIdAndUpdate(userId, {
      $pull: { 
        followers: currentUserId,
        friends: currentUserId
      }
    });

    res.json({
      success: true,
      message: 'User unfollowed successfully'
    });
  } catch (error) {
    console.error('Unfollow user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/user/fix-relationships
// @desc    Fix existing relationships (temporary endpoint)
// @access  Private
router.post('/fix-relationships', auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const currentUser = await User.findById(currentUserId).select('following followers friendRequestsSent friendRequestsReceived friends');
    
    // Find users who are in following/followers but not in friends
    const followingUsers = await User.find({ _id: { $in: currentUser.following } });
    const followerUsers = await User.find({ _id: { $in: currentUser.followers } });
    
    let fixed = 0;
    
    // Check mutual following relationships and add to friends
    for (const followingUser of followingUsers) {
      if (followingUser.followers.includes(currentUserId)) {
        // Mutual relationship exists, add to friends
        await User.findByIdAndUpdate(currentUserId, {
          $addToSet: { friends: followingUser._id }
        });
        await User.findByIdAndUpdate(followingUser._id, {
          $addToSet: { friends: currentUserId }
        });
        fixed++;
      }
    }
    
    res.json({
      success: true,
      message: `Fixed ${fixed} relationships`,
      data: {
        following: currentUser.following.length,
        followers: currentUser.followers.length,
        friends: currentUser.friends.length,
        fixed
      }
    });
  } catch (error) {
    console.error('Fix relationships error:', error);
    res.status(500).json({ success: false, message: 'Fix failed' });
  }
});

// @route   GET /api/user/debug/:userId
// @desc    Debug user relationship status
// @access  Private
router.get('/debug/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;
    
    const currentUser = await User.findById(currentUserId).select('following friendRequestsSent friendRequestsReceived friends');
    const targetUser = await User.findById(userId).select('_id firstName lastName');
    
    res.json({
      success: true,
      data: {
        currentUserId,
        targetUserId: userId,
        targetUserExists: !!targetUser,
        targetUserName: targetUser ? `${targetUser.firstName} ${targetUser.lastName}` : null,
        isFollowing: currentUser.following.includes(userId),
        sentRequest: currentUser.friendRequestsSent.find(req => req.user.toString() === userId),
        receivedRequest: currentUser.friendRequestsReceived.find(req => req.user.toString() === userId),
        isFriend: currentUser.friends.includes(userId),
        isSameUser: userId === currentUserId.toString()
      }
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ success: false, message: 'Debug failed' });
  }
});

// @route   GET /api/user/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
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
          isAdmin: user.isAdmin,
          preferences: user.preferences,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin,
          loginCount: user.loginCount
        }
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/user/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', [
  auth,
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  
  body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Please provide a valid date'),
  
  body('gender')
    .optional()
    .isIn(['male', 'female', 'other', 'prefer-not-to-say'])
    .withMessage('Invalid gender option'),
  
  body('country')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Country name too long')
], async (req, res) => {
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

    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update allowed fields
    const allowedUpdates = ['firstName', 'lastName', 'dateOfBirth', 'gender', 'country'];
    const updates = {};
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    Object.assign(user, updates);
    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          name: user.fullName,
          email: user.email,
          picture: user.profilePicture,
          dateOfBirth: user.dateOfBirth,
          gender: user.gender,
          country: user.country,
          updatedAt: user.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/user/preferences
// @desc    Update user preferences
// @access  Private
router.put('/preferences', [
  auth,
  body('theme')
    .optional()
    .isIn(['light', 'dark', 'auto'])
    .withMessage('Invalid theme option'),
  
  body('language')
    .optional()
    .isLength({ min: 2, max: 5 })
    .withMessage('Invalid language code'),
  
  body('notifications.email')
    .optional()
    .isBoolean()
    .withMessage('Email notification preference must be boolean'),
  
  body('notifications.push')
    .optional()
    .isBoolean()
    .withMessage('Push notification preference must be boolean'),
  
  body('notifications.marketing')
    .optional()
    .isBoolean()
    .withMessage('Marketing notification preference must be boolean')
], async (req, res) => {
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

    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update preferences
    if (req.body.theme) {
      user.preferences.theme = req.body.theme;
    }
    
    if (req.body.language) {
      user.preferences.language = req.body.language;
    }
    
    if (req.body.notifications) {
      if (req.body.notifications.email !== undefined) {
        user.preferences.notifications.email = req.body.notifications.email;
      }
      if (req.body.notifications.push !== undefined) {
        user.preferences.notifications.push = req.body.notifications.push;
      }
      if (req.body.notifications.marketing !== undefined) {
        user.preferences.notifications.marketing = req.body.notifications.marketing;
      }
    }
    
    if (req.body.privacy) {
      if (req.body.privacy.profileVisibility) {
        user.preferences.privacy.profileVisibility = req.body.privacy.profileVisibility;
      }
      if (req.body.privacy.showRecentActivity !== undefined) {
        user.preferences.privacy.showRecentActivity = req.body.privacy.showRecentActivity;
      }
    }

    await user.save();

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: {
        preferences: user.preferences
      }
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/user/change-password
// @desc    Change user password
// @access  Private
router.put('/change-password', [
  auth,
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match');
      }
      return true;
    })
], async (req, res) => {
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

    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id).select('+password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has a password (not Google-only user)
    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change password for Google-authenticated accounts'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/user/account
// @desc    Delete user account
// @access  Private
router.delete('/account', [
  auth,
  body('password')
    .optional()
    .notEmpty()
    .withMessage('Password is required for account deletion'),
  
  body('confirmDeletion')
    .equals('DELETE')
    .withMessage('Please type DELETE to confirm account deletion')
], async (req, res) => {
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

    const { password } = req.body;

    const user = await User.findById(req.user.id).select('+password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify password if user has one
    if (user.password && password) {
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Password is incorrect'
        });
      }
    }

    // Soft delete - deactivate account instead of hard delete
    user.isActive = false;
    user.email = `deleted_${Date.now()}_${user.email}`;
    await user.save();

    res.json({
      success: true,
      message: 'Account has been deactivated successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/user/stats
// @desc    Get user statistics
// @access  Private
router.get('/stats', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('playlists')
      .populate('likedSongs')
      .populate('followedArtists');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const stats = {
      accountAge: Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)), // days
      loginCount: user.loginCount,
      lastLogin: user.lastLogin,
      playlistsCount: user.playlists.length,
      likedSongsCount: user.likedSongs.length,
      followedArtistsCount: user.followedArtists.length,
      favoriteGenres: user.favoriteGenres,
      accountType: user.accountType,
      isEmailVerified: user.isEmailVerified
    };

    res.json({
      success: true,
      data: { stats }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
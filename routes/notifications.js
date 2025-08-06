const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/notifications
// @desc    Get user notifications
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const notifications = await Notification.getUserNotifications(
      req.user.id,
      parseInt(limit),
      parseInt(skip)
    );

    const unreadCount = await Notification.getUnreadCount(req.user.id);

    res.json({
      success: true,
      data: {
        notifications,
        unreadCount,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: notifications.length
        }
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/notifications/unread-count
// @desc    Get unread notifications count
// @access  Private
router.get('/unread-count', auth, async (req, res) => {
  try {
    const unreadCount = await Notification.getUnreadCount(req.user.id);

    res.json({
      success: true,
      data: {
        unreadCount
      }
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/notifications/:notificationId/read
// @desc    Mark notification as read
// @access  Private
router.put('/:notificationId/read', auth, async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findOne({
      _id: notificationId,
      recipient: req.user.id
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    await notification.markAsRead();

    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/notifications/mark-all-read
// @desc    Mark all notifications as read
// @access  Private
router.put('/mark-all-read', auth, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, isRead: false },
      { isRead: true }
    );

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/notifications/friend-request/:userId
// @desc    Send friend request
// @access  Private
router.post('/friend-request/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    if (userId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot send a friend request to yourself'
      });
    }

    // Check if target user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const currentUser = await User.findById(currentUserId);

    // Check if already friends
    if (currentUser.friends.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: 'You are already friends with this user'
      });
    }

    // Check if friend request already sent
    const existingRequest = currentUser.friendRequestsSent.find(
      req => req.user.toString() === userId
    );
    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: 'Friend request already sent'
      });
    }

    // Check if there's a pending request from the target user
    const incomingRequest = currentUser.friendRequestsReceived.find(
      req => req.user.toString() === userId
    );
    if (incomingRequest) {
      return res.status(400).json({
        success: false,
        message: 'This user has already sent you a friend request'
      });
    }

    // Add friend request to both users
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

    // Create notification
    await Notification.createFriendRequest(currentUserId, userId);

    res.json({
      success: true,
      message: 'Friend request sent successfully'
    });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/notifications/friend-request/:userId/accept
// @desc    Accept friend request
// @access  Private
router.post('/friend-request/:userId/accept', auth, async (req, res) => {
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

    // Check if friend request exists
    const friendRequest = currentUser.friendRequestsReceived.find(
      req => req.user.toString() === userId
    );

    if (!friendRequest) {
      return res.status(400).json({
        success: false,
        message: 'No friend request found from this user'
      });
    }

    // Remove friend requests from both users
    await User.findByIdAndUpdate(currentUserId, {
      $pull: {
        friendRequestsReceived: { user: userId }
      },
      $addToSet: {
        friends: userId
      }
    });

    await User.findByIdAndUpdate(userId, {
      $pull: {
        friendRequestsSent: { user: currentUserId }
      },
      $addToSet: {
        friends: currentUserId
      }
    });

    // Update the original friend request notification
    await Notification.findOneAndUpdate(
      {
        sender: userId,
        recipient: currentUserId,
        type: 'friend_request',
        actionTaken: 'pending'
      },
      {
        actionTaken: 'accepted'
      }
    );

    // Create acceptance notification for the sender
    await Notification.createFriendRequestAccepted(currentUserId, userId);

    res.json({
      success: true,
      message: 'Friend request accepted successfully'
    });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/notifications/friend-request/:userId/decline
// @desc    Decline friend request
// @access  Private
router.post('/friend-request/:userId/decline', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    const currentUser = await User.findById(currentUserId);

    // Check if friend request exists
    const friendRequest = currentUser.friendRequestsReceived.find(
      req => req.user.toString() === userId
    );

    if (!friendRequest) {
      return res.status(400).json({
        success: false,
        message: 'No friend request found from this user'
      });
    }

    // Remove friend requests from both users
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

    // Update the original friend request notification
    await Notification.findOneAndUpdate(
      {
        sender: userId,
        recipient: currentUserId,
        type: 'friend_request',
        actionTaken: 'pending'
      },
      {
        actionTaken: 'declined'
      }
    );

    res.json({
      success: true,
      message: 'Friend request declined successfully'
    });
  } catch (error) {
    console.error('Decline friend request error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/notifications/:notificationId
// @desc    Delete notification
// @access  Private
router.delete('/:notificationId', auth, async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      recipient: req.user.id
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
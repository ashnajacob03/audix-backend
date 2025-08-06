const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // Who will receive this notification
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Who triggered this notification
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Type of notification
  type: {
    type: String,
    enum: [
      'friend_request',
      'friend_request_accepted',
      'friend_request_declined',
      'follow_request',
      'follow_request_accepted',
      'follow_request_declined',
      'new_follower',
      'like',
      'comment',
      'playlist_share',
      'system'
    ],
    required: true
  },
  
  // Notification title
  title: {
    type: String,
    required: true
  },
  
  // Notification message/content
  message: {
    type: String,
    required: true
  },
  
  // Additional data (optional)
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Read status
  isRead: {
    type: Boolean,
    default: false
  },
  
  // Action taken (for friend requests)
  actionTaken: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'none'],
    default: 'none'
  },
  
  // Expiry date (optional)
  expiresAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for better performance
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ sender: 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ isRead: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual to populate sender details
notificationSchema.virtual('senderDetails', {
  ref: 'User',
  localField: 'sender',
  foreignField: '_id',
  justOne: true
});

// Method to mark as read
notificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  return this.save();
};

// Static method to create friend request notification
notificationSchema.statics.createFriendRequest = function(senderId, recipientId) {
  return this.create({
    recipient: recipientId,
    sender: senderId,
    type: 'friend_request',
    title: 'New Friend Request',
    message: 'sent you a friend request',
    actionTaken: 'pending'
  });
};

// Static method to create friend request accepted notification
notificationSchema.statics.createFriendRequestAccepted = function(senderId, recipientId) {
  return this.create({
    recipient: recipientId,
    sender: senderId,
    type: 'friend_request_accepted',
    title: 'Friend Request Accepted',
    message: 'accepted your friend request',
    actionTaken: 'none'
  });
};

// Static method to create follow request notification
notificationSchema.statics.createFollowRequest = function(senderId, recipientId) {
  return this.create({
    recipient: recipientId,
    sender: senderId,
    type: 'follow_request',
    title: 'New Follow Request',
    message: 'sent you a follow request',
    actionTaken: 'pending'
  });
};

// Static method to create follow request accepted notification
notificationSchema.statics.createFollowRequestAccepted = function(senderId, recipientId) {
  return this.create({
    recipient: recipientId,
    sender: senderId,
    type: 'follow_request_accepted',
    title: 'Follow Request Accepted',
    message: 'accepted your follow request',
    actionTaken: 'none'
  });
};

// Static method to get unread count for a user
notificationSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({
    recipient: userId,
    isRead: false
  });
};

// Static method to get notifications for a user
notificationSchema.statics.getUserNotifications = function(userId, limit = 20, skip = 0) {
  return this.find({ recipient: userId })
    .populate('sender', 'firstName lastName profilePicture')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

module.exports = mongoose.model('Notification', notificationSchema);
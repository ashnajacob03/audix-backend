const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  unreadCount: {
    type: Map,
    of: Number,
    default: new Map()
  },
  isActive: {
    type: Boolean,
    default: true
  },
  conversationType: {
    type: String,
    enum: ['direct', 'group'],
    default: 'direct'
  },
  // For group conversations (future feature)
  groupName: {
    type: String,
    default: null
  },
  groupAvatar: {
    type: String,
    default: null
  },
  groupAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ 'participants': 1, 'lastMessageAt': -1 });

// Virtual for conversation ID (sorted participants for consistency)
conversationSchema.virtual('conversationId').get(function() {
  if (this.conversationType === 'direct' && this.participants.length === 2) {
    const participantIds = this.participants.map(p => p.toString()).sort();
    return participantIds.join('_');
  }
  return this._id.toString();
});

// Static method to find or create conversation
conversationSchema.statics.findOrCreateConversation = async function(participantIds) {
  // For direct conversations, ensure only 2 participants
  if (participantIds.length === 2) {
    const sortedIds = participantIds.sort();
    
    let conversation = await this.findOne({
      participants: { $all: sortedIds, $size: 2 },
      conversationType: 'direct'
    }).populate('participants', 'firstName lastName profilePicture lastActiveAt')
      .populate('lastMessage');
    
    if (!conversation) {
      conversation = await this.create({
        participants: sortedIds,
        conversationType: 'direct'
      });
      
      conversation = await this.findById(conversation._id)
        .populate('participants', 'firstName lastName profilePicture lastActiveAt')
        .populate('lastMessage');
    }
    
    return conversation;
  }
  
  // For group conversations (future feature)
  throw new Error('Group conversations not implemented yet');
};

// Static method to get user conversations
conversationSchema.statics.getUserConversations = function(userId, page = 1, limit = 20) {
  return this.find({
    participants: userId,
    isActive: true
  })
  .populate('participants', 'firstName lastName profilePicture lastActiveAt')
  .populate({
    path: 'lastMessage',
    populate: {
      path: 'sender',
      select: 'firstName lastName'
    }
  })
  .sort({ lastMessageAt: -1 })
  .limit(limit * 1)
  .skip((page - 1) * limit);
};

// Method to update last message
conversationSchema.methods.updateLastMessage = function(messageId) {
  this.lastMessage = messageId;
  this.lastMessageAt = new Date();
  return this.save();
};

// Method to increment unread count for a user
conversationSchema.methods.incrementUnreadCount = function(userId) {
  const currentCount = this.unreadCount.get(userId.toString()) || 0;
  this.unreadCount.set(userId.toString(), currentCount + 1);
  return this.save();
};

// Method to reset unread count for a user
conversationSchema.methods.resetUnreadCount = function(userId) {
  this.unreadCount.set(userId.toString(), 0);
  return this.save();
};

module.exports = mongoose.model('Conversation', conversationSchema);
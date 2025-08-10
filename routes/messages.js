const express = require('express');
const { body, validationResult, param } = require('express-validator');
const { auth } = require('../middleware/auth');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');

const router = express.Router();

  // Get user conversations
  router.get('/conversations', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const userId = req.user.id;

    // Fetch ALL conversations for the user (without pagination) to ensure we can backfill all historical data
    let conversations = await Conversation.find({
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
    .sort({ lastMessageAt: -1, updatedAt: -1 });

    // Ensure historical conversations are represented and lastMessage is populated
    // 1) Backfill lastMessage for existing conversations that are missing it
    console.log('🔍 Starting backfill process. Found', conversations.length, 'conversations');
    conversations = await Promise.all(conversations.map(async (conv) => {
      try {
        if (!conv.lastMessage && Array.isArray(conv.participants)) {
          const other = conv.participants.find(p => p._id.toString() !== userId);
          if (other) {
            console.log('🔍 Backfilling conversation with', other.fullName, 'for user', userId);
            const lastMsg = await Message.getLastMessage(userId, other._id);
            if (lastMsg) {
              console.log('🔍 Found historical message:', lastMsg.content, 'from', lastMsg.createdAt);
              // Persist last message and timestamp from history
              conv.lastMessage = lastMsg._id;
              conv.lastMessageAt = lastMsg.createdAt;
              await conv.save();
              // Re-populate lastMessage with sender details for formatting below
              await conv.populate({
                path: 'lastMessage',
                populate: { path: 'sender', select: 'firstName lastName' }
              });
              console.log('🔍 Successfully backfilled conversation', conv._id);
            } else {
              console.log('🔍 No historical messages found for conversation with', other.fullName);
            }
          }
        } else if (conv.lastMessage) {
          console.log('🔍 Conversation already has lastMessage:', conv.lastMessage.content);
        }
      } catch (e) {
        console.warn('Backfill lastMessage failed for conversation', conv._id?.toString?.(), e?.message);
      }
      return conv;
    }));

    // 2) Create conversations for friends that have historical messages but no conversation doc yet
    try {
      const currentUser = await User.findById(userId).select('friends firstName lastName');
      const friendIds = (currentUser?.friends || []).map(id => id.toString());
      console.log('🔍 User has friends:', friendIds);
      
      const existingOtherIds = new Set(
        conversations
          .map(c => (c.participants || []).find(p => p._id.toString() !== userId))
          .filter(Boolean)
          .map(p => p._id.toString())
      );
      console.log('🔍 Existing conversation participants:', Array.from(existingOtherIds));

      const newlyCreatedConversations = await Promise.all(friendIds.map(async (friendId) => {
        if (existingOtherIds.has(friendId)) {
          console.log('🔍 Friend', friendId, 'already has conversation, skipping');
          return null;
        }
        try {
          console.log('🔍 Checking for historical messages with friend', friendId);
          const lastMsg = await Message.getLastMessage(userId, friendId);
          if (!lastMsg) {
            console.log('🔍 No historical messages found for friend', friendId);
            return null; // no historical messages
          }

          console.log('🔍 Found historical message with friend', friendId, ':', lastMsg.content);
          // Create or fetch the conversation and persist historical last message
          let conv = await Conversation.findOrCreateConversation([userId, friendId]);
          // Only set values if missing to avoid overwriting newer state
          if (!conv.lastMessage) {
            conv.lastMessage = lastMsg._id;
            conv.lastMessageAt = lastMsg.createdAt;
            await conv.save();
            console.log('🔍 Created conversation with historical lastMessage for friend', friendId);
          }
          // Populate for consistent formatting
          conv = await conv.populate('participants', 'firstName lastName profilePicture lastActiveAt');
          await conv.populate({
            path: 'lastMessage',
            populate: { path: 'sender', select: 'firstName lastName' }
          });
          return conv;
        } catch (e) {
          console.warn('Failed ensuring conversation for friend', friendId, e?.message);
          return null;
        }
      }));

      const validNewConversations = newlyCreatedConversations.filter(Boolean);
      console.log('🔍 Created', validNewConversations.length, 'new conversations from historical messages');
      
      conversations = conversations.concat(validNewConversations);
      // Sort again after potential backfill/creation
      conversations.sort((a, b) => new Date(b.lastMessageAt || b.updatedAt) - new Date(a.lastMessageAt || a.updatedAt));
    } catch (e) {
      console.warn('Backfill ensure conversations step failed:', e?.message);
    }
    
    console.log('🔍 Backend raw conversations from DB:', JSON.stringify(conversations.map(conv => ({
      id: conv._id,
      participants: conv.participants.map(p => ({ id: p._id, name: p.fullName })),
      lastMessage: conv.lastMessage ? {
        id: conv.lastMessage._id,
        content: conv.lastMessage.content,
        sender: conv.lastMessage.sender ? conv.lastMessage.sender.fullName : 'Unknown'
      } : null,
      lastMessageAt: conv.lastMessageAt
    })), null, 2));
    
    // Format conversations for frontend
    const formattedConversations = conversations.map(conv => {
      const otherParticipant = conv.participants.find(p => p._id.toString() !== userId);
      const unreadCount = conv.unreadCount.get(userId) || 0;
      
      const formatted = {
        id: conv._id,
        conversationId: conv.conversationId,
        participant: {
          id: otherParticipant._id,
          name: otherParticipant.fullName,
          firstName: otherParticipant.firstName,
          lastName: otherParticipant.lastName,
          avatar: otherParticipant.profilePicture || '/default-avatar.png',
          online: otherParticipant.lastActiveAt && (Date.now() - new Date(otherParticipant.lastActiveAt).getTime()) < 5 * 60 * 1000, // 5 minutes
          lastSeen: otherParticipant.lastActiveAt
        },
        lastMessage: conv.lastMessage ? {
          id: conv.lastMessage._id,
          content: conv.lastMessage.content,
          sender: conv.lastMessage.sender ? conv.lastMessage.sender.fullName : 'Unknown',
          senderId: conv.lastMessage.sender ? conv.lastMessage.sender._id.toString() : null,
          timestamp: conv.lastMessage.createdAt,
          isRead: conv.lastMessage.isRead
        } : null,
        unreadCount,
        lastMessageAt: conv.lastMessageAt ? conv.lastMessageAt.toISOString() : null,
        updatedAt: conv.updatedAt
      };
      
      console.log('🔍 Backend formatted conversation:', {
        id: formatted.id,
        participant: formatted.participant.name,
        lastMessage: formatted.lastMessage,
        lastMessageAt: formatted.lastMessageAt
      });
      
      return formatted;
    });

    console.log('🔍 Backend sending formatted conversations:', JSON.stringify(formattedConversations.map(conv => ({
      id: conv.id,
      participant: conv.participant.name,
      lastMessage: conv.lastMessage,
      lastMessageAt: conv.lastMessageAt
    })), null, 2));
    
    // Final summary of what we're sending
    console.log('🔍 FINAL SUMMARY: Sending', formattedConversations.length, 'conversations');
    formattedConversations.forEach((conv, index) => {
      console.log(`  ${index + 1}. ${conv.participant.name}: ${conv.lastMessage ? `"${conv.lastMessage.content}" (${conv.lastMessageAt})` : 'No last message'}`);
    });

    res.json({
      success: true,
      data: {
        conversations: formattedConversations,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: formattedConversations.length
        }
      }
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversations',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get conversation messages
router.get('/conversations/:userId', [
  auth,
  param('userId').isMongoId().withMessage('Invalid user ID')
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
    const { page = 1, limit = 50 } = req.query;
    const currentUserId = req.user.id;

    // Check if the other user exists and is a friend
    const otherUser = await User.findById(userId);
    if (!otherUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if users are friends
    const currentUser = await User.findById(currentUserId);
    if (!currentUser.friends.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You can only message friends'
      });
    }

    // Get messages
    const messages = await Message.getConversation(currentUserId, userId, parseInt(page), parseInt(limit));
    
    // Mark messages as read
    await Message.markAsRead(userId, currentUserId);

    // Update conversation unread count
    const conversation = await Conversation.findOrCreateConversation([currentUserId, userId]);
    await conversation.resetUnreadCount(currentUserId);

    // Format messages for frontend
    const formattedMessages = messages.reverse().map(msg => ({
      id: msg._id,
      content: msg.content,
      senderId: msg.sender._id,
      senderName: msg.sender.fullName,
      receiverId: msg.receiver._id,
      receiverName: msg.receiver.fullName,
      timestamp: msg.createdAt,
      isRead: msg.isRead,
      readAt: msg.readAt,
      messageType: msg.messageType,
      fileUrl: msg.fileUrl,
      fileName: msg.fileName,
      isEdited: msg.isEdited,
      editedAt: msg.editedAt,
      replyTo: msg.replyTo ? {
        id: msg.replyTo._id,
        content: msg.replyTo.content,
        senderName: msg.replyTo.sender.fullName,
        timestamp: msg.replyTo.createdAt
      } : null
    }));

    res.json({
      success: true,
      data: {
        messages: formattedMessages,
        otherUser: {
          id: otherUser._id,
          name: otherUser.fullName,
          firstName: otherUser.firstName,
          lastName: otherUser.lastName,
          avatar: otherUser.profilePicture || '/default-avatar.png',
          online: otherUser.lastActiveAt && (Date.now() - new Date(otherUser.lastActiveAt).getTime()) < 5 * 60 * 1000,
          lastSeen: otherUser.lastActiveAt
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: formattedMessages.length
        }
      }
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Send message
router.post('/send', [
  auth,
  body('receiverId').isMongoId().withMessage('Invalid receiver ID'),
  body('content').trim().isLength({ min: 1, max: 1000 }).withMessage('Message content must be between 1 and 1000 characters'),
  body('messageType').optional().isIn(['text', 'image', 'audio', 'file']).withMessage('Invalid message type'),
  body('replyToId').optional().isMongoId().withMessage('Invalid reply message ID')
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

    const { receiverId, content, messageType = 'text', replyToId } = req.body;
    const senderId = req.user.id;

    // Check if receiver exists and is a friend
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: 'Receiver not found'
      });
    }

    const sender = await User.findById(senderId);
    if (!sender.friends.includes(receiverId)) {
      return res.status(403).json({
        success: false,
        message: 'You can only message friends'
      });
    }

    // Create message
    const messageData = {
      sender: senderId,
      receiver: receiverId,
      content,
      messageType
    };

    if (replyToId) {
      const replyMessage = await Message.findById(replyToId);
      if (replyMessage) {
        messageData.replyTo = replyToId;
      }
    }

    const message = await Message.create(messageData);
    
    // Populate message for response
    await message.populate('sender', 'firstName lastName profilePicture');
    await message.populate('receiver', 'firstName lastName profilePicture');
    if (message.replyTo) {
      await message.populate('replyTo', 'content sender createdAt');
    }

    // Update or create conversation
    const conversation = await Conversation.findOrCreateConversation([senderId, receiverId]);
    await conversation.updateLastMessage(message._id);
    await conversation.incrementUnreadCount(receiverId);

    // Format message for response
    const formattedMessage = {
      id: message._id,
      content: message.content,
      senderId: message.sender._id,
      senderName: message.sender.fullName,
      receiverId: message.receiver._id,
      receiverName: message.receiver.fullName,
      timestamp: message.createdAt,
      isRead: message.isRead,
      messageType: message.messageType,
      conversationId: conversation.conversationId,
      replyTo: message.replyTo ? {
        id: message.replyTo._id,
        content: message.replyTo.content,
        senderName: message.replyTo.sender.fullName,
        timestamp: message.replyTo.createdAt
      } : null
    };

    // Emit socket event (will be handled by socket middleware)
    req.io.to(`user_${receiverId}`).emit('new_message', formattedMessage);
    req.io.to(`user_${senderId}`).emit('message_sent', formattedMessage);

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: formattedMessage
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Mark messages as read
router.put('/mark-read/:userId', [
  auth,
  param('userId').isMongoId().withMessage('Invalid user ID')
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
    const currentUserId = req.user.id;

    // Mark messages as read
    await Message.markAsRead(userId, currentUserId);

    // Update conversation unread count
    const conversation = await Conversation.findOrCreateConversation([currentUserId, userId]);
    await conversation.resetUnreadCount(currentUserId);

    // Emit socket event to sender
    req.io.to(`user_${userId}`).emit('messages_read', {
      readBy: currentUserId,
      conversationId: conversation.conversationId
    });

    res.json({
      success: true,
      message: 'Messages marked as read'
    });
  } catch (error) {
    console.error('Mark messages as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark messages as read',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get unread message count
router.get('/unread-count', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const unreadCount = await Message.getUnreadCount(userId);

    res.json({
      success: true,
      data: { unreadCount }
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get unread count',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete message
router.delete('/:messageId', [
  auth,
  param('messageId').isMongoId().withMessage('Invalid message ID')
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

    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Check if user is the sender
    if (message.sender.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own messages'
      });
    }

    // Soft delete
    message.isDeleted = true;
    message.deletedAt = new Date();
    await message.save();

    // Emit socket event
    const conversationId = [message.sender.toString(), message.receiver.toString()].sort().join('_');
    req.io.to(`user_${message.receiver}`).emit('message_deleted', {
      messageId,
      conversationId
    });

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete message',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
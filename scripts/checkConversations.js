const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');

require('dotenv').config();

async function checkConversations() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/audix');
    console.log('Connected to MongoDB');

    // Check conversations
    const conversations = await Conversation.find()
      .populate('participants', 'firstName lastName email')
      .populate('lastMessage', 'content sender createdAt');

    console.log(`\n📱 Found ${conversations.length} conversations:`);
    
    conversations.forEach((conv, index) => {
      console.log(`\n${index + 1}. Conversation ID: ${conv.conversationId}`);
      console.log(`   Participants: ${conv.participants.map(p => `${p.firstName} ${p.lastName} (${p.email})`).join(', ')}`);
      console.log(`   Last Message: ${conv.lastMessage ? conv.lastMessage.content : 'None'}`);
      console.log(`   Last Message At: ${conv.lastMessageAt}`);
      console.log(`   Unread Count: ${JSON.stringify(conv.unreadCount)}`);
    });

    // Check messages
    const messages = await Message.find()
      .populate('sender', 'firstName lastName')
      .populate('receiver', 'firstName lastName');

    console.log(`\n💬 Found ${messages.length} messages:`);
    
    messages.forEach((msg, index) => {
      console.log(`\n${index + 1}. Message: "${msg.content}"`);
      console.log(`   From: ${msg.sender.firstName} ${msg.sender.lastName}`);
      console.log(`   To: ${msg.receiver.firstName} ${msg.receiver.lastName}`);
      console.log(`   Created: ${msg.createdAt}`);
    });

    // Check users
    const users = await User.find().select('firstName lastName email friends');
    console.log(`\n👥 Found ${users.length} users:`);
    
    users.forEach((user, index) => {
      console.log(`\n${index + 1}. ${user.firstName} ${user.lastName} (${user.email})`);
      console.log(`   Friends: ${user.friends.length}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

checkConversations(); 
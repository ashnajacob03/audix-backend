const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');

require('dotenv').config();

async function testConversations() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/audix');
    console.log('Connected to MongoDB');

    // Get all users
    const users = await User.find().select('firstName lastName email');
    console.log('\n👥 Users in database:');
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.firstName} ${user.lastName} (${user.email}) - ID: ${user._id}`);
    });

    // Get all conversations
    const conversations = await Conversation.find()
      .populate('participants', 'firstName lastName email')
      .populate('lastMessage', 'content sender createdAt');

    console.log(`\n📱 Conversations in database: ${conversations.length}`);
    
    conversations.forEach((conv, index) => {
      console.log(`\n${index + 1}. Conversation ID: ${conv._id}`);
      console.log(`   Conversation ID (virtual): ${conv.conversationId}`);
      console.log(`   Participants: ${conv.participants.map(p => `${p.firstName} ${p.lastName} (${p.email})`).join(', ')}`);
      console.log(`   Last Message: ${conv.lastMessage ? conv.lastMessage.content : 'None'}`);
      console.log(`   Last Message At: ${conv.lastMessageAt}`);
      console.log(`   Unread Count: ${JSON.stringify(conv.unreadCount)}`);
    });

    // Test getUserConversations for each user
    for (const user of users) {
      console.log(`\n🔍 Testing getUserConversations for ${user.firstName} ${user.lastName} (${user._id}):`);
      
      const userConversations = await Conversation.getUserConversations(user._id);
      console.log(`   Found ${userConversations.length} conversations`);
      
      userConversations.forEach((conv, index) => {
        const otherParticipant = conv.participants.find(p => p._id.toString() !== user._id.toString());
        console.log(`   ${index + 1}. With: ${otherParticipant ? `${otherParticipant.firstName} ${otherParticipant.lastName}` : 'Unknown'}`);
        console.log(`      Last Message: ${conv.lastMessage ? conv.lastMessage.content : 'None'}`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

testConversations(); 
const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function checkFriends() {
  try {
    console.log('🔍 Checking friends for Ashna Jacob...');
    
    // Find the current user (Ashna)
    const currentUser = await User.findOne({ email: 'ashnajacob986@gmail.com' })
      .populate('friends', 'firstName lastName email profilePicture lastActiveAt');
    
    if (!currentUser) {
      console.log('❌ Current user not found');
      return;
    }
    
    console.log(`✅ Found user: ${currentUser.fullName}`);
    console.log(`👥 Friends count: ${currentUser.friends.length}`);
    
    if (currentUser.friends.length > 0) {
      console.log('\n📋 Friends list:');
      currentUser.friends.forEach((friend, index) => {
        const isOnline = friend.lastActiveAt && (Date.now() - new Date(friend.lastActiveAt).getTime()) < 5 * 60 * 1000;
        console.log(`${index + 1}. ${friend.firstName} ${friend.lastName} (${friend.email}) - ${isOnline ? 'Online' : 'Offline'}`);
      });
    } else {
      console.log('📭 No friends found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

checkFriends();

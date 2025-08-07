const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function testAvatarData() {
  try {
    console.log('🔍 Testing avatar data for friends...');
    
    // Find the current user (Ashna)
    const currentUser = await User.findOne({ email: 'ashnajacob986@gmail.com' })
      .populate('friends', 'firstName lastName email profilePicture authMethod googleId');
    
    if (!currentUser) {
      console.log('❌ Current user not found');
      return;
    }
    
    console.log(`✅ Found user: ${currentUser.fullName}`);
    console.log(`👥 Friends count: ${currentUser.friends.length}\n`);
    
    if (currentUser.friends.length > 0) {
      console.log('📋 Friends avatar data:');
      currentUser.friends.forEach((friend, index) => {
        console.log(`${index + 1}. ${friend.firstName} ${friend.lastName}`);
        console.log(`   Email: ${friend.email}`);
        console.log(`   Auth Method: ${friend.authMethod || 'regular'}`);
        console.log(`   Profile Picture: ${friend.profilePicture || 'null'}`);
        console.log(`   Google ID: ${friend.googleId || 'null'}`);
        console.log(`   Is Google User: ${friend.authMethod === 'google'}`);
        console.log('');
      });
    } else {
      console.log('📭 No friends found');
    }
    
    // Test the formatted data like the API would return
    console.log('🔧 API Response Format:');
    const formattedFriends = currentUser.friends.map(friend => ({
      id: friend._id,
      name: friend.fullName,
      firstName: friend.firstName,
      lastName: friend.lastName,
      email: friend.email,
      avatar: friend.profilePicture,
      authMethod: friend.authMethod,
      isGoogleUser: friend.authMethod === 'google',
    }));
    
    console.log(JSON.stringify(formattedFriends, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

testAvatarData();

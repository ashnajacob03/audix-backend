const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function addTestFriends() {
  try {
    console.log('🔍 Looking for users...');
    
    // Find the current user (Ashna)
    const currentUser = await User.findOne({ email: 'ashnajacob986@gmail.com' });
    if (!currentUser) {
      console.log('❌ Current user not found');
      return;
    }
    
    console.log(`✅ Found current user: ${currentUser.fullName}`);
    
    // Create some test friends if they don't exist
    const testFriends = [
      {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        password: 'password123',
        isEmailVerified: true,
        isActive: true
      },
      {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
        password: 'password123',
        isEmailVerified: true,
        isActive: true
      },
      {
        firstName: 'Mike',
        lastName: 'Johnson',
        email: 'mike.johnson@example.com',
        password: 'password123',
        isEmailVerified: true,
        isActive: true
      }
    ];
    
    const createdFriends = [];
    
    for (const friendData of testFriends) {
      // Check if user already exists
      let friend = await User.findOne({ email: friendData.email });
      
      if (!friend) {
        // Create new user
        friend = new User(friendData);
        await friend.save();
        console.log(`✅ Created test user: ${friend.fullName}`);
      } else {
        console.log(`👤 User already exists: ${friend.fullName}`);
      }
      
      createdFriends.push(friend);
    }
    
    // Add friends to current user's friends list
    for (const friend of createdFriends) {
      // Check if already friends
      if (!currentUser.friends.includes(friend._id)) {
        currentUser.friends.push(friend._id);
        friend.friends.push(currentUser._id);
        await friend.save();
        console.log(`🤝 Added ${friend.fullName} as friend`);
      } else {
        console.log(`👥 Already friends with ${friend.fullName}`);
      }
    }
    
    await currentUser.save();
    
    console.log(`🎉 Successfully set up ${createdFriends.length} friends for ${currentUser.fullName}`);
    console.log('📱 You can now test the messaging feature!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

addTestFriends();

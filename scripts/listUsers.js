const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function listUsers() {
  try {
    console.log('🔍 Looking for all users...');
    
    const users = await User.find({}, 'firstName lastName email isActive friends').limit(10);
    
    console.log(`📊 Found ${users.length} users:`);
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.fullName} (${user.email}) - Active: ${user.isActive} - Friends: ${user.friends.length}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

listUsers();

const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const makeUserAdmin = async (email) => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find user by email
    const user = await User.findOne({ email });
    
    if (!user) {
      console.log('❌ User not found with email:', email);
      return;
    }

    // Update user to admin
    user.isAdmin = true;
    await user.save();

    console.log('✅ Successfully made user admin:', {
      name: user.fullName,
      email: user.email,
      isAdmin: user.isAdmin
    });

  } catch (error) {
    console.error('❌ Error making user admin:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.log('❌ Please provide an email address');
  console.log('Usage: node makeAdmin.js <email>');
  process.exit(1);
}

makeUserAdmin(email); 
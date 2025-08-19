require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const crypto = require('crypto');

async function testResetPassword() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/audix');
    console.log('✅ Connected to MongoDB');

    // Check if required environment variables are set
    console.log('\n🔍 Environment Variables Check:');
    console.log('JWT_SECRET:', process.env.JWT_SECRET ? '✅ Set' : '❌ Missing');
    console.log('BCRYPT_SALT_ROUNDS:', process.env.BCRYPT_SALT_ROUNDS ? '✅ Set' : '❌ Missing');
    console.log('FRONTEND_URL:', process.env.FRONTEND_URL ? '✅ Set' : '❌ Missing');

    if (!process.env.JWT_SECRET) {
      console.log('\n❌ JWT_SECRET is missing! This will cause the reset password to fail.');
      console.log('Please create a .env file with the required environment variables.');
      return;
    }

    // Find a test user
    const testUser = await User.findOne({ email: { $exists: true } });
    if (!testUser) {
      console.log('\n❌ No test user found. Please create a user first.');
      return;
    }

    console.log('\n👤 Test User Found:');
    console.log('Email:', testUser.email);
    console.log('ID:', testUser._id);

    // Test password reset token generation
    console.log('\n🔑 Testing Password Reset Token Generation...');
    const resetToken = testUser.generatePasswordResetToken();
    console.log('Reset Token:', resetToken);
    console.log('Hashed Token:', testUser.passwordResetToken);
    console.log('Expires:', testUser.passwordResetExpires);

    // Save the user with the reset token
    await testUser.save();
    console.log('✅ User saved with reset token');

    // Test the reset password logic
    console.log('\n🔄 Testing Reset Password Logic...');
    const { token, password } = {
      token: resetToken,
      password: 'NewPassword123'
    };

    // Hash the token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    console.log('Input Token Hash:', hashedToken);
    console.log('Stored Token Hash:', testUser.passwordResetToken);
    console.log('Token Match:', hashedToken === testUser.passwordResetToken);

    // Find user with reset token
    const userWithToken = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!userWithToken) {
      console.log('❌ User not found with reset token');
      return;
    }

    console.log('✅ User found with reset token');

    // Test password update
    console.log('\n🔐 Testing Password Update...');
    const oldPassword = userWithToken.password;
    userWithToken.password = password;
    userWithToken.passwordResetToken = undefined;
    userWithToken.passwordResetExpires = undefined;

    // This should trigger the password hashing middleware
    await userWithToken.save();
    console.log('✅ Password updated and saved');

    // Test token generation
    console.log('\n🎫 Testing Token Generation...');
    try {
      const authToken = userWithToken.generateAuthToken();
      const refreshToken = userWithToken.generateRefreshToken();
      console.log('✅ Auth Token Generated:', authToken ? 'Success' : 'Failed');
      console.log('✅ Refresh Token Generated:', refreshToken ? 'Success' : 'Failed');
    } catch (tokenError) {
      console.log('❌ Token Generation Failed:', tokenError.message);
    }

    console.log('\n✅ Reset Password Test Completed Successfully!');

  } catch (error) {
    console.error('\n❌ Test Failed:', error);
    console.error('Stack Trace:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the test
testResetPassword(); 
const mongoose = require('mongoose');
require('dotenv').config();
const Playlist = require('../models/Playlist');
const User = require('../models/User');

async function createTestPlaylist() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get a user
    const user = await User.findOne({});
    if (!user) {
      console.log('No users found in database');
      return;
    }

    console.log(`Creating test playlist for user: ${user.email}`);

    // Create a test playlist
    const testPlaylist = new Playlist({
      name: 'My Test Playlist',
      description: 'A test playlist for debugging',
      owner: user._id,
      isPublic: true,
      mood: 'happy'
    });

    await testPlaylist.save();
    console.log('✓ Created test playlist:', testPlaylist.name);
    console.log('Playlist ID:', testPlaylist._id);
    console.log('Owner:', testPlaylist.owner);

    // Check if playlist was created correctly
    const savedPlaylist = await Playlist.findById(testPlaylist._id).populate('owner', 'email firstName lastName');
    console.log('✓ Verified playlist creation:');
    console.log('  Name:', savedPlaylist.name);
    console.log('  Owner:', savedPlaylist.owner.email);
    console.log('  Public:', savedPlaylist.isPublic);
    console.log('  Songs count:', savedPlaylist.songs.length);

    console.log('\n🎵 Test playlist created successfully!');
    console.log('You can now test the "Add to Playlist" functionality in your app.');

  } catch (error) {
    console.error('Error creating test playlist:', error);
  } finally {
    await mongoose.disconnect();
  }
}

createTestPlaylist();

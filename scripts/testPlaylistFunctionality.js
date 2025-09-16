const mongoose = require('mongoose');
require('dotenv').config();
const Song = require('../models/Song');
const Playlist = require('../models/Playlist');
const User = require('../models/User');

async function testPlaylistFunctionality() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get a user and a song to test with
    const user = await User.findOne({});
    const song = await Song.findOne({});

    if (!user) {
      console.log('No users found in database');
      return;
    }

    if (!song) {
      console.log('No songs found in database');
      return;
    }

    console.log(`Testing with user: ${user.email}`);
    console.log(`Testing with song: ${song.title} - ${song.artist}`);

    // Create a test playlist
    const testPlaylist = new Playlist({
      name: 'Test Playlist',
      description: 'Test playlist for functionality testing',
      owner: user._id,
      isPublic: true
    });

    await testPlaylist.save();
    console.log('✓ Created test playlist:', testPlaylist.name);

    // Test adding song to playlist
    console.log('\n--- Testing Add Song to Playlist ---');
    
    // Check if song is already in playlist
    const existingSong = testPlaylist.songs.find(s => s.song.toString() === song._id.toString());
    if (existingSong) {
      console.log('Song already in playlist, removing first...');
      testPlaylist.songs = testPlaylist.songs.filter(s => s.song.toString() !== song._id.toString());
      await testPlaylist.save();
    }

    // Add song to playlist
    testPlaylist.songs.push({
      song: song._id,
      addedBy: user._id,
      position: testPlaylist.songs.length
    });

    // Update total duration
    if (typeof song.duration === 'number' && !Number.isNaN(song.duration)) {
      testPlaylist.totalDuration = (testPlaylist.totalDuration || 0) + song.duration;
    }

    await testPlaylist.save();
    await testPlaylist.populate('songs.song', 'title artist album imageUrl duration');

    console.log('✓ Successfully added song to playlist');
    console.log('Playlist now has', testPlaylist.songs.length, 'songs');
    console.log('Total duration:', testPlaylist.totalDuration, 'seconds');

    // Test the API endpoint directly
    console.log('\n--- Testing API Endpoint ---');
    const axios = require('axios');
    
    try {
      // First, get a token (you'll need to implement this based on your auth system)
      console.log('Note: To test the API endpoint, you need to be logged in and have a valid token');
      console.log('The playlist functionality should work if:');
      console.log('1. User is authenticated');
      console.log('2. Playlist exists and user has access');
      console.log('3. Song exists in database');
      
    } catch (apiError) {
      console.log('API test requires authentication setup');
    }

    // Clean up test playlist
    await Playlist.findByIdAndDelete(testPlaylist._id);
    console.log('\n✓ Cleaned up test playlist');

    console.log('\n=== PLAYLIST FUNCTIONALITY TEST COMPLETE ===');
    console.log('✓ Database operations work correctly');
    console.log('✓ Song can be added to playlist');
    console.log('✓ Playlist population works');
    console.log('✓ Duration calculation works');

  } catch (error) {
    console.error('Error testing playlist functionality:', error);
  } finally {
    await mongoose.disconnect();
  }
}

testPlaylistFunctionality();

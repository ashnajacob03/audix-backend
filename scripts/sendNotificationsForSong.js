const mongoose = require('mongoose');
const User = require('../models/User');
const Artist = require('../models/Artist');
const Song = require('../models/Song');
const Notification = require('../models/Notification');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/audix', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function sendNotificationsForSong(songTitle) {
  try {
    console.log(`🔔 Sending notifications for song: ${songTitle}`);

    // Find the song
    const song = await Song.findOne({ title: { $regex: new RegExp(songTitle, 'i') } });
    if (!song) {
      console.log(`❌ Song not found: ${songTitle}`);
      return;
    }

    console.log('📀 Found song:', {
      title: song.title,
      artist: song.artist,
      uploadedBy: song.uploadedBy
    });

    // Find or create the artist document
    let artistDoc = await Artist.findOne({ name: song.artist });
    
    if (!artistDoc) {
      // Try case-insensitive search
      artistDoc = await Artist.findOne({ 
        name: { $regex: new RegExp(`^${song.artist}$`, 'i') } 
      });
    }
    
    if (!artistDoc) {
      artistDoc = await Artist.create({ name: song.artist });
      console.log(`✅ Created artist document for: ${song.artist}`);
    } else {
      console.log(`ℹ️  Found artist document: ${artistDoc.name}`);
    }

    // Get all followers of this artist
    const followers = await User.find({ 
      followedArtists: artistDoc._id 
    }).select('_id firstName lastName email');

    console.log(`👥 Found ${followers.length} followers for artist: ${artistDoc.name}`);

    if (followers.length === 0) {
      console.log('ℹ️  No followers found for this artist');
      return;
    }

    // Check if notifications already exist
    const existingNotifications = await Notification.find({
      type: 'new_song',
      data: { songId: song._id }
    });

    if (existingNotifications.length > 0) {
      console.log(`ℹ️  Notifications already sent (${existingNotifications.length} found)`);
      console.log('Existing notifications:', existingNotifications.map(n => ({
        recipient: n.recipient,
        createdAt: n.createdAt
      })));
      return;
    }

    // Send notifications to all followers
    const notificationPromises = followers.map(follower => 
      Notification.createNewSongNotification(
        song.uploadedBy, // sender (the user who uploaded the song)
        follower._id, // recipient (the follower)
        song.title, // song title
        song._id // song ID
      )
    );

    // Execute all notifications in parallel
    const notifications = await Promise.all(notificationPromises);
    
    console.log(`✅ Sent ${notifications.length} notifications for song: ${song.title}`);
    console.log('Recipients:', followers.map(f => `${f.firstName} ${f.lastName} (${f.email})`));

  } catch (error) {
    console.error('❌ Error sending notifications:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Get song title from command line argument
const songTitle = process.argv[2];

if (!songTitle) {
  console.log('Usage: node debugArtistNotifications.js <song-title>');
  console.log('Example: node debugArtistNotifications.js golden1');
  process.exit(1);
}

sendNotificationsForSong(songTitle);

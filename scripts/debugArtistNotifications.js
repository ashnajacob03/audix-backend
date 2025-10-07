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

async function debugArtistNotifications() {
  try {
    console.log('🔍 Debugging artist notification system...\n');

    // Find the "golden1" song
    const goldenSong = await Song.findOne({ title: { $regex: /golden1/i } });
    if (goldenSong) {
      console.log('📀 Found song:', {
        title: goldenSong.title,
        artist: goldenSong.artist,
        uploadedBy: goldenSong.uploadedBy,
        createdAt: goldenSong.createdAt
      });

      // Find the artist document
      const artistDoc = await Artist.findOne({ name: goldenSong.artist });
      if (artistDoc) {
        console.log('🎤 Found artist document:', {
          name: artistDoc.name,
          followers: artistDoc.followers?.length || 0,
          followerCount: artistDoc.followerCount
        });

        // Find followers
        const followers = await User.find({ 
          followedArtists: artistDoc._id 
        }).select('firstName lastName email');

        console.log('👥 Followers:', followers.map(f => `${f.firstName} ${f.lastName} (${f.email})`));

        // Check if notifications were sent
        const notifications = await Notification.find({
          type: 'new_song',
          data: { songId: goldenSong._id }
        }).populate('recipient', 'firstName lastName email');

        console.log('🔔 Notifications sent:', notifications.map(n => ({
          recipient: `${n.recipient.firstName} ${n.recipient.lastName}`,
          message: n.message,
          createdAt: n.createdAt
        })));

      } else {
        console.log('❌ No artist document found for:', goldenSong.artist);
      }
    } else {
      console.log('❌ No song found with title containing "golden1"');
    }

    console.log('\n🔍 Checking all artists and their followers...');
    const allArtists = await Artist.find({}).populate('followers', 'firstName lastName email');
    
    allArtists.forEach(artist => {
      console.log(`🎤 Artist: ${artist.name}`);
      console.log(`   Followers: ${artist.followers?.length || 0}`);
      if (artist.followers?.length > 0) {
        console.log(`   Follower names: ${artist.followers.map(f => `${f.firstName} ${f.lastName}`).join(', ')}`);
      }
      console.log('');
    });

    console.log('\n🔍 Checking all songs and their artists...');
    const recentSongs = await Song.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('uploadedBy', 'firstName lastName email');
    
    recentSongs.forEach(song => {
      console.log(`📀 Song: ${song.title} by ${song.artist}`);
      console.log(`   Uploaded by: ${song.uploadedBy ? `${song.uploadedBy.firstName} ${song.uploadedBy.lastName}` : 'Unknown'}`);
      console.log(`   Created: ${song.createdAt}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

async function fixArtistData() {
  try {
    console.log('🔧 Fixing artist data...\n');

    // Find all songs and ensure their artists exist in Artist collection
    const songs = await Song.find({});
    const artistNames = [...new Set(songs.map(song => song.artist))];

    console.log('📀 Found unique artist names from songs:', artistNames);

    for (const artistName of artistNames) {
      let artistDoc = await Artist.findOne({ name: artistName });
      
      if (!artistDoc) {
        // Try case-insensitive search
        artistDoc = await Artist.findOne({ 
          name: { $regex: new RegExp(`^${artistName}$`, 'i') } 
        });
      }

      if (!artistDoc) {
        artistDoc = await Artist.create({ name: artistName });
        console.log(`✅ Created artist document for: ${artistName}`);
      } else {
        console.log(`ℹ️  Artist already exists: ${artistDoc.name}`);
      }
    }

    console.log('\n✅ Artist data fix completed!');

  } catch (error) {
    console.error('❌ Fix failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the appropriate function based on command line argument
const command = process.argv[2];

if (command === 'fix') {
  fixArtistData();
} else {
  debugArtistNotifications();
}

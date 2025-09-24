const mongoose = require('mongoose');
require('dotenv').config();
const Song = require('../models/Song');

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/audix');
    console.log('Connected to MongoDB');

    // Find songs that only have preview URLs (no full audio)
    const songsWithOnlyPreview = await Song.find({
      previewUrl: { $exists: true, $ne: null },
      $or: [
        { audioUrl: { $exists: false } },
        { audioUrl: null },
        { audioUrl: '' }
      ],
      $or: [
        { streamUrl: { $exists: false } },
        { streamUrl: null },
        { streamUrl: '' }
      ]
    }).limit(10);

    console.log(`Found ${songsWithOnlyPreview.length} songs with only preview URLs:`);
    
    songsWithOnlyPreview.forEach((song, index) => {
      console.log(`${index + 1}. ${song.title} by ${song.artist}`);
      console.log(`   Preview URL: ${song.previewUrl}`);
      console.log(`   Spotify ID: ${song.spotifyId || 'N/A'}`);
      console.log('   ---');
    });

    if (songsWithOnlyPreview.length === 0) {
      console.log('No songs found with only preview URLs.');
      return;
    }

    console.log('\nTo add full audio URLs to these songs, you can:');
    console.log('1. Use the setAudioUrl.js script: node scripts/setAudioUrl.js <songId> <audioUrl>');
    console.log('2. Or manually update the database with full audio URLs');
    console.log('\nExample:');
    console.log(`node scripts/setAudioUrl.js ${songsWithOnlyPreview[0]._id} "https://example.com/full-audio.mp3"`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

main();


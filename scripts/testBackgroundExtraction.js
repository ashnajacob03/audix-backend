const mongoose = require('mongoose');
const backgroundExtractionService = require('../services/backgroundExtractionService');
const Song = require('../models/Song');
require('dotenv').config();

async function testBackgroundExtraction() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/audix');
    console.log('Connected to MongoDB');

    // Find a song with audio URL
    const song = await Song.findOne({
      $or: [
        { audioUrl: { $exists: true, $ne: null } },
        { streamUrl: { $exists: true, $ne: null } },
        { previewUrl: { $exists: true, $ne: null } }
      ]
    });

    if (!song) {
      console.log('No song found with audio URL');
      return;
    }

    console.log(`Testing with song: ${song.title} by ${song.artist}`);
    
    // Get audio URL
    const songObj = song.toObject({ getters: false, virtuals: false });
    const audioUrl = songObj.audioUrl || songObj.streamUrl || songObj.previewUrl;
    
    if (!audioUrl) {
      console.log('No audio URL available for this song');
      return;
    }

    console.log(`Audio URL: ${audioUrl}`);

    // Test extraction
    console.log('Starting background extraction...');
    const result = await backgroundExtractionService.extractBackground(
      song._id,
      audioUrl,
      (progress, message) => {
        console.log(`Progress: ${progress}% - ${message}`);
      }
    );

    console.log('Extraction result:', result);

    if (result.success) {
      console.log('✅ Background extraction successful!');
      console.log(`Output file: ${result.outputPath}`);
      console.log(`Public URL: ${result.publicUrl}`);
    } else {
      console.log('❌ Background extraction failed:', result.error);
    }

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the test
testBackgroundExtraction();


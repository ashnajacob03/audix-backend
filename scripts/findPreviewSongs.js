const mongoose = require('mongoose');
const Song = require('../models/Song');

async function findSongsWithPreview() {
  try {
    await mongoose.connect('mongodb://localhost:27017/audix');
    console.log('Connected to MongoDB');
    
    const songs = await Song.find({ 
      previewUrl: { $exists: true, $ne: null } 
    }).limit(5);
    
    console.log(`Found ${songs.length} songs with preview URLs:`);
    songs.forEach((song, i) => {
      console.log(`${i+1}. ${song.title} by ${song.artist}`);
      console.log(`   Preview URL: ${song.previewUrl}`);
      console.log(`   Audio URL: ${song.audioUrl || 'None'}`);
      console.log(`   ID: ${song._id}`);
      console.log('');
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

findSongsWithPreview();

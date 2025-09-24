const mongoose = require('mongoose');
const Song = require('../models/Song');
const service = require('../services/backgroundExtractionService');

async function main() {
  const songId = process.argv[2];
  if (!songId) {
    console.error('Usage: node scripts/extractForId.js <songId>');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/audix');
    console.log('Connected to MongoDB');

    const song = await Song.findById(songId);
    if (!song) {
      console.error('Song not found:', songId);
      process.exit(1);
    }

    const songObj = song.toObject({ getters: false, virtuals: false });
    const sourceUrl = songObj.audioUrl || songObj.streamUrl || songObj.previewUrl;
    console.log('Testing extraction for:', song.title, 'by', song.artist);
    console.log('Source URL:', sourceUrl);

    const result = await service.extractBackground(song._id, sourceUrl, (p,msg)=>{
      console.log(`Progress: ${Math.round(p)}% - ${msg}`);
    });
    console.log('Result:', result);
  } catch (err) {
    console.error('Diagnostic extraction error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

main();



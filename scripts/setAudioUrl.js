const mongoose = require('mongoose');
require('dotenv').config();
const Song = require('../models/Song');

async function main() {
  const [,, songId, audioUrl] = process.argv;
  if (!songId || !audioUrl) {
    console.error('Usage: node scripts/setAudioUrl.js <songId> <audioUrl>');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const result = await Song.findByIdAndUpdate(
      songId,
      { $set: { audioUrl, isAvailable: true } },
      { new: true }
    );

    if (!result) {
      console.error('Song not found');
      process.exit(1);
    }

    console.log('Updated song:', {
      id: result._id.toString(),
      title: result.title,
      artist: result.artist,
      audioUrl: result.audioUrl
    });
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();


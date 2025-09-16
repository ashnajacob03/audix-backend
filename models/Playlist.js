const mongoose = require('mongoose');

const PlaylistSongSchema = new mongoose.Schema({
  song: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Song',
    required: true,
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  position: {
    type: Number,
    default: 0,
  },
}, { _id: false });

const PlaylistSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
    trim: true,
  },
  songs: [PlaylistSongSchema],
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  collaborators: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  isPublic: {
    type: Boolean,
    default: true,
  },
  mood: {
    type: String,
    enum: ['happy', 'sad', 'energetic', 'chill', 'romantic', 'workout', 'study', 'party', 'sleep', 'other'],
  },
  tags: [{
    type: String,
    trim: true,
  }],
  totalDuration: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

module.exports = mongoose.model('Playlist', PlaylistSchema);

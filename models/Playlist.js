const mongoose = require('mongoose');

const playlistSchema = new mongoose.Schema({
  // Basic information
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },

  // Ownership
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Playlist type
  type: {
    type: String,
    enum: ['user', 'system', 'collaborative'],
    default: 'user'
  },

  // Visibility
  isPublic: {
    type: Boolean,
    default: true
  },

  // Cover image
  imageUrl: {
    type: String
  },

  // Songs in playlist
  songs: [{
    song: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Song',
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    position: {
      type: Number
    }
  }],

  // Playlist metadata
  totalDuration: {
    type: Number, // in seconds
    default: 0
  },
  songCount: {
    type: Number,
    default: 0
  },

  // Followers and engagement
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  followerCount: {
    type: Number,
    default: 0
  },

  // Playlist features
  isCollaborative: {
    type: Boolean,
    default: false
  },
  collaborators: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // Tags and categorization
  tags: [{
    type: String,
    trim: true
  }],
  mood: {
    type: String,
    enum: ['happy', 'sad', 'energetic', 'chill', 'romantic', 'workout', 'study', 'party', 'sleep', 'other']
  },

  // External references
  externalId: {
    type: String // For syncing with external services
  },
  source: {
    type: String,
    enum: ['spotify', 'deezer', 'lastfm', 'manual'],
    default: 'manual'
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
playlistSchema.index({ owner: 1 });
playlistSchema.index({ name: 'text', description: 'text' });
playlistSchema.index({ isPublic: 1 });
playlistSchema.index({ type: 1 });
playlistSchema.index({ mood: 1 });
playlistSchema.index({ tags: 1 });

// Virtual for formatted duration
playlistSchema.virtual('durationFormatted').get(function() {
  const hours = Math.floor(this.totalDuration / 3600);
  const minutes = Math.floor((this.totalDuration % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
});

// Ensure virtual fields are serialized
playlistSchema.set('toJSON', { virtuals: true });
playlistSchema.set('toObject', { virtuals: true });

// Pre-save middleware to update song count and duration
playlistSchema.pre('save', function(next) {
  this.songCount = this.songs.length;
  this.followerCount = this.followers.length;
  next();
});

module.exports = mongoose.model('Playlist', playlistSchema); 
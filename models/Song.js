const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
  // External API identifiers
  spotifyId: {
    type: String,
    unique: true,
    sparse: true
  },
  deezerId: {
    type: String,
    unique: true,
    sparse: true
  },
  lastfmId: {
    type: String,
    unique: true,
    sparse: true
  },

  // Basic song information
  title: {
    type: String,
    required: true,
    trim: true
  },
  artist: {
    type: String,
    required: true,
    trim: true
  },
  album: {
    type: String,
    trim: true
  },
  albumArtist: {
    type: String,
    trim: true
  },

  // Audio metadata
  duration: {
    type: Number, // in seconds
    required: true
  },
  trackNumber: {
    type: Number
  },
  discNumber: {
    type: Number,
    default: 1
  },

  // Media URLs
  previewUrl: {
    type: String // 30-second preview URL from Spotify
  },
  audioUrl: {
    type: String // Full audio URL (if available)
  },
  imageUrl: {
    type: String // Album artwork
  },
  largeImageUrl: {
    type: String // High-resolution album artwork
  },

  // Audio features (from Spotify)
  audioFeatures: {
    danceability: Number,
    energy: Number,
    key: Number,
    loudness: Number,
    mode: Number,
    speechiness: Number,
    acousticness: Number,
    instrumentalness: Number,
    liveness: Number,
    valence: Number,
    tempo: Number,
    timeSignature: Number
  },

  // Genre and classification
  genres: [{
    type: String,
    trim: true
  }],
  tags: [{
    type: String,
    trim: true
  }],

  // Release information
  releaseDate: {
    type: Date
  },
  releaseYear: {
    type: Number
  },

  // Popularity metrics
  popularity: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  playCount: {
    type: Number,
    default: 0
  },

  // External URLs
  externalUrls: {
    spotify: String,
    deezer: String,
    lastfm: String,
    youtube: String
  },

  // Licensing and availability
  isExplicit: {
    type: Boolean,
    default: false
  },
  isAvailable: {
    type: Boolean,
    default: true
  },

  // Source tracking
  source: {
    type: String,
    enum: ['spotify', 'deezer', 'lastfm', 'manual'],
    required: true
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
songSchema.index({ title: 'text', artist: 'text', album: 'text' });
songSchema.index({ spotifyId: 1 });
songSchema.index({ deezerId: 1 });
songSchema.index({ popularity: -1 });
songSchema.index({ releaseYear: -1 });
songSchema.index({ genres: 1 });

// Virtual for formatted duration
songSchema.virtual('durationFormatted').get(function() {
  const minutes = Math.floor(this.duration / 60);
  const seconds = this.duration % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// Ensure virtual fields are serialized
songSchema.set('toJSON', { virtuals: true });
songSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Song', songSchema); 
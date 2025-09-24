const mongoose = require('mongoose');

const userSongInteractionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  song: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Song',
    required: true
  },
  interaction: {
    type: String,
    enum: ['like', 'dislike', 'neutral'],
    default: 'neutral'
  },
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

// Create compound index to ensure one interaction per user-song pair
userSongInteractionSchema.index({ user: 1, song: 1 }, { unique: true });

// Index for efficient queries
userSongInteractionSchema.index({ song: 1, interaction: 1 });
userSongInteractionSchema.index({ user: 1, interaction: 1 });

// Pre-save middleware to update updatedAt
userSongInteractionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('UserSongInteraction', userSongInteractionSchema);

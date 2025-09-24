const mongoose = require('mongoose');

const artistVerificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  displayName: { type: String, required: true },
  socialLink: { type: String, default: '' },
  portfolioLink: { type: String, default: '' },
  idFileUrl: { type: String, default: '' },
  evidenceUrls: { type: [String], default: [] },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('ArtistVerification', artistVerificationSchema);



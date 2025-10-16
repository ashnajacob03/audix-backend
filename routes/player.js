const express = require('express');
const router = express.Router();

// Simple in-memory store for current playback state per song
// key: songId -> { isPlaying, currentTime, duration, updatedAt }
const playbackState = new Map();

router.post('/update', async (req, res) => {
  try {
    console.log('[player/update] incoming body:', req.body);
    const body = req.body || {};
    // Accept multiple possible keys for robustness
    const songId = body.song_id || body.songId || body.id || req.query.song_id || req.query.id;
    const isPlayingRaw = body.is_playing ?? body.isPlaying;
    const currentTimeRaw = body.current_time ?? body.currentTime;
    const durationRaw = body.duration;

    if (!songId) {
      // Gracefully no-op to avoid noisy 400s during rapid state changes
      return res.json({ success: true, noop: true, message: 'No song_id provided; update skipped' });
    }

    const state = {
      isPlaying: !!isPlayingRaw,
      currentTime: Number(currentTimeRaw) || 0,
      duration: Number(durationRaw) || 0,
      updatedAt: Date.now(),
    };
    playbackState.set(String(songId), state);
    return res.json({ success: true, state });
  } catch (err) {
    console.error('Player update error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Expose a getter for other routers to read playback state
router.get('/state/:songId', (req, res) => {
  const songId = String(req.params.songId || '');
  return res.json({ success: true, state: playbackState.get(songId) || null });
});

// Helper to allow other modules to read state programmatically
router.getPlaybackState = (songId) => playbackState.get(String(songId));

module.exports = router;





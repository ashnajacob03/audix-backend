const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Import player route to read current playback state
const playerRoute = require('./player');

// In-memory caches for visibility and notation data
// visibleSongs: songId -> boolean
// processingStatus: songId -> { processing: boolean, startedAt: ts }
// notationStore: songId -> { ready: boolean, parts: array, measures: array }
const visibleSongs = new Map();
const processingStatus = new Map();
const notationStore = new Map();

// Toggle visibility for current song's sheet music panel
router.post('/toggle', (req, res) => {
  console.log('[sheet-music/toggle] incoming body:', req.body);
  const body = req.body || {};
  const songId = body.song_id || body.songId || body.id || req.query.song_id || req.query.id;
  if (!songId) return res.json({ success: true, visible: false, requires_processing: false, noop: true, message: 'No song_id provided; toggle ignored' });

  const hasNotation = notationStore.get(String(songId))?.ready === true;
  const current = !!visibleSongs.get(String(songId));
  const nextVisible = !current;
  visibleSongs.set(String(songId), nextVisible);

  if (nextVisible && !hasNotation) {
    return res.json({ success: true, visible: true, requires_processing: true });
  }

  return res.json({ success: true, visible: nextVisible, notation_data: hasNotation ? notationStore.get(String(songId)) : null });
});

// Kick off processing (placeholder: simulate processing and create synthetic notation)
router.post('/process', async (req, res) => {
  try {
    console.log('[sheet-music/process] incoming body:', req.body);
    const body = req.body || {};
    const songId = body.song_id || body.songId || body.id || req.query.song_id || req.query.id;
    const audioFile = body.audio_file || body.audio || body.url;
    const metadata = body.metadata || {};
    if (!songId) return res.json({ success: true, processing: false, noop: true, message: 'No song_id provided; process ignored' });

    // If already processing or ready, acknowledge
    const status = processingStatus.get(String(songId));
    const existing = notationStore.get(String(songId));
    if (existing?.ready) {
      return res.json({ success: true, message: 'Already processed', ready: true });
    }
    if (status?.processing) {
      return res.json({ success: true, message: 'Processing already started', processing: true });
    }

    processingStatus.set(String(songId), { processing: true, startedAt: Date.now() });

    // Simulate async processing to produce minimal notation
    setTimeout(() => {
      try {
        const measures = [];
        const numMeasures = 32; // placeholder length
        for (let i = 0; i < numMeasures; i++) {
          const start = i * 2; // 2s per measure placeholder
          const notes = [];
          for (let j = 0; j < 4; j++) {
            notes.push({
              part: 'melody',
              pitch: ['C4','E4','G4','B4','D5','F4','A4'][((i + j) % 7)],
              start_time: start + j * 0.4,
              end_time: start + j * 0.4 + 0.35,
            });
          }
          measures.push({ number: i + 1, start_time: start, end_time: start + 2, notes });
        }
        notationStore.set(String(songId), {
          ready: true,
          parts: ['melody'],
          measures,
          meta: { title: metadata?.title || 'Track', artist: metadata?.artist || 'Artist' }
        });
      } catch (e) {
        // swallow errors in background simulation
      } finally {
        processingStatus.set(String(songId), { processing: false, startedAt: null });
      }
    }, 1200);

    return res.json({ success: true, processing: true });
  } catch (err) {
    console.error('Sheet music process error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Return a live notation slice aligned with current timestamp
router.get('/notation/:songId', (req, res) => {
  try {
    const songId = String(req.params.songId || '');
    const t = Number(req.query.timestamp) || 0;
    const store = notationStore.get(songId);
    if (!store?.ready) {
      return res.status(404).json({ error: 'Notation not ready' });
    }

    // Determine the current measure window around time t
    const measures = store.measures || [];
    const currentIdx = measures.findIndex(m => t >= m.start_time && t < m.end_time);
    const windowStart = Math.max(0, (currentIdx === -1 ? Math.floor(t / 2) : currentIdx) - 1);
    const windowEnd = Math.min(measures.length, windowStart + 3);
    const windowMeasures = measures.slice(windowStart, windowEnd).map((m) => {
      const notes = (m.notes || []).map(n => ({
        ...n,
        is_current: t >= n.start_time && t < n.end_time,
        time_until: Math.max(0, n.start_time - t),
      }));
      return { ...m, notes };
    });

    // Optionally consult current playback state for more context
    const playback = typeof playerRoute.getPlaybackState === 'function' ? playerRoute.getPlaybackState(songId) : null;

    return res.json({
      song_id: songId,
      timestamp: t,
      measures: windowMeasures,
      parts: store.parts,
      is_playing: playback?.isPlaying ?? true,
    });
  } catch (err) {
    console.error('Sheet music notation error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;





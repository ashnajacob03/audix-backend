const express = require('express');
const router = express.Router();
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mm = require('music-metadata');
const { body, validationResult, query } = require('express-validator');
const { auth, optionalAuth } = require('../middleware/auth');
const Song = require('../models/Song');
const Playlist = require('../models/Playlist');
const Artist = require('../models/Artist');
const User = require('../models/User');
const UserSongInteraction = require('../models/UserSongInteraction');
const Notification = require('../models/Notification');
const musicApiService = require('../services/musicApiService');
const backgroundExtractionService = require('../services/backgroundExtractionService');

// Utility function to fix artist names
const fixArtistNames = (songs) => {
  return songs.map(song => {
    if (!song.artist || song.artist === 'undefined' || song.artist === '' || song.artist.includes('undefined')) {
      if (song.uploadedBy) {
        song.artist = `${song.uploadedBy.firstName} ${song.uploadedBy.lastName}`;
        // Save the fix to the database
        song.save().catch(err => console.error('Error saving artist name fix:', err));
      } else {
        song.artist = 'Unknown Artist';
      }
    }
    return song;
  });
};

// ===== SONG ROUTES =====

// Upload storage (covers & audio)
const ensureDir = (p) => { try { fs.mkdirSync(p, { recursive: true }); } catch {} };
const coversDir = path.join(__dirname, '..', 'public', 'uploads', 'covers');
const audioDir = path.join(__dirname, '..', 'public', 'uploads', 'audio');
ensureDir(coversDir); ensureDir(audioDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'cover') return cb(null, coversDir);
    return cb(null, audioDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || (file.mimetype && `.${file.mimetype.split('/')[1]}`) || '';
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({ storage });

// Create manual song with uploads
router.post('/songs', auth, upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'cover', maxCount: 1 },
]), async (req, res) => {
  try {
    const title = (req.body.title || '').trim();
    const album = (req.body.album || '').trim();
    const genre = (req.body.genre || '').trim();
    const description = (req.body.description || '').trim();
    const releaseDate = req.body.releaseDate ? new Date(req.body.releaseDate) : undefined;
    const isExplicit = String(req.body.explicit) === 'true';
    // Get artist name from request body or use user's full name
    let artistName = req.body.artist ? req.body.artist.trim() : null;
    
    // If no artist name provided, use user's full name
    if (!artistName) {
      const firstName = req.user.firstName || '';
      const lastName = req.user.lastName || '';
      artistName = `${firstName} ${lastName}`.trim();
    }
    
    // Ensure artist name is not empty or undefined
    if (!artistName || artistName === 'undefined' || artistName === '' || artistName.includes('undefined')) {
      return res.status(400).json({ 
        message: 'Artist name is required and must be valid',
        details: 'Please provide a valid artist name or ensure your profile has a complete name'
      });
    }

    if (!title) return res.status(400).json({ message: 'Title is required' });

    const audioFile = req.files?.audio?.[0];
    if (!audioFile) return res.status(400).json({ message: 'Audio file is required' });

    // Extract duration from audio
    let durationSec = 0;
    try {
      const meta = await mm.parseFile(audioFile.path);
      durationSec = Math.round(meta.format.duration || 0);
    } catch {}
    if (!durationSec || Number.isNaN(durationSec)) durationSec = 180; // fallback 3 min

    const coverFile = req.files?.cover?.[0];

    const audioUrl = `/uploads/audio/${path.basename(audioFile.path)}`;
    const imageUrl = coverFile ? `/uploads/covers/${path.basename(coverFile.path)}` : undefined;

    console.log(`Creating song: "${title}" by "${artistName}" (uploaded by: ${req.user.firstName} ${req.user.lastName})`);
    console.log(`User details: ID=${req.user.id}, firstName="${req.user.firstName}", lastName="${req.user.lastName}"`);
    console.log(`Request body artist: "${req.body.artist}"`);

    const doc = new Song({
      title,
      artist: artistName,
      album: album || undefined,
      description: description || undefined,
      duration: durationSec,
      audioUrl,
      imageUrl,
      genres: genre ? [genre] : [],
      releaseDate: releaseDate || undefined,
      releaseYear: releaseDate ? releaseDate.getFullYear() : undefined,
      isExplicit,
      source: 'manual',
      uploadedBy: req.user.id,
      isAvailable: true,
    });

    await doc.save();

    // Send notifications to followers of the artist
    try {
      // Find or create the artist document - try exact match first, then case-insensitive
      let artistDoc = await Artist.findOne({ name: artistName });
      
      if (!artistDoc) {
        // Try case-insensitive search
        artistDoc = await Artist.findOne({ 
          name: { $regex: new RegExp(`^${artistName}$`, 'i') } 
        });
      }
      
      if (!artistDoc) {
        artistDoc = await Artist.create({ name: artistName });
        console.log(`Created new artist document for: ${artistName}`);
      } else {
        console.log(`Found existing artist document for: ${artistName} (actual name: ${artistDoc.name})`);
      }

      // Get all followers of this artist
      const followers = await User.find({ 
        followedArtists: artistDoc._id 
      }).select('_id firstName lastName');

      console.log(`Found ${followers.length} followers for artist: ${artistDoc.name} (ID: ${artistDoc._id})`);

      // Send notifications to all followers
      const notificationPromises = followers.map(follower => 
        Notification.createNewSongNotification(
          req.user.id, // sender (the user who uploaded the song)
          follower._id, // recipient (the follower)
          title, // song title
          doc._id // song ID
        )
      );

      // Execute all notifications in parallel
      await Promise.all(notificationPromises);
      
      console.log(`Sent ${followers.length} notifications for new song: ${title} by ${artistDoc.name}`);
    } catch (notificationError) {
      // Log error but don't fail the song creation
      console.error('Error sending song notifications:', notificationError);
    }

    res.status(201).json(doc);
  } catch (error) {
    console.error('Error creating manual song:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update manual song (metadata + optional new files)
router.put('/songs/:id', auth, upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'cover', maxCount: 1 },
]), async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);
    if (!song) return res.status(404).json({ message: 'Song not found' });
    if (song.source !== 'manual' || song.uploadedBy?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const title = (req.body.title || '').trim();
    const genre = (req.body.genre || '').trim();
    const description = (req.body.description || '').trim();
    
    // Handle artist name update
    let artistName = req.body.artist ? req.body.artist.trim() : null;
    if (!artistName) {
      const firstName = req.user.firstName || '';
      const lastName = req.user.lastName || '';
      artistName = `${firstName} ${lastName}`.trim();
    }
    
    // Ensure artist name is valid
    if (artistName && artistName !== 'undefined' && artistName !== '' && !artistName.includes('undefined')) {
      song.artist = artistName;
    }

    if (title) song.title = title;
    if (genre) song.genres = [genre]; else if (req.body.genre === '') song.genres = [];
    song.description = description || undefined;

    const audioFile = req.files?.audio?.[0];
    const coverFile = req.files?.cover?.[0];

    const unlinkSafe = (p) => { try { fs.unlinkSync(p); } catch {} };
    if (audioFile) {
      // delete old audio if local file
      if (song.audioUrl && song.audioUrl.startsWith('/uploads/audio/')) {
        unlinkSafe(path.join(__dirname, '..', 'public', song.audioUrl.replace(/^\//, '')));
      }
      song.audioUrl = `/uploads/audio/${path.basename(audioFile.path)}`;
      try {
        const meta = await mm.parseFile(audioFile.path);
        song.duration = Math.round(meta.format.duration || song.duration || 0) || song.duration || 180;
      } catch {}
    }
    if (coverFile) {
      if (song.imageUrl && song.imageUrl.startsWith('/uploads/covers/')) {
        unlinkSafe(path.join(__dirname, '..', 'public', song.imageUrl.replace(/^\//, '')));
      }
      song.imageUrl = `/uploads/covers/${path.basename(coverFile.path)}`;
    }

    await song.save();
    res.json(song);
  } catch (error) {
    console.error('Error updating song:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current artist's uploaded songs
router.get('/my-songs', auth, async (req, res) => {
  try {
    const songs = await Song.find({ source: 'manual', uploadedBy: req.user.id }).sort({ createdAt: -1 });
    res.json(songs);
  } catch (error) {
    console.error('Error fetching my songs:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a manual song (owner by artist name)
router.delete('/songs/:id', auth, async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);
    if (!song) return res.status(404).json({ message: 'Song not found' });
    if (song.source !== 'manual' || song.uploadedBy?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    // Remove files if they exist
    const unlinkSafe = (p) => { try { fs.unlinkSync(p); } catch {} };
    if (song.audioUrl) unlinkSafe(path.join(__dirname, '..', 'public', song.audioUrl.replace(/^\//, '')));
    if (song.imageUrl) unlinkSafe(path.join(__dirname, '..', 'public', song.imageUrl.replace(/^\//, '')));
    await Song.deleteOne({ _id: song._id });
    res.json({ message: 'Deleted' });
  } catch (error) {
    console.error('Error deleting song:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all songs with pagination and filters
router.get('/songs', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('genre').optional().isString().withMessage('Genre must be a string'),
  query('year').optional().isInt({ min: 1900, max: new Date().getFullYear() }).withMessage('Invalid year'),
  query('sort').optional().isIn(['title', 'artist', 'popularity', 'releaseDate', 'duration']).withMessage('Invalid sort field'),
  query('order').optional().isIn(['asc', 'desc']).withMessage('Order must be asc or desc')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      page = 1,
      limit = 20,
      genre,
      year,
      sort = 'popularity',
      order = 'desc',
      search
    } = req.query;

    const skip = (page - 1) * limit;
    const sortObj = { [sort]: order === 'desc' ? -1 : 1 };

    // Build filter object
    const filter = { isAvailable: true };
    if (genre) filter.genres = { $in: [new RegExp(genre, 'i')] };
    if (year) filter.releaseYear = year;
    if (search) {
      filter.$text = { $search: search };
    }

    const songs = await Song.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-audioFeatures')
      .populate('uploadedBy', 'firstName lastName');

    // Fix artist names for songs with undefined or bad artist names
    const fixedSongs = fixArtistNames(songs);

    const total = await Song.countDocuments(filter);

    res.json({
      songs: fixedSongs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching songs:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get song by ID
router.get('/songs/:id', async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);
    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }
    res.json(song);
  } catch (error) {
    console.error('Error fetching song:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Simple in-memory cache for lyrics to reduce external calls
const lyricsCache = new Map(); // key: songId -> { lyrics, ts }

// Get lyrics for a song by ID
router.get('/songs/:id/lyrics', async (req, res) => {
  try {
    const cacheHit = lyricsCache.get(req.params.id);
    if (cacheHit && cacheHit.lyrics && (Date.now() - cacheHit.ts < 1000 * 60 * 60 * 24)) {
      return res.json({ lyrics: cacheHit.lyrics, cached: true });
    }

    const song = await Song.findById(req.params.id);
    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }

    const rawTitle = (song.title || '').trim();
    const rawArtist = (song.artist || song.albumArtist || '').trim();
    const normalize = (s) => s
      .replace(/\s*\([^)]*\)\s*/g, ' ') // remove (...) parts
      .replace(/\s*-\s*[^-]*$/g, ' ') // remove trailing - Remix/Live/etc
      .replace(/\s*feat\.?\s+[^,]+/ig, ' ') // remove feat. in title
      .replace(/\s*\[[^\]]*\]\s*/g, ' ') // remove [Live] parts
      .replace(/\s{2,}/g, ' ') // collapse spaces
      .trim();
    const cleanTitle = normalize(rawTitle);
    const cleanArtist = normalize(rawArtist.replace(/\s*&\s*/g, ' & ')).replace(/,.*$/, '').replace(/\s*feat\..*$/i, '').trim();
    if (!cleanTitle || !cleanArtist) {
      return res.status(404).json({ message: 'Insufficient metadata for lyrics' });
    }

    // Build candidate queries
    const candidates = [];
    const pushUnique = (t, a) => {
      const key = `${t}__${a}`.toLowerCase();
      if (!candidates.some(c => c.key === key)) candidates.push({ key, title: t, artist: a });
    };
    pushUnique(cleanTitle, cleanArtist);
    if (cleanTitle !== rawTitle) pushUnique(rawTitle, cleanArtist);
    if (cleanArtist !== rawArtist) pushUnique(cleanTitle, rawArtist);
    // Title without anything after '-' and without parentheses already handled by normalize
    // Try also removing ampersands
    pushUnique(cleanTitle.replace(/ & /g, ' and '), cleanArtist);

    // Try multiple free lyrics providers in order (each attempt receives a candidate)
    const providerCalls = [
      async () => {
        // Lyrist API (community project)
        for (const c of candidates) {
          const url = `https://lyrist.vercel.app/api/${encodeURIComponent(c.artist)}/${encodeURIComponent(c.title)}`;
          const resp = await axios.get(url, { validateStatus: s => s >= 200 && s < 500 });
          const text = resp?.data?.lyrics || resp?.data?.lyric || resp?.data?.result || null;
          if (text && typeof text === 'string') return text;
        }
        return null;
      },
      async () => {
        // lyrics.ovh simple API
        for (const c of candidates) {
          const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(c.artist)}/${encodeURIComponent(c.title)}`;
          const resp = await axios.get(url, { validateStatus: s => s >= 200 && s < 500 });
          const text = resp?.data?.lyrics || null;
          if (text && typeof text === 'string') return text;
        }
        return null;
      },
      async () => {
        // some-random-api lyrics by title
        // Try "artist - title" and plain title
        for (const c of candidates) {
          const queries = [
            `${c.artist} - ${c.title}`,
            c.title,
          ];
          for (const q of queries) {
            const url = `https://some-random-api.com/lyrics?title=${encodeURIComponent(q)}`;
            const resp = await axios.get(url, { validateStatus: s => s >= 200 && s < 500 });
            const text = resp?.data?.lyrics || null;
            if (text && typeof text === 'string') return text;
          }
        }
        return null;
      },
      async () => {
        // ChartLyrics XML API
        const xml2txt = (xml) => {
          if (!xml) return null;
          const match = xml.match(/<Lyric>([\s\S]*?)<\/Lyric>/i);
          if (match && match[1]) {
            return match[1]
              .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
              .replace(/\r\n/g, '\n')
              .trim();
          }
          return null;
        };
        for (const c of candidates) {
          const url = `https://api.chartlyrics.com/apiv1.asmx/SearchLyricDirect?artist=${encodeURIComponent(c.artist)}&song=${encodeURIComponent(c.title)}`;
          const resp = await axios.get(url, { responseType: 'text', validateStatus: s => s >= 200 && s < 500 });
          const text = xml2txt(resp?.data);
          if (text && typeof text === 'string' && text.length > 0) return text;
        }
        return null;
      },
    ];

    let lyrics = null;
    for (const run of providerCalls) {
      try {
        lyrics = await run();
        if (lyrics) break;
      } catch (e) {
        // continue to next provider
      }
    }

    if (!lyrics) {
      return res.status(404).json({ message: 'Lyrics not found' });
    }

    // Normalize newlines and trim
    lyrics = String(lyrics)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n') // collapse overly large gaps
      .trim();

    lyricsCache.set(req.params.id, { lyrics, ts: Date.now() });
    return res.json({ lyrics });
  } catch (error) {
    console.error('Error fetching lyrics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Handle CORS preflight for audio streaming
router.options('/songs/:id/stream', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Range, Content-Length, Content-Type, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
  res.status(200).end();
});

// Stream song audio
router.get('/songs/:id/stream', async (req, res) => {
  try {
    console.log(`Stream request for song ID: ${req.params.id}`);
    const song = await Song.findById(req.params.id);
    if (!song) {
      console.error(`Song not found: ${req.params.id}`);
      return res.status(404).json({ message: 'Song not found' });
    }

    // If a direct audio URL exists on the document, use that first
    // Note: audioUrl may not be part of the schema for Spotify imports,
    // but if present on manual entries, we can still access it via toObject()
    const songObj = song.toObject({ getters: false, virtuals: false });
    const directAudioUrl = songObj.audioUrl || songObj.streamUrl;
    
    console.log(`Song: ${song.title} by ${song.artist}, Direct URL available: ${!!directAudioUrl}`);

    // If a full audio URL is available, proxy it with Range support
    if (directAudioUrl && typeof directAudioUrl === 'string') {
      // Forward range header if present
      const range = req.headers.range;
      const headers = {
        ...(range ? { Range: range } : {}),
        // Some hosts require a UA
        'User-Agent': req.headers['user-agent'] || 'Audix/1.0',
        // Allow cross-origin fetches of audio
        'Accept': '*/*'
      };

      console.log(`Attempting to proxy audio from: ${directAudioUrl}`);
      
      try {
        const upstream = await axios.get(directAudioUrl, {
          responseType: 'stream',
          headers,
          validateStatus: (status) => status >= 200 && status < 400,
          timeout: 10000 // 10 second timeout
        });

        // Mirror status and critical headers for media playback
        res.status(upstream.status);
        
        // Set CORS headers for audio streaming
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Range, Content-Length, Content-Type');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
        
        // Ensure content type is set for audio
        if (!upstream.headers['content-type']) {
          res.setHeader('Content-Type', 'audio/mpeg');
        }
        
        const passthroughHeaders = [
          'content-type',
          'content-length',
          'accept-ranges',
          'content-range',
          'cache-control',
        ];
        passthroughHeaders.forEach((h) => {
          const v = upstream.headers[h];
          if (v) res.setHeader(h, v);
        });

        console.log(`Successfully streaming audio from: ${directAudioUrl}`);
        upstream.data.pipe(res);
        return;
      } catch (proxyError) {
        console.error(`Error proxying audio from ${directAudioUrl}:`, proxyError.message);
        // Continue to fallback options instead of failing
      }
    }

    // Try external resolver API for a full track URL if configured
    const resolverUrl = process.env.FULL_TRACK_RESOLVER_URL;
    if (resolverUrl) {
      try {
        console.log(`Attempting to use resolver API for song: ${song.title}`);
        const params = {
          title: song.title,
          artist: song.artist,
          album: song.album,
          spotifyId: song.spotifyId,
        };
        const headers = {};
        if (process.env.FULL_TRACK_RESOLVER_TOKEN) {
          headers['Authorization'] = `Bearer ${process.env.FULL_TRACK_RESOLVER_TOKEN}`;
        }
        const resolveResp = await axios.get(resolverUrl, { 
          params, 
          headers,
          timeout: 8000 // 8 second timeout
        });
        const resolvedAudio = resolveResp?.data?.audioUrl || resolveResp?.data?.streamUrl;
        if (resolvedAudio) {
          console.log(`Resolver API returned audio URL: ${resolvedAudio}`);
          const range = req.headers.range;
          const proxyHeaders = {
            ...(range ? { Range: range } : {}),
            'User-Agent': req.headers['user-agent'] || 'Audix/1.0',
            'Accept': '*/*'
          };
          const upstream = await axios.get(resolvedAudio, {
            responseType: 'stream',
            headers: proxyHeaders,
            validateStatus: (status) => status >= 200 && status < 400,
            timeout: 10000 // 10 second timeout
          });

          res.status(upstream.status);
          
          // Set CORS headers for audio streaming
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Range, Content-Length, Content-Type');
          res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
          
          const passthroughHeaders = [
            'content-type',
            'content-length',
            'accept-ranges',
            'content-range',
            'cache-control',
          ];
          passthroughHeaders.forEach((h) => {
            const v = upstream.headers[h];
            if (v) res.setHeader(h, v);
          });

          upstream.data.pipe(res);
          return;
        }
      } catch (resolverErr) {
        console.error('Full track resolver failed:', resolverErr.message);
      }
    }

    // Fallback to Spotify 30s preview if available — proxy instead of redirect to avoid CORS
    if (song.previewUrl) {
      try {
        const range = req.headers.range;
        const proxyHeaders = {
          ...(range ? { Range: range } : {}),
          'User-Agent': req.headers['user-agent'] || 'Audix/1.0',
          'Accept': '*/*'
        };
        const upstream = await axios.get(song.previewUrl, {
          responseType: 'stream',
          headers: proxyHeaders,
          validateStatus: (status) => status >= 200 && status < 400
        });

        res.status(upstream.status);
        
        // Set CORS headers for audio streaming
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Range, Content-Length, Content-Type');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
        
        const passthroughHeaders = [
          'content-type',
          'content-length',
          'accept-ranges',
          'content-range',
          'cache-control',
        ];
        passthroughHeaders.forEach((h) => {
          const v = upstream.headers[h];
          if (v) res.setHeader(h, v);
        });

        upstream.data.pipe(res);
        return;
      } catch (previewErr) {
        console.error('Preview proxy failed:', previewErr.message);
      }
    }

    // Last-resort fallback: try iTunes Search API for a preview clip
    try {
      const term = `${song.title} ${song.artist}`;
      const response = await axios.get('https://itunes.apple.com/search', {
        params: { term, entity: 'song', limit: 1 }
      });
      const itunesPreview = response?.data?.results?.[0]?.previewUrl;
      if (itunesPreview) {
        return res.redirect(itunesPreview);
      }
    } catch (itunesError) {
      console.error('iTunes fallback failed:', itunesError.message);
    }

    return res.status(404).json({ message: 'No stream available for this song' });
  } catch (error) {
    console.error('Error streaming song:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Premium-only: Download full song audio (no Range; force attachment)
router.get('/songs/:id/download', auth, async (req, res) => {
  try {
    // Verify user is premium (or equivalent) and not expired
    const user = await User.findById(req.user.id).select('accountType subscriptionExpires');
    const now = new Date();
    const isPremiumType = user && user.accountType && user.accountType !== 'free';
    const isActiveSubscription = user?.subscriptionExpires ? user.subscriptionExpires > now : isPremiumType; // if no expires set but premium, allow
    if (!isPremiumType || !isActiveSubscription) {
      return res.status(403).json({
        success: false,
        code: 'PREMIUM_REQUIRED',
        message: 'Downloading songs is available for premium members only.'
      });
    }

    const song = await Song.findById(req.params.id);
    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }

    // Prefer direct audio URL if present
    const songObj = song.toObject({ getters: false, virtuals: false });
    const directAudioUrl = songObj.audioUrl || songObj.streamUrl;

    const filenameSafe = `${(song.title || 'track').replace(/[^a-z0-9_\-]+/gi, '_')}-${(song.artist || 'artist').replace(/[^a-z0-9_\-]+/gi, '_')}.mp3`;

    const proxyDownload = async (url) => {
      const upstream = await axios.get(url, {
        responseType: 'stream',
        headers: {
          'User-Agent': req.headers['user-agent'] || 'Audix/1.0',
          'Accept': '*/*'
        },
        validateStatus: (status) => status >= 200 && status < 400
      });

      res.status(upstream.status);
      // Set attachment headers
      res.setHeader('Content-Disposition', `attachment; filename="${filenameSafe}"`);
      res.setHeader('Content-Type', upstream.headers['content-type'] || 'audio/mpeg');
      if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
      if (upstream.headers['cache-control']) res.setHeader('Cache-Control', upstream.headers['cache-control']);
      
      // Set CORS headers for downloads
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Range, Content-Length, Content-Type');

      upstream.data.pipe(res);
    };

    if (directAudioUrl && typeof directAudioUrl === 'string') {
      await proxyDownload(directAudioUrl);
      return;
    }

    // Try resolver for full track
    const resolverUrl = process.env.FULL_TRACK_RESOLVER_URL;
    if (resolverUrl) {
      try {
        const headers = {};
        if (process.env.FULL_TRACK_RESOLVER_TOKEN) {
          headers['Authorization'] = `Bearer ${process.env.FULL_TRACK_RESOLVER_TOKEN}`;
        }
        const resolveResp = await axios.get(resolverUrl, {
          params: {
            title: song.title,
            artist: song.artist,
            album: song.album,
            spotifyId: song.spotifyId,
          },
          headers
        });
        const resolvedAudio = resolveResp?.data?.audioUrl || resolveResp?.data?.streamUrl;
        if (resolvedAudio) {
          await proxyDownload(resolvedAudio);
          return;
        }
      } catch (resolverErr) {
        console.error('Full track resolver (download) failed:', resolverErr.message);
      }
    }

    // As a last resort, if only a preview exists, allow downloading that preview for premium
    if (song.previewUrl) {
      try {
        await proxyDownload(song.previewUrl);
        return;
      } catch (previewErr) {
        console.error('Preview proxy (download) failed:', previewErr.message);
      }
    }

    return res.status(404).json({ message: 'No downloadable source available for this song' });
  } catch (error) {
    console.error('Error handling song download:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search songs with external API integration
router.get('/search', [
  query('q').notEmpty().withMessage('Search query is required'),
  query('type').optional().isIn(['song', 'artist', 'album', 'playlist', 'all']).withMessage('Invalid search type'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('source').optional().isIn(['local', 'spotify', 'all']).withMessage('Invalid source')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { q: query, type = 'song', limit = 20, source = 'all' } = req.query;

    let results = {};

    // Search local database first
    if (type === 'song' || type === 'all') {
      const localSongs = await Song.find({
        $text: { $search: query },
        isAvailable: true
      })
      .limit(parseInt(limit))
      .select('-audioFeatures')
      .populate('uploadedBy', 'firstName lastName');
      
      // Fix artist names for songs with undefined or bad artist names
      const fixedLocalSongs = fixArtistNames(localSongs);
      
      results.songs = fixedLocalSongs;
    }

    // Search external APIs if requested
    if (source !== 'local') {
      try {
        const externalResults = await musicApiService.searchAll(query, parseInt(limit), true); // Enable regional search
        
        // Import Spotify tracks only
        if (externalResults.spotify.length > 0) {
          const importedSongs = [];
          for (const track of externalResults.spotify.slice(0, 10)) { // Increased limit for better coverage
            try {
              const song = await musicApiService.importSpotifyTrack(track);
              importedSongs.push(song);
            } catch (error) {
              console.error('Error importing Spotify track:', error);
            }
          }
          
          // Merge imported songs
          results.songs = [...results.songs, ...importedSongs];
        }
        
      } catch (error) {
        console.error('Spotify API search failed:', error);
      }
    }

    // Remove duplicates and limit results
    if (results.songs) {
      const seen = new Set();
      results.songs = results.songs.filter(song => {
        const key = `${song.title}-${song.artist}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, parseInt(limit));
    }

    if (type === 'artist' || type === 'all') {
      // Search artists from songs
      const artistsFromSongs = await Song.aggregate([
        {
          $match: {
            artist: { $regex: query, $options: 'i' },
            isAvailable: true
          }
        },
        {
          $group: {
            _id: '$artist',
            songCount: { $sum: 1 },
            latestSong: { $first: '$$ROOT' }
          }
        },
        { $limit: parseInt(limit) }
      ]);

      // Also search artists from Artist collection (for artists without songs yet)
      const artistsFromCollection = await Artist.find({
        name: { $regex: query, $options: 'i' }
      }).limit(parseInt(limit));

      // Merge results, prioritizing artists with songs
      const artistMap = new Map();
      
      // Add artists with songs first
      artistsFromSongs.forEach(artist => {
        artistMap.set(artist._id, {
          name: artist._id,
          songCount: artist.songCount,
          imageUrl: artist.latestSong?.imageUrl || artist.latestSong?.largeImageUrl || null
        });
      });

      // Add artists without songs if not already present
      artistsFromCollection.forEach(artist => {
        if (!artistMap.has(artist.name)) {
          artistMap.set(artist.name, {
            name: artist.name,
            songCount: 0,
            imageUrl: artist.imageUrl || null
          });
        }
      });

      results.artists = Array.from(artistMap.values()).slice(0, parseInt(limit));
    }

    if (type === 'album' || type === 'all') {
      const albums = await Song.aggregate([
        {
          $match: {
            album: { $regex: query, $options: 'i' },
            isAvailable: true
          }
        },
        {
          $group: {
            _id: '$album',
            artist: { $first: '$artist' },
            songCount: { $sum: 1 },
            latestSong: { $first: '$$ROOT' }
          }
        },
        { $limit: parseInt(limit) }
      ]);
      
      results.albums = albums;
    }

    if (type === 'playlist' || type === 'all') {
      const playlists = await Playlist.find({
        $text: { $search: query },
        isPublic: true
      })
      .populate('owner', 'firstName lastName username')
      .limit(parseInt(limit));
      
      results.playlists = playlists;
    }

    res.json(results);
  } catch (error) {
    console.error('Error searching:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get popular songs
router.get('/popular', [
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('genre').optional().isString().withMessage('Genre must be a string')
], async (req, res) => {
  try {
    const { limit = 20, genre } = req.query;
    
    const filter = { isAvailable: true };
    if (genre) filter.genres = { $in: [new RegExp(genre, 'i')] };

    const songs = await Song.find(filter)
      .sort({ popularity: -1, playCount: -1 })
      .limit(parseInt(limit))
      .select('-audioFeatures')
      .populate('uploadedBy', 'firstName lastName');

    // Fix artist names for songs with undefined or bad artist names
    const fixedSongs = fixArtistNames(songs);

    res.json(fixedSongs);
  } catch (error) {
    console.error('Error fetching popular songs:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get personalized recommendations
router.get('/recommendations', [
  auth,
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
], async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const recommendations = await musicApiService.getRecommendations(req.user.id, parseInt(limit));
    res.json(recommendations);
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get songs by genre
router.get('/genres/:genre', [
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
], async (req, res) => {
  try {
    const { genre } = req.params;
    const { limit = 20 } = req.query;

    const songs = await Song.find({
      genres: { $in: [new RegExp(genre, 'i')] },
      isAvailable: true
    })
    .sort({ popularity: -1 })
    .limit(parseInt(limit))
    .select('-audioFeatures');

    res.json(songs);
  } catch (error) {
    console.error('Error fetching songs by genre:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== ARTIST ROUTES =====

// Get artists that have available songs in the system
router.get('/artists', [optionalAuth,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString().withMessage('Search must be a string'),
  query('order').optional().isIn(['asc', 'desc']).withMessage('Order must be asc or desc')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { page = 1, limit = 24, search = '', order = 'desc' } = req.query;
    const skip = (page - 1) * limit;

    const match = { isAvailable: true };
    if (search) {
      match.artist = { $regex: search, $options: 'i' };
    }

    const pipeline = [
      { $match: match },
      { $group: {
          _id: '$artist',
          name: { $first: '$artist' },
          songCount: { $sum: 1 },
          latestSong: { $first: '$$ROOT' },
        }
      },
      { $sort: { songCount: order === 'desc' ? -1 : 1, name: 1 } },
      { $skip: parseInt(skip) },
      { $limit: parseInt(limit) }
    ];

    const artistsAgg = await Song.aggregate(pipeline);

    // Try to enrich with stored artist images if present
    const names = artistsAgg.map(a => a.name);
    const artistDocs = await Artist.find({ name: { $in: names } }).select('name imageUrl followerCount followers');
    const nameToDoc = new Map(artistDocs.map(doc => [doc.name, doc]));

    const currentUserId = req.user?.id?.toString?.();

    const artists = artistsAgg.map(a => {
      const doc = nameToDoc.get(a.name);
      const isFollowing = !!(currentUserId && doc && Array.isArray(doc.followers) && doc.followers.some(id => id.toString() === currentUserId));
      return {
        name: a.name,
        imageUrl: doc?.imageUrl || a.latestSong?.imageUrl || a.latestSong?.largeImageUrl || null,
        songCount: a.songCount,
        followerCount: doc?.followerCount || 0,
        isFollowing,
      };
    });

    // Total unique artists count for pagination
    const countAgg = await Song.aggregate([
      { $match: match },
      { $group: { _id: '$artist' } },
      { $count: 'total' }
    ]);
    const total = countAgg?.[0]?.total || 0;

    res.json({
      artists,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching artists:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a single artist profile with their available songs
router.get('/artist/:name', optionalAuth, async (req, res) => {
  try {
    const rawName = req.params.name || '';
    const name = decodeURIComponent(rawName);
    const currentUserId = req.user?.id?.toString?.();

    const songs = await Song.find({ artist: name, isAvailable: true })
      .sort({ popularity: -1, playCount: -1 })
      .select('-audioFeatures');

    const artistDoc = await Artist.findOne({ name }).select('name imageUrl followerCount followers');
    const latestWithImage = await Song.findOne({ artist: name, isAvailable: true, imageUrl: { $exists: true, $ne: null } }).sort({ releaseDate: -1 });

    const isFollowing = !!(currentUserId && artistDoc && Array.isArray(artistDoc.followers) && artistDoc.followers.some(id => id.toString() === currentUserId));

    const profile = {
      name,
      imageUrl: artistDoc?.imageUrl || latestWithImage?.imageUrl || latestWithImage?.largeImageUrl || null,
      followerCount: artistDoc?.followerCount || 0,
      isFollowing,
      songCount: songs.length,
    };

    res.json({ artist: profile, songs });
  } catch (error) {
    console.error('Error fetching artist profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== PLAYLIST ROUTES =====

// Get user's playlists
router.get('/playlists', auth, async (req, res) => {
  try {
    // Support scope filtering for clearer UX of "Your Playlists"
    // scope=mine|following|public|all (default: all similar to previous behavior)
    const { scope } = req.query;

    let filter;
    switch (scope) {
      case 'mine':
        filter = { owner: req.user.id };
        break;
      case 'following':
        filter = { followers: req.user.id };
        break;
      case 'public':
        filter = { isPublic: true };
        break;
      case 'all':
      default:
        filter = {
          $or: [
            { owner: req.user.id },
            { followers: req.user.id },
            { isPublic: true }
          ]
        };
    }

    const playlists = await Playlist.find(filter)
    .populate('owner', 'firstName lastName username')
    .populate('songs.song', 'title artist album imageUrl duration')
    .sort({ updatedAt: -1 });

    res.json(playlists);
  } catch (error) {
    console.error('Error fetching playlists:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new playlist
router.post('/playlists', [
  auth,
  body('name').optional().isString().trim().isLength({ min: 1 }).withMessage('Name is required'),
  body('title').optional().isString().trim(),
  body('playlistName').optional().isString().trim(),
  body('description').optional().trim(),
  body('isPublic').optional().isBoolean().withMessage('isPublic must be a boolean'),
  body('mood').optional().isIn(['happy', 'sad', 'energetic', 'chill', 'romantic', 'workout', 'study', 'party', 'sleep', 'other'])
], async (req, res) => {
  try {
    console.log('Create playlist request:', {
      rawType: typeof req.body,
      rawBody: req.body,
      userId: req.user?.id
    });
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Support stringified JSON bodies defensively
    let bodyObj = req.body;
    if (typeof bodyObj === 'string') {
      try { bodyObj = JSON.parse(bodyObj); } catch {}
    }

    const { name, title, playlistName, description, isPublic = true, mood, tags } = bodyObj || {};
    // Prefer explicit 'name'; then fall back to 'title' or 'playlistName' if provided.
    const candidates = [name, title, playlistName].filter(v => typeof v === 'string');
    const firstNonEmpty = candidates.map(v => v.trim()).find(v => v.length > 0) || '';
    const cleanedName = firstNonEmpty.trim();
    if (!cleanedName) {
      return res.status(400).json({ message: 'Playlist name is required' });
    }

    const playlist = new Playlist({
      name: cleanedName,
      description: typeof description === 'string' ? description : undefined,
      owner: req.user.id,
      isPublic,
      mood,
      tags: tags || []
    });

    await playlist.save();

    await playlist.populate('owner', 'firstName lastName username');
    res.status(201).json(playlist);
  } catch (error) {
    console.error('Error creating playlist:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get playlist by ID (optional auth to allow owner/collab access for private)
router.get('/playlists/:id', optionalAuth, async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.id)
      .populate('owner', 'firstName lastName username')
      .populate('songs.song', 'title artist album imageUrl duration previewUrl')
      .populate('followers', 'firstName lastName username');

    if (!playlist) {
      return res.status(404).json({ message: 'Playlist not found' });
    }

    // Check if user can view this playlist
    if (!playlist.isPublic) {
      if (!req.user) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const isOwner = playlist.owner._id.toString() === req.user.id;
      const isCollaborator = Array.isArray(playlist.collaborators) && playlist.collaborators.some(id => id.toString() === req.user.id);
      if (!isOwner && !isCollaborator) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    res.json(playlist);
  } catch (error) {
    console.error('Error fetching playlist:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add song to playlist
router.post('/playlists/:id/songs', [
  auth,
  body('songId').notEmpty().withMessage('Song ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { songId } = req.body;
    const playlist = await Playlist.findById(req.params.id);

    if (!playlist) {
      return res.status(404).json({ message: 'Playlist not found' });
    }

    // Check if user owns the playlist or is a collaborator
    const isOwner = playlist.owner.toString() === req.user.id;
    const isCollaborator = Array.isArray(playlist.collaborators) && playlist.collaborators.some(id => id.toString() === req.user.id);
    if (!isOwner && !isCollaborator) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check if song exists
    const song = await Song.findById(songId);
    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }

    // Check if song is already in playlist
    const existingSong = playlist.songs.find(s => s.song.toString() === songId);
    if (existingSong) {
      return res.status(400).json({ message: 'Song already in playlist' });
    }

    playlist.songs.push({
      song: songId,
      addedBy: req.user.id,
      position: playlist.songs.length
    });

    // Update total duration if song has duration metadata
    if (typeof song.duration === 'number' && !Number.isNaN(song.duration)) {
      playlist.totalDuration = (playlist.totalDuration || 0) + song.duration;
    }

    await playlist.save();
    await playlist.populate('songs.song', 'title artist album imageUrl duration');

    res.json(playlist);
  } catch (error) {
    console.error('Error adding song to playlist:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Remove song from playlist
router.delete('/playlists/:id/songs/:songId', auth, async (req, res) => {
  try {
    const { id, songId } = req.params;
    const playlist = await Playlist.findById(id);

    if (!playlist) {
      return res.status(404).json({ message: 'Playlist not found' });
    }

    const isOwner = playlist.owner.toString() === req.user.id;
    const isCollaborator = Array.isArray(playlist.collaborators) && playlist.collaborators.some(cid => cid.toString() === req.user.id);
    if (!isOwner && !isCollaborator) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Find the removed entry to adjust duration
    const removedEntry = playlist.songs.find(s => s.song.toString() === songId);

    playlist.songs = playlist.songs.filter(s => s.song.toString() !== songId);

    // Reindex positions
    playlist.songs.forEach((s, index) => { s.position = index; });

    // Decrement total duration if possible
    if (removedEntry) {
      const removedSong = await Song.findById(removedEntry.song);
      if (removedSong && typeof removedSong.duration === 'number' && !Number.isNaN(removedSong.duration)) {
        playlist.totalDuration = Math.max(0, (playlist.totalDuration || 0) - removedSong.duration);
      }
    }
    await playlist.save();

    res.json({ message: 'Song removed from playlist' });
  } catch (error) {
    console.error('Error removing song from playlist:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Follow/unfollow playlist
router.post('/playlists/:id/follow', auth, async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) {
      return res.status(404).json({ message: 'Playlist not found' });
    }

    const isFollowing = Array.isArray(playlist.followers) && playlist.followers.some(id => id.toString() === req.user.id);
    
    if (isFollowing) {
      playlist.followers = playlist.followers.filter(id => id.toString() !== req.user.id);
    } else {
      playlist.followers.push(req.user.id);
    }

    await playlist.save();
    res.json({ 
      message: isFollowing ? 'Unfollowed playlist' : 'Followed playlist',
      isFollowing: !isFollowing
    });
  } catch (error) {
    console.error('Error following playlist:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== USER MUSIC ACTIONS =====

// Like/dislike song
router.post('/songs/:id/like', auth, async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);
    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }

    const userId = req.user.id;
    const songId = song._id;

    // Find existing interaction
    let interaction = await UserSongInteraction.findOne({ user: userId, song: songId });

    if (!interaction) {
      // Create new interaction
      interaction = new UserSongInteraction({
        user: userId,
        song: songId,
        interaction: 'like'
      });
      await interaction.save();
      
      // Update song like count
      song.likeCount += 1;
      await song.save();
      
      // Update user's liked songs array (for backward compatibility)
      const user = await User.findById(userId);
      if (!user.likedSongs.includes(songId)) {
        user.likedSongs.push(songId);
        await user.save();
      }
      
      res.json({ 
        message: 'Song liked',
        interaction: 'like',
        likeCount: song.likeCount,
        dislikeCount: song.dislikeCount
      });
    } else if (interaction.interaction === 'like') {
      // Remove like
      await UserSongInteraction.deleteOne({ _id: interaction._id });
      
      // Update song like count
      song.likeCount = Math.max(0, song.likeCount - 1);
      await song.save();
      
      // Update user's liked songs array
      const user = await User.findById(userId);
      user.likedSongs = user.likedSongs.filter(id => id.toString() !== songId.toString());
      await user.save();
      
      res.json({ 
        message: 'Song unliked',
        interaction: 'neutral',
        likeCount: song.likeCount,
        dislikeCount: song.dislikeCount
      });
    } else if (interaction.interaction === 'dislike') {
      // Change from dislike to like
      interaction.interaction = 'like';
      await interaction.save();
      
      // Update song counts
      song.dislikeCount = Math.max(0, song.dislikeCount - 1);
      song.likeCount += 1;
      await song.save();
      
      // Update user's liked songs array
      const user = await User.findById(userId);
      if (!user.likedSongs.includes(songId)) {
        user.likedSongs.push(songId);
        await user.save();
      }
      
      res.json({ 
        message: 'Song liked',
        interaction: 'like',
        likeCount: song.likeCount,
        dislikeCount: song.dislikeCount
      });
    } else {
      // Change from neutral to like
      interaction.interaction = 'like';
      await interaction.save();
      
      // Update song like count
      song.likeCount += 1;
      await song.save();
      
      // Update user's liked songs array
      const user = await User.findById(userId);
      if (!user.likedSongs.includes(songId)) {
        user.likedSongs.push(songId);
        await user.save();
      }
      
      res.json({ 
        message: 'Song liked',
        interaction: 'like',
        likeCount: song.likeCount,
        dislikeCount: song.dislikeCount
      });
    }
  } catch (error) {
    console.error('Error liking song:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Dislike song
router.post('/songs/:id/dislike', auth, async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);
    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }

    const userId = req.user.id;
    const songId = song._id;

    // Find existing interaction
    let interaction = await UserSongInteraction.findOne({ user: userId, song: songId });

    if (!interaction) {
      // Create new interaction
      interaction = new UserSongInteraction({
        user: userId,
        song: songId,
        interaction: 'dislike'
      });
      await interaction.save();
      
      // Update song dislike count
      song.dislikeCount += 1;
      await song.save();
      
      res.json({ 
        message: 'Song disliked',
        interaction: 'dislike',
        likeCount: song.likeCount,
        dislikeCount: song.dislikeCount
      });
    } else if (interaction.interaction === 'dislike') {
      // Remove dislike
      await UserSongInteraction.deleteOne({ _id: interaction._id });
      
      // Update song dislike count
      song.dislikeCount = Math.max(0, song.dislikeCount - 1);
      await song.save();
      
      res.json({ 
        message: 'Song undisliked',
        interaction: 'neutral',
        likeCount: song.likeCount,
        dislikeCount: song.dislikeCount
      });
    } else if (interaction.interaction === 'like') {
      // Change from like to dislike
      interaction.interaction = 'dislike';
      await interaction.save();
      
      // Update song counts
      song.likeCount = Math.max(0, song.likeCount - 1);
      song.dislikeCount += 1;
      await song.save();
      
      // Update user's liked songs array
      const user = await User.findById(userId);
      user.likedSongs = user.likedSongs.filter(id => id.toString() !== songId.toString());
      await user.save();
      
      res.json({ 
        message: 'Song disliked',
        interaction: 'dislike',
        likeCount: song.likeCount,
        dislikeCount: song.dislikeCount
      });
    } else {
      // Change from neutral to dislike
      interaction.interaction = 'dislike';
      await interaction.save();
      
      // Update song dislike count
      song.dislikeCount += 1;
      await song.save();
      
      res.json({ 
        message: 'Song disliked',
        interaction: 'dislike',
        likeCount: song.likeCount,
        dislikeCount: song.dislikeCount
      });
    }
  } catch (error) {
    console.error('Error disliking song:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's interaction with a song
router.get('/songs/:id/interaction', auth, async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);
    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }

    const interaction = await UserSongInteraction.findOne({ 
      user: req.user.id, 
      song: req.params.id 
    });

    res.json({
      interaction: interaction ? interaction.interaction : 'neutral',
      likeCount: song.likeCount,
      dislikeCount: song.dislikeCount
    });
  } catch (error) {
    console.error('Error getting song interaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's liked songs
router.get('/liked-songs', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('likedSongs');
    res.json(user.likedSongs);
  } catch (error) {
    console.error('Error fetching liked songs:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's recently played songs
router.get('/recent', auth, async (req, res) => {
  try {
    // This would typically come from a separate RecentlyPlayed model
    // For now, we'll return an empty array
    res.json([]);
  } catch (error) {
    console.error('Error fetching recent songs:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== BACKGROUND EXTRACTION ROUTES =====

// Extract background music from a song
router.post('/songs/:id/extract-background', auth, async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);
    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }

    // Check if background already exists
    const status = backgroundExtractionService.getExtractionStatus(song._id);
    if (status.exists) {
      return res.json({
        success: true,
        message: 'Background music already extracted',
        publicUrl: status.publicUrl,
        alreadyExists: true
      });
    }

    // Always use our own stream proxy so every song uses the same playable source
    // This avoids CORS/headers/format differences between providers
    const sourceUrl = `${req.protocol}://${req.get('host')}/api/music/songs/${song._id}/stream`;
    console.log('Using internal stream endpoint for extraction:', sourceUrl);

    // Start background extraction process
    const result = await backgroundExtractionService.extractBackground(
      song._id,
      sourceUrl,
      (progress, message) => {
        // In a real implementation, you'd use WebSockets or Server-Sent Events
        // to send progress updates to the client
        console.log(`Progress: ${progress}% - ${message}`);
      }
    );

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        publicUrl: result.publicUrl
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }

  } catch (error) {
    console.error('Error extracting background:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to extract background music',
      error: error.message 
    });
  }
});

// Get background extraction status
router.get('/songs/:id/background-status', auth, async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);
    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }

    const status = backgroundExtractionService.getExtractionStatus(song._id);
    res.json({
      exists: status.exists,
      publicUrl: status.publicUrl,
      size: status.size,
      created: status.created
    });

  } catch (error) {
    console.error('Error checking background status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Stream extracted background music
router.get('/songs/:id/background-stream', auth, async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);
    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }

    const status = backgroundExtractionService.getExtractionStatus(song._id);
    if (!status.exists) {
      return res.status(404).json({ message: 'Background music not extracted yet' });
    }

    const backgroundPath = require('path').join(__dirname, '../public/extracted', `${song._id}_background.mp3`);
    
    // Check if file exists
    if (!require('fs').existsSync(backgroundPath)) {
      return res.status(404).json({ message: 'Background music file not found' });
    }
    
    // Get file stats for proper headers
    const fs = require('fs');
    const stats = fs.statSync(backgroundPath);
    const fileSize = stats.size;
    const range = req.headers.range;
    
    if (range) {
      // Handle range requests for streaming
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', chunksize);
      res.setHeader('Content-Type', 'audio/mpeg');
      
      const stream = fs.createReadStream(backgroundPath, { start, end });
      stream.pipe(res);
    } else {
      // Stream the entire file
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', fileSize);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Disposition', `inline; filename="${song.title}_background.mp3"`);
      
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Range, Content-Length, Content-Type');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
      
      const stream = fs.createReadStream(backgroundPath);
      stream.pipe(res);
    }

  } catch (error) {
    console.error('Error streaming background music:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete extracted background music
router.delete('/songs/:id/background', auth, async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);
    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }

    const deleted = backgroundExtractionService.deleteExtractedBackground(song._id);
    
    if (deleted) {
      res.json({ message: 'Background music deleted successfully' });
    } else {
      res.status(404).json({ message: 'Background music not found' });
    }

  } catch (error) {
    console.error('Error deleting background music:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
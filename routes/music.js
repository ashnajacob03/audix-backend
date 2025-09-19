const express = require('express');
const router = express.Router();
const axios = require('axios');
const { body, validationResult, query } = require('express-validator');
const { auth, optionalAuth } = require('../middleware/auth');
const Song = require('../models/Song');
const Playlist = require('../models/Playlist');
const Artist = require('../models/Artist');
const User = require('../models/User');
const musicApiService = require('../services/musicApiService');

// ===== SONG ROUTES =====

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
      .select('-audioFeatures');

    const total = await Song.countDocuments(filter);

    res.json({
      songs,
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

// Stream song audio
router.get('/songs/:id/stream', async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);
    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }

    // If a direct audio URL exists on the document, use that first
    // Note: audioUrl may not be part of the schema for Spotify imports,
    // but if present on manual entries, we can still access it via toObject()
    const songObj = song.toObject({ getters: false, virtuals: false });
    const directAudioUrl = songObj.audioUrl || songObj.streamUrl;

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

      const upstream = await axios.get(directAudioUrl, {
        responseType: 'stream',
        headers,
        validateStatus: (status) => status >= 200 && status < 400
      });

      // Mirror status and critical headers for media playback
      res.status(upstream.status);
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

    // Try external resolver API for a full track URL if configured
    const resolverUrl = process.env.FULL_TRACK_RESOLVER_URL;
    if (resolverUrl) {
      try {
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
        const resolveResp = await axios.get(resolverUrl, { params, headers });
        const resolvedAudio = resolveResp?.data?.audioUrl || resolveResp?.data?.streamUrl;
        if (resolvedAudio) {
          const range = req.headers.range;
          const proxyHeaders = {
            ...(range ? { Range: range } : {}),
            'User-Agent': req.headers['user-agent'] || 'Audix/1.0',
            'Accept': '*/*'
          };
          const upstream = await axios.get(resolvedAudio, {
            responseType: 'stream',
            headers: proxyHeaders,
            validateStatus: (status) => status >= 200 && status < 400
          });

          res.status(upstream.status);
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
      .select('-audioFeatures');
      
      results.songs = localSongs;
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
      const artists = await Song.aggregate([
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
      
      results.artists = artists;
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
      .select('-audioFeatures');

    res.json(songs);
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

// Like/unlike song
router.post('/songs/:id/like', auth, async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);
    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }

    const user = await User.findById(req.user.id);
    const isLiked = user.likedSongs.includes(song._id);

    if (isLiked) {
      user.likedSongs = user.likedSongs.filter(id => id.toString() !== song._id.toString());
    } else {
      user.likedSongs.push(song._id);
    }

    await user.save();
    res.json({ 
      message: isLiked ? 'Song unliked' : 'Song liked',
      isLiked: !isLiked
    });
  } catch (error) {
    console.error('Error liking song:', error);
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

module.exports = router; 
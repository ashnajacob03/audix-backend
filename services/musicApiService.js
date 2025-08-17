const axios = require('axios');
const Song = require('../models/Song');

class MusicApiService {
  constructor() {
    this.spotifyBaseUrl = 'https://api.spotify.com/v1';
    this.lastfmBaseUrl = 'http://ws.audioscrobbler.com/2.0';
    this.deezerBaseUrl = 'https://api.deezer.com';
    
    // You'll need to set these environment variables
    this.spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
    this.spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    this.lastfmApiKey = process.env.LASTFM_API_KEY;
    
    this.spotifyAccessToken = null;
    this.spotifyTokenExpiry = null;
  }

  // ===== SPOTIFY API METHODS =====

  async getSpotifyAccessToken() {
    if (this.spotifyAccessToken && this.spotifyTokenExpiry > Date.now()) {
      return this.spotifyAccessToken;
    }

    try {
      const response = await axios.post('https://accounts.spotify.com/api/token', 
        'grant_type=client_credentials',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${this.spotifyClientId}:${this.spotifyClientSecret}`).toString('base64')}`
          }
        }
      );

      this.spotifyAccessToken = response.data.access_token;
      this.spotifyTokenExpiry = Date.now() + (response.data.expires_in * 1000);
      
      return this.spotifyAccessToken;
    } catch (error) {
      console.error('Error getting Spotify access token:', error);
      throw new Error('Failed to authenticate with Spotify');
    }
  }

  async searchSpotify(query, type = 'track', limit = 20) {
    try {
      const token = await this.getSpotifyAccessToken();
      const response = await axios.get(`${this.spotifyBaseUrl}/search`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          q: query,
          type,
          limit
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error searching Spotify:', error);
      throw new Error('Failed to search Spotify');
    }
  }

  async getSpotifyTrack(trackId) {
    try {
      const token = await this.getSpotifyAccessToken();
      const response = await axios.get(`${this.spotifyBaseUrl}/tracks/${trackId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error getting Spotify track:', error);
      throw new Error('Failed to get track from Spotify');
    }
  }

  async getSpotifyAudioFeatures(trackId) {
    try {
      const token = await this.getSpotifyAccessToken();
      const response = await axios.get(`${this.spotifyBaseUrl}/audio-features/${trackId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error getting Spotify audio features:', error);
      return null;
    }
  }

  async getSpotifyRecommendations(seedTracks, seedGenres, seedArtists, limit = 20) {
    try {
      const token = await this.getSpotifyAccessToken();
      const response = await axios.get(`${this.spotifyBaseUrl}/recommendations`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          seed_tracks: seedTracks?.join(','),
          seed_genres: seedGenres?.join(','),
          seed_artists: seedArtists?.join(','),
          limit
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error getting Spotify recommendations:', error);
      throw new Error('Failed to get recommendations from Spotify');
    }
  }

  // ===== LAST.FM API METHODS =====

  async searchLastfm(query, limit = 20) {
    try {
      const response = await axios.get(this.lastfmBaseUrl, {
        params: {
          method: 'track.search',
          track: query,
          api_key: this.lastfmApiKey,
          format: 'json',
          limit
        }
      });

      return response.data.results;
    } catch (error) {
      console.error('Error searching Last.fm:', error);
      throw new Error('Failed to search Last.fm');
    }
  }

  async getLastfmTrackInfo(artist, track) {
    try {
      const response = await axios.get(this.lastfmBaseUrl, {
        params: {
          method: 'track.getInfo',
          artist,
          track,
          api_key: this.lastfmApiKey,
          format: 'json'
        }
      });

      return response.data.track;
    } catch (error) {
      console.error('Error getting Last.fm track info:', error);
      return null;
    }
  }

  async getLastfmSimilarTracks(artist, track, limit = 20) {
    try {
      const response = await axios.get(this.lastfmBaseUrl, {
        params: {
          method: 'track.getSimilar',
          artist,
          track,
          api_key: this.lastfmApiKey,
          format: 'json',
          limit
        }
      });

      return response.data.similartracks;
    } catch (error) {
      console.error('Error getting Last.fm similar tracks:', error);
      return null;
    }
  }

  // ===== DEEZER API METHODS =====

  async searchDeezer(query, limit = 20) {
    try {
      const response = await axios.get(`${this.deezerBaseUrl}/search`, {
        params: {
          q: query,
          limit
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error searching Deezer:', error);
      throw new Error('Failed to search Deezer');
    }
  }

  async getDeezerTrack(trackId) {
    try {
      const response = await axios.get(`${this.deezerBaseUrl}/track/${trackId}`);
      return response.data;
    } catch (error) {
      console.error('Error getting Deezer track:', error);
      throw new Error('Failed to get track from Deezer');
    }
  }

  // ===== UNIFIED SEARCH METHODS =====

  async searchAll(query, limit = 20) {
    const results = {
      spotify: [],
      lastfm: [],
      deezer: []
    };

    try {
      // Search Spotify
      const spotifyResults = await this.searchSpotify(query, 'track', limit);
      results.spotify = spotifyResults.tracks?.items || [];
    } catch (error) {
      console.error('Spotify search failed:', error);
    }

    try {
      // Search Last.fm
      const lastfmResults = await this.searchLastfm(query, limit);
      results.lastfm = lastfmResults.trackmatches?.track || [];
    } catch (error) {
      console.error('Last.fm search failed:', error);
    }

    try {
      // Search Deezer
      const deezerResults = await this.searchDeezer(query, limit);
      results.deezer = deezerResults.data || [];
    } catch (error) {
      console.error('Deezer search failed:', error);
    }

    return results;
  }

  // ===== SONG IMPORT METHODS =====

  async importSpotifyTrack(spotifyTrack) {
    try {
      // Check if song already exists
      let song = await Song.findOne({ spotifyId: spotifyTrack.id });
      
      if (song) {
        return song;
      }

      // Get audio features
      const audioFeatures = await this.getSpotifyAudioFeatures(spotifyTrack.id);

      // Create new song
      song = new Song({
        spotifyId: spotifyTrack.id,
        title: spotifyTrack.name,
        artist: spotifyTrack.artists[0]?.name || 'Unknown Artist',
        album: spotifyTrack.album?.name,
        albumArtist: spotifyTrack.album?.artists[0]?.name,
        duration: Math.round(spotifyTrack.duration_ms / 1000),
        trackNumber: spotifyTrack.track_number,
        discNumber: spotifyTrack.disc_number,
        previewUrl: spotifyTrack.preview_url,
        imageUrl: spotifyTrack.album?.images[0]?.url,
        largeImageUrl: spotifyTrack.album?.images[1]?.url,
        popularity: spotifyTrack.popularity,
        releaseDate: spotifyTrack.album?.release_date,
        releaseYear: new Date(spotifyTrack.album?.release_date).getFullYear(),
        isExplicit: spotifyTrack.explicit,
        externalUrls: {
          spotify: spotifyTrack.external_urls?.spotify
        },
        source: 'spotify',
        audioFeatures: audioFeatures ? {
          danceability: audioFeatures.danceability,
          energy: audioFeatures.energy,
          key: audioFeatures.key,
          loudness: audioFeatures.loudness,
          mode: audioFeatures.mode,
          speechiness: audioFeatures.speechiness,
          acousticness: audioFeatures.acousticness,
          instrumentalness: audioFeatures.instrumentalness,
          liveness: audioFeatures.liveness,
          valence: audioFeatures.valence,
          tempo: audioFeatures.tempo,
          timeSignature: audioFeatures.time_signature
        } : undefined
      });

      await song.save();
      return song;
    } catch (error) {
      console.error('Error importing Spotify track:', error);
      throw new Error('Failed to import track from Spotify');
    }
  }

  async importLastfmTrack(lastfmTrack) {
    try {
      // Check if song already exists
      let song = await Song.findOne({ 
        title: lastfmTrack.name,
        artist: lastfmTrack.artist
      });
      
      if (song) {
        return song;
      }

      // Get detailed track info
      const trackInfo = await this.getLastfmTrackInfo(lastfmTrack.artist, lastfmTrack.name);

      // Create new song
      song = new Song({
        lastfmId: lastfmTrack.mbid || lastfmTrack.url,
        title: lastfmTrack.name,
        artist: lastfmTrack.artist,
        album: trackInfo?.album?.title,
        duration: trackInfo?.duration ? Math.round(trackInfo.duration) : null,
        imageUrl: lastfmTrack.image?.[2]?.['#text'] || trackInfo?.album?.image?.[2]?.['#text'],
        largeImageUrl: lastfmTrack.image?.[3]?.['#text'] || trackInfo?.album?.image?.[3]?.['#text'],
        genres: trackInfo?.toptags?.tag?.map(tag => tag.name) || [],
        tags: lastfmTrack.tags?.tag?.map(tag => tag.name) || [],
        externalUrls: {
          lastfm: lastfmTrack.url
        },
        source: 'lastfm',
        playCount: parseInt(lastfmTrack.listeners) || 0
      });

      await song.save();
      return song;
    } catch (error) {
      console.error('Error importing Last.fm track:', error);
      throw new Error('Failed to import track from Last.fm');
    }
  }

  async importDeezerTrack(deezerTrack) {
    try {
      // Check if song already exists
      let song = await Song.findOne({ deezerId: deezerTrack.id.toString() });
      
      if (song) {
        return song;
      }

      // Create new song
      song = new Song({
        deezerId: deezerTrack.id.toString(),
        title: deezerTrack.title,
        artist: deezerTrack.artist?.name || 'Unknown Artist',
        album: deezerTrack.album?.title,
        albumArtist: deezerTrack.album?.artist?.name,
        duration: deezerTrack.duration,
        trackNumber: deezerTrack.track_position,
        discNumber: deezerTrack.disk_number,
        previewUrl: deezerTrack.preview,
        imageUrl: deezerTrack.album?.cover,
        largeImageUrl: deezerTrack.album?.cover_big,
        popularity: deezerTrack.rank,
        releaseDate: deezerTrack.release_date,
        releaseYear: new Date(deezerTrack.release_date).getFullYear(),
        externalUrls: {
          deezer: deezerTrack.link
        },
        source: 'deezer'
      });

      await song.save();
      return song;
    } catch (error) {
      console.error('Error importing Deezer track:', error);
      throw new Error('Failed to import track from Deezer');
    }
  }

  // ===== RECOMMENDATION METHODS =====

  async getRecommendations(userId, limit = 20) {
    try {
      // Get user's liked songs
      const user = await require('../models/User').findById(userId).populate('likedSongs');
      const likedSongs = user.likedSongs || [];

      if (likedSongs.length === 0) {
        // Return popular songs if user has no liked songs
        return await Song.find({ isAvailable: true })
          .sort({ popularity: -1 })
          .limit(limit);
      }

      // Get Spotify IDs for liked songs
      const spotifyIds = likedSongs
        .filter(song => song.spotifyId)
        .slice(0, 5) // Spotify allows max 5 seed tracks
        .map(song => song.spotifyId);

      if (spotifyIds.length > 0) {
        // Get recommendations from Spotify
        const recommendations = await this.getSpotifyRecommendations(spotifyIds, null, null, limit);
        
        // Import recommended tracks
        const importedSongs = [];
        for (const track of recommendations.tracks) {
          try {
            const song = await this.importSpotifyTrack(track);
            importedSongs.push(song);
          } catch (error) {
            console.error('Error importing recommended track:', error);
          }
        }

        return importedSongs;
      }

      // Fallback to popular songs
      return await Song.find({ isAvailable: true })
        .sort({ popularity: -1 })
        .limit(limit);
    } catch (error) {
      console.error('Error getting recommendations:', error);
      throw new Error('Failed to get recommendations');
    }
  }
}

module.exports = new MusicApiService(); 
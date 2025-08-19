const axios = require('axios');
const Song = require('../models/Song');

class MusicApiService {
  constructor() {
    this.spotifyBaseUrl = 'https://api.spotify.com/v1';
    
    // Spotify credentials
    this.spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
    this.spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    
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

  async searchSpotify(query, type = 'track', limit = 20, market = 'US') {
    try {
      const token = await this.getSpotifyAccessToken();
      const response = await axios.get(`${this.spotifyBaseUrl}/search`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          q: query,
          type,
          limit,
          market
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

  // ===== ENHANCED SPOTIFY SEARCH FOR GLOBAL COVERAGE =====

  async searchSpotifyGlobal(query, limit = 20) {
    try {
      // Search multiple markets for better global coverage
      const markets = ['US', 'JP', 'KR', 'IN', 'BR', 'MX', 'FR', 'DE', 'GB', 'AU'];
      const allResults = [];
      
      // Search primary market first
      const primaryResults = await this.searchSpotify(query, 'track', limit, 'US');
      if (primaryResults.tracks?.items) {
        allResults.push(...primaryResults.tracks.items);
      }

      // Search additional markets for regional content
      for (const market of markets.slice(1, 4)) { // Limit to 3 additional markets
        try {
          const marketResults = await this.searchSpotify(query, 'track', Math.floor(limit / 2), market);
          if (marketResults.tracks?.items) {
            allResults.push(...marketResults.tracks.items);
          }
        } catch (error) {
          console.error(`Market search failed for ${market}:`, error);
        }
      }

      // Remove duplicates and limit results
      const uniqueResults = this.removeDuplicateTracks(allResults);
      return { tracks: { items: uniqueResults.slice(0, limit) } };
    } catch (error) {
      console.error('Error in global Spotify search:', error);
      throw new Error('Failed to search Spotify globally');
    }
  }

  // ===== UNIFIED SEARCH METHODS (SPOTIFY ONLY) =====

  async searchAll(query, limit = 20, includeRegional = true) {
    const results = {
      spotify: [],
      lastfm: [],
      deezer: [],
      itunes: [],
      youtube: []
    };

    try {
      if (includeRegional) {
        // Use enhanced global search
        const globalResults = await this.searchSpotifyGlobal(query, limit);
        results.spotify = globalResults.tracks?.items || [];
      } else {
        // Use single market search
        const spotifyResults = await this.searchSpotify(query, 'track', limit, 'US');
        results.spotify = spotifyResults.tracks?.items || [];
      }

      // Return empty arrays for other sources since we're Spotify-only
      results.lastfm = [];
      results.deezer = [];
      results.itunes = [];
      results.youtube = [];
    } catch (error) {
      console.error('Error in Spotify search:', error);
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

  // ===== UTILITY METHODS =====

  removeDuplicateTracks(tracks) {
    const seen = new Set();
    return tracks.filter(track => {
      const key = `${track.name}-${track.artists[0]?.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
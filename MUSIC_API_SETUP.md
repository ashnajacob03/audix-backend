# Music API Integration Setup Guide

This guide will help you set up the music API integration for your Audix project.

## Available Music APIs

### 1. Spotify Web API (Recommended)
- **Free Tier**: 1,000 requests/hour
- **Features**: Full music catalog, playlists, search, recommendations, audio features
- **Best for**: Complete music streaming experience
- **Setup**: Requires Spotify Developer account

### 2. Last.fm API
- **Free Tier**: 5,000 requests/day
- **Features**: Music discovery, artist info, similar artists, charts
- **Best for**: Music recommendations and discovery
- **Setup**: Requires Last.fm API key

### 3. Deezer API
- **Free Tier**: No rate limits specified
- **Features**: Music search, playlists, charts, radio
- **Best for**: International music catalog
- **Setup**: No authentication required

## Setup Instructions

### 1. Environment Variables

Add the following environment variables to your `.env` file:

```env
# Spotify API (Optional but recommended)
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

# Last.fm API (Optional)
LASTFM_API_KEY=your_lastfm_api_key
```

### 2. Spotify API Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click "Create App"
4. Fill in the app details:
   - App name: "Audix Music App"
   - App description: "Music streaming application"
   - Redirect URI: `http://localhost:3002/api/auth/spotify/callback`
5. Click "Save"
6. Copy the Client ID and Client Secret to your `.env` file

### 3. Last.fm API Setup

1. Go to [Last.fm API](https://www.last.fm/api/account/create)
2. Create a new API account
3. Fill in the application details
4. Copy the API key to your `.env` file

### 4. Install Dependencies

Make sure you have the required dependencies:

```bash
npm install axios
```

### 5. Add Sample Data

Run the sample data script to populate your database with test music:

```bash
node scripts/addSampleMusic.js
```

## API Endpoints

### Songs
- `GET /api/music/songs` - Get all songs with filters
- `GET /api/music/songs/:id` - Get song by ID
- `GET /api/music/search` - Search songs across all sources
- `GET /api/music/popular` - Get popular songs
- `GET /api/music/recommendations` - Get personalized recommendations
- `GET /api/music/genres/:genre` - Get songs by genre

### Playlists
- `GET /api/music/playlists` - Get user's playlists
- `POST /api/music/playlists` - Create new playlist
- `GET /api/music/playlists/:id` - Get playlist by ID
- `POST /api/music/playlists/:id/songs` - Add song to playlist
- `DELETE /api/music/playlists/:id/songs/:songId` - Remove song from playlist
- `POST /api/music/playlists/:id/follow` - Follow/unfollow playlist

### User Actions
- `POST /api/music/songs/:id/like` - Like/unlike song
- `GET /api/music/liked-songs` - Get user's liked songs
- `GET /api/music/recent` - Get recently played songs

## Frontend Integration

The frontend API service has been updated with music methods:

```javascript
import api from '@/services/api';

// Search for songs
const results = await api.searchMusic('Blinding Lights');

// Get popular songs
const popularSongs = await api.getPopularSongs(20);

// Get recommendations
const recommendations = await api.getRecommendations(20);

// Get user's playlists
const playlists = await api.getPlaylists();

// Like a song
await api.likeSong(songId);
```

## Features

### 1. Multi-Source Search
- Search across local database and external APIs
- Automatic deduplication of results
- Configurable search sources

### 2. Smart Recommendations
- Based on user's liked songs
- Uses Spotify's recommendation engine
- Fallback to popular songs

### 3. Playlist Management
- Create, edit, and delete playlists
- Add/remove songs from playlists
- Follow/unfollow playlists
- Collaborative playlists

### 4. User Engagement
- Like/unlike songs
- Track recently played
- Personalized recommendations

### 5. Rich Metadata
- Audio features (tempo, key, energy, etc.)
- Genre and tag classification
- Release information
- Popularity metrics

## Rate Limiting

The integration includes rate limiting to respect API limits:
- Spotify: 1,000 requests/hour
- Last.fm: 5,000 requests/day
- Deezer: No limits specified

## Error Handling

The service includes comprehensive error handling:
- API failures are gracefully handled
- Fallback to local database when external APIs fail
- Detailed error logging

## Testing

Test the API endpoints:

```bash
# Search for songs
curl "http://localhost:3002/api/music/search?q=Blinding%20Lights"

# Get popular songs
curl "http://localhost:3002/api/music/popular?limit=10"

# Get recommendations (requires auth)
curl -H "Authorization: Bearer YOUR_TOKEN" "http://localhost:3002/api/music/recommendations"
```

## Troubleshooting

### Common Issues

1. **Spotify API errors**: Check your client ID and secret
2. **Rate limiting**: Implement caching for frequently accessed data
3. **Missing songs**: External APIs may not have all songs
4. **Authentication errors**: Ensure tokens are properly set

### Debug Mode

Enable debug logging by setting:

```env
DEBUG=true
```

This will log all API requests and responses.

## Next Steps

1. Set up your API keys
2. Run the sample data script
3. Test the endpoints
4. Integrate with your frontend
5. Add caching for better performance
6. Implement user preferences
7. Add more music sources as needed

## Support

For issues or questions:
1. Check the API documentation
2. Review error logs
3. Test with sample data
4. Verify environment variables 
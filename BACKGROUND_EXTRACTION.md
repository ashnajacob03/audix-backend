# Background Music Extraction Feature

This feature allows users to extract background music (instrumental/karaoke versions) from songs by removing vocals using AI-powered audio processing.

## Overview

The background extraction feature uses FFmpeg with advanced audio processing techniques to:
- Remove vocals from songs
- Preserve instrumental elements
- Create high-quality karaoke-style tracks
- Support multiple audio formats (MP3, WAV, etc.)

## Backend Implementation

### Dependencies
- `ffmpeg-static`: Static FFmpeg binary for audio processing
- `fluent-ffmpeg`: Node.js wrapper for FFmpeg
- `axios`: For downloading audio files

### API Endpoints

#### POST `/api/music/songs/:id/extract-background`
Extract background music from a song.

**Request:**
- Headers: `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "Background music extracted successfully",
  "publicUrl": "/extracted/songId_background.mp3",
  "alreadyExists": false
}
```

#### GET `/api/music/songs/:id/background-status`
Check if background music has been extracted.

**Response:**
```json
{
  "exists": true,
  "publicUrl": "/extracted/songId_background.mp3",
  "size": 1234567,
  "created": "2024-01-01T00:00:00.000Z"
}
```

#### GET `/api/music/songs/:id/background-stream`
Stream the extracted background music file.

#### DELETE `/api/music/songs/:id/background`
Delete the extracted background music file.

### Audio Processing

The extraction process uses several techniques:

1. **Center Channel Extraction**: Removes vocals typically mixed in the center channel
2. **Phase Inversion**: Uses phase cancellation to remove vocals
3. **Frequency Filtering**: Applies filters to isolate instrumental elements

### File Structure

```
audix-backend/
├── services/
│   └── backgroundExtractionService.js  # Core extraction logic
├── public/
│   └── extracted/                      # Extracted background files
├── temp/                              # Temporary processing files
└── routes/
    └── music.js                       # API endpoints
```

## Frontend Implementation

### Components

#### BackgroundExtractionModal
A modal component that handles the extraction process with:
- Progress tracking
- Status updates
- Play/download functionality
- Error handling

#### Integration Points
- **SongCard**: Dropdown menu option
- **Song Page**: Dedicated extraction button
- **Audio Player**: Play extracted background music

### API Service Methods

```typescript
// Extract background music
api.extractBackground(songId)

// Check extraction status
api.getBackgroundStatus(songId)

// Stream background music
api.getBackgroundStream(songId)

// Delete background music
api.deleteBackground(songId)
```

## Usage

### For Users
1. Navigate to any song
2. Click the "Extract Background" button or use the dropdown menu
3. Wait for processing (1-3 minutes)
4. Play or download the extracted background music

### For Developers
1. Install dependencies: `npm install`
2. Ensure FFmpeg is available (handled by ffmpeg-static)
3. Start the server: `npm run dev`
4. Test with: `node scripts/testBackgroundExtraction.js`

## Technical Details

### Audio Processing Pipeline
1. Download source audio file
2. Apply center channel extraction
3. Use phase inversion for vocal removal
4. Apply frequency filtering
5. Export as MP3

### Performance Considerations
- Processing time: 1-3 minutes per song
- File size: Typically 60-80% of original
- Quality: High-quality instrumental output
- Storage: Files stored in `/public/extracted/`

### Error Handling
- Network timeouts
- Invalid audio formats
- Insufficient disk space
- Processing failures

## Future Enhancements

1. **AI-Powered Extraction**: Integration with Spleeter or similar AI models
2. **Real-time Processing**: WebSocket-based progress updates
3. **Batch Processing**: Extract multiple songs simultaneously
4. **Quality Options**: Different quality levels for extraction
5. **Cloud Storage**: Store extracted files in cloud storage

## Testing

Run the test script to verify functionality:
```bash
cd audix-backend
node scripts/testBackgroundExtraction.js
```

This will:
1. Connect to the database
2. Find a song with audio URL
3. Test the extraction process
4. Display results

## Troubleshooting

### Common Issues
1. **FFmpeg not found**: Ensure ffmpeg-static is installed
2. **Permission errors**: Check file system permissions
3. **Memory issues**: Large files may require more RAM
4. **Network timeouts**: Check internet connection for audio downloads

### Logs
Check server logs for detailed error information:
```bash
tail -f backend_log.txt
```


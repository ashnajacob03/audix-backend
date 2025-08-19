const mongoose = require('mongoose');
const Song = require('../models/Song');
const Playlist = require('../models/Playlist');
require('dotenv').config();

// Sample music data
const sampleSongs = [
  {
    title: "Blinding Lights",
    artist: "The Weeknd",
    album: "After Hours",
    duration: 200,
    trackNumber: 1,
    discNumber: 1,
    imageUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop&crop=center",
    largeImageUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=800&fit=crop&crop=center",
    popularity: 95,
    releaseYear: 2020,
    genres: ["pop", "synth-pop", "new wave"],
    tags: ["chart-topper", "viral", "retro"],
    isExplicit: false,
    isAvailable: true,
    source: "manual",
    playCount: 2500000
  },
  {
    title: "Watermelon Sugar",
    artist: "Harry Styles",
    album: "Fine Line",
    duration: 174,
    trackNumber: 2,
    discNumber: 1,
    imageUrl: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop&crop=center",
    largeImageUrl: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=800&fit=crop&crop=center",
    popularity: 88,
    releaseYear: 2019,
    genres: ["pop", "rock", "indie"],
    tags: ["summer", "feel-good", "romantic"],
    isExplicit: false,
    isAvailable: true,
    source: "manual",
    playCount: 1800000
  },
  {
    title: "Levitating",
    artist: "Dua Lipa",
    album: "Future Nostalgia",
    duration: 203,
    trackNumber: 3,
    discNumber: 1,
    imageUrl: "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400&h=400&fit=crop&crop=center",
    largeImageUrl: "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=800&h=800&fit=crop&crop=center",
    popularity: 92,
    releaseYear: 2020,
    genres: ["pop", "disco", "funk"],
    tags: ["dance", "retro", "energetic"],
    isExplicit: false,
    isAvailable: true,
    source: "manual",
    playCount: 2200000
  },
  {
    title: "Good 4 U",
    artist: "Olivia Rodrigo",
    album: "SOUR",
    duration: 178,
    trackNumber: 4,
    discNumber: 1,
    imageUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop&crop=center",
    largeImageUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=800&fit=crop&crop=center",
    popularity: 90,
    releaseYear: 2021,
    genres: ["pop", "rock", "alternative"],
    tags: ["breakup", "angry", "teen"],
    isExplicit: true,
    isAvailable: true,
    source: "manual",
    playCount: 1900000
  },
  {
    title: "Stay",
    artist: "The Kid LAROI & Justin Bieber",
    album: "F*CK LOVE 3: OVER YOU",
    duration: 141,
    trackNumber: 5,
    discNumber: 1,
    imageUrl: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop&crop=center",
    largeImageUrl: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=800&fit=crop&crop=center",
    popularity: 87,
    releaseYear: 2021,
    genres: ["pop", "hip-hop", "r&b"],
    tags: ["collaboration", "viral", "tiktok"],
    isExplicit: true,
    isAvailable: true,
    source: "manual",
    playCount: 1600000
  },
  {
    title: "As It Was",
    artist: "Harry Styles",
    album: "Harry's House",
    duration: 167,
    trackNumber: 1,
    discNumber: 1,
    imageUrl: "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400&h=400&fit=crop&crop=center",
    largeImageUrl: "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=800&h=800&fit=crop&crop=center",
    popularity: 94,
    releaseYear: 2022,
    genres: ["pop", "rock", "indie"],
    tags: ["summer", "feel-good", "nostalgic"],
    isExplicit: false,
    isAvailable: true,
    source: "manual",
    playCount: 2800000
  },
  {
    title: "About Damn Time",
    artist: "Lizzo",
    album: "Special",
    duration: 191,
    trackNumber: 2,
    discNumber: 1,
    imageUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop&crop=center",
    largeImageUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=800&fit=crop&crop=center",
    popularity: 85,
    releaseYear: 2022,
    genres: ["pop", "funk", "disco"],
    tags: ["empowering", "dance", "positive"],
    isExplicit: true,
    isAvailable: true,
    source: "manual",
    playCount: 1400000
  },
  {
    title: "Late Night Talking",
    artist: "Harry Styles",
    album: "Harry's House",
    duration: 178,
    trackNumber: 3,
    discNumber: 1,
    imageUrl: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop&crop=center",
    largeImageUrl: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=800&fit=crop&crop=center",
    popularity: 82,
    releaseYear: 2022,
    genres: ["pop", "rock", "indie"],
    tags: ["romantic", "chill", "night"],
    isExplicit: false,
    isAvailable: true,
    source: "manual",
    playCount: 1200000
  },
  {
    title: "Break My Soul",
    artist: "Beyoncé",
    album: "RENAISSANCE",
    duration: 279,
    trackNumber: 1,
    discNumber: 1,
    imageUrl: "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400&h=400&fit=crop&crop=center",
    largeImageUrl: "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=800&h=800&fit=crop&crop=center",
    popularity: 89,
    releaseYear: 2022,
    genres: ["pop", "house", "dance"],
    tags: ["queen", "dance", "empowering"],
    isExplicit: false,
    isAvailable: true,
    source: "manual",
    playCount: 1800000
  },
  {
    title: "Vampire",
    artist: "Olivia Rodrigo",
    album: "GUTS",
    duration: 219,
    trackNumber: 1,
    discNumber: 1,
    imageUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop&crop=center",
    largeImageUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=800&fit=crop&crop=center",
    popularity: 86,
    releaseYear: 2023,
    genres: ["pop", "rock", "alternative"],
    tags: ["dark", "angry", "breakup"],
    isExplicit: true,
    isAvailable: true,
    source: "manual",
    playCount: 1500000
  }
];

const samplePlaylists = [
  {
    name: "Summer Vibes",
    description: "Perfect songs for those warm summer days",
    isPublic: true,
    mood: "happy",
    tags: ["summer", "feel-good", "outdoor"],
    imageUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=400&fit=crop&crop=center"
  },
  {
    name: "Workout Mix",
    description: "High energy songs to keep you motivated during workouts",
    isPublic: true,
    mood: "energetic",
    tags: ["workout", "gym", "motivation"],
    imageUrl: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop&crop=center"
  },
  {
    name: "Chill Vibes",
    description: "Relaxing music for studying or unwinding",
    isPublic: true,
    mood: "chill",
    tags: ["study", "relax", "ambient"],
    imageUrl: "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400&h=400&fit=crop&crop=center"
  },
  {
    name: "Party Hits",
    description: "The best songs to get the party started",
    isPublic: true,
    mood: "party",
    tags: ["party", "dance", "celebration"],
    imageUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop&crop=center"
  }
];

async function addSampleMusic() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing sample data
    await Song.deleteMany({ source: 'manual' });
    await Playlist.deleteMany({ name: { $in: samplePlaylists.map(p => p.name) } });
    console.log('Cleared existing sample data');

    // Add sample songs
    const songs = await Song.insertMany(sampleSongs);
    console.log(`Added ${songs.length} sample songs`);

    // Create a system user for playlists (or use existing user)
    const User = require('../models/User');
    let systemUser = await User.findOne({ email: 'system@audix.com' });
    
    if (!systemUser) {
      systemUser = new User({
        firstName: 'System',
        lastName: 'User',
        email: 'system@audix.com',
        username: 'system',
        password: 'system123', // This won't be used for login
        isVerified: true
      });
      await systemUser.save();
    }

    // Add sample playlists with owner
    const playlistsWithOwner = samplePlaylists.map(playlist => ({
      ...playlist,
      owner: systemUser._id
    }));
    
    const playlists = await Playlist.insertMany(playlistsWithOwner);
    console.log(`Added ${playlists.length} sample playlists`);

    // Add some songs to playlists
    for (let i = 0; i < playlists.length; i++) {
      const playlist = playlists[i];
      const startIndex = i * 2;
      const endIndex = Math.min(startIndex + 3, songs.length);
      
      for (let j = startIndex; j < endIndex; j++) {
        playlist.songs.push({
          song: songs[j]._id,
          position: j - startIndex
        });
      }
      
      await playlist.save();
    }

    console.log('Added songs to playlists');
    console.log('Sample music data added successfully!');

  } catch (error) {
    console.error('Error adding sample music:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the script
addSampleMusic(); 
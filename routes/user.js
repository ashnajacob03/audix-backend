const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Artist = require('../models/Artist');
const ArtistVerification = require('../models/ArtistVerification');
const Notification = require('../models/Notification');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { auth } = require('../middleware/auth');
const expressValidator = require('express-validator');
const { body: bodyValidator, validationResult: validationResultValidator } = expressValidator;
const speakeasy = require('speakeasy');

const router = express.Router();

// Helper to normalize Google profile image URLs
const normalizeProfileImageUrl = (imageUrl) => {
  if (!imageUrl) return null;
  try {
    if (typeof imageUrl === 'string' && imageUrl.includes('googleusercontent.com')) {
      const baseUrl = imageUrl.split('=')[0];
      return `${baseUrl}=s400-c`;
    }
    return imageUrl;
  } catch (e) {
    return imageUrl;
  }
};

// @route   GET /api/user/all
// @desc    Get all users except current user (for friends/follow suggestions)
// @access  Private
router.get('/all', auth, async (req, res) => {
  try {
    // Get current user to check following status and friend requests
    const currentUser = await User.findById(req.user.id).select('following friends friendRequestsSent friendRequestsReceived');

    // Get all users except the current user, only return necessary fields
    const users = await User.find({
      _id: { $ne: req.user.id },
      isActive: true
    })
    .select('firstName lastName email profilePicture accountType createdAt lastLogin followers friends')
    .sort({ createdAt: -1 })
    .limit(50); // Limit to 50 users for performance

    const formattedUsers = users.map(user => {
      const userId = user._id.toString();
      const currentUserId = req.user.id.toString();
      
      // Check friend request status
      const sentRequest = currentUser.friendRequestsSent.find(req => req.user.toString() === userId);
      const receivedRequest = currentUser.friendRequestsReceived.find(req => req.user.toString() === userId);
      // Check both users' friends arrays
      const currentUserHasFriend = currentUser.friends.includes(user._id);
      const targetUserHasFriend = user.friends.includes(currentUser._id);
      const isFriend = currentUserHasFriend && targetUserHasFriend;
      
      // Debug logging for specific user
      if (user.firstName === 'Alka' && user.lastName === 'Sony') {
        console.log('Friend status debug for Alka Sony:', {
          currentUserId: currentUserId,
          targetUserId: userId,
          currentUserHasFriend,
          targetUserHasFriend,
          isFriend,
          sentRequest: !!sentRequest,
          receivedRequest: !!receivedRequest,
          currentUserFriends: currentUser.friends.map(id => id.toString()),
          targetUserFriends: user.friends.map(id => id.toString())
        });
      }
      
      let friendStatus = 'none';
      if (isFriend) {
        friendStatus = 'friends';
      } else if (sentRequest) {
        friendStatus = 'request_sent';
      } else if (receivedRequest) {
        friendStatus = 'request_received';
      }

      return {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.fullName,
        email: user.email,
        picture: user.profilePicture,
        accountType: user.accountType,
        joinedAt: user.createdAt,
        lastSeen: user.lastLogin,
        isOnline: user.lastLogin && (Date.now() - new Date(user.lastLogin).getTime()) < 5 * 60 * 1000, // 5 minutes
        isFollowing: currentUser.following.includes(user._id),
        followersCount: user.followers.length,
        friendStatus: friendStatus
      };
    });

    res.json({
      success: true,
      data: {
        users: formattedUsers,
        total: formattedUsers.length
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/user/profile-picture
// @desc    Update user profile picture (URL or data URL)
// @access  Private
router.put('/profile-picture', [
  auth,
  body('picture')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null) return true; // allow removing picture
      if (typeof value !== 'string') throw new Error('Picture must be a string');
      // Accept http(s) URL or data URL
      const isHttpUrl = /^https?:\/\//i.test(value);
      const isDataUrl = /^data:image\/(png|jpg|jpeg|webp);base64,/i.test(value);
      if (!isHttpUrl && !isDataUrl) throw new Error('Picture must be a valid URL or base64 data URL');
      // Basic max size check for data URLs (~5MB)
      if (isDataUrl) {
        const base64 = value.split(',')[1] || '';
        const approxBytes = Math.floor(base64.length * 3 / 4);
        if (approxBytes > 5 * 1024 * 1024) throw new Error('Image size exceeds 5MB limit');
      }
      return true;
    })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const incoming = req.body.picture ?? null;
    const normalized = normalizeProfileImageUrl(incoming);
    user.profilePicture = normalized;
    await user.save();

    res.json({
      success: true,
      message: normalized ? 'Profile picture updated' : 'Profile picture removed',
      data: {
        picture: user.profilePicture
      }
    });
  } catch (error) {
    console.error('Update profile picture error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ===== Artist Verification Submission =====
// Storage for uploads
const uploadsRoot = path.join(__dirname, '..', 'public', 'artist-verifications');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(uploadsRoot, { recursive: true });
    cb(null, uploadsRoot);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safe = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
    cb(null, `${Date.now()}_${safe}${ext}`);
  }
});

// @route   PUT /api/user/artist-status
// @desc    Toggle artist status for the current user
// @access  Private
router.put('/artist-status', auth, async (req, res) => {
  try {
    const { isArtist } = req.body || {};
    if (typeof isArtist !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isArtist boolean is required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.isArtist = isArtist;
    await user.save();

    await Notification.create({
      recipient: user._id,
      sender: req.user.id,
      type: 'system',
      title: isArtist ? 'Artist mode enabled' : 'Switched to listener',
      message: isArtist ? 'You can now access artist features.' : 'You switched back to a normal listener account.'
    });

    if (!isArtist) {
      try {
        const { sendEmail } = require('../utils/sendEmail');
        await sendEmail({
          to: user.email,
          subject: 'Audix — You switched to Listener',
          text: 'You have switched back to a normal listener account on Audix. You can re-apply for artist anytime.',
          html: '<p>You have switched back to a normal listener account on Audix. You can re-apply for artist anytime.</p>'
        });
      } catch (e) { console.error('Email send failed:', e.message); }
    }

    res.json({ success: true, message: 'Artist status updated', data: { isArtist: user.isArtist } });
  } catch (error) {
    console.error('Update artist status error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});
const upload = multer({ storage });

// @route   POST /api/user/artist-verification
// @desc    Submit artist verification request with files
// @access  Private
router.post('/artist-verification', auth, upload.fields([
  { name: 'idFile', maxCount: 1 },
  { name: 'evidence', maxCount: 10 }
]), async (req, res) => {
  try {
    const { displayName, socialLink, portfolioLink } = req.body;
    if (!displayName) {
      return res.status(400).json({ success: false, message: 'displayName is required' });
    }

    // Save file URLs (served from /public)
    const basePublic = '/artist-verifications';
    const idFileUrl = req.files?.idFile?.[0] ? `${basePublic}/${req.files.idFile[0].filename}` : '';
    const evidenceUrls = (req.files?.evidence || []).map(f => `${basePublic}/${f.filename}`);

    // Create or update pending request for this user
    const existing = await ArtistVerification.findOne({ user: req.user.id, status: 'pending' });
    if (existing) {
      existing.displayName = displayName;
      existing.socialLink = socialLink;
      existing.portfolioLink = portfolioLink;
      if (idFileUrl) existing.idFileUrl = idFileUrl;
      if (evidenceUrls.length) existing.evidenceUrls = evidenceUrls;
      await existing.save();
    } else {
      await ArtistVerification.create({
        user: req.user.id,
        displayName,
        socialLink,
        portfolioLink,
        idFileUrl,
        evidenceUrls,
        status: 'pending'
      });
    }

    // Create a notification for admins (use system notification to admins)
    // For simplicity, notify the submitting user that it's pending
    await Notification.create({
      recipient: req.user.id,
      sender: req.user.id,
      type: 'system',
      title: 'Artist verification submitted',
      message: 'We are reviewing your submission. You\'ll be notified once approved.'
    });

    res.json({ success: true, message: 'Verification submitted' });
  } catch (error) {
    console.error('Artist verification submit error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   POST /api/user/follow/:userId
// @desc    Send follow request to a user
// @access  Private
router.post('/follow/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    console.log('Follow request:', { userId, currentUserId, userIdType: typeof userId, currentUserIdType: typeof currentUserId });

    // Validate MongoDB ObjectId format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log('Error: Invalid user ID format:', userId);
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    if (userId === currentUserId.toString()) {
      console.log('Error: User trying to follow themselves');
      return res.status(400).json({
        success: false,
        message: 'You cannot follow yourself'
      });
    }

    // Check if target user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      console.log('Error: Target user not found:', userId);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const currentUser = await User.findById(currentUserId);
    console.log('Current user following:', currentUser.following.map(id => id.toString()));
    console.log('Target user ID:', userId);

    // Check if already following
    if (currentUser.following.includes(userId)) {
      console.log('Error: Already following this user');
      return res.status(400).json({
        success: false,
        message: 'You are already following this user'
      });
    }

    // Check if follow request already sent
    const existingRequest = currentUser.friendRequestsSent.find(
      req => req.user.toString() === userId
    );
    if (existingRequest) {
      console.log('Error: Follow request already sent');
      return res.status(400).json({
        success: false,
        message: 'Follow request already sent'
      });
    }

    // Check if there's a pending request from the target user
    const incomingRequest = currentUser.friendRequestsReceived.find(
      req => req.user.toString() === userId
    );
    if (incomingRequest) {
      console.log('Error: Incoming request already exists');
      return res.status(400).json({
        success: false,
        message: 'This user has already sent you a follow request'
      });
    }

    // Add follow request to both users
    await User.findByIdAndUpdate(currentUserId, {
      $addToSet: {
        friendRequestsSent: {
          user: userId,
          sentAt: new Date()
        }
      }
    });

    await User.findByIdAndUpdate(userId, {
      $addToSet: {
        friendRequestsReceived: {
          user: currentUserId,
          receivedAt: new Date()
        }
      }
    });

    // Create notification for follow request
    const Notification = require('../models/Notification');
    await Notification.createFollowRequest(currentUserId, userId);

    res.json({
      success: true,
      message: 'Follow request sent successfully'
    });
  } catch (error) {
    console.error('Send follow request error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
});

// @route   POST /api/user/follow/:userId/accept
// @desc    Accept follow request
// @access  Private
router.post('/follow/:userId/accept', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    const currentUser = await User.findById(currentUserId);
    const senderUser = await User.findById(userId);

    if (!senderUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if follow request exists
    const followRequest = currentUser.friendRequestsReceived.find(
      req => req.user.toString() === userId
    );

    if (!followRequest) {
      return res.status(400).json({
        success: false,
        message: 'No follow request found from this user'
      });
    }

    // Remove follow requests from both users and add to friends/following/followers
    await User.findByIdAndUpdate(currentUserId, {
      $pull: {
        friendRequestsReceived: { user: userId }
      },
      $addToSet: {
        friends: userId,
        followers: userId
      }
    });

    await User.findByIdAndUpdate(userId, {
      $pull: {
        friendRequestsSent: { user: currentUserId }
      },
      $addToSet: {
        friends: currentUserId,
        following: currentUserId
      }
    });

    // Update the original follow request notification
    const Notification = require('../models/Notification');
    await Notification.findOneAndUpdate(
      {
        sender: userId,
        recipient: currentUserId,
        type: 'follow_request',
        actionTaken: 'pending'
      },
      {
        actionTaken: 'accepted'
      }
    );

    // Create acceptance notification for the sender
    await Notification.createFollowRequestAccepted(currentUserId, userId);

    res.json({
      success: true,
      message: 'Follow request accepted successfully'
    });
  } catch (error) {
    console.error('Accept follow request error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/user/follow/:userId/decline
// @desc    Decline follow request
// @access  Private
router.post('/follow/:userId/decline', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    const currentUser = await User.findById(currentUserId);

    // Check if follow request exists
    const followRequest = currentUser.friendRequestsReceived.find(
      req => req.user.toString() === userId
    );

    if (!followRequest) {
      return res.status(400).json({
        success: false,
        message: 'No follow request found from this user'
      });
    }

    // Remove follow requests from both users
    await User.findByIdAndUpdate(currentUserId, {
      $pull: {
        friendRequestsReceived: { user: userId }
      }
    });

    await User.findByIdAndUpdate(userId, {
      $pull: {
        friendRequestsSent: { user: currentUserId }
      }
    });

    // Update the original follow request notification
    const Notification = require('../models/Notification');
    await Notification.findOneAndUpdate(
      {
        sender: userId,
        recipient: currentUserId,
        type: 'follow_request',
        actionTaken: 'pending'
      },
      {
        actionTaken: 'declined'
      }
    );

    res.json({
      success: true,
      message: 'Follow request declined successfully'
    });
  } catch (error) {
    console.error('Decline follow request error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/user/follow/:userId/cancel
// @desc    Cancel follow request
// @access  Private
router.post('/follow/:userId/cancel', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    const currentUser = await User.findById(currentUserId);

    // Check if follow request exists
    const followRequest = currentUser.friendRequestsSent.find(
      req => req.user.toString() === userId
    );

    if (!followRequest) {
      return res.status(400).json({
        success: false,
        message: 'No follow request found for this user'
      });
    }

    // Remove follow requests from both users
    await User.findByIdAndUpdate(currentUserId, {
      $pull: {
        friendRequestsSent: { user: userId }
      }
    });

    await User.findByIdAndUpdate(userId, {
      $pull: {
        friendRequestsReceived: { user: currentUserId }
      }
    });

    // Update the original follow request notification
    const Notification = require('../models/Notification');
    await Notification.findOneAndUpdate(
      {
        sender: currentUserId,
        recipient: userId,
        type: 'follow_request',
        actionTaken: 'pending'
      },
      {
        actionTaken: 'cancelled'
      }
    );

    res.json({
      success: true,
      message: 'Follow request cancelled successfully'
    });
  } catch (error) {
    console.error('Cancel follow request error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/user/follow/:userId
// @desc    Unfollow a user
// @access  Private
router.delete('/follow/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    // Remove from friends/following/followers
    await User.findByIdAndUpdate(currentUserId, {
      $pull: { 
        following: userId,
        friends: userId
      }
    });

    await User.findByIdAndUpdate(userId, {
      $pull: { 
        followers: currentUserId,
        friends: currentUserId
      }
    });

    res.json({
      success: true,
      message: 'User unfollowed successfully'
    });
  } catch (error) {
    console.error('Unfollow user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/user/follow-artist
// @desc    Toggle follow/unfollow for an artist by name
// @access  Private
router.post('/follow-artist', auth, async (req, res) => {
  try {
    // Accept JSON body, stringified JSON, or query param
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const candidate = (body && typeof body.name === 'string' ? body.name : '') || (typeof req.query.name === 'string' ? req.query.name : '');
    const name = candidate && candidate.trim();
    if (!name) {
      return res.status(400).json({ success: false, message: 'Artist name is required' });
    }

    let artistDoc = await Artist.findOne({ name });
    if (!artistDoc) {
      artistDoc = await Artist.create({ name });
    }

    const user = await User.findById(req.user.id);
    const isFollowing = Array.isArray(user.followedArtists) && user.followedArtists.some(id => id.toString() === artistDoc._id.toString());

    if (isFollowing) {
      user.followedArtists = user.followedArtists.filter(id => id.toString() !== artistDoc._id.toString());
      artistDoc.followers = (artistDoc.followers || []).filter(id => id.toString() !== user._id.toString());
      artistDoc.followerCount = Math.max(0, (artistDoc.followerCount || 0) - 1);
    } else {
      // Add only if not already present
      if (!user.followedArtists.some(id => id.toString() === artistDoc._id.toString())) {
        user.followedArtists.push(artistDoc._id);
      }
      artistDoc.followers = Array.isArray(artistDoc.followers) ? artistDoc.followers : [];
      if (!artistDoc.followers.some(id => id.toString() === user._id.toString())) {
        artistDoc.followers.push(user._id);
        artistDoc.followerCount = (artistDoc.followerCount || 0) + 1;
      }
    }

    await Promise.all([user.save(), artistDoc.save()]);

    res.json({
      success: true,
      message: isFollowing ? 'Unfollowed artist' : 'Followed artist',
      isFollowing: !isFollowing,
      artistId: artistDoc._id,
      name: artistDoc.name
    });
  } catch (error) {
    console.error('Follow artist error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   POST /api/user/fix-relationships
// @desc    Fix existing relationships (temporary endpoint)
// @access  Private
router.post('/fix-relationships', auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const currentUser = await User.findById(currentUserId).select('following followers friendRequestsSent friendRequestsReceived friends');
    
    // Find users who are in following/followers but not in friends
    const followingUsers = await User.find({ _id: { $in: currentUser.following } });
    const followerUsers = await User.find({ _id: { $in: currentUser.followers } });
    
    let fixed = 0;
    
    // Check mutual following relationships and add to friends
    for (const followingUser of followingUsers) {
      if (followingUser.followers.includes(currentUserId)) {
        // Mutual relationship exists, add to friends
        await User.findByIdAndUpdate(currentUserId, {
          $addToSet: { friends: followingUser._id }
        });
        await User.findByIdAndUpdate(followingUser._id, {
          $addToSet: { friends: currentUserId }
        });
        fixed++;
      }
    }
    
    res.json({
      success: true,
      message: `Fixed ${fixed} relationships`,
      data: {
        following: currentUser.following.length,
        followers: currentUser.followers.length,
        friends: currentUser.friends.length,
        fixed
      }
    });
  } catch (error) {
    console.error('Fix relationships error:', error);
    res.status(500).json({ success: false, message: 'Fix failed' });
  }
});

// @route   GET /api/user/debug/:userId
// @desc    Debug user relationship status
// @access  Private
router.get('/debug/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;
    
    const currentUser = await User.findById(currentUserId).select('following friendRequestsSent friendRequestsReceived friends');
    const targetUser = await User.findById(userId).select('_id firstName lastName');
    
    res.json({
      success: true,
      data: {
        currentUserId,
        targetUserId: userId,
        targetUserExists: !!targetUser,
        targetUserName: targetUser ? `${targetUser.firstName} ${targetUser.lastName}` : null,
        isFollowing: currentUser.following.includes(userId),
        sentRequest: currentUser.friendRequestsSent.find(req => req.user.toString() === userId),
        receivedRequest: currentUser.friendRequestsReceived.find(req => req.user.toString() === userId),
        isFriend: currentUser.friends.includes(userId),
        isSameUser: userId === currentUserId.toString()
      }
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ success: false, message: 'Debug failed' });
  }
});

// @route   GET /api/user/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          name: user.fullName,
          given_name: user.firstName,
          family_name: user.lastName,
          email: user.email,
          picture: user.profilePicture,
          isEmailVerified: user.isEmailVerified,
          accountType: user.accountType,
        isArtist: user.isArtist,
          isAdmin: user.isAdmin,
          preferences: user.preferences,
          dateOfBirth: user.dateOfBirth,
          gender: user.gender,
          country: user.country,
          phone: user.phone,
          bio: user.bio,
          website: user.website,
          location: user.location,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin,
          loginCount: user.loginCount
        }
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/user/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', [
  auth,
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  
  body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Please provide a valid date'),
  
  body('gender')
    .optional()
    .isIn(['male', 'female', 'other', 'prefer-not-to-say'])
    .withMessage('Invalid gender option'),
  
  body('country')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Country name too long'),
  
  body('phone')
    .optional()
    .trim()
    .custom((value) => {
      if (!value || value === '') return true; // Allow empty values
      return /^[\+]?[1-9][\d]{0,15}$/.test(value); // Basic phone validation
    })
    .withMessage('Please provide a valid phone number'),
  
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Bio cannot exceed 500 characters'),
  
  body('website')
    .optional()
    .trim()
    .custom((value) => {
      if (!value || value === '') return true; // Allow empty values
      return /^https?:\/\/.+/.test(value);
    })
    .withMessage('Please provide a valid website URL starting with http:// or https://'),
  
  body('location')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Location name too long')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update allowed fields
    const allowedUpdates = ['firstName', 'lastName', 'dateOfBirth', 'gender', 'country', 'phone', 'bio', 'website', 'location'];
    const updates = {};
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    Object.assign(user, updates);
    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          name: user.fullName,
          email: user.email,
          picture: user.profilePicture,
          dateOfBirth: user.dateOfBirth,
          gender: user.gender,
          country: user.country,
          phone: user.phone,
          bio: user.bio,
          website: user.website,
          location: user.location,
          updatedAt: user.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/user/preferences
// @desc    Update user preferences
// @access  Private
router.put('/preferences', [
  auth,
  body('theme')
    .optional()
    .isIn(['light', 'dark', 'auto'])
    .withMessage('Invalid theme option'),
  
  body('language')
    .optional()
    .isLength({ min: 2, max: 5 })
    .withMessage('Invalid language code'),
  
  body('notifications.email')
    .optional()
    .isBoolean()
    .withMessage('Email notification preference must be boolean'),
  
  body('notifications.push')
    .optional()
    .isBoolean()
    .withMessage('Push notification preference must be boolean'),
  
  body('notifications.marketing')
    .optional()
    .isBoolean()
    .withMessage('Marketing notification preference must be boolean')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update preferences
    if (req.body.theme) {
      user.preferences.theme = req.body.theme;
    }
    
    if (req.body.language) {
      user.preferences.language = req.body.language;
    }
    
    if (req.body.notifications) {
      if (req.body.notifications.email !== undefined) {
        user.preferences.notifications.email = req.body.notifications.email;
      }
      if (req.body.notifications.push !== undefined) {
        user.preferences.notifications.push = req.body.notifications.push;
      }
      if (req.body.notifications.marketing !== undefined) {
        user.preferences.notifications.marketing = req.body.notifications.marketing;
      }
    }
    
    if (req.body.privacy) {
      if (req.body.privacy.profileVisibility) {
        user.preferences.privacy.profileVisibility = req.body.privacy.profileVisibility;
      }
      if (req.body.privacy.showRecentActivity !== undefined) {
        user.preferences.privacy.showRecentActivity = req.body.privacy.showRecentActivity;
      }
    }

    await user.save();

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: {
        preferences: user.preferences
      }
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/user/change-password
// @desc    Change user password
// @access  Private
router.put('/change-password', [
  auth,
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match');
      }
      return true;
    })
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id).select('+password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has a password (not Google-only user)
    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change password for Google-authenticated accounts'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/user/account
// @desc    Delete user account
// @access  Private
router.delete('/account', [
  auth,
  body('password')
    .optional()
    .notEmpty()
    .withMessage('Password is required for account deletion'),
  
  body('confirmDeletion')
    .equals('DELETE')
    .withMessage('Please type DELETE to confirm account deletion')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { password } = req.body;

    const user = await User.findById(req.user.id).select('+password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify password if user has one
    if (user.password && password) {
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Password is incorrect'
        });
      }
    }

    // Soft delete - deactivate account instead of hard delete
    user.isActive = false;
    user.email = `deleted_${Date.now()}_${user.email}`;
    await user.save();

    res.json({
      success: true,
      message: 'Account has been deactivated successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/user/stats
// @desc    Get user statistics
// @access  Private
router.get('/stats', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('playlists')
      .populate('likedSongs')
      .populate('followedArtists');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const stats = {
      accountAge: Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)), // days
      loginCount: user.loginCount,
      lastLogin: user.lastLogin,
      playlistsCount: user.playlists.length,
      likedSongsCount: user.likedSongs.length,
      followedArtistsCount: user.followedArtists.length,
      favoriteGenres: user.favoriteGenres,
      accountType: user.accountType,
      isEmailVerified: user.isEmailVerified
    };

    res.json({
      success: true,
      data: { stats }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/user/friends
// @desc    Get user's friends list
// @access  Private
router.get('/friends', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('friends', 'firstName lastName email profilePicture lastActiveAt authMethod googleId')
      .select('friends');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Format friends data
    const formattedFriends = user.friends.map(friend => ({
      id: friend._id,
      name: friend.fullName,
      firstName: friend.firstName,
      lastName: friend.lastName,
      email: friend.email,
      avatar: friend.profilePicture, // Don't set default here, let frontend handle it
      authMethod: friend.authMethod,
      isGoogleUser: friend.authMethod === 'google',
      online: friend.lastActiveAt && (Date.now() - new Date(friend.lastActiveAt).getTime()) < 5 * 60 * 1000, // 5 minutes
      lastSeen: friend.lastActiveAt || friend.createdAt
    }));

    res.json({
      success: true,
      data: {
        friends: formattedFriends,
        count: formattedFriends.length
      }
    });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/user/subscription
// @desc    Update user's subscription/account type
// @access  Private
router.put('/subscription', [
  auth,
  body('accountType')
    .isIn(['free', 'premium', 'family', 'student'])
    .withMessage('Invalid account type'),
  body('subscriptionExpires')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('subscriptionExpires must be a valid date if provided')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { accountType, subscriptionExpires, plan, amount, currency, paymentId } = req.body;
    user.accountType = accountType;

    // If client explicitly sends a subscriptionExpires, respect it; otherwise derive from plan on premium upgrades
    if (subscriptionExpires !== undefined) {
      user.subscriptionExpires = subscriptionExpires ? new Date(subscriptionExpires) : null;
    } else if (accountType === 'premium' && (plan === 'monthly' || plan === 'yearly')) {
      const now = new Date();
      const derivedEnd = new Date(now);
      if (plan === 'yearly') {
        derivedEnd.setFullYear(derivedEnd.getFullYear() + 1);
      } else {
        derivedEnd.setMonth(derivedEnd.getMonth() + 1);
      }
      user.subscriptionExpires = derivedEnd;
    } else if (accountType === 'free') {
      user.subscriptionExpires = null;
    }

    await user.save();

    // Create invoice when upgrading to premium and amount provided
    if (accountType === 'premium' && typeof amount === 'number' && amount > 0) {
      try {
        const Invoice = require('../models/Invoice');
        const { sendEmail } = require('../utils/sendEmail');
        const { generateInvoicePdfBuffer } = require('../utils/invoicePdf');
        // Derive billing period from plan
        const now = new Date();
        const periodStart = now;
        const periodEnd = user.subscriptionExpires || (() => {
          const tmp = new Date(now);
          if (plan === 'yearly') tmp.setFullYear(tmp.getFullYear() + 1); else tmp.setMonth(tmp.getMonth() + 1);
          return tmp;
        })();
        const invoice = await Invoice.create({
          user: user._id,
          plan: plan === 'yearly' ? 'yearly' : 'monthly',
          amount,
          currency: currency || 'INR',
          paymentId: paymentId || null,
          periodStart,
          periodEnd,
          status: 'paid',
          meta: { source: 'subscription_update' }
        });

        // Generate PDF and email it to the user (non-blocking but awaited here for reliability)
        try {
          const pdfBuffer = await generateInvoicePdfBuffer(invoice, user.email);
          const amountFormatted = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(invoice.amount || 0));
          const baseUrl = process.env.BACKEND_PUBLIC_URL || process.env.SERVER_URL || '';
          const downloadUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/invoices/${invoice._id}/pdf` : '';

          await sendEmail({
            to: user.email,
            template: 'invoicePaid',
            data: {
              name: user.fullName || user.firstName,
              invoiceId: String(invoice._id),
              plan: invoice.plan,
              amount: String(invoice.amount),
              amountFormatted,
              currency: invoice.currency,
              periodStart: periodStart.toLocaleDateString(),
              periodEnd: periodEnd.toLocaleDateString(),
              downloadUrl
            },
            attachments: [
              {
                filename: `invoice-${invoice._id}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
              }
            ]
          });
        } catch (emailErr) {
          console.error('Failed to send invoice email:', emailErr);
        }
      } catch (e) {
        console.error('Failed to create invoice:', e);
      }
    }

    return res.json({
      success: true,
      message: 'Subscription updated',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          name: user.fullName,
          email: user.email,
          picture: user.profilePicture,
          accountType: user.accountType,
          subscriptionExpires: user.subscriptionExpires,
          isAdmin: user.isAdmin,
          isEmailVerified: user.isEmailVerified,
        }
      }
    });
  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
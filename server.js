const express = require('express');

const mongoose = require('mongoose');

const cors = require('cors');

const helmet = require('helmet');

const rateLimit = require('express-rate-limit');

const { createServer } = require('http');

const { Server } = require('socket.io');

const jwt = require('jsonwebtoken');

const path = require('path');

require('dotenv').config();



// Import routes

const authRoutes = require('./routes/auth');

const userRoutes = require('./routes/user');

const notificationRoutes = require('./routes/notifications');

const messageRoutes = require('./routes/messages');

const adminRoutes = require('./routes/admin');

const musicRoutes = require('./routes/music');
const invoiceRoutes = require('./routes/invoices');



// Import middleware

const errorHandler = require('./middleware/errorHandler');

const logger = require('./middleware/logger');



const app = express();

const server = createServer(app);

app.use((req, res, next) => {

  res.setHeader(

    "Content-Security-Policy",

    "script-src 'self' https://accounts.google.com https://apis.google.com 'unsafe-inline' 'unsafe-eval';"

  );

  next();

});



// CORS must be applied BEFORE any other middleware that may reply (e.g. rate limit)

const corsOptions = {

  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5175', 'http://localhost:3002'],

  credentials: true,

  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],

  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']

};



app.use(cors(corsOptions));

// Handle preflight early

app.options('*', cors(corsOptions));





// Security middleware

app.use(helmet({

  crossOriginResourcePolicy: { policy: "cross-origin" },

  contentSecurityPolicy: {

    directives: {

      defaultSrc: ["'self'"],

      scriptSrc: ["'self'", "'unsafe-inline'"],

      styleSrc: ["'self'", "'unsafe-inline'"],

      imgSrc: ["'self'", "data:", "https:", "blob:"],

      mediaSrc: ["'self'", "https:", "blob:", "data:"],

      connectSrc: [

        "'self'",

        "http://localhost:5173",

        "http://localhost:3000",

        "http://localhost:5175",

        "http://localhost:3001",

        "http://localhost:3002"

      ],

      fontSrc: ["'self'", "data:"],

    },

  },

}));



// Rate limiting (skip preflight)

const limiter = rateLimit({

  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes

  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // limit each IP to 1000 requests per windowMs (increased for development)

  message: {

    error: 'Too many requests from this IP, please try again later.',

    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)

  },

  standardHeaders: true,

  legacyHeaders: false,

  skip: (req) => req.method === 'OPTIONS',

  keyGenerator: (req) => {

    // Use a more specific key for development

    return req.ip + ':' + req.get('User-Agent');

  }

});



// Apply different rate limiting based on environment

if (process.env.NODE_ENV === 'development') {

  // More lenient rate limiting for development

  const devLimiter = rateLimit({

    windowMs: 1 * 60 * 1000, // 1 minute

    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_DEV) || 2000, // relaxed for development

    message: {

      error: 'Too many requests from this IP, please try again later.',

      retryAfter: 60

    },

    standardHeaders: true,

    legacyHeaders: false,

    skip: (req) => req.method === 'OPTIONS'

  });

  app.use('/api/', devLimiter);

} else {

  app.use('/api/', limiter);

}



// Socket.IO setup

const io = new Server(server, {

  cors: corsOptions,

  transports: ['websocket', 'polling']

});



// Socket.IO authentication middleware

io.use(async (socket, next) => {

  try {

    console.log('🔐 Socket authentication attempt:', {

      id: socket.id,

      handshake: {

        auth: socket.handshake.auth ? 'present' : 'missing',

        query: socket.handshake.query,

        headers: socket.handshake.headers.origin

      }

    });



    const token = socket.handshake.auth.token;

    if (!token) {

      console.log('❌ No token provided for socket:', socket.id);

      return next(new Error('Authentication error: No token provided'));

    }



    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-jwt-secret-change-in-production');

    const User = require('./models/User');

    const user = await User.findById(decoded.id);

    

    if (!user) {

      console.log('❌ User not found for token:', decoded.id);

      return next(new Error('Authentication error: User not found'));

    }



    socket.userId = user._id.toString();

    socket.user = user;

    console.log('✅ Socket authenticated for user:', user.firstName, user.lastName);

    next();

  } catch (error) {

    console.log('❌ Socket authentication error:', error.message);

    next(new Error('Authentication error: Invalid token'));

  }

});



// Socket.IO connection handling

const connectedUsers = new Map();



io.on('connection', (socket) => {

  console.log(`User ${socket.user.firstName} connected with socket ID: ${socket.id}`);

  

  // Store user connection

  connectedUsers.set(socket.userId, socket.id);

  

  // Join user to their personal room

  socket.join(`user_${socket.userId}`);

  

  // Update user's last active time

  socket.user.lastActiveAt = new Date();

  socket.user.save().catch(err => console.error('Error updating user activity:', err));

  

  // Broadcast user online status to friends

  socket.user.friends.forEach(friendId => {

    socket.to(`user_${friendId}`).emit('user_online', {

      userId: socket.userId,

      name: socket.user.fullName,

      online: true

    });

  });



  // Handle typing events

  socket.on('typing_start', (data) => {

    socket.to(`user_${data.receiverId}`).emit('user_typing', {

      userId: socket.userId,

      name: socket.user.firstName,

      conversationId: data.conversationId

    });

  });



  socket.on('typing_stop', (data) => {

    socket.to(`user_${data.receiverId}`).emit('user_stop_typing', {

      userId: socket.userId,

      conversationId: data.conversationId

    });

  });



  // Handle sending messages via socket

  socket.on('send_message', async (data) => {

    try {

      const { receiverId, content, replyToId } = data;

      const senderId = socket.userId;



      // Check if receiver exists and is a friend

      const receiver = await User.findById(receiverId);

      if (!receiver) {

        socket.emit('message_error', { error: 'Receiver not found' });

        return;

      }



      const sender = await User.findById(senderId);

      if (!sender.friends.includes(receiverId)) {

        socket.emit('message_error', { error: 'You can only message friends' });

        return;

      }



      // Create message

      const Message = require('./models/Message');

      const Conversation = require('./models/Conversation');

      

      const messageData = {

        sender: senderId,

        receiver: receiverId,

        content,

        messageType: 'text'

      };



      if (replyToId) {

        const replyMessage = await Message.findById(replyToId);

        if (replyMessage) {

          messageData.replyTo = replyToId;

        }

      }



      const message = await Message.create(messageData);

      

      // Populate message for response

      await message.populate('sender', 'firstName lastName profilePicture');

      await message.populate('receiver', 'firstName lastName profilePicture');

      if (message.replyTo) {

        await message.populate('replyTo', 'content sender createdAt');

      }



      // Update or create conversation

      const conversation = await Conversation.findOrCreateConversation([senderId, receiverId]);

      await conversation.updateLastMessage(message._id);

      await conversation.incrementUnreadCount(receiverId);



      // Format message for response

      const formattedMessage = {

        id: message._id,

        content: message.content,

        senderId: message.sender._id,

        senderName: message.sender.fullName,

        receiverId: message.receiver._id,

        receiverName: message.receiver.fullName,

        timestamp: message.createdAt,

        isRead: message.isRead,

        messageType: message.messageType,

        conversationId: conversation.conversationId,

        replyTo: message.replyTo ? {

          id: message.replyTo._id,

          content: message.replyTo.content,

          senderName: message.replyTo.sender.fullName,

          timestamp: message.replyTo.createdAt

        } : null

      };



      // Emit to receiver and sender

      socket.to(`user_${receiverId}`).emit('new_message', formattedMessage);

      socket.emit('message_sent', formattedMessage);



    } catch (error) {

      console.error('Socket send message error:', error);

      socket.emit('message_error', { error: 'Failed to send message' });

    }

  });



  // Handle marking messages as read

  socket.on('mark_messages_read', async (data) => {

    try {

      const { userId } = data;

      const currentUserId = socket.userId;



      const Message = require('./models/Message');

      const Conversation = require('./models/Conversation');



      // Mark messages as read

      await Message.markAsRead(userId, currentUserId);



      // Update conversation unread count

      const conversation = await Conversation.findOrCreateConversation([currentUserId, userId]);

      await conversation.resetUnreadCount(currentUserId);



      // Emit to sender

      socket.to(`user_${userId}`).emit('messages_read', {

        readBy: currentUserId,

        conversationId: conversation.conversationId

      });



    } catch (error) {

      console.error('Socket mark messages read error:', error);

    }

  });



  // Handle joining/leaving conversations

  socket.on('join_conversation', (conversationId) => {

    socket.join(`conversation_${conversationId}`);

    console.log(`User ${socket.user.firstName} joined conversation ${conversationId}`);

  });



  socket.on('leave_conversation', (conversationId) => {

    socket.leave(`conversation_${conversationId}`);

    console.log(`User ${socket.user.firstName} left conversation ${conversationId}`);

  });



  // Handle user status updates

  socket.on('update_status', (status) => {

    socket.user.friends.forEach(friendId => {

      socket.to(`user_${friendId}`).emit('user_status_update', {

        userId: socket.userId,

        status: status

      });

    });

  });



  // Handle disconnection

  socket.on('disconnect', () => {

    console.log(`User ${socket.user.firstName} disconnected`);

    

    // Remove user from connected users

    connectedUsers.delete(socket.userId);

    

    // Update last active time

    socket.user.lastActiveAt = new Date();

    socket.user.save();

    

    // Broadcast user offline status to friends

    socket.user.friends.forEach(friendId => {

      socket.to(`user_${friendId}`).emit('user_offline', {

        userId: socket.userId,

        name: socket.user.fullName,

        online: false,

        lastSeen: new Date()

      });

    });

  });

});



// Make io available to routes

app.use((req, res, next) => {

  req.io = io;

  req.connectedUsers = connectedUsers;

  next();

});



// Preflight already handled above



// Body parsing middleware

app.use(express.json({ limit: '10mb' }));

app.use(express.urlencoded({ extended: true, limit: '10mb' }));



// Custom middleware

app.use(logger);



// Add cache control headers for development

if (process.env.NODE_ENV === 'development') {

  app.use((req, res, next) => {

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    res.setHeader('Pragma', 'no-cache');

    res.setHeader('Expires', '0');

    next();

  });

}



// Health check endpoint

app.get('/health', (req, res) => {

  res.status(200).json({

    status: 'OK',

    timestamp: new Date().toISOString(),

    uptime: process.uptime(),

    environment: process.env.NODE_ENV,

    version: process.env.npm_package_version || '1.0.0'

  });

});



// API routes

app.use('/api/auth', authRoutes);

app.use('/api/user', userRoutes);

app.use('/api/notifications', notificationRoutes);

app.use('/api/messages', messageRoutes);

app.use('/api/admin', adminRoutes);

app.use('/api/music', musicRoutes);
app.use('/api/invoices', invoiceRoutes);

// Serve extracted background music files
app.use('/extracted', express.static(path.join(__dirname, 'public/extracted')));
app.use('/artist-verifications', express.static(path.join(__dirname, 'public/artist-verifications')));



// 404 handler

app.use('*', (req, res) => {

  res.status(404).json({

    success: false,

    message: 'API endpoint not found',

    path: req.originalUrl,

    method: req.method

  });

});



// Error handling middleware (must be last)

app.use(errorHandler);



// MongoDB connection

const connectDB = async () => {

  try {

    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/audix';

    const conn = await mongoose.connect(mongoUri, {

      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE) || 10,

      minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE) || 5,

      maxIdleTimeMS: 30000,

      serverSelectionTimeoutMS: 5000,

      socketTimeoutMS: 45000,

    });



    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    

    // Handle connection events

    mongoose.connection.on('error', (err) => {

      console.error('❌ MongoDB connection error:', err);

    });



    mongoose.connection.on('disconnected', () => {

      console.log('⚠️  MongoDB disconnected');

    });



    mongoose.connection.on('reconnected', () => {

      console.log('✅ MongoDB reconnected');

    });



  } catch (error) {

    console.error('❌ MongoDB connection failed:', error.message);

    process.exit(1);

  }

};



// Graceful shutdown

process.on('SIGINT', async () => {

  console.log('\n🔄 Gracefully shutting down...');

  

  try {

    await mongoose.connection.close();

    console.log('✅ MongoDB connection closed');

    process.exit(0);

  } catch (error) {

    console.error('❌ Error during shutdown:', error);

    process.exit(1);

  }

});



// Start server

const PORT = process.env.PORT || 3002;



const startServer = async () => {

  try {

    await connectDB();

    

    server.listen(PORT, () => {

      console.log(`🚀 Server running on port ${PORT}`);

      console.log(`🌍 Environment: ${process.env.NODE_ENV}`);

      console.log(`📊 Health check: http://localhost:${PORT}/health`);

      console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);

      console.log(`💬 Socket.IO enabled for real-time messaging`);

    });

  } catch (error) {

    console.error('❌ Failed to start server:', error);

    process.exit(1);

  }

};



startServer();

module.exports = app;



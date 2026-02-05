import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { mockDB } from './db/mock';

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// Socket.IO for real-time communication
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', apiLimiter);

// ============================================
// AUTH ROUTES (Using Mock Database)
// ============================================

// Register a new device
app.post('/api/auth/register', (req, res) => {
  try {
    const { deviceId, publicKey } = req.body;

    if (!deviceId || !publicKey) {
      return res.status(400).json({
        success: false,
        message: 'deviceId and publicKey are required'
      });
    }

    // Create new user
    const user = mockDB.createUser({
      deviceId,
      publicKey,
      isVerified: false
    });

    res.status(201).json({
      success: true,
      message: 'Device registered successfully',
      data: {
        userId: user.id,
        deviceId: user.deviceId
      }
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

// Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { userId, deviceId } = req.body;

    if (!userId && !deviceId) {
      return res.status(400).json({
        success: false,
        message: 'userId or deviceId is required'
      });
    }

    // Find user
    let user = userId ? mockDB.findUserByPk(userId) : mockDB.findUserByDeviceId(deviceId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Create session
    const sessionToken = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const session = mockDB.createSession({
      userId: user.id,
      sessionToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        userId: user.id,
        deviceId: user.deviceId,
        sessionToken: session.sessionToken
      }
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  try {
    const { sessionToken } = req.body;

    if (!sessionToken) {
      return res.status(400).json({
        success: false,
        message: 'sessionToken is required'
      });
    }

    mockDB.deleteSession(sessionToken);

    res.status(200).json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error: any) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: error.message
    });
  }
});

// ============================================
// DEVICE ROUTES
// ============================================

app.get('/api/devices/:deviceId', (req, res) => {
  try {
    const { deviceId } = req.params;
    const device = mockDB.findUserByDeviceId(deviceId);

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    res.status(200).json({
      success: true,
      data: device
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// PROXIMITY ROUTES
// ============================================

app.post('/api/proximity/detect', (req, res) => {
  try {
    const { sessionId, frequency, pattern, intensity } = req.body;

    // Create handshake record
    const handshake = mockDB.createHandshake({
      sessionId,
      frequency,
      pattern,
      intensity,
      status: 'detected'
    });

    res.status(200).json({
      success: true,
      message: 'Proximity detected',
      data: handshake
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// SOCKET.IO EVENTS
// ============================================

io.on('connection', (socket) => {
  console.log('✅ Client connected:', socket.id);

  socket.on('join-session', (sessionId) => {
    socket.join(`session:${sessionId}`);
    console.log(`📍 Client ${socket.id} joined session ${sessionId}`);
  });

  socket.on('update-location', (data) => {
    const { sessionId, latitude, longitude } = data;
    socket.to(`session:${sessionId}`).emit('location-update', {
      userId: socket.id,
      latitude,
      longitude,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('light-id-detected', (data) => {
    const { sessionId, frequency, pattern, intensity } = data;
    io.to(`session:${sessionId}`).emit('light-id-signal', {
      frequency,
      pattern,
      intensity,
      detectedAt: new Date().toISOString(),
      detectorId: socket.id
    });
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'FlickerSecure Backend API',
    database: 'mock-in-memory'
  });
});

// Start server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`\n`);
  console.log(`╔════════════════════════════════════════════╗`);
  console.log(`║  🚀 FlickerSecure Backend API Running  🚀  ║`);
  console.log(`╚════════════════════════════════════════════╝`);
  console.log(`\n`);
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`🔗 Frontend connected to http://localhost:3000`);
  console.log(`📡 Socket.IO ready for real-time communication`);
  console.log(`💾 Using in-memory mock database`);
  console.log(`\n`);
});

export { io };

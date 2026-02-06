import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// Import routes
import authRoutes from './routes/auth.routes';
import proximityRoutes from './routes/proximity.routes';
import deviceRoutes from './routes/device.routes';
import deliveryRoutes from './routes/delivery.routes';

// Load environment variables FIRST
dotenv.config();

// Import real database with initialization
import sequelize, { initializeDatabase } from './models/database';

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

// Middleware to inject io into request
app.use((req: any, res, next) => {
  req.io = io;
  next();
});

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/proximity', proximityRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/delivery', deliveryRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'FlickerSecure Backend API'
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // Join a proximity session
  socket.on('join-session', (sessionId) => {
    socket.join(`session:${sessionId}`);
    console.log(`Client ${socket.id} joined session ${sessionId}`);
  });
  
  // Join delivery tracking room
  socket.on('join-delivery', (orderId) => {
    socket.join(`delivery:${orderId}`);
    console.log(`Client ${socket.id} joined delivery tracking ${orderId}`);
  });
  
  // Real-time delivery location update
  socket.on('delivery-location-update', (data) => {
    const { orderId, latitude, longitude, speed, heading } = data;
    
    // Broadcast to all clients tracking this delivery
    io.to(`delivery:${orderId}`).emit('delivery-location-changed', {
      orderId,
      latitude,
      longitude,
      speed,
      heading,
      timestamp: new Date().toISOString()
    });
    
    console.log(`📍 Delivery ${orderId} location updated: ${latitude}, ${longitude}`);
  });
  
  // Update location in real-time
  socket.on('update-location', (data) => {
    const { sessionId, latitude, longitude } = data;
    
    // Broadcast to other session members
    socket.to(`session:${sessionId}`).emit('location-update', {
      userId: socket.id,
      latitude,
      longitude,
      timestamp: new Date().toISOString()
    });
  });
  
  // Light-ID signal detection
  socket.on('light-id-detected', (data) => {
    const { sessionId, frequency, pattern, intensity } = data;
    
    // Broadcast detection to session
    io.to(`session:${sessionId}`).emit('light-id-signal', {
      frequency,
      pattern,
      intensity,
      detectedAt: new Date().toISOString(),
      detectorId: socket.id
    });
  });
  
  // Disconnect handling
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Database connection and server start
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Initialize real database
    const dbInitialized = await initializeDatabase();
    
    if (!dbInitialized) {
      console.error('❌ Failed to initialize database. Exiting.');
      process.exit(1);
    }
    
    // Start server
    server.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log(`📡 Socket.IO ready for real-time connections`);
      console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
      console.log(`💾 Database: PostgreSQL on ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}`);
    });
  } catch (error) {
    console.error('❌ Unable to start server:', error);
    process.exit(1);
  }
}

startServer();

export { io }; // Export for use in other files

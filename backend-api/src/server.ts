import express, { Request, Response, NextFunction } from 'express';
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
import deliveryRoutesV3 from './routes/delivery.routes.v3';
import blockchainRoutes from './routes/blockchain.routes';
import bluetoothRoutes from './routes/bluetooth.routes';
import uwbRoutes from './routes/uwb.routes';
import nfcRoutes from './routes/nfc.routes';
import rangingRoutes from './routes/ranging.routes';

// Load environment variables FIRST
dotenv.config();

// Import real database with initialization
import sequelize, { initializeDatabase } from './models/database';

const app = express();
const server = http.createServer(app);

// CORS configuration - support multiple origins for web + mobile
const allowedOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',')
  : [process.env.FRONTEND_URL || 'http://localhost:3000'];

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin matches any allowed origin or pattern
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed.startsWith('exp://')) return origin.startsWith('exp://');
      return origin === allowed || origin.startsWith(allowed);
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log(`CORS blocked origin: ${origin}`);
      callback(null, true); // Still allow for now during development
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-token']
};

// Socket.IO for real-time communication
const io = new Server(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling']
});

// Middleware
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware to inject io into request
app.use((req: Request & { io?: Server }, res: Response, next: NextFunction) => {
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
app.use('/api/delivery', deliveryRoutesV3); // New web-focused delivery routes
app.use('/api/blockchain', blockchainRoutes); // Solana blockchain routes
app.use('/api/bluetooth', bluetoothRoutes); // Bluetooth 6.0 ranging routes
app.use('/api/uwb', uwbRoutes); // UWB ranging routes
app.use('/api/nfc', nfcRoutes); // NFC verification routes
app.use('/api/ranging', rangingRoutes); // Find Me / Live ranging routes

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
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
    let dbInitialized = false;
    try {
      dbInitialized = await initializeDatabase();
    } catch (dbError: any) {
      console.error('⚠️ Database initialization failed:', dbError.message);
      console.log('🔄 Server will continue without database (blockchain still works)');
    }
    
    if (!dbInitialized) {
      console.warn('⚠️ Database not initialized - some features may not work');
      console.log('🔗 Blockchain features will still function normally');
    }
    
    // Start server
    server.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log(`📡 Socket.IO ready for real-time connections`);
      console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
      console.log(`💾 Database: ${dbInitialized ? 'Connected' : 'Not connected (running in limited mode)'}`);
      console.log(`🔗 Blockchain: Solana ${process.env.SOLANA_NETWORK || 'devnet'}`);
    });
  } catch (error) {
    console.error('❌ Unable to start server:', error);
    process.exit(1);
  }
}

startServer();

export { io }; // Export for use in other files

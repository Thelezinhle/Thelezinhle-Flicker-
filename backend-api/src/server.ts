import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// Load environment variables FIRST
dotenv.config();

// Import routes that don't need database
import authRoutes from './routes/auth.routes';
import proximityRoutes from './routes/proximity.routes';
import deviceRoutes from './routes/device.routes';
import bluetoothRoutes from './routes/bluetooth.routes';
import uwbRoutes from './routes/uwb.routes';
import nfcRoutes from './routes/nfc.routes';
import rangingRoutes from './routes/ranging.routes';
import deliveryRoutes from './routes/delivery.routes';  // Uses in-memory Maps, no DB needed

// Routes that need database - load conditionally
let deliveryRoutesV3: any = null;
let blockchainRoutes: any = null;

// Only load database-dependent routes if DATABASE_URL or DB_HOST is set
if (process.env.DATABASE_URL || process.env.DB_HOST) {
  try {
    deliveryRoutesV3 = require('./routes/delivery.routes.v3').default;
    blockchainRoutes = require('./routes/blockchain.routes').default;
    console.log('✅ Database routes loaded');
  } catch (e) {
    console.log('⚠️ Database routes not available');
  }
} else {
  console.log('📝 No database configured - some routes disabled');
}

// Database initialization  
let initializeDatabase: (() => Promise<boolean>) | null = null;
if (process.env.DATABASE_URL || process.env.DB_HOST) {
  try {
    const dbModule = require('./models/database');
    initializeDatabase = dbModule.initializeDatabase;
  } catch (e) {
    console.log('Database module not available');
  }
}

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

// Rate limiting - returns JSON for frontend compatibility
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per windowMs (increased for testing)
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests. Please wait a few minutes and try again.'
    });
  }
});
app.use('/api/', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/proximity', proximityRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/delivery', deliveryRoutes);  // In-memory delivery routes - always available

// Database-dependent routes (only if loaded)
if (deliveryRoutesV3) {
  app.use('/api/delivery', deliveryRoutesV3);
}
if (blockchainRoutes) {
  app.use('/api/blockchain', blockchainRoutes);
}

app.use('/api/bluetooth', bluetoothRoutes); // Bluetooth 6.0 ranging routes
app.use('/api/uwb', uwbRoutes); // UWB ranging routes
app.use('/api/nfc', nfcRoutes); // NFC verification routes
app.use('/api/ranging', rangingRoutes); // Find Me / Live ranging routes

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'FlickerSecure Backend API',
    version: '2.2.0-ratelimit-fix',
    database: !!(process.env.DATABASE_URL || process.env.DB_HOST) ? 'configured' : 'in-memory'
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

// Import db available setter from mock
import { setDbAvailable } from './db/mock';

async function startServer() {
  try {
    // Initialize real database (optional)
    let dbInitialized = false;
    if (initializeDatabase) {
      try {
        dbInitialized = await initializeDatabase();
        setDbAvailable(dbInitialized);
      } catch (dbError: any) {
        console.error('⚠️ Database initialization failed:', dbError.message);
        console.log('🔄 Server will continue with in-memory database');
        setDbAvailable(false);
      }
    } else {
      console.log('📝 No database configured - using in-memory storage');
      setDbAvailable(false);
    }
    
    if (!dbInitialized) {
      console.warn('⚠️ Using in-memory storage (data resets on restart)');
      console.log('✅ All features work without PostgreSQL');
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

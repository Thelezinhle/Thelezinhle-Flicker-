const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 5000;

// Mock database
const users = new Map();
const sessions = new Map();

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'FlickerSecure Backend (Mock)' });
});

// Register endpoint
app.post('/api/auth/register', (req, res) => {
  try {
    const { deviceId, publicKey } = req.body;
    
    if (!deviceId || !publicKey) {
      return res.status(400).json({ success: false, message: 'Missing deviceId or publicKey' });
    }

    const userId = uuidv4();
    const user = {
      id: userId,
      deviceId,
      publicKey,
      createdAt: new Date()
    };

    users.set(userId, user);

    res.json({
      success: true,
      data: {
        userId,
        deviceId,
        message: 'User registered successfully'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Registration failed', error: String(error) });
  }
});

// Login endpoint
app.post('/api/auth/login', (req, res) => {
  try {
    const { userId, deviceId } = req.body;

    if (!userId || !deviceId) {
      return res.status(400).json({ success: false, message: 'Missing userId or deviceId' });
    }

    const user = users.get(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const sessionToken = uuidv4();
    const session = {
      userId,
      deviceId,
      sessionToken,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    };

    sessions.set(sessionToken, session);

    res.json({
      success: true,
      data: {
        userId,
        deviceId,
        sessionToken,
        message: 'Login successful'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Login failed', error: String(error) });
  }
});

// Get user profile
app.get('/api/auth/profile', (req, res) => {
  try {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const session = sessions.get(sessionToken);
    if (!session) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    const user = users.get(session.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch profile', error: String(error) });
  }
});

// Proximity endpoint (mock data)
app.post('/api/proximity/detect', (req, res) => {
  try {
    const { sessionToken, latitude, longitude } = req.body;

    res.json({
      success: true,
      data: {
        detected: true,
        distance: Math.random() * 100,
        signal: Math.random() * 100,
        timestamp: new Date()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Proximity detection failed', error: String(error) });
  }
});

// Device registration
app.post('/api/devices/register', (req, res) => {
  try {
    const { sessionToken, deviceType, capabilities } = req.body;

    res.json({
      success: true,
      data: {
        deviceId: uuidv4(),
        deviceType,
        capabilities,
        registeredAt: new Date()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Device registration failed', error: String(error) });
  }
});

app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     FlickerSecure Backend (Mock)           ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log('');
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`🔌 Frontend URL: http://localhost:3000`);
  console.log('');
  console.log('📚 Available Endpoints:');
  console.log('   POST   /api/auth/register');
  console.log('   POST   /api/auth/login');
  console.log('   GET    /api/auth/profile');
  console.log('   POST   /api/proximity/detect');
  console.log('   POST   /api/devices/register');
  console.log('   GET    /health');
  console.log('');
  console.log('⚠️  This is a MOCK backend for testing without PostgreSQL');
  console.log('');
});

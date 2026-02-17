// Load environment variables
require('dotenv').config();

const express = require('express');
const http = require('http');
const app = express();
const server = http.createServer(app);

// Socket.IO setup
let io;
try {
  const { Server } = require('socket.io');
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });
  
  io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);
    
    socket.on('join-delivery', (orderId) => {
      socket.join(`delivery-${orderId}`);
      console.log(`📦 Client joined delivery room: ${orderId}`);
    });
    
    socket.on('disconnect', () => {
      console.log('🔌 Client disconnected:', socket.id);
    });
  });
} catch (e) {
  console.warn('Socket.IO not available, real-time updates disabled');
}

app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// In-memory storage for deliveries
const activeDeliveries = new Map();
const locationHistory = new Map();

// Create demo delivery on startup
function createDemoDelivery() {
  const customerLat = -26.1917;
  const customerLng = 28.0328;
  const restaurantLat = -26.2100;
  const restaurantLng = 28.0500;
  const driverLat = -26.2041;
  const driverLng = 28.0473;
  
  const demoOrder = {
    orderId: 'sample-order-123',
    driverId: 'driver-demo-001',
    recipientId: 'recipient-demo-001',
    status: 'in_transit',
    currentLocation: {
      latitude: driverLat,
      longitude: driverLng,
      accuracy: 10,
      speed: 8.5, // m/s (~30 km/h)
      timestamp: new Date().toISOString()
    },
    customerLocation: {
      latitude: customerLat,
      longitude: customerLng,
      address: '123 Johannesburg, South Africa'
    },
    restaurantLocation: {
      latitude: restaurantLat,
      longitude: restaurantLng,
      address: 'Restaurant ABC, Johannesburg'
    },
    distanceToCustomer: calculateDistance(driverLat, driverLng, customerLat, customerLng),
    distanceToRestaurant: calculateDistance(driverLat, driverLng, restaurantLat, restaurantLng),
    eta: 900, // 15 minutes in seconds
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  activeDeliveries.set(demoOrder.orderId, demoOrder);
  locationHistory.set(demoOrder.orderId, [{
    latitude: demoOrder.currentLocation.latitude,
    longitude: demoOrder.currentLocation.longitude,
    timestamp: new Date().toISOString(),
    accuracy: 10
  }]);
  
  console.log('Demo delivery created: sample-order-123');
}

// Simulate driver movement for demo
function simulateDriverMovement() {
  const delivery = activeDeliveries.get('sample-order-123');
  if (!delivery || delivery.status === 'completed') return;
  
  // Move towards customer
  const destLat = delivery.customerLocation.latitude;
  const destLng = delivery.customerLocation.longitude;
  const currLat = delivery.currentLocation.latitude;
  const currLng = delivery.currentLocation.longitude;
  
  // Small step towards destination
  const step = 0.0005;
  const newLat = currLat + (destLat - currLat) * step * 10;
  const newLng = currLng + (destLng - currLng) * step * 10;
  
  delivery.currentLocation = {
    latitude: newLat,
    longitude: newLng,
    accuracy: 5 + Math.random() * 10,
    speed: 7 + Math.random() * 5, // 7-12 m/s
    timestamp: new Date().toISOString()
  };
  
  // Calculate new distances
  delivery.distanceToCustomer = calculateDistance(newLat, newLng, destLat, destLng);
  delivery.distanceToRestaurant = calculateDistance(newLat, newLng, delivery.restaurantLocation.latitude, delivery.restaurantLocation.longitude);
  delivery.eta = Math.max(60, Math.round(delivery.distanceToCustomer / 2.5)); // ~150m per minute, in seconds
  delivery.updatedAt = new Date().toISOString();
  
  // Add to history
  const history = locationHistory.get(delivery.orderId) || [];
  history.push({
    latitude: newLat,
    longitude: newLng,
    timestamp: new Date().toISOString(),
    accuracy: delivery.currentLocation.accuracy
  });
  locationHistory.set(delivery.orderId, history.slice(-200));
  
  // Emit via Socket.IO
  if (io) {
    io.to(`delivery-${delivery.orderId}`).emit('location-update', {
      orderId: delivery.orderId,
      location: delivery.currentLocation,
      distanceToCustomer: delivery.distanceToCustomer,
      eta: delivery.eta
    });
  }
}

// Start simulation
createDemoDelivery();
setInterval(simulateDriverMovement, 3000);

// Helper function to calculate distance
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', backend: 'FlickerSecure Mock API' });
});

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'FlickerSecure Backend API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      proximity: '/api/proximity/*',
      delivery: '/api/delivery/*',
      auth: '/api/auth/*'
    },
    frontend: 'http://localhost:3000'
  });
});

// ============== Proximity Tracking ==============
const proximityTrackings = new Map();

// Determine phase based on distance
function determinePhase(distance) {
  if (distance > 300) return 'gps';
  if (distance > 50) return 'discovery';
  if (distance > 0.1) return 'close_range';
  if (distance > 0.001) return 'nfc_ready';
  return 'verified';
}

// Select technology based on distance
function selectTechnology(distance) {
  if (distance > 300) return 'gps';
  if (distance > 50) return 'uwb';
  if (distance > 0.1) return 'pdr';
  return 'nfc';
}

// Start proximity tracking
app.post('/api/proximity/tracking/start', (req, res) => {
  const { user_id, target_user_id, target_latitude, target_longitude } = req.body;
  
  const trackingId = 'track-' + Date.now();
  const tracking = {
    id: trackingId,
    user_id: user_id || 'user-' + Date.now(),
    target_user_id,
    target_latitude,
    target_longitude,
    current_distance: 0,
    phase: 'gps',
    technology: 'gps',
    status: 'active',
    last_update: new Date()
  };
  
  proximityTrackings.set(trackingId, tracking);
  console.log('📍 Tracking started:', trackingId);
  
  res.status(201).json({
    success: true,
    data: tracking,
    message: 'Tracking started'
  });
});

// Update position and get distance + phase
app.post('/api/proximity/update', (req, res) => {
  const { tracking_id, latitude, longitude } = req.body;
  
  if (!tracking_id || latitude === undefined || longitude === undefined) {
    return res.status(400).json({
      success: false,
      error: 'tracking_id, latitude, and longitude are required'
    });
  }
  
  const tracking = proximityTrackings.get(tracking_id);
  
  if (!tracking) {
    return res.status(404).json({
      success: false,
      error: 'Tracking session not found'
    });
  }
  
  // Calculate distance
  const distance = calculateDistance(
    latitude, 
    longitude, 
    tracking.target_latitude, 
    tracking.target_longitude
  );
  
  // Update tracking
  tracking.current_distance = distance;
  tracking.phase = determinePhase(distance);
  tracking.technology = selectTechnology(distance);
  tracking.last_update = new Date();
  
  proximityTrackings.set(tracking_id, tracking);
  
  console.log(`📍 Distance update: ${distance.toFixed(2)}m, Phase: ${tracking.phase}`);
  
  res.json({
    success: true,
    data: {
      tracking_id: tracking.id,
      distance: tracking.current_distance,
      phase: tracking.phase,
      technology: tracking.technology,
      status: tracking.status,
      last_update: tracking.last_update
    },
    message: `Distance: ${distance.toFixed(2)}m, Phase: ${tracking.phase}`
  });
});

// Stop tracking
app.post('/api/proximity/tracking/stop', (req, res) => {
  const { tracking_id } = req.body;
  
  const tracking = proximityTrackings.get(tracking_id);
  if (tracking) {
    tracking.status = 'completed';
    proximityTrackings.set(tracking_id, tracking);
  }
  
  res.json({ success: true, message: 'Tracking stopped' });
});

// Get tracking status
app.get('/api/proximity/tracking/:trackingId', (req, res) => {
  const tracking = proximityTrackings.get(req.params.trackingId);
  
  if (!tracking) {
    return res.status(404).json({ success: false, error: 'Tracking not found' });
  }
  
  res.json({ success: true, data: tracking });
});

// In-memory user storage
const users = new Map();
const sessions = new Map();
const deliveries = new Map();

// Auth routes
app.post('/api/auth/register', (req, res) => {
  console.log('📝 Register request:', req.body);
  const { deviceId, name, email, role } = req.body;
  
  const userId = 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  const user = {
    userId,
    deviceId: deviceId || 'device-' + Date.now(),
    name: name || 'User ' + userId.slice(-6),
    email: email || null,
    role: role || 'user',
    createdAt: new Date().toISOString()
  };
  
  users.set(userId, user);
  console.log('✅ User registered:', userId);
  
  res.json({
    success: true,
    data: {
      userId: user.userId,
      deviceId: user.deviceId,
      name: user.name,
      message: 'Registered successfully'
    }
  });
});

app.post('/api/auth/login', (req, res) => {
  console.log('🔐 Login request:', req.body);
  const { deviceId, userId, role } = req.body;
  
  // Generate new user ID if not provided
  const finalUserId = userId || 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  const finalDeviceId = deviceId || 'device-' + Date.now();
  const sessionToken = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  
  // Create or get user
  let user = users.get(finalUserId);
  if (!user) {
    user = {
      userId: finalUserId,
      deviceId: finalDeviceId,
      name: (role === 'sender' ? 'Driver' : 'Customer') + ' ' + finalUserId.slice(-6),
      role: role || 'user',
      createdAt: new Date().toISOString()
    };
    users.set(finalUserId, user);
  }
  
  // Create session
  sessions.set(sessionToken, {
    userId: finalUserId,
    deviceId: finalDeviceId,
    createdAt: new Date().toISOString()
  });
  
  console.log('✅ User logged in:', finalUserId, '| Role:', role || 'user');
  
  res.json({
    success: true,
    data: {
      userId: finalUserId,
      deviceId: finalDeviceId,
      sessionToken,
      name: user.name,
      message: 'Login successful'
    }
  });
});

// Create delivery (for tester)
app.post('/api/delivery/create', (req, res) => {
  console.log('📦 Create delivery request:', req.body);
  const { senderId, recipientId, description, pickupLocation, dropoffLocation } = req.body;
  
  const deliveryId = 'DEL-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();
  const verificationCode = Math.random().toString(36).substr(2, 6).toUpperCase();
  
  const delivery = {
    id: deliveryId,
    deliveryId: deliveryId,
    senderId: senderId || 'anonymous',
    recipientId: recipientId || null,
    description: description || 'Package',
    status: 'PENDING',
    verificationCode,
    pickupLocation: pickupLocation || { lat: -26.2041, lng: 28.0473 },
    dropoffLocation: dropoffLocation || { lat: -26.2050, lng: 28.0480 },
    currentLocation: pickupLocation || { lat: -26.2041, lng: 28.0473 },
    distance: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  deliveries.set(deliveryId, delivery);
  console.log('✅ Delivery created:', deliveryId, '| Code:', verificationCode);
  
  res.json({
    success: true,
    data: {
      deliveryId,
      verificationCode,
      status: delivery.status,
      message: 'Delivery created successfully'
    }
  });
});

// List all deliveries
app.get('/api/delivery/orders', (req, res) => {
  const allDeliveries = [
    ...Array.from(deliveries.values()),
    ...Array.from(activeDeliveries.values())
  ];
  
  res.json({
    success: true,
    data: {
      count: allDeliveries.length,
      deliveries: allDeliveries.map(d => ({
        orderId: d.orderId || d.id,
        status: d.status,
        pickupAddress: d.pickupAddress || 'Pickup location',
        deliveryAddress: d.deliveryAddress || 'Delivery location',
        packageDescription: d.packageDescription || '',
        recipientName: d.recipientName || '',
        distanceToCustomer: d.distanceToCustomer,
        eta: d.eta,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt || d.createdAt
      }))
    }
  });
});

// Get all deliveries (alias for frontend compatibility)
app.get('/api/deliveries', (req, res) => {
  const allDeliveries = [
    ...Array.from(deliveries.values()),
    ...Array.from(activeDeliveries.values())
  ];
  
  res.json({
    success: true,
    data: allDeliveries.map(d => ({
      orderId: d.orderId || d.id,
      id: d.orderId || d.id,
      status: d.status,
      pickupAddress: d.pickupAddress || 'Pickup location',
      deliveryAddress: d.deliveryAddress || 'Delivery location',
      packageDescription: d.packageDescription || '',
      recipientName: d.recipientName || '',
      customerId: d.customerId,
      deliveryPersonId: d.deliveryPersonId,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt
    }))
  });
});

// Get delivery by ID
app.get('/api/delivery/:id', (req, res) => {
  const deliveryId = req.params.id;
  console.log('🔍 Lookup delivery:', deliveryId);
  
  const delivery = deliveries.get(deliveryId);
  if (!delivery) {
    // Also check activeDeliveries from demo
    const demoDelivery = activeDeliveries.get(deliveryId);
    if (demoDelivery) {
      return res.json({
        success: true,
        data: {
          id: demoDelivery.orderId,
          status: demoDelivery.status,
          currentLocation: demoDelivery.currentLocation,
          distance: demoDelivery.distanceToCustomer,
          eta: demoDelivery.eta
        }
      });
    }
    return res.status(404).json({ success: false, message: 'Delivery not found' });
  }
  
  res.json({
    success: true,
    data: delivery
  });
});

// Verify delivery
app.post('/api/delivery/:id/verify', (req, res) => {
  const deliveryId = req.params.id;
  const { verificationCode, location, proximityData } = req.body;
  
  console.log('✅ Verify delivery:', deliveryId, '| Code:', verificationCode);
  
  const delivery = deliveries.get(deliveryId);
  if (!delivery) {
    return res.status(404).json({ success: false, message: 'Delivery not found' });
  }
  
  if (verificationCode && delivery.verificationCode !== verificationCode) {
    console.log('❌ Invalid code. Expected:', delivery.verificationCode, 'Got:', verificationCode);
    return res.status(400).json({ success: false, message: 'Invalid verification code' });
  }
  
  delivery.status = 'VERIFIED';
  delivery.verifiedAt = new Date().toISOString();
  delivery.verificationLocation = location || null;
  delivery.proximityData = proximityData || null;
  
  console.log('🎉 Delivery verified successfully:', deliveryId);
  
  res.json({
    success: true,
    data: {
      deliveryId,
      status: 'VERIFIED',
      verifiedAt: delivery.verifiedAt,
      message: 'Delivery verified successfully!'
    }
  });
});

// Delivery tracking routes
app.post('/api/delivery/orders', (req, res) => {
  const { 
    orderId: providedOrderId, 
    deliveryPersonId, 
    customerId, 
    customerLocation, 
    restaurantLocation, 
    estimatedDistance,
    pickupAddress,
    deliveryAddress,
    packageDescription,
    recipientName,
    recipientPhone,
    startLat,
    startLng,
    endLat,
    endLng
  } = req.body;

  // Generate orderId if not provided
  const orderId = providedOrderId || `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

  const delivery = {
    orderId,
    deliveryPersonId: deliveryPersonId || null,
    customerId,
    customerLocation: customerLocation || { lat: endLat, lng: endLng },
    restaurantLocation: restaurantLocation || { lat: startLat, lng: startLng },
    pickupAddress: pickupAddress || 'Pickup location',
    deliveryAddress: deliveryAddress || 'Delivery location',
    packageDescription: packageDescription || '',
    recipientName: recipientName || '',
    recipientPhone: recipientPhone || '',
    estimatedDistance: estimatedDistance || 5000,
    status: 'pending',  // Start as pending until driver accepts
    createdAt: new Date(),
    updatedAt: new Date(),
    locations: []
  };

  activeDeliveries.set(orderId, delivery);
  locationHistory.set(orderId, []);

  console.log(`📦 Delivery order created: ${orderId}`);
  res.status(201).json({
    success: true,
    data: { ...delivery, orderId },
    message: 'Delivery order created successfully'
  });
});

// Accept delivery (driver accepts an order)
app.post('/api/delivery/:orderId/accept', (req, res) => {
  const { orderId } = req.params;
  const { driverId } = req.body;

  const delivery = activeDeliveries.get(orderId);
  if (!delivery) {
    return res.status(404).json({
      success: false,
      message: 'Delivery order not found'
    });
  }

  if (delivery.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: 'Order already accepted or completed'
    });
  }

  delivery.deliveryPersonId = driverId;
  delivery.status = 'assigned';
  delivery.updatedAt = new Date();
  activeDeliveries.set(orderId, delivery);

  console.log(`✅ Driver ${driverId} accepted order: ${orderId}`);
  res.json({
    success: true,
    data: delivery,
    message: 'Order accepted successfully'
  });
});

app.post('/api/delivery/orders/:orderId/location', (req, res) => {
  const { orderId } = req.params;
  const { deliveryPersonId, latitude, longitude, accuracy, speed, heading, status: newStatus } = req.body;

  // Check both delivery stores
  let delivery = activeDeliveries.get(orderId) || deliveries.get(orderId);
  let deliveryStore = activeDeliveries.has(orderId) ? activeDeliveries : deliveries;
  
  if (!delivery) {
    return res.status(404).json({
      success: false,
      message: 'Delivery order not found'
    });
  }

  const location = {
    latitude,
    longitude,
    accuracy,
    speed,
    heading,
    timestamp: Date.now()
  };

  // Helper to get lat/lng from various formats
  const getLat = (loc) => loc?.latitude ?? loc?.lat ?? 0;
  const getLng = (loc) => loc?.longitude ?? loc?.lng ?? 0;

  // Get customer and restaurant locations
  const customerLoc = delivery.customerLocation || delivery.dropoffLocation;
  const restaurantLoc = delivery.restaurantLocation || delivery.pickupLocation;

  // Calculate distances
  const distanceToCustomer = calculateDistance(
    latitude,
    longitude,
    getLat(customerLoc),
    getLng(customerLoc)
  );

  const distanceToRestaurant = calculateDistance(
    latitude,
    longitude,
    getLat(restaurantLoc),
    getLng(restaurantLoc)
  );

  // Update status based on distances or explicit status
  let status = newStatus || delivery.status;
  if (status === 'assigned' && distanceToRestaurant < 100) {
    status = 'at_restaurant';
  } else if (status === 'at_restaurant' && distanceToRestaurant > 500) {
    status = 'picked_up';
  } else if (status === 'picked_up' && distanceToCustomer < 100) {
    status = 'arriving';
  }

  // Calculate ETA
  const speedMPS = speed || 10;
  const eta = Math.round(distanceToCustomer / speedMPS);

  // Update delivery
  delivery.currentLocation = location;
  delivery.distanceToCustomer = Math.round(distanceToCustomer);
  delivery.distanceToRestaurant = Math.round(distanceToRestaurant);
  delivery.status = status;
  delivery.eta = eta;
  delivery.updatedAt = new Date();

  // Store back in the correct store
  deliveryStore.set(orderId, delivery);

  // Store history
  const history = locationHistory.get(orderId) || [];
  history.push(location);
  if (history.length > 1000) history.shift();
  locationHistory.set(orderId, history);

  // Emit real-time update via Socket.io
  if (io) {
    io.to(`delivery-${orderId}`).emit('location-changed', {
      orderId,
      latitude,
      longitude,
      status,
      distanceToCustomer: delivery.distanceToCustomer,
      eta
    });
    io.emit('delivery:location-updated', {
      orderId,
      deliveryId: orderId,
      latitude,
      longitude,
      status,
      distanceToEnd: delivery.distanceToCustomer,
      eta
    });
  }

  console.log(`📍 Location update - ${orderId}: ${latitude}, ${longitude} | Status: ${status}`);
  res.status(200).json({
    success: true,
    data: {
      orderId,
      status,
      currentLocation: location,
      distanceToCustomer: delivery.distanceToCustomer,
      distanceToRestaurant: delivery.distanceToRestaurant,
      eta,
      message: `ETA to customer: ${Math.round(eta / 60)} minutes`
    }
  });
});

app.get('/api/delivery/orders/:orderId/track', (req, res) => {
  const { orderId } = req.params;

  // Check both delivery stores
  let delivery = activeDeliveries.get(orderId) || deliveries.get(orderId);
  if (!delivery) {
    return res.status(404).json({
      success: false,
      message: 'Delivery order not found'
    });
  }

  // Helper to convert lat/lng to latitude/longitude format
  const toLatLng = (loc) => {
    if (!loc) return null;
    return {
      latitude: loc.latitude ?? loc.lat,
      longitude: loc.longitude ?? loc.lng
    };
  };

  const currentLoc = toLatLng(delivery.currentLocation) || toLatLng(delivery.pickupLocation);

  res.status(200).json({
    success: true,
    data: {
      orderId: delivery.orderId || delivery.deliveryId,
      deliveryId: delivery.deliveryId || delivery.orderId,
      status: delivery.status,
      currentLocation: currentLoc,
      customerLocation: toLatLng(delivery.customerLocation) || toLatLng(delivery.dropoffLocation),
      restaurantLocation: toLatLng(delivery.restaurantLocation) || toLatLng(delivery.pickupLocation),
      pickupLocation: toLatLng(delivery.pickupLocation),
      dropoffLocation: toLatLng(delivery.dropoffLocation),
      distanceToCustomer: delivery.distanceToCustomer || delivery.distance || 0,
      distanceToRestaurant: delivery.distanceToRestaurant || 0,
      eta: delivery.eta || 0,
      createdAt: delivery.createdAt,
      updatedAt: delivery.updatedAt
    }
  });
});

app.get('/api/delivery/orders/:orderId/history', (req, res) => {
  const { orderId } = req.params;
  const limit = parseInt(req.query.limit) || 100;

  // Check both delivery stores
  const delivery = activeDeliveries.get(orderId) || deliveries.get(orderId);
  if (!delivery) {
    return res.status(404).json({
      success: false,
      message: 'Delivery order not found'
    });
  }

  const history = locationHistory.get(orderId) || [];
  const recentHistory = history.slice(-limit);

  res.status(200).json({
    success: true,
    data: {
      orderId,
      locations: recentHistory,
      totalPoints: history.length
    }
  });
});

app.put('/api/delivery/orders/:orderId/complete', (req, res) => {
  const { orderId } = req.params;
  const { deliveryPersonId, finalLocation } = req.body;

  const delivery = activeDeliveries.get(orderId);
  if (!delivery) {
    return res.status(404).json({
      success: false,
      message: 'Delivery order not found'
    });
  }

  delivery.status = 'completed';
  delivery.completedAt = new Date();
  delivery.finalLocation = finalLocation;

  console.log(`✅ Delivery completed: ${orderId}`);
  res.status(200).json({
    success: true,
    data: delivery,
    message: 'Delivery marked as completed'
  });
});

app.get('/api/delivery/active', (req, res) => {
  const deliveries = Array.from(activeDeliveries.values());

  res.status(200).json({
    success: true,
    data: {
      count: deliveries.length,
      deliveries: deliveries.map(d => ({
        orderId: d.orderId,
        status: d.status,
        distanceToCustomer: d.distanceToCustomer,
        eta: d.eta,
        updatedAt: d.updatedAt
      }))
    }
  });
});

// ==========================================
// SOLANA BLOCKCHAIN ROUTES (Development)
// ==========================================

let solanaService = null;
try {
  const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, LAMPORTS_PER_SOL, clusterApiUrl } = require('@solana/web3.js');
  const bs58 = require('bs58');
  const crypto = require('crypto');
  
  const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
  
  const network = process.env.SOLANA_NETWORK || 'devnet';
  const rpcUrl = process.env.SOLANA_RPC_URL || clusterApiUrl(network);
  const connection = new Connection(rpcUrl, 'confirmed');
  
  let wallet = null;
  const walletKey = process.env.SOLANA_WALLET_KEY;
  if (walletKey) {
    try {
      const secretKey = bs58.decode(walletKey);
      wallet = Keypair.fromSecretKey(secretKey);
      console.log(`✅ Solana wallet loaded: ${wallet.publicKey.toBase58()}`);
    } catch (e) {
      console.warn('⚠️ Invalid SOLANA_WALLET_KEY');
    }
  } else {
    console.log('⚠️ No SOLANA_WALLET_KEY - blockchain in read-only mode');
  }
  
  solanaService = {
    connection,
    wallet,
    network,
    isInitialized: () => wallet !== null,
    getWalletAddress: () => wallet ? wallet.publicKey.toBase58() : '',
    getNetwork: () => network,
    
    async getBalance() {
      if (!wallet) throw new Error('Wallet not initialized');
      const balance = await connection.getBalance(wallet.publicKey);
      return balance / LAMPORTS_PER_SOL;
    },
    
    generateWallet() {
      const keypair = Keypair.generate();
      return {
        publicKey: keypair.publicKey.toBase58(),
        privateKey: bs58.encode(keypair.secretKey)
      };
    },
    
    async requestAirdrop(amount = 1) {
      if (network !== 'devnet') throw new Error('Airdrop only on devnet');
      if (!wallet) throw new Error('Wallet not initialized');
      const lamports = Math.min(amount, 2) * LAMPORTS_PER_SOL;
      const sig = await connection.requestAirdrop(wallet.publicKey, lamports);
      await connection.confirmTransaction(sig, 'confirmed');
      return sig;
    },
    
    async mintNFT(req) {
      if (!wallet) throw new Error('Wallet not initialized');
      const timestamp = new Date();
      const hashData = `${req.deliveryId}:${req.userId}:${req.latitude}:${req.longitude}:${timestamp.toISOString()}`;
      const hash = crypto.createHash('sha256').update(hashData).digest('hex').substring(0, 16);
      
      const memoData = JSON.stringify({
        type: 'ProofOfPresence',
        version: '1.0',
        delivery: req.deliveryId,
        user: req.userId.substring(0, 8),
        lat: req.latitude.toFixed(6),
        lng: req.longitude.toFixed(6),
        time: Math.floor(timestamp.getTime() / 1000),
        hash
      });
      
      const memoInstruction = new TransactionInstruction({
        keys: [{ pubkey: wallet.publicKey, isSigner: true, isWritable: true }],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(memoData, 'utf-8')
      });
      
      const transaction = new Transaction().add(memoInstruction);
      const signature = await sendAndConfirmTransaction(connection, transaction, [wallet], { commitment: 'confirmed' });
      
      const cluster = network === 'mainnet-beta' ? '' : `?cluster=${network}`;
      return {
        id: req.deliveryId,
        mint: wallet.publicKey.toBase58(),
        txHash: signature,
        metadata: { name: 'Proof of Presence', symbol: 'POP', verifyHash: hash },
        network,
        explorerUrl: `https://explorer.solana.com/tx/${signature}${cluster}`,
        timestamp,
        status: 'confirmed'
      };
    },
    
    async verifyNFT(txSignature) {
      const status = await connection.getSignatureStatus(txSignature);
      return status?.value?.confirmationStatus === 'confirmed' || status?.value?.confirmationStatus === 'finalized';
    },
    
    async getTransactionHistory(limit = 20) {
      if (!wallet) throw new Error('Wallet not initialized');
      const sigs = await connection.getSignaturesForAddress(wallet.publicKey, { limit });
      return sigs.map(s => ({ signature: s.signature, slot: s.slot, status: s.err ? 'failed' : 'confirmed' }));
    }
  };

} catch (e) {
  console.log('⚠️ Solana SDK not available:', e.message);
}

// Blockchain status
app.get('/api/blockchain/status', async (req, res) => {
  if (!solanaService) {
    return res.status(503).json({ success: false, error: 'Blockchain service not available' });
  }
  
  const status = {
    initialized: solanaService.isInitialized(),
    network: solanaService.getNetwork(),
    walletAddress: solanaService.getWalletAddress()
  };
  
  if (status.initialized) {
    try { status.balanceSol = await solanaService.getBalance(); } catch (e) {}
  }
  
  res.json({ success: true, data: status });
});

// Generate wallet
app.get('/api/blockchain/generate-wallet', (req, res) => {
  if (!solanaService) {
    return res.status(503).json({ success: false, error: 'Blockchain service not available' });
  }
  
  const wallet = solanaService.generateWallet();
  res.json({
    success: true,
    data: wallet,
    warning: 'SAVE YOUR PRIVATE KEY SECURELY!',
    nextSteps: [
      '1. Add privateKey to .env as SOLANA_WALLET_KEY',
      '2. Request airdrop: POST /api/blockchain/airdrop',
      '3. Mint NFTs: POST /api/blockchain/mint-nft'
    ]
  });
});

// Get balance
app.get('/api/blockchain/balance', async (req, res) => {
  if (!solanaService?.isInitialized()) {
    return res.status(503).json({ success: false, error: 'Wallet not initialized' });
  }
  try {
    const balance = await solanaService.getBalance();
    res.json({ success: true, data: { wallet: solanaService.getWalletAddress(), balanceSol: balance, network: solanaService.getNetwork() } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Request airdrop
app.post('/api/blockchain/airdrop', async (req, res) => {
  if (!solanaService?.isInitialized()) {
    return res.status(503).json({ success: false, error: 'Wallet not initialized' });
  }
  try {
    const amount = Math.min(parseFloat(req.body.amount) || 1, 2);
    const signature = await solanaService.requestAirdrop(amount);
    res.json({ success: true, data: { amountSol: amount, signature, explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet` } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Mint NFT
app.post('/api/blockchain/mint-nft', async (req, res) => {
  if (!solanaService?.isInitialized()) {
    return res.status(503).json({ success: false, error: 'Wallet not initialized - configure SOLANA_WALLET_KEY' });
  }
  try {
    const { deliveryId, userId = 'test-user', latitude, longitude } = req.body;
    if (!deliveryId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, error: 'deliveryId, latitude, longitude required' });
    }
    const nft = await solanaService.mintNFT({ deliveryId, userId, latitude: parseFloat(latitude), longitude: parseFloat(longitude) });
    res.status(201).json({ success: true, message: 'Proof of Presence NFT minted!', data: nft });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Verify NFT
app.post('/api/blockchain/verify', async (req, res) => {
  if (!solanaService) {
    return res.status(503).json({ success: false, error: 'Blockchain service not available' });
  }
  try {
    const verified = await solanaService.verifyNFT(req.body.signature);
    res.json({ success: true, data: { signature: req.body.signature, verified, network: solanaService.getNetwork() } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Transaction history
app.get('/api/blockchain/transactions', async (req, res) => {
  if (!solanaService?.isInitialized()) {
    return res.status(503).json({ success: false, error: 'Wallet not initialized' });
  }
  try {
    const transactions = await solanaService.getTransactionHistory(parseInt(req.query.limit) || 20);
    res.json({ success: true, data: { wallet: solanaService.getWalletAddress(), network: solanaService.getNetwork(), transactions } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============== Bluetooth 6.0 Channel Sounding ==============
const bluetoothSessions = new Map();
const bluetoothDevices = new Map();

// Bluetooth status
app.get('/api/bluetooth/status', (req, res) => {
  res.json({
    success: true,
    data: {
      available: true,
      channelSoundingSupported: true,
      activeSessions: bluetoothSessions.size,
      connectedDevices: bluetoothDevices.size,
      pathLossExponents: {
        free_space: 2.0,
        outdoor: 2.5,
        indoor: 3.0,
        heavy_obstacles: 4.0
      }
    }
  });
});

// Create Bluetooth session
app.post('/api/bluetooth/session', (req, res) => {
  const { deliveryId, driverId, recipientId } = req.body;
  
  if (!deliveryId) {
    return res.status(400).json({ success: false, error: 'deliveryId required' });
  }
  
  const sessionId = 'bt-session-' + Date.now();
  const session = {
    sessionId,
    deliveryId,
    driverId: driverId || 'driver-' + Date.now(),
    recipientId: recipientId || 'recipient-' + Date.now(),
    status: 'active',
    rangingData: [],
    createdAt: new Date().toISOString()
  };
  
  bluetoothSessions.set(sessionId, session);
  console.log('🔵 Bluetooth session created:', sessionId);
  
  res.status(201).json({ success: true, data: session });
});

// Start Bluetooth discovery
app.post('/api/bluetooth/discovery/start', (req, res) => {
  const { sessionId } = req.body;
  console.log('🔍 Bluetooth discovery started for session:', sessionId);
  res.json({ success: true, message: 'Discovery started', sessionId });
});

// Stop Bluetooth discovery
app.post('/api/bluetooth/discovery/stop', (req, res) => {
  const { sessionId } = req.body;
  console.log('🔍 Bluetooth discovery stopped for session:', sessionId);
  res.json({ success: true, message: 'Discovery stopped', sessionId });
});

// Submit ranging data
app.post('/api/bluetooth/ranging', (req, res) => {
  const { sessionId, deviceId, rssi, txPower, measuredDistance, channelSoundingData } = req.body;
  
  const session = bluetoothSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  
  // Calculate distance using path loss model
  const pathLossExponent = 2.5; // outdoor default
  const calculatedDistance = Math.pow(10, ((txPower || -59) - rssi) / (10 * pathLossExponent));
  
  const rangingEntry = {
    deviceId,
    rssi,
    txPower: txPower || -59,
    calculatedDistance: calculatedDistance.toFixed(2),
    measuredDistance,
    channelSoundingData,
    timestamp: new Date().toISOString()
  };
  
  session.rangingData.push(rangingEntry);
  bluetoothSessions.set(sessionId, session);
  
  console.log(`📡 Bluetooth ranging: ${calculatedDistance.toFixed(2)}m (RSSI: ${rssi})`);
  
  res.json({
    success: true,
    data: {
      sessionId,
      deviceId,
      rssi,
      calculatedDistance: parseFloat(calculatedDistance.toFixed(2)),
      isInProximity: calculatedDistance < 50
    }
  });
});

// Get distance for device
app.get('/api/bluetooth/distance/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  
  // Find latest ranging data for device
  let latestDistance = null;
  for (const session of bluetoothSessions.values()) {
    const deviceData = session.rangingData.filter(r => r.deviceId === deviceId);
    if (deviceData.length > 0) {
      latestDistance = deviceData[deviceData.length - 1].calculatedDistance;
    }
  }
  
  res.json({
    success: true,
    data: {
      deviceId,
      distance: latestDistance ? parseFloat(latestDistance) : null,
      isInRange: latestDistance !== null
    }
  });
});

// Calculate distance from RSSI (utility endpoint)
app.post('/api/bluetooth/calculate-distance', (req, res) => {
  const { rssi, txPower = -59, environment = 'outdoor' } = req.body;
  
  const pathLossExponents = {
    free_space: 2.0,
    outdoor: 2.5,
    indoor: 3.0,
    heavy_obstacles: 4.0
  };
  
  const n = pathLossExponents[environment] || 2.5;
  const distance = Math.pow(10, (txPower - rssi) / (10 * n));
  
  res.json({
    success: true,
    data: {
      rssi,
      txPower,
      environment,
      pathLossExponent: n,
      distance: parseFloat(distance.toFixed(2)),
      unit: 'meters'
    }
  });
});

// Calibrate for device
app.post('/api/bluetooth/calibrate', (req, res) => {
  const { deviceId, knownDistance, measuredRssi, environment = 'outdoor' } = req.body;
  
  // Calculate optimal path loss exponent
  const txPower = -59;
  const calculatedN = (txPower - measuredRssi) / (10 * Math.log10(knownDistance));
  
  console.log(`⚙️ Calibration: Device ${deviceId}, Path loss exponent: ${calculatedN.toFixed(2)}`);
  
  res.json({
    success: true,
    data: {
      deviceId,
      knownDistance,
      measuredRssi,
      calibratedPathLossExponent: parseFloat(calculatedN.toFixed(2)),
      environment
    }
  });
});

// ============== UWB Ranging ==============
const uwbSessions = new Map();
const uwbDevices = new Map();

// UWB status
app.get('/api/uwb/status', (req, res) => {
  res.json({
    success: true,
    data: {
      available: true,
      activeSessions: uwbSessions.size,
      registeredDevices: uwbDevices.size,
      maxRange: 50,
      accuracy: '10cm'
    }
  });
});

// Register UWB device
app.post('/api/uwb/device/register', (req, res) => {
  const { deviceId, capabilities = {} } = req.body;
  
  if (!deviceId) {
    return res.status(400).json({ success: false, error: 'deviceId required' });
  }
  
  const device = {
    deviceId,
    capabilities: {
      hasUwb: true,
      hasAngleOfArrival: capabilities.hasAngleOfArrival || false,
      maxRangeMeters: capabilities.maxRangeMeters || 50,
      ...capabilities
    },
    registeredAt: new Date().toISOString()
  };
  
  uwbDevices.set(deviceId, device);
  console.log('📡 UWB device registered:', deviceId);
  
  res.status(201).json({ success: true, data: device });
});

// Create UWB session
app.post('/api/uwb/session', (req, res) => {
  const { deliveryId, driverDeviceId, recipientDeviceId } = req.body;
  
  const sessionId = 'uwb-session-' + Date.now();
  const session = {
    sessionId,
    deliveryId,
    driverDeviceId,
    recipientDeviceId,
    status: 'created',
    rangingData: [],
    createdAt: new Date().toISOString()
  };
  
  uwbSessions.set(sessionId, session);
  console.log('📡 UWB session created:', sessionId);
  
  res.status(201).json({ success: true, data: session });
});

// Start UWB session
app.post('/api/uwb/session/:sessionId/start', (req, res) => {
  const { sessionId } = req.params;
  const session = uwbSessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  
  session.status = 'active';
  uwbSessions.set(sessionId, session);
  
  res.json({ success: true, data: session });
});

// Submit UWB ranging data
app.post('/api/uwb/ranging', (req, res) => {
  const { sessionId, deviceId, distance, azimuth, elevation, confidence } = req.body;
  
  const session = uwbSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  
  const rangingEntry = {
    deviceId,
    distance: parseFloat(distance),
    azimuth: azimuth || 0,
    elevation: elevation || 0,
    confidence: confidence || 0.95,
    timestamp: new Date().toISOString()
  };
  
  session.rangingData.push(rangingEntry);
  uwbSessions.set(sessionId, session);
  
  console.log(`📡 UWB ranging: ${distance}m (azimuth: ${azimuth || 0}°)`);
  
  res.json({
    success: true,
    data: {
      sessionId,
      ...rangingEntry,
      isCloseProximity: distance < 3
    }
  });
});

// Get UWB distance
app.get('/api/uwb/distance/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = uwbSessions.get(sessionId);
  
  if (!session || session.rangingData.length === 0) {
    return res.json({ success: true, data: { distance: null } });
  }
  
  const latest = session.rangingData[session.rangingData.length - 1];
  res.json({
    success: true,
    data: {
      sessionId,
      distance: latest.distance,
      azimuth: latest.azimuth,
      elevation: latest.elevation,
      isCloseProximity: latest.distance < 3
    }
  });
});

// ============== NFC Verification ==============
const nfcSessions = new Map();
const crypto = require('crypto');

// NFC status
app.get('/api/nfc/status', (req, res) => {
  res.json({
    success: true,
    data: {
      available: true,
      activeSessions: nfcSessions.size,
      proofOfPresenceEnabled: true
    }
  });
});

// Create NFC session
app.post('/api/nfc/session', (req, res) => {
  const { deliveryId, driverId, recipientId } = req.body;
  
  if (!deliveryId) {
    return res.status(400).json({ success: false, error: 'deliveryId required' });
  }
  
  const sessionId = 'nfc-session-' + Date.now();
  const verificationCode = Math.random().toString().slice(2, 8); // 6-digit code
  
  const session = {
    sessionId,
    deliveryId,
    driverId: driverId || 'driver-' + Date.now(),
    recipientId: recipientId || 'recipient-' + Date.now(),
    verificationCode,
    status: 'pending',
    verified: false,
    createdAt: new Date().toISOString()
  };
  
  nfcSessions.set(sessionId, session);
  console.log('📱 NFC session created:', sessionId, '| Code:', verificationCode);
  
  res.status(201).json({ success: true, data: session });
});

// Prepare for NFC verification
app.post('/api/nfc/session/:sessionId/prepare', (req, res) => {
  const { sessionId } = req.params;
  const session = nfcSessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  
  session.status = 'ready';
  nfcSessions.set(sessionId, session);
  
  res.json({
    success: true,
    data: {
      sessionId,
      status: 'ready',
      verificationCode: session.verificationCode,
      message: 'Ready for NFC tap'
    }
  });
});

// Verify NFC tap and create Proof of Presence
app.post('/api/nfc/verify', (req, res) => {
  const { sessionId, nfcData, deviceId, location } = req.body;
  
  const session = nfcSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  
  // Generate Proof of Presence hash
  const proofData = {
    deliveryId: session.deliveryId,
    driverId: session.driverId,
    recipientId: session.recipientId,
    deviceId: deviceId || 'unknown',
    location: location || { latitude: 0, longitude: 0 },
    timestamp: new Date().toISOString(),
    verificationCode: session.verificationCode
  };
  
  const proofHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(proofData))
    .digest('hex');
  
  // Sign the proof
  const signature = crypto
    .createHmac('sha256', process.env.NFC_SIGNING_SECRET || 'flicker-nfc-secret')
    .update(proofHash)
    .digest('hex');
  
  session.verified = true;
  session.status = 'verified';
  session.proofOfPresence = {
    hash: proofHash,
    signature,
    timestamp: proofData.timestamp,
    location: proofData.location
  };
  session.verifiedAt = new Date().toISOString();
  
  nfcSessions.set(sessionId, session);
  console.log('✅ NFC verified! Proof of Presence:', proofHash.slice(0, 16) + '...');
  
  res.json({
    success: true,
    data: {
      sessionId,
      deliveryId: session.deliveryId,
      verified: true,
      proofOfPresence: session.proofOfPresence,
      message: 'Delivery verified with Proof of Presence'
    }
  });
});

// Get NFC session status
app.get('/api/nfc/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = nfcSessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  
  res.json({ success: true, data: session });
});

// Check if delivery is verified
app.get('/api/nfc/delivery/:deliveryId/verified', (req, res) => {
  const { deliveryId } = req.params;
  
  let verified = false;
  let proofOfPresence = null;
  
  for (const session of nfcSessions.values()) {
    if (session.deliveryId === deliveryId && session.verified) {
      verified = true;
      proofOfPresence = session.proofOfPresence;
      break;
    }
  }
  
  res.json({
    success: true,
    data: {
      deliveryId,
      verified,
      proofOfPresence
    }
  });
});

// Generate signature for mobile client
app.post('/api/nfc/signature', (req, res) => {
  const { data } = req.body;
  
  const signature = crypto
    .createHmac('sha256', process.env.NFC_SIGNING_SECRET || 'flicker-nfc-secret')
    .update(JSON.stringify(data))
    .digest('hex');
  
  res.json({
    success: true,
    data: {
      signature,
      timestamp: new Date().toISOString()
    }
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log('');
  console.log('FlickerSecure Backend API running on http://localhost:5000');
  console.log('Frontend: http://localhost:3000');
  console.log('Socket.IO: ' + (io ? 'enabled' : 'disabled'));
  console.log('Blockchain: ' + (solanaService ? `Solana ${solanaService.getNetwork()}` : 'disabled'));
  console.log('Bluetooth 6.0: enabled (Channel Sounding)');
  console.log('UWB: enabled (cm-accurate ranging)');
  console.log('NFC: enabled (Proof of Presence)');
  console.log('Demo delivery: sample-order-123 (auto-updating)');
  console.log('');
});


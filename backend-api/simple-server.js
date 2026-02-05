const express = require('express');
const app = express();

app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// In-memory storage for deliveries
const activeDeliveries = new Map();
const locationHistory = new Map();

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

// Auth routes
app.post('/api/auth/register', (req, res) => {
  console.log('Register request:', req.body);
  res.json({
    success: true,
    data: {
      userId: 'user-' + Date.now(),
      deviceId: req.body.deviceId,
      message: 'Registered'
    }
  });
});

app.post('/api/auth/login', (req, res) => {
  console.log('Login request:', req.body);
  res.json({
    success: true,
    data: {
      userId: req.body.userId,
      deviceId: req.body.deviceId,
      sessionToken: 'token-' + Date.now(),
      message: 'Logged in'
    }
  });
});

// Delivery tracking routes
app.post('/api/delivery/orders', (req, res) => {
  const { orderId, deliveryPersonId, customerId, customerLocation, restaurantLocation, estimatedDistance } = req.body;

  const delivery = {
    orderId,
    deliveryPersonId,
    customerId,
    customerLocation,
    restaurantLocation,
    estimatedDistance,
    status: 'assigned',
    createdAt: new Date(),
    updatedAt: new Date(),
    locations: []
  };

  activeDeliveries.set(orderId, delivery);
  locationHistory.set(orderId, []);

  console.log(`📦 Delivery order created: ${orderId}`);
  res.status(201).json({
    success: true,
    data: delivery,
    message: 'Delivery order created successfully'
  });
});

app.post('/api/delivery/orders/:orderId/location', (req, res) => {
  const { orderId } = req.params;
  const { deliveryPersonId, latitude, longitude, accuracy, speed, heading } = req.body;

  const delivery = activeDeliveries.get(orderId);
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

  // Calculate distances
  const distanceToCustomer = calculateDistance(
    latitude,
    longitude,
    delivery.customerLocation.latitude,
    delivery.customerLocation.longitude
  );

  const distanceToRestaurant = calculateDistance(
    latitude,
    longitude,
    delivery.restaurantLocation.latitude,
    delivery.restaurantLocation.longitude
  );

  // Update status based on distances
  let status = delivery.status;
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

  // Store history
  const history = locationHistory.get(orderId) || [];
  history.push(location);
  if (history.length > 1000) history.shift();
  locationHistory.set(orderId, history);

  console.log(`📍 Location update - ${orderId}: ${latitude}, ${longitude}`);
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

  const delivery = activeDeliveries.get(orderId);
  if (!delivery) {
    return res.status(404).json({
      success: false,
      message: 'Delivery order not found'
    });
  }

  res.status(200).json({
    success: true,
    data: {
      orderId: delivery.orderId,
      status: delivery.status,
      currentLocation: delivery.currentLocation,
      customerLocation: delivery.customerLocation,
      restaurantLocation: delivery.restaurantLocation,
      distanceToCustomer: delivery.distanceToCustomer,
      distanceToRestaurant: delivery.distanceToRestaurant,
      eta: delivery.eta,
      createdAt: delivery.createdAt,
      updatedAt: delivery.updatedAt
    }
  });
});

app.get('/api/delivery/orders/:orderId/history', (req, res) => {
  const { orderId } = req.params;
  const limit = parseInt(req.query.limit) || 100;

  const delivery = activeDeliveries.get(orderId);
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

const PORT = 5000;
app.listen(PORT, () => {
  console.log('');
  console.log('✅ Mock Backend API running on http://localhost:5000');
  console.log('   Frontend: http://localhost:3000');
  console.log('');
  console.log('📦 Delivery tracking endpoints ready:');
  console.log('   POST   /api/delivery/orders');
  console.log('   POST   /api/delivery/orders/:orderId/location');
  console.log('   GET    /api/delivery/orders/:orderId/track');
  console.log('   GET    /api/delivery/orders/:orderId/history');
  console.log('   PUT    /api/delivery/orders/:orderId/complete');
  console.log('   GET    /api/delivery/active');
  console.log('');
});

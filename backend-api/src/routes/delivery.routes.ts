/**
 * DeliveryTracking routes - Real-time location tracking for deliveries
 * Handles order delivery tracking, location updates, and ETA calculations
 * Optimized for Uber Eats style delivery system
 */

import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';

const router = Router();

// In-memory storage for active deliveries (replace with database in production)
const activeDeliveries = new Map<string, any>();
const locationHistory = new Map<string, any[]>();

/**
 * Get all deliveries (for driver portal)
 * GET /api/delivery/list
 */
router.get('/list', async (req: Request, res: Response) => {
  try {
    const deliveries = Array.from(activeDeliveries.values());
    return res.json({
      success: true,
      data: deliveries
    });
  } catch (error) {
    console.error('Error listing deliveries:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to list deliveries'
    });
  }
});

/**
 * Get active deliveries
 * GET /api/delivery/active
 */
router.get('/active', async (req: Request, res: Response) => {
  try {
    const deliveries = Array.from(activeDeliveries.values())
      .filter((d: any) => d.status !== 'delivered' && d.status !== 'cancelled');
    return res.json({
      success: true,
      data: { deliveries }
    });
  } catch (error) {
    console.error('Error listing active deliveries:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to list active deliveries'
    });
  }
});

/**
 * Create a new delivery order and start tracking
 * POST /api/delivery/orders
 * Simplified endpoint for web dashboard
 */
router.post('/orders', [
  body('customerId').notEmpty().withMessage('Customer ID is required'),
  body('pickupAddress').notEmpty().withMessage('Pickup address is required'),
  body('deliveryAddress').notEmpty().withMessage('Delivery address is required'),
  body('recipientName').notEmpty().withMessage('Recipient name is required'),
  body('recipientPhone').notEmpty().withMessage('Recipient phone is required')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      customerId,
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

    // Generate unique order ID
    const orderId = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const delivery = {
      orderId,
      customerId,
      pickupAddress,
      deliveryAddress,
      packageDescription: packageDescription || 'Package',
      recipientName,
      recipientPhone,
      pickupLocation: {
        latitude: startLat || -26.2041,
        longitude: startLng || 28.0473
      },
      deliveryLocation: {
        latitude: endLat || -26.1952,
        longitude: endLng || 28.0342
      },
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      driverId: null,
      locations: []
    };

    activeDeliveries.set(orderId, delivery);
    locationHistory.set(orderId, []);

    console.log('Order created successfully:', orderId);

    return res.status(201).json({
      success: true,
      data: delivery,
      message: 'Delivery order created successfully'
    });
  } catch (error) {
    console.error('Error creating delivery:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create delivery order'
    });
  }
});

/**
 * Update delivery location in real-time
 * POST /api/delivery/orders/:orderId/location
 * This is called frequently (every 5-10 seconds) by delivery app
 */
router.post('/orders/:orderId/location', [
  param('orderId').notEmpty(),
  body('deliveryPersonId').isUUID().notEmpty(),
  body('latitude').isFloat({ min: -90, max: 90 }),
  body('longitude').isFloat({ min: -180, max: 180 }),
  body('accuracy').isInt({ min: 0 }).optional(),
  body('speed').isFloat({ min: 0 }).optional(),
  body('heading').isFloat({ min: 0, max: 360 }).optional()
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { orderId } = req.params;
    const {
      deliveryPersonId,
      latitude,
      longitude,
      accuracy,
      speed,
      heading
    } = req.body;

    const delivery = activeDeliveries.get(orderId);
    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery order not found'
      });
    }

    if (delivery.deliveryPersonId !== deliveryPersonId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to update this delivery'
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

    // Update delivery status based on distances
    let status = delivery.status;
    if (status === 'assigned' && distanceToRestaurant < 100) {
      status = 'at_restaurant';
    } else if (status === 'at_restaurant' && distanceToRestaurant > 500) {
      status = 'picked_up';
    } else if (status === 'picked_up' && distanceToCustomer < 100) {
      status = 'arriving';
    }

    // Calculate ETA
    const speedMPS = speed || 10; // Default to 10 m/s if no speed data
    const eta = Math.round(distanceToCustomer / speedMPS);

    // Update delivery record
    delivery.currentLocation = location;
    delivery.distanceToCustomer = Math.round(distanceToCustomer);
    delivery.distanceToRestaurant = Math.round(distanceToRestaurant);
    delivery.status = status;
    delivery.eta = eta;
    delivery.updatedAt = new Date();

    // Store location history (keep last 1000 points)
    const history = locationHistory.get(orderId) || [];
    history.push(location);
    if (history.length > 1000) {
      history.shift();
    }
    locationHistory.set(orderId, history);

    return res.status(200).json({
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
  } catch (error) {
    console.error('Error updating delivery location:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update delivery location'
    });
  }
});

/**
 * Get real-time delivery tracking info
 * GET /api/delivery/orders/:orderId/track
 */
router.get('/orders/:orderId/track', [
  param('orderId').notEmpty()
], async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const delivery = activeDeliveries.get(orderId);
    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery order not found'
      });
    }

    return res.status(200).json({
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
  } catch (error) {
    console.error('Error fetching delivery tracking:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch delivery tracking'
    });
  }
});

/**
 * Get delivery location history
 * GET /api/delivery/orders/:orderId/history
 */
router.get('/orders/:orderId/history', [
  param('orderId').notEmpty(),
  body('limit').isInt({ min: 1, max: 1000 }).optional()
], async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;

    const delivery = activeDeliveries.get(orderId);
    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery order not found'
      });
    }

    const history = locationHistory.get(orderId) || [];
    const recentHistory = history.slice(-limit);

    return res.status(200).json({
      success: true,
      data: {
        orderId,
        locations: recentHistory,
        totalPoints: history.length
      }
    });
  } catch (error) {
    console.error('Error fetching location history:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch location history'
    });
  }
});

/**
 * Mark delivery as complete
 * PUT /api/delivery/orders/:orderId/complete
 */
router.put('/orders/:orderId/complete', [
  param('orderId').notEmpty(),
  body('deliveryPersonId').isUUID().notEmpty(),
  body('finalLocation.latitude').isFloat({ min: -90, max: 90 }),
  body('finalLocation.longitude').isFloat({ min: -180, max: 180 })
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { orderId } = req.params;
    const { deliveryPersonId, finalLocation } = req.body;

    const delivery = activeDeliveries.get(orderId);
    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery order not found'
      });
    }

    if (delivery.deliveryPersonId !== deliveryPersonId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to complete this delivery'
      });
    }

    delivery.status = 'completed';
    delivery.completedAt = new Date();
    delivery.finalLocation = finalLocation;

    return res.status(200).json({
      success: true,
      data: delivery,
      message: 'Delivery marked as completed'
    });
  } catch (error) {
    console.error('Error completing delivery:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to complete delivery'
    });
  }
});

/**
 * Get all active deliveries (admin/monitoring)
 * GET /api/delivery/active
 */
router.get('/active', async (req: Request, res: Response) => {
  try {
    const deliveries = Array.from(activeDeliveries.values());

    return res.status(200).json({
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
  } catch (error) {
    console.error('Error fetching active deliveries:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch active deliveries'
    });
  }
});

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
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

  return R * c; // Distance in meters
}

export default router;

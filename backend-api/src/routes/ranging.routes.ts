/**
 * Ranging Routes - Real-time "Find Me" feature for driver-customer navigation
 * Uses GPS for web, UWB/Bluetooth for mobile
 * Enables driver to see direction and distance to customer
 */

import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { activeDeliveries, customerBeacons, activeRangingSessions, addGPSReading, clearGPSHistory } from '../data/store';

const router = Router();

// CustomerBeacon and RangingSession interfaces (data stored in shared store)
interface CustomerBeacon {
  customerId: string;
  orderId: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy: number;
  heading?: number;
  locationType: 'live' | 'fixed'; // Customer location sharing mode
  verificationCode: string; // 4-digit code for driver to verify they found the right customer
  indoorDetails?: {
    building?: string;
    floor?: string;
    section?: string;
    landmark?: string;
  };
  status: 'waiting' | 'found' | 'completed';
  lastUpdate: Date;
  createdAt: Date;
}

// Generate random 4-digit verification code
function generateVerificationCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

interface RangingSession {
  sessionId: string;
  orderId: string;
  customerId: string;
  driverId: string;
  customerLocation: {
    latitude: number;
    longitude: number;
    altitude?: number;
    accuracy: number;
  };
  driverLocation: {
    latitude: number;
    longitude: number;
    altitude?: number;
    heading?: number;
    speed?: number;
    accuracy: number;
  };
  distance: number;
  bearing: number;
  status: 'active' | 'approaching' | 'arrived' | 'completed';
  createdAt: Date;
  lastUpdate: Date;
}

// Helper function to calculate distance between two GPS points (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper function to calculate bearing (direction) from point A to point B
function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  bearing = (bearing + 360) % 360; // Normalize to 0-360
  return bearing;
}

// Get direction text from bearing
function getDirectionFromBearing(bearing: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
}

// Get arrow emoji from bearing
function getArrowFromBearing(bearing: number): string {
  const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  const index = Math.round(bearing / 45) % 8;
  return arrows[index];
}

/**
 * GPS Smoothing is now handled in data/store.ts via addGPSReading()
 * This removes jitter and provides stable coordinates
 */

/**
 * Debug endpoint - check active beacons
 * GET /api/ranging/debug/beacons
 */
router.get('/debug/beacons', (_req: Request, res: Response): void => {
  const beacons: any[] = [];
  customerBeacons.forEach((beacon, orderId) => {
    beacons.push({
      orderId,
      customerId: beacon.customerId,
      status: beacon.status,
      lastUpdate: beacon.lastUpdate,
      location: { lat: beacon.latitude, lng: beacon.longitude }
    });
  });
  
  res.json({
    success: true,
    activeBeacons: beacons.length,
    beacons,
    activeSessions: activeRangingSessions.size,
    serverStartedAt: new Date(Date.now() - process.uptime() * 1000).toISOString()
  });
});

/**
 * Customer starts "I'm waiting" beacon
 * POST /api/ranging/beacon/start
 */
router.post('/beacon/start', [
  body('customerId').notEmpty(),
  body('orderId').notEmpty(),
  body('latitude').isFloat({ min: -90, max: 90 }),
  body('longitude').isFloat({ min: -180, max: 180 })
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { customerId, orderId, latitude, longitude, altitude, accuracy, indoorDetails, locationType } = req.body;

    // Generate 4-digit verification code
    const verificationCode = generateVerificationCode();

    const beacon: CustomerBeacon = {
      customerId,
      orderId,
      latitude,
      longitude,
      altitude,
      accuracy: accuracy || 10,
      locationType: locationType || 'fixed', // Default to fixed for stability
      verificationCode,
      indoorDetails,
      status: 'waiting',
      lastUpdate: new Date(),
      createdAt: new Date()
    };

    customerBeacons.set(orderId, beacon);

    // Emit via Socket.IO if available
    const io = (req as any).io;
    if (io) {
      io.to(`delivery:${orderId}`).emit('customer:beacon-started', {
        orderId,
        customerId,
        latitude,
        longitude,
        message: 'Customer is waiting for delivery'
      });
    }

    console.log(`Customer beacon started for order ${orderId} with code ${verificationCode}`);

    return res.status(201).json({
      success: true,
      data: {
        orderId,
        status: 'waiting',
        verificationCode, // Send code to customer to show driver
        message: 'Your location is now visible to the driver'
      }
    });
  } catch (error) {
    console.error('Error starting beacon:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to start beacon'
    });
  }
});

/**
 * Customer updates their location (called every 3-5 seconds)
 * POST /api/ranging/beacon/update
 * Now uses GPS smoothing to reduce jitter
 */
router.post('/beacon/update', [
  body('orderId').notEmpty(),
  body('latitude').isFloat({ min: -90, max: 90 }),
  body('longitude').isFloat({ min: -180, max: 180 })
], async (req: Request, res: Response): Promise<any> => {
  try {
    const { orderId, latitude, longitude, altitude, accuracy, heading, indoorDetails } = req.body;

    const beacon = customerBeacons.get(orderId);
    if (!beacon) {
      return res.status(404).json({
        success: false,
        message: 'Beacon not found. Please start a new beacon.'
      });
    }

    // Apply GPS smoothing to reduce jitter
    const smoothed = addGPSReading(
      `customer:${orderId}`, 
      latitude, 
      longitude, 
      accuracy || 10
    );

    // If stationary, use smoothed position; if moving, use raw GPS
    const finalLat = smoothed.isStationary ? smoothed.latitude : latitude;
    const finalLon = smoothed.isStationary ? smoothed.longitude : longitude;

    // Update beacon location with smoothed/raw coordinates
    beacon.latitude = finalLat;
    beacon.longitude = finalLon;
    beacon.altitude = altitude;
    beacon.accuracy = smoothed.smoothedAccuracy;
    beacon.heading = heading;
    beacon.isStationary = smoothed.isStationary; // Track if customer is standing still
    beacon.indoorDetails = indoorDetails || beacon.indoorDetails;
    beacon.lastUpdate = new Date();

    customerBeacons.set(orderId, beacon);

    // Emit via Socket.IO
    const io = (req as any).io;
    if (io) {
      io.to(`delivery:${orderId}`).emit('customer:location-updated', {
        orderId,
        latitude: finalLat,
        longitude: finalLon,
        rawLatitude: latitude, // Send raw for debugging
        rawLongitude: longitude,
        altitude,
        heading,
        isStationary: smoothed.isStationary,
        timestamp: new Date().toISOString()
      });
    }

    return res.json({
      success: true,
      message: 'Location updated',
      isStationary: smoothed.isStationary
    });
  } catch (error) {
    console.error('Error updating beacon:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update location'
    });
  }
});

/**
 * Driver starts tracking customer
 * POST /api/ranging/track/start
 */
router.post('/track/start', [
  body('driverId').notEmpty(),
  body('orderId').notEmpty(),
  body('latitude').isFloat({ min: -90, max: 90 }),
  body('longitude').isFloat({ min: -180, max: 180 })
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { driverId, orderId, latitude, longitude, heading, speed, accuracy } = req.body;

    // Check if customer beacon exists, otherwise try delivery location as fallback
    let beacon = customerBeacons.get(orderId);
    let usingDeliveryFallback = false;
    
    if (!beacon) {
      // Try to get customer location from the delivery order (fallback for network issues)
      const delivery = activeDeliveries.get(orderId);
      if (delivery && delivery.deliveryLocation) {
        // Create a temporary beacon from delivery location
        beacon = {
          customerId: delivery.customerId || 'unknown',
          orderId,
          latitude: delivery.deliveryLocation.latitude,
          longitude: delivery.deliveryLocation.longitude,
          accuracy: 50, // Lower accuracy since it's from order address
          locationType: 'fixed' as const,
          status: 'waiting' as const,
          lastUpdate: new Date(),
          createdAt: new Date()
        };
        usingDeliveryFallback = true;
        console.log(`Using delivery address as fallback for order ${orderId}`);
      } else {
        return res.status(404).json({
          success: false,
          message: 'No location available. Customer hasn\'t shared location and no delivery address found.',
          hint: 'Ask the customer to tap "Share My Location" or ensure the order has a delivery address.',
          orderId,
          activeBeacons: customerBeacons.size,
          debugUrl: '/api/ranging/debug/beacons'
        });
      }
    }

    // Calculate distance and bearing
    const distance = calculateDistance(latitude, longitude, beacon.latitude, beacon.longitude);
    const bearing = calculateBearing(latitude, longitude, beacon.latitude, beacon.longitude);

    const sessionId = `RS-${Date.now().toString(36)}`;
    
    const session: RangingSession = {
      sessionId,
      orderId,
      customerId: beacon.customerId,
      driverId,
      customerLocation: {
        latitude: beacon.latitude,
        longitude: beacon.longitude,
        altitude: beacon.altitude,
        accuracy: beacon.accuracy
      },
      driverLocation: {
        latitude,
        longitude,
        heading,
        speed,
        accuracy: accuracy || 10
      },
      distance,
      bearing,
      status: distance < 50 ? 'approaching' : 'active',
      createdAt: new Date(),
      lastUpdate: new Date()
    };

    activeRangingSessions.set(sessionId, session);

    // Join socket room
    const io = (req as any).io;
    if (io) {
      io.to(`delivery:${orderId}`).emit('driver:tracking-started', {
        orderId,
        driverId,
        distance,
        bearing,
        direction: getDirectionFromBearing(bearing),
        arrow: getArrowFromBearing(bearing)
      });
    }

    console.log(`Driver tracking started for order ${orderId}, distance: ${distance.toFixed(1)}m${usingDeliveryFallback ? ' (using delivery address)' : ''}`);

    return res.status(201).json({
      success: true,
      data: {
        sessionId,
        customerId: beacon.customerId,
        customerLocation: {
          latitude: beacon.latitude,
          longitude: beacon.longitude,
          indoorDetails: beacon.indoorDetails,
          locationType: beacon.locationType, // Tell driver if customer uses live or fixed
          isDeliveryFallback: usingDeliveryFallback // True if using order address instead of live sharing
        },
        distance: Math.round(distance),
        bearing: Math.round(bearing),
        direction: getDirectionFromBearing(bearing),
        arrow: getArrowFromBearing(bearing),
        status: session.status,
        note: usingDeliveryFallback ? 'Using delivery address (customer not sharing live location)' : undefined
      }
    });
  } catch (error) {
    console.error('Error starting tracking:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to start tracking'
    });
  }
});

/**
 * Driver updates their position and gets new direction
 * POST /api/ranging/track/update
 * Now uses GPS smoothing for both driver and customer positions
 */
router.post('/track/update', [
  body('sessionId').notEmpty(),
  body('latitude').isFloat({ min: -90, max: 90 }),
  body('longitude').isFloat({ min: -180, max: 180 })
], async (req: Request, res: Response): Promise<any> => {
  try {
    const { sessionId, latitude, longitude, heading, speed, accuracy } = req.body;

    const session = activeRangingSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Tracking session not found'
      });
    }

    // Get latest customer location - try beacon first, then delivery fallback
    let beacon = customerBeacons.get(session.orderId);
    let usingDeliveryFallback = false;
    
    if (!beacon) {
      // Try to use delivery location as fallback
      const delivery = activeDeliveries.get(session.orderId);
      if (delivery && delivery.deliveryLocation) {
        beacon = {
          customerId: delivery.customerId || session.customerId,
          orderId: session.orderId,
          latitude: delivery.deliveryLocation.latitude,
          longitude: delivery.deliveryLocation.longitude,
          accuracy: 50,
          locationType: 'fixed' as const,
          status: 'waiting' as const,
          lastUpdate: new Date(),
          createdAt: new Date()
        };
        usingDeliveryFallback = true;
      } else {
        return res.status(404).json({
          success: false,
          message: 'Customer stopped sharing and no delivery address available'
        });
      }
    }

    // Apply GPS smoothing to DRIVER position (reduces jitter when standing still)
    const smoothedDriver = addGPSReading(
      `driver:${sessionId}`,
      latitude,
      longitude,
      accuracy || 10
    );

    // Use smoothed position if driver is stationary, raw if moving
    const driverLat = smoothedDriver.isStationary ? smoothedDriver.latitude : latitude;
    const driverLon = smoothedDriver.isStationary ? smoothedDriver.longitude : longitude;

    // Update customer location in session (already smoothed in beacon/update)
    session.customerLocation = {
      latitude: beacon.latitude,
      longitude: beacon.longitude,
      altitude: beacon.altitude,
      accuracy: beacon.accuracy
    };

    // Update driver location with smoothed coords
    session.driverLocation = {
      latitude: driverLat,
      longitude: driverLon,
      rawLatitude: latitude,  // Keep raw for debugging
      rawLongitude: longitude,
      heading,
      speed,
      accuracy: smoothedDriver.smoothedAccuracy,
      isStationary: smoothedDriver.isStationary
    };

    // Calculate distance using SMOOTHED positions (both already processed)
    const distance = calculateDistance(driverLat, driverLon, beacon.latitude, beacon.longitude);
    const bearing = calculateBearing(driverLat, driverLon, beacon.latitude, beacon.longitude);

    session.distance = distance;
    session.bearing = bearing;
    session.lastUpdate = new Date();

    // Calculate combined GPS accuracy (both driver and customer)
    const driverAccuracy = smoothedDriver.smoothedAccuracy;
    const customerAccuracy = beacon.accuracy || 15;
    const combinedAccuracy = driverAccuracy + customerAccuracy;
    
    // GPS REALITY CHECK:
    // Browser GPS is typically ±5-50m accuracy
    // With smoothing, we can achieve ±3-15m typically
    
    // Dynamic thresholds based on accuracy:
    // - Minimum arrival threshold = 2m (if both have excellent GPS)
    // - Maximum arrival threshold = combinedAccuracy * 0.3 (scaled to accuracy)
    const arrivalThreshold = Math.max(2, Math.min(combinedAccuracy * 0.3, 15));
    const approachingThreshold = Math.max(10, combinedAccuracy * 0.5);
    
    // Log for debugging
    console.log(`[RANGING] Order: ${session.orderId}`);
    console.log(`  Driver GPS: ${driverLat.toFixed(6)}, ${driverLon.toFixed(6)} (±${driverAccuracy.toFixed(1)}m)${smoothedDriver.isStationary ? ' [STATIONARY]' : ''}`);
    console.log(`  Customer GPS: ${beacon.latitude.toFixed(6)}, ${beacon.longitude.toFixed(6)} (±${customerAccuracy}m)${beacon.isStationary ? ' [STATIONARY]' : ''}`);
    console.log(`  Distance: ${distance.toFixed(1)}m | Thresholds: arrive=${arrivalThreshold.toFixed(0)}m, approaching=${approachingThreshold.toFixed(0)}m`);
    
    // Update status based on distance WITH GPS accuracy consideration
    if (distance <= arrivalThreshold) {
      session.status = 'arrived';
    } else if (distance <= approachingThreshold) {
      session.status = 'approaching';  // Within approaching threshold
    } else {
      session.status = 'active';
    }

    activeRangingSessions.set(sessionId, session);

    // Emit via Socket.IO - show decimal for precision when close
    const io = (req as any).io;
    if (io) {
      io.to(`delivery:${session.orderId}`).emit('ranging:updated', {
        orderId: session.orderId,
        driverLatitude: driverLat,
        driverLongitude: driverLon,
        customerLatitude: beacon.latitude,
        customerLongitude: beacon.longitude,
        distance: distance <= 10 ? parseFloat(distance.toFixed(1)) : Math.round(distance),
        bearing: Math.round(bearing),
        direction: getDirectionFromBearing(bearing),
        arrow: getArrowFromBearing(bearing),
        status: session.status,
        eta: Math.ceil(distance / 1.4), // Seconds at walking speed
        accuracy: combinedAccuracy,
        arrivalThreshold: arrivalThreshold,
        driverStationary: smoothedDriver.isStationary,
        customerStationary: beacon.isStationary || false
      });
    }

    // Format distance - show decimal when within 10m for precision
    const displayDistance = distance <= 10 ? distance.toFixed(1) : Math.round(distance).toString();

    return res.json({
      success: true,
      data: {
        distance: distance <= 10 ? parseFloat(distance.toFixed(1)) : Math.round(distance),
        bearing: Math.round(bearing),
        direction: getDirectionFromBearing(bearing),
        arrow: getArrowFromBearing(bearing),
        customerLocation: {
          latitude: beacon.latitude,
          longitude: beacon.longitude,
          indoorDetails: beacon.indoorDetails,
          locationType: beacon.locationType,
          isStationary: beacon.isStationary || false
        },
        driverStationary: smoothedDriver.isStationary,
        status: session.status,
        accuracy: combinedAccuracy,
        arrivalThreshold,
        eta: Math.ceil(distance / 1.4), // ETA in seconds at walking speed (1.4 m/s)
        message: session.status === 'arrived' 
          ? 'You have arrived! Look around for the customer.'
          : session.status === 'approaching'
            ? `Almost there! ${displayDistance}m away - look around!`
            : `${displayDistance}m to customer - keep walking ${getDirectionFromBearing(bearing)}`
      }
    });
  } catch (error) {
    console.error('Error updating tracking:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update tracking'
    });
  }
});

/**
 * Get current tracking status
 * GET /api/ranging/track/:orderId
 */
router.get('/track/:orderId', async (req: Request, res: Response): Promise<any> => {
  try {
    const { orderId } = req.params;

    const beacon = customerBeacons.get(orderId);
    if (!beacon) {
      return res.json({
        success: false,
        message: 'Customer is not sharing location',
        beaconActive: false
      });
    }

    // Find active session for this order
    let activeSession: RangingSession | null = null;
    for (const [, session] of activeRangingSessions) {
      if (session.orderId === orderId && session.status !== 'completed') {
        activeSession = session;
        break;
      }
    }

    return res.json({
      success: true,
      data: {
        beaconActive: true,
        customerLocation: {
          latitude: beacon.latitude,
          longitude: beacon.longitude,
          indoorDetails: beacon.indoorDetails,
          locationType: beacon.locationType
        },
        status: beacon.status,
        lastUpdate: beacon.lastUpdate,
        tracking: activeSession ? {
          sessionId: activeSession.sessionId,
          distance: Math.round(activeSession.distance),
          bearing: Math.round(activeSession.bearing),
          direction: getDirectionFromBearing(activeSession.bearing),
          arrow: getArrowFromBearing(activeSession.bearing),
          status: activeSession.status
        } : null
      }
    });
  } catch (error) {
    console.error('Error getting tracking status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get tracking status'
    });
  }
});

/**
 * Stop beacon (customer)
 * POST /api/ranging/beacon/stop
 */
router.post('/beacon/stop', [
  body('orderId').notEmpty()
], async (req: Request, res: Response): Promise<any> => {
  try {
    const { orderId } = req.body;

    const beacon = customerBeacons.get(orderId);
    if (beacon) {
      beacon.status = 'completed';
      customerBeacons.delete(orderId);
    }

    // Emit via Socket.IO
    const io = (req as any).io;
    if (io) {
      io.to(`delivery:${orderId}`).emit('customer:beacon-stopped', {
        orderId,
        message: 'Customer stopped sharing location'
      });
    }

    return res.json({
      success: true,
      message: 'Beacon stopped'
    });
  } catch (error) {
    console.error('Error stopping beacon:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to stop beacon'
    });
  }
});

/**
 * Mark as arrived/found
 * POST /api/ranging/arrived
 */
router.post('/arrived', [
  body('orderId').notEmpty(),
  body('driverId').notEmpty()
], async (req: Request, res: Response): Promise<any> => {
  try {
    const { orderId, driverId } = req.body;

    // Update beacon status
    const beacon = customerBeacons.get(orderId);
    if (beacon) {
      beacon.status = 'found';
      customerBeacons.set(orderId, beacon);
    }

    // Find and complete session
    for (const [sessionId, session] of activeRangingSessions) {
      if (session.orderId === orderId) {
        session.status = 'completed';
        activeRangingSessions.set(sessionId, session);
        break;
      }
    }

    // Emit via Socket.IO
    const io = (req as any).io;
    if (io) {
      io.to(`delivery:${orderId}`).emit('driver:arrived', {
        orderId,
        driverId,
        message: 'Driver has found the customer!'
      });
    }

    console.log(`Driver arrived at customer for order ${orderId}`);

    return res.json({
      success: true,
      message: 'Marked as arrived'
    });
  } catch (error) {
    console.error('Error marking arrived:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to mark as arrived'
    });
  }
});

/**
 * Verify customer code - Driver enters code to confirm they found the right customer
 * POST /api/ranging/verify-code
 */
router.post('/verify-code', [
  body('orderId').notEmpty(),
  body('driverId').notEmpty(),
  body('code').notEmpty().isLength({ min: 4, max: 4 })
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { orderId, driverId, code } = req.body;

    // Get the beacon
    const beacon = customerBeacons.get(orderId);
    if (!beacon) {
      return res.status(404).json({
        success: false,
        message: 'Customer beacon not found. They may have stopped sharing.'
      });
    }

    // Verify the code
    if (beacon.verificationCode !== code) {
      return res.json({
        success: false,
        verified: false,
        message: 'Incorrect code. Ask the customer for their 4-digit Flicker code.'
      });
    }

    // Code matches! Mark as found
    beacon.status = 'found';
    customerBeacons.set(orderId, beacon);

    // Complete any active session
    for (const [sessionId, session] of activeRangingSessions) {
      if (session.orderId === orderId) {
        session.status = 'completed';
        activeRangingSessions.set(sessionId, session);
        break;
      }
    }

    // Emit via Socket.IO
    const io = (req as any).io;
    if (io) {
      io.to(`delivery:${orderId}`).emit('driver:arrived', {
        orderId,
        driverId,
        verified: true,
        message: 'Driver has verified and found you!'
      });
    }

    console.log(`Driver verified customer with code for order ${orderId}`);

    return res.json({
      success: true,
      verified: true,
      message: 'Code verified! Customer confirmed.'
    });
  } catch (error) {
    console.error('Error verifying code:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify code'
    });
  }
});

export default router;

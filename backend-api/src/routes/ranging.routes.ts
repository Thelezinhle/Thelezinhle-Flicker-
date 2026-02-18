/**
 * Ranging Routes - Real-time "Find Me" feature for driver-customer navigation
 * Uses GPS for web, UWB/Bluetooth for mobile
 * Enables driver to see direction and distance to customer
 */

import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { activeDeliveries, customerBeacons, activeRangingSessions } from '../data/store';

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
 * Dead Reckoning - Estimate current position based on last position, heading, and speed
 * This smooths out GPS updates and provides better tracking when GPS is delayed
 */
function applyDeadReckoning(
  lastLat: number, 
  lastLon: number, 
  heading: number | undefined, 
  speed: number | undefined, 
  elapsedSeconds: number
): { lat: number; lon: number } {
  // If no heading/speed data, return original position
  if (!heading || !speed || speed < 0.1 || elapsedSeconds > 10) {
    return { lat: lastLat, lon: lastLon };
  }
  
  // Calculate distance traveled (speed is in m/s)
  const distanceTraveled = speed * elapsedSeconds;
  
  // Convert heading to radians (heading is in degrees, 0 = North)
  const headingRad = heading * Math.PI / 180;
  
  // Calculate lat/lon change
  // 1 degree of latitude = ~111,111 meters
  // 1 degree of longitude = ~111,111 * cos(latitude) meters
  const deltaLat = (distanceTraveled * Math.cos(headingRad)) / 111111;
  const deltaLon = (distanceTraveled * Math.sin(headingRad)) / (111111 * Math.cos(lastLat * Math.PI / 180));
  
  return {
    lat: lastLat + deltaLat,
    lon: lastLon + deltaLon
  };
}

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

    const beacon: CustomerBeacon = {
      customerId,
      orderId,
      latitude,
      longitude,
      altitude,
      accuracy: accuracy || 10,
      locationType: locationType || 'fixed', // Default to fixed for stability
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

    console.log(`Customer beacon started for order ${orderId}`);

    return res.status(201).json({
      success: true,
      data: {
        orderId,
        status: 'waiting',
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

    // Update beacon location
    beacon.latitude = latitude;
    beacon.longitude = longitude;
    beacon.altitude = altitude;
    beacon.accuracy = accuracy || beacon.accuracy;
    beacon.heading = heading;
    beacon.indoorDetails = indoorDetails || beacon.indoorDetails;
    beacon.lastUpdate = new Date();

    customerBeacons.set(orderId, beacon);

    // Emit via Socket.IO
    const io = (req as any).io;
    if (io) {
      io.to(`delivery:${orderId}`).emit('customer:location-updated', {
        orderId,
        latitude,
        longitude,
        altitude,
        heading,
        timestamp: new Date().toISOString()
      });
    }

    return res.json({
      success: true,
      message: 'Location updated'
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

    // Update customer location in session
    session.customerLocation = {
      latitude: beacon.latitude,
      longitude: beacon.longitude,
      altitude: beacon.altitude,
      accuracy: beacon.accuracy
    };

    // Update driver location
    session.driverLocation = {
      latitude,
      longitude,
      heading,
      speed,
      accuracy: accuracy || 10
    };

    // Apply dead reckoning for smoother tracking
    // Only apply if customer is using live location (they might be moving)
    // Skip for fixed location - customer position is stable
    let estimatedCustomerPos = { lat: beacon.latitude, lon: beacon.longitude };
    
    if (beacon.locationType === 'live') {
      const customerTimeSinceUpdate = (Date.now() - new Date(beacon.lastUpdate).getTime()) / 1000;
      estimatedCustomerPos = applyDeadReckoning(
        beacon.latitude, 
        beacon.longitude, 
        beacon.heading, 
        0.5, // Assume slow walking if customer moving
        customerTimeSinceUpdate
      );
    }

    // Calculate new distance and bearing using estimated positions
    const distance = calculateDistance(latitude, longitude, estimatedCustomerPos.lat, estimatedCustomerPos.lon);
    const bearing = calculateBearing(latitude, longitude, estimatedCustomerPos.lat, estimatedCustomerPos.lon);

    session.distance = distance;
    session.bearing = bearing;
    session.lastUpdate = new Date();

    // Calculate combined GPS accuracy (both driver and customer)
    const driverAccuracy = accuracy || 15;  // Default to 15m if not provided
    const customerAccuracy = beacon.accuracy || 15;
    const combinedAccuracy = driverAccuracy + customerAccuracy;
    
    // GPS REALITY CHECK:
    // Browser GPS is typically ±5-50m accuracy
    // Two devices 1m apart can report positions 30m different due to GPS error
    // So we use a GENEROUS arrival threshold based on reported accuracy
    
    // Arrival threshold = greater of: 15m OR half the combined GPS error
    // This prevents "stuck at Xm" when devices are actually together
    const arrivalThreshold = Math.max(15, combinedAccuracy * 0.5);
    const approachingThreshold = Math.max(30, combinedAccuracy * 0.75);
    
    // Log for debugging
    console.log(`[RANGING] Order: ${session.orderId}`);
    console.log(`  Driver GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (±${driverAccuracy}m)`);
    console.log(`  Customer GPS: ${beacon.latitude.toFixed(6)}, ${beacon.longitude.toFixed(6)} (±${customerAccuracy}m)`);
    console.log(`  Calculated: ${distance.toFixed(1)}m | Arrival threshold: ${arrivalThreshold.toFixed(0)}m`);
    
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
        driverLatitude: latitude,
        driverLongitude: longitude,
        customerLatitude: beacon.latitude,
        customerLongitude: beacon.longitude,
        distance: distance <= 10 ? parseFloat(distance.toFixed(1)) : Math.round(distance),
        bearing: Math.round(bearing),
        direction: getDirectionFromBearing(bearing),
        arrow: getArrowFromBearing(bearing),
        status: session.status,
        eta: Math.ceil(distance / 1.4), // Seconds at walking speed
        accuracy: combinedAccuracy,
        arrivalThreshold: arrivalThreshold
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
          locationType: beacon.locationType
        },
        status: session.status,
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

export default router;

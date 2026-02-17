/**
 * Bluetooth Routes - Bluetooth 6.0 Channel Sounding & BLE Ranging API
 * 
 * Endpoints for managing Bluetooth proximity sessions and ranging data
 */

import { Router, Request, Response } from 'express';
import { bluetoothService, BluetoothRangingData } from '../services/BluetoothService';

const router = Router();

// ============== Session Management ==============

/**
 * POST /api/bluetooth/session
 * Create a new Bluetooth ranging session for a delivery
 */
router.post('/session', async (req: Request, res: Response) => {
  try {
    const { deliveryId, courierDeviceId, recipientDeviceId } = req.body;

    if (!deliveryId || !courierDeviceId || !recipientDeviceId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: deliveryId, courierDeviceId, recipientDeviceId'
      });
    }

    const session = bluetoothService.createSession(
      deliveryId,
      courierDeviceId,
      recipientDeviceId
    );

    return res.status(201).json({
      success: true,
      data: session
    });
  } catch (error: any) {
    console.error('Error creating Bluetooth session:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/bluetooth/session/:sessionId
 * Get session details
 */
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = bluetoothService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    return res.json({
      success: true,
      data: session
    });
  } catch (error: any) {
    console.error('Error getting Bluetooth session:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/bluetooth/sessions/delivery/:deliveryId
 * Get all sessions for a delivery
 */
router.get('/sessions/delivery/:deliveryId', async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;
    const sessions = bluetoothService.getSessionsForDelivery(deliveryId);

    return res.json({
      success: true,
      data: sessions
    });
  } catch (error: any) {
    console.error('Error getting sessions for delivery:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============== Discovery & Ranging ==============

/**
 * POST /api/bluetooth/discovery/start
 * Start Bluetooth discovery for a target device
 */
router.post('/discovery/start', async (req: Request, res: Response) => {
  try {
    const { sessionId, targetDeviceId } = req.body;

    if (!sessionId || !targetDeviceId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sessionId, targetDeviceId'
      });
    }

    const success = await bluetoothService.startDiscovery(sessionId, targetDeviceId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or discovery failed'
      });
    }

    return res.json({
      success: true,
      message: 'Discovery started'
    });
  } catch (error: any) {
    console.error('Error starting discovery:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/bluetooth/discovery/stop
 * Stop Bluetooth discovery
 */
router.post('/discovery/stop', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: sessionId'
      });
    }

    const success = await bluetoothService.stopDiscovery(sessionId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    return res.json({
      success: true,
      message: 'Discovery stopped'
    });
  } catch (error: any) {
    console.error('Error stopping discovery:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/bluetooth/ranging
 * Submit ranging data from mobile client
 */
router.post('/ranging', async (req: Request, res: Response) => {
  try {
    const {
      deliveryId,
      targetDeviceId,
      sourceDeviceId,
      deviceId, // Alternative field name from mobile
      rssi,
      distance,
      signalQuality,
      technology,
      timestamp
    } = req.body;

    // Support both targetDeviceId and deviceId as field name
    const deviceIdToUse = targetDeviceId || deviceId;
    const sourceIdToUse = sourceDeviceId || 'mobile-client';

    if (!deviceIdToUse || rssi === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: deviceId/targetDeviceId, rssi'
      });
    }

    // Calculate distance from RSSI if not provided
    const calculatedDistance = distance ?? 
      bluetoothService.calculateDistanceFromRSSI(rssi);

    const rangingData: BluetoothRangingData = {
      targetDeviceId: deviceIdToUse,
      sourceDeviceId: sourceIdToUse,
      rssi,
      distance: calculatedDistance,
      signalQuality: signalQuality ?? bluetoothService.getSignalQuality(deviceIdToUse),
      technology: technology || 'bluetooth_le',
      timestamp: timestamp ? new Date(timestamp) : new Date()
    };

    bluetoothService.processRangingData(rangingData);

    // Log for debugging
    console.log(`📶 BLE Ranging: ${deviceIdToUse} | RSSI: ${rssi}dBm | Distance: ${calculatedDistance.toFixed(2)}m | Delivery: ${deliveryId || 'N/A'}`);

    return res.json({
      success: true,
      data: {
        ...rangingData,
        deliveryId,
        calculatedDistance
      }
    });
  } catch (error: any) {
    console.error('Error processing ranging data:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/bluetooth/distance/:deviceId
 * Get current distance to a device
 */
router.get('/distance/:deviceId', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    
    const distance = bluetoothService.getDistance(deviceId);
    const rssi = bluetoothService.getRSSI(deviceId);
    const signalQuality = bluetoothService.getSignalQuality(deviceId);

    return res.json({
      success: true,
      data: {
        deviceId,
        distance,
        rssi,
        signalQuality,
        found: distance !== null
      }
    });
  } catch (error: any) {
    console.error('Error getting distance:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/bluetooth/session/:sessionId/average
 * Get average distance for a session
 */
router.get('/session/:sessionId/average', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const windowSize = parseInt(req.query.window as string) || 5;
    
    const averageDistance = bluetoothService.getAverageDistance(sessionId, windowSize);
    const isInProximity = bluetoothService.isInProximity(sessionId);

    return res.json({
      success: true,
      data: {
        sessionId,
        averageDistance,
        windowSize,
        isInProximity
      }
    });
  } catch (error: any) {
    console.error('Error getting average distance:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============== Calibration ==============

/**
 * POST /api/bluetooth/calibrate
 * Calibrate RSSI for a specific device at 1 meter
 */
router.post('/calibrate', async (req: Request, res: Response) => {
  try {
    const { deviceId, rssiAt1Meter, environment } = req.body;

    if (!deviceId || rssiAt1Meter === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: deviceId, rssiAt1Meter'
      });
    }

    const calibration = bluetoothService.calibrateForDevice(
      deviceId,
      rssiAt1Meter,
      environment || 'indoor'
    );

    return res.json({
      success: true,
      data: calibration
    });
  } catch (error: any) {
    console.error('Error calibrating device:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/bluetooth/calculate-distance
 * Calculate distance from RSSI value
 */
router.post('/calculate-distance', async (req: Request, res: Response) => {
  try {
    const { rssi, deviceId, environment } = req.body;

    if (rssi === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: rssi'
      });
    }

    const distance = bluetoothService.calculateDistanceFromRSSI(
      rssi,
      deviceId,
      environment || 'indoor'
    );

    return res.json({
      success: true,
      data: {
        rssi,
        distance,
        environment: environment || 'indoor'
      }
    });
  } catch (error: any) {
    console.error('Error calculating distance:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============== Health & Status ==============

/**
 * GET /api/bluetooth/status
 * Get Bluetooth service status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const healthStatus = bluetoothService.getHealthStatus();

    return res.json({
      success: true,
      data: {
        isAvailable: healthStatus.isAvailable,
        activeSessions: healthStatus.activeSessions,
        devicesFound: healthStatus.devicesFound,
        devices: Array.from(healthStatus.deviceDetails.values()),
        lastHealthCheck: healthStatus.lastHealthCheck
      }
    });
  } catch (error: any) {
    console.error('Error getting status:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/bluetooth/devices
 * Get all connected/discovered devices
 */
router.get('/devices', async (_req: Request, res: Response) => {
  try {
    const devices = bluetoothService.getConnectedDevices();

    return res.json({
      success: true,
      data: devices
    });
  } catch (error: any) {
    console.error('Error getting devices:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;

/**
 * UWB Routes - Ultra-Wideband Ranging API
 * 
 * Endpoints for managing UWB proximity sessions and ranging data
 */

import { Router, Request, Response } from 'express';
import { uwbService, UWBRangingData, UWBCapabilities } from '../services/UWBService';

const router = Router();

// ============== Device Registration ==============

/**
 * POST /api/uwb/device/register
 * Register device UWB capabilities
 */
router.post('/device/register', async (req: Request, res: Response) => {
  try {
    const { deviceId, capabilities } = req.body;

    if (!deviceId || !capabilities) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: deviceId, capabilities'
      });
    }

    const deviceInfo = uwbService.registerDevice(deviceId, capabilities as UWBCapabilities);

    return res.status(201).json({
      success: true,
      data: deviceInfo
    });
  } catch (error: any) {
    console.error('Error registering UWB device:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/uwb/device/:deviceId
 * Get device info
 */
router.get('/device/:deviceId', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const deviceInfo = uwbService.getDeviceInfo(deviceId);

    if (!deviceInfo) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    return res.json({
      success: true,
      data: deviceInfo
    });
  } catch (error: any) {
    console.error('Error getting device info:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============== Session Management ==============

/**
 * POST /api/uwb/session
 * Create a new UWB ranging session
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

    const session = uwbService.createSession(
      deliveryId,
      courierDeviceId,
      recipientDeviceId
    );

    return res.status(201).json({
      success: true,
      data: session
    });
  } catch (error: any) {
    console.error('Error creating UWB session:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/uwb/session/:sessionId/start
 * Start UWB ranging session
 */
router.post('/session/:sessionId/start', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const success = await uwbService.startSession(sessionId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    return res.json({
      success: true,
      message: 'UWB session started'
    });
  } catch (error: any) {
    console.error('Error starting UWB session:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/uwb/session/:sessionId/stop
 * Stop UWB ranging session
 */
router.post('/session/:sessionId/stop', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const success = await uwbService.stopSession(sessionId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    return res.json({
      success: true,
      message: 'UWB session stopped'
    });
  } catch (error: any) {
    console.error('Error stopping UWB session:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/uwb/session/:sessionId
 * Get session details
 */
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = uwbService.getSession(sessionId);

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
    console.error('Error getting UWB session:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============== Ranging ==============

/**
 * POST /api/uwb/ranging
 * Submit ranging data from mobile client
 */
router.post('/ranging', async (req: Request, res: Response) => {
  try {
    const {
      targetDeviceId,
      sourceDeviceId,
      distance,
      azimuth,
      elevation,
      accuracy
    } = req.body;

    if (!targetDeviceId || !sourceDeviceId || distance === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: targetDeviceId, sourceDeviceId, distance'
      });
    }

    const rangingData: UWBRangingData = {
      targetDeviceId,
      sourceDeviceId,
      distance,
      azimuth: azimuth ?? null,
      elevation: elevation ?? null,
      accuracy: accuracy ?? 0.1,
      technology: 'uwb',
      timestamp: new Date()
    };

    uwbService.processRangingData(rangingData);

    return res.json({
      success: true,
      data: rangingData
    });
  } catch (error: any) {
    console.error('Error processing UWB ranging data:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/uwb/distance/:deviceId
 * Get current distance to a device
 */
router.get('/distance/:deviceId', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    
    const distance = uwbService.getDistance(deviceId);
    const direction = uwbService.getDirection(deviceId);

    return res.json({
      success: true,
      data: {
        deviceId,
        distance,
        azimuth: direction.azimuth,
        elevation: direction.elevation,
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
 * GET /api/uwb/session/:sessionId/proximity
 * Check if devices are in close proximity
 */
router.get('/session/:sessionId/proximity', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const threshold = parseFloat(req.query.threshold as string) || 1;
    
    const averageDistance = uwbService.getAverageDistance(sessionId);
    const isInCloseProximity = uwbService.isInCloseProximity(sessionId, threshold);

    return res.json({
      success: true,
      data: {
        sessionId,
        averageDistance,
        threshold,
        isInCloseProximity
      }
    });
  } catch (error: any) {
    console.error('Error checking proximity:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============== Health & Status ==============

/**
 * GET /api/uwb/status
 * Get UWB service status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const healthStatus = uwbService.getHealthStatus();

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
    console.error('Error getting UWB status:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/uwb/devices
 * Get all registered UWB devices
 */
router.get('/devices', async (_req: Request, res: Response) => {
  try {
    const devices = uwbService.getAllDevices();

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

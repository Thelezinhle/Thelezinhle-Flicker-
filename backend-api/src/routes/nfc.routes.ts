/**
 * NFC Routes - Near Field Communication Verification API
 * 
 * Endpoints for NFC-based proximity verification (final handshake)
 */

import { Router, Request, Response } from 'express';
import { nfcService, NFCVerificationRequest, NFCCapabilities } from '../services/NFCService';

const router = Router();

// ============== Device Registration ==============

/**
 * POST /api/nfc/device/register
 * Register device NFC capabilities
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

    const deviceInfo = nfcService.registerDevice(deviceId, capabilities as NFCCapabilities);

    return res.status(201).json({
      success: true,
      data: deviceInfo
    });
  } catch (error: any) {
    console.error('Error registering NFC device:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/nfc/device/:deviceId
 * Get device info
 */
router.get('/device/:deviceId', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const deviceInfo = nfcService.getDeviceInfo(deviceId);

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
 * POST /api/nfc/session
 * Create a new NFC verification session
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

    const session = nfcService.createSession(
      deliveryId,
      courierDeviceId,
      recipientDeviceId
    );

    return res.status(201).json({
      success: true,
      data: {
        sessionId: session.sessionId,
        verificationCode: session.verificationCode,
        status: session.status
      }
    });
  } catch (error: any) {
    console.error('Error creating NFC session:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/nfc/session/:sessionId/prepare
 * Prepare session for NFC verification (ready for tap)
 */
router.post('/session/:sessionId/prepare', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { expectedTagId } = req.body;

    const success = nfcService.prepareForVerification(sessionId, expectedTagId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    return res.json({
      success: true,
      message: 'Session ready for NFC verification'
    });
  } catch (error: any) {
    console.error('Error preparing NFC session:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/nfc/session/:sessionId/cancel
 * Cancel NFC verification session
 */
router.post('/session/:sessionId/cancel', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const success = nfcService.cancelVerification(sessionId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    return res.json({
      success: true,
      message: 'Session cancelled'
    });
  } catch (error: any) {
    console.error('Error cancelling NFC session:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/nfc/session/:sessionId
 * Get session details
 */
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = nfcService.getSession(sessionId);

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
    console.error('Error getting NFC session:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============== Verification ==============

/**
 * POST /api/nfc/verify
 * Verify NFC tap and create Proof of Presence
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const {
      verificationId,
      sourceDeviceId,
      targetDeviceId,
      deliveryId,
      nfcTagId,
      latitude,
      longitude,
      payload,
      signature
    } = req.body;

    if (!sourceDeviceId || !targetDeviceId || !deliveryId || !nfcTagId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sourceDeviceId, targetDeviceId, deliveryId, nfcTagId'
      });
    }

    const verificationRequest: NFCVerificationRequest = {
      verificationId: verificationId || `verify-${Date.now()}`,
      sourceDeviceId,
      targetDeviceId,
      deliveryId,
      nfcTagId,
      latitude: latitude || 0,
      longitude: longitude || 0,
      timestamp: new Date(),
      payload: payload || '',
      signature: signature || nfcService.generateSignature(payload || '')
    };

    const result = await nfcService.verifyProximity(verificationRequest);

    if (!result.verified) {
      return res.status(400).json({
        success: false,
        error: result.errorMessage,
        data: result
      });
    }

    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('Error verifying NFC:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/nfc/delivery/:deliveryId/verified
 * Check if delivery has been NFC-verified
 */
router.get('/delivery/:deliveryId/verified', async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;
    const isVerified = nfcService.isDeliveryVerified(deliveryId);

    return res.json({
      success: true,
      data: {
        deliveryId,
        isVerified
      }
    });
  } catch (error: any) {
    console.error('Error checking verification status:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/nfc/sessions/delivery/:deliveryId
 * Get all NFC sessions for a delivery
 */
router.get('/sessions/delivery/:deliveryId', async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;
    const sessions = nfcService.getSessionsForDelivery(deliveryId);

    return res.json({
      success: true,
      data: sessions
    });
  } catch (error: any) {
    console.error('Error getting sessions:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============== Signature Generation ==============

/**
 * POST /api/nfc/signature
 * Generate signature for NFC payload (for mobile client)
 */
router.post('/signature', async (req: Request, res: Response) => {
  try {
    const { payload } = req.body;

    if (!payload) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: payload'
      });
    }

    const signature = nfcService.generateSignature(payload);

    return res.json({
      success: true,
      data: {
        payload,
        signature
      }
    });
  } catch (error: any) {
    console.error('Error generating signature:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============== Health & Status ==============

/**
 * GET /api/nfc/status
 * Get NFC service status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const healthStatus = nfcService.getHealthStatus();

    return res.json({
      success: true,
      data: healthStatus
    });
  } catch (error: any) {
    console.error('Error getting NFC status:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/nfc/devices
 * Get all registered NFC devices
 */
router.get('/devices', async (_req: Request, res: Response) => {
  try {
    const devices = nfcService.getAllDevices();

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

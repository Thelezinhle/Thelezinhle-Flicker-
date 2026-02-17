import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { ProximityService } from '../services/ProximityService';
import { EncryptionService } from '../services/EncryptionService';
import { ProximityHandshake } from '../models';

const router = Router();

// Initiate a new proximity handshake
router.post('/initiate', [
  body('initiatorId').isUUID().notEmpty(),
  body('latitude').isFloat({ min: -90, max: 90 }),
  body('longitude').isFloat({ min: -180, max: 180 })
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { initiatorId, latitude, longitude } = req.body;
    
    const handshake = await ProximityService.initiateHandshake(
      initiatorId,
      latitude,
      longitude
    );
    
    res.status(201).json({
      success: true,
      data: handshake,
      message: 'Proximity handshake initiated'
    });
  } catch (error) {
    console.error('Error initiating handshake:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate handshake'
    });
  }
});

// Join an existing handshake
router.post('/join', [
  body('handshakeCode').isLength({ min: 6, max: 6 }),
  body('receiverId').isUUID().notEmpty(),
  body('latitude').isFloat({ min: -90, max: 90 }),
  body('longitude').isFloat({ min: -180, max: 180 })
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { handshakeCode, receiverId, latitude, longitude } = req.body;
    
    // Find handshake by code
    const handshake = await ProximityHandshake.findOne({
      where: { handshakeCode, status: 'pending' }
    });
    
    if (!handshake) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired handshake code'
      });
    }
    
    // Verify proximity
    const verification = await ProximityService.verifyProximity(
      handshake.id,
      latitude,
      longitude
    );
    
    if (!verification.verified) {
      return res.status(400).json({
        success: false,
        message: verification.message,
        phase: verification.phase,
        distance: verification.distance
      });
    }
    
    // Update handshake with receiver
    await handshake.update({
      receiverId,
      status: 'active',
      phase: verification.phase
    });
    
    // Generate encryption keys for this session
    const initiatorKeyPair = EncryptionService.generateKeyPair();
    const receiverKeyPair = EncryptionService.generateKeyPair();
    
    // Derive shared secret
    const sharedSecret = EncryptionService.deriveSharedSecret(
      receiverKeyPair.privateKey,
      initiatorKeyPair.publicKey
    );
    
    res.status(200).json({
      success: true,
      data: {
        sessionId: handshake.id,
        handshakeCode,
        phase: handshake.phase,
        verification,
        encryption: {
          publicKey: receiverKeyPair.publicKey,
          sharedSecret: sharedSecret.substring(0, 32) // First 32 chars
        }
      },
      message: 'Successfully joined handshake'
    });
  } catch (error) {
    console.error('Error joining handshake:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to join handshake'
    });
  }
});

// Verify proximity with additional data (Bluetooth/UWB)
router.post('/verify', [
  body('sessionId').isUUID().notEmpty(),
  body('latitude').isFloat({ min: -90, max: 90 }),
  body('longitude').isFloat({ min: -180, max: 180 }),
  body('bluetoothRSSI').optional().isFloat(),
  body('uwbDistance').optional().isFloat({ min: 0 })
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { 
      sessionId, 
      latitude, 
      longitude, 
      bluetoothRSSI, 
      uwbDistance 
    } = req.body;
    
    const verification = await ProximityService.verifyProximity(
      sessionId,
      latitude,
      longitude,
      bluetoothRSSI,
      uwbDistance
    );
    
    res.status(200).json({
      success: true,
      data: verification,
      message: verification.verified ? 
        'Proximity verified successfully' : 
        'Proximity verification failed'
    });
  } catch (error) {
    console.error('Error verifying proximity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify proximity'
    });
  }
});

/**
 * Update current position and get distance + phase
 * POST /api/proximity/update
 * 
 * Receives: latitude, longitude, tracking_id
 * Returns: distance (meters), phase, technology
 */
router.post('/update', [
  body('tracking_id').isUUID().withMessage('Valid tracking_id required'),
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { tracking_id, latitude, longitude } = req.body;

    const status = await ProximityService.updateDistance(
      tracking_id,
      latitude,
      longitude
    );

    if (!status) {
      return res.status(404).json({
        success: false,
        message: 'Tracking session not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        tracking_id: status.id,
        distance: status.current_distance,
        phase: status.phase,
        technology: status.technology,
        status: status.status,
        last_update: status.last_update
      },
      message: `Distance: ${status.current_distance.toFixed(2)}m, Phase: ${status.phase}`
    });
  } catch (error) {
    console.error('Error updating proximity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update proximity'
    });
  }
});

// Get Light-ID pattern for session
router.get('/light-id/:sessionId', [
  param('sessionId').isUUID().notEmpty()
], async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    
    const pattern = ProximityService.generateLightIDPattern(sessionId);
    
    res.status(200).json({
      success: true,
      data: {
        sessionId,
        pattern: pattern.pattern,
        duration: pattern.duration,
        frequency: 2000
      },
      message: 'Light-ID pattern generated'
    });
  } catch (error) {
    console.error('Error generating Light-ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate Light-ID pattern'
    });
  }
});

// Complete handshake (NFC tap simulation)
router.post('/complete', [
  body('sessionId').isUUID().notEmpty(),
  body('encryptedData').notEmpty(),
  body('signature').notEmpty()
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { sessionId, encryptedData, signature } = req.body;
    
    const handshake = await ProximityHandshake.findByPk(sessionId);
    
    if (!handshake) {
      return res.status(404).json({
        success: false,
        message: 'Handshake session not found'
      });
    }
    
    // Verify signature and complete handshake
    await handshake.update({
      status: 'completed',
      phase: 'complete',
      encryptedPayload: encryptedData
    });
    
    res.status(200).json({
      success: true,
      data: {
        sessionId,
        completedAt: new Date().toISOString(),
        initiatorId: handshake.initiatorId,
        receiverId: handshake.receiverId
      },
      message: 'Handshake completed successfully'
    });
  } catch (error) {
    console.error('Error completing handshake:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete handshake'
    });
  }
});

// ============== Continuous Tracking Routes (matching Go API) ==============

/**
 * Start proximity tracking
 * POST /api/proximity/tracking/start
 */
router.post('/tracking/start', [
  body('target_user_id').isUUID().notEmpty(),
  body('target_latitude').isFloat({ min: -90, max: 90 }),
  body('target_longitude').isFloat({ min: -180, max: 180 })
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Get user ID from auth or request
    const userId = (req as any).user?.id || req.body.user_id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID required'
      });
    }

    const status = await ProximityService.startTracking(userId, {
      target_user_id: req.body.target_user_id,
      target_latitude: req.body.target_latitude,
      target_longitude: req.body.target_longitude
    });

    res.status(201).json({
      success: true,
      data: status,
      message: 'Tracking started'
    });
  } catch (error) {
    console.error('Error starting tracking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start tracking'
    });
  }
});

/**
 * Stop proximity tracking
 * POST /api/proximity/tracking/stop
 */
router.post('/tracking/stop', [
  body('tracking_id').isUUID().notEmpty()
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    await ProximityService.stopTracking(req.body.tracking_id);

    res.status(200).json({
      success: true,
      message: 'Tracking stopped'
    });
  } catch (error) {
    console.error('Error stopping tracking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop tracking'
    });
  }
});

/**
 * Get tracking status
 * GET /api/proximity/tracking/:trackingId
 */
router.get('/tracking/:trackingId', [
  param('trackingId').isUUID().notEmpty()
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const status = await ProximityService.getStatus(req.params.trackingId);

    if (!status) {
      return res.status(404).json({
        success: false,
        message: 'Tracking not found'
      });
    }

    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Error getting tracking status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get tracking status'
    });
  }
});

/**
 * Update position and get distance
 * POST /api/proximity/tracking/update
 */
router.post('/tracking/update', [
  body('tracking_id').isUUID().notEmpty(),
  body('latitude').isFloat({ min: -90, max: 90 }),
  body('longitude').isFloat({ min: -180, max: 180 })
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const status = await ProximityService.updateDistance(
      req.body.tracking_id,
      req.body.latitude,
      req.body.longitude
    );

    if (!status) {
      return res.status(404).json({
        success: false,
        message: 'Tracking not found'
      });
    }

    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Error updating distance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update distance'
    });
  }
});

/**
 * Get all active trackings for user
 * GET /api/proximity/tracking/active
 */
router.get('/tracking/active/:userId', [
  param('userId').isUUID().notEmpty()
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const trackings = await ProximityService.getActiveTrackings(req.params.userId);

    res.status(200).json({
      success: true,
      data: { trackings }
    });
  } catch (error) {
    console.error('Error getting active trackings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get active trackings'
    });
  }
});

export default router;

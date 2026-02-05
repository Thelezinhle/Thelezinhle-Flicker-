import { Router, Request, Response } from 'express';
import { param, validationResult } from 'express-validator';
import { User } from '../models';

const router = Router();

/**
 * Get user profile
 */
router.get('/profile/:userId', [
  param('userId').isUUID().notEmpty()
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.params;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        deviceId: user.deviceId,
        publicKey: user.publicKey,
        isVerified: user.isVerified
      },
      message: 'User profile retrieved'
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
});

/**
 * Update device public key (for key rotation)
 */
router.put('/update-key/:userId', [
  param('userId').isUUID().notEmpty()
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.params;
    const { publicKey } = req.body;

    if (!publicKey || publicKey.length < 50) {
      return res.status(400).json({
        success: false,
        message: 'Invalid public key format'
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update public key
    await user.update({ publicKey });

    res.status(200).json({
      success: true,
      data: {
        userId: user.id,
        deviceId: user.deviceId,
        publicKeyUpdated: true
      },
      message: 'Public key updated successfully'
    });
  } catch (error) {
    console.error('Error updating key:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update public key'
    });
  }
});

/**
 * Mark device as verified (after proximity handshake)
 */
router.post('/verify/:userId', [
  param('userId').isUUID().notEmpty()
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.params;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Mark as verified
    await user.update({ isVerified: true });

    res.status(200).json({
      success: true,
      data: {
        userId: user.id,
        isVerified: user.isVerified,
        verifiedAt: new Date().toISOString()
      },
      message: 'Device verified successfully'
    });
  } catch (error) {
    console.error('Error verifying device:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify device'
    });
  }
});

/**
 * List nearby users (based on recent proximity sessions)
 */
router.get('/nearby/:userId', [
  param('userId').isUUID().notEmpty()
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.params;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // In a real scenario, you would query proximity sessions
    // to find nearby users from the past 24 hours
    // This is a placeholder response
    res.status(200).json({
      success: true,
      data: {
        userId,
        nearbyUsers: [],
        lastUpdated: new Date().toISOString()
      },
      message: 'Nearby users retrieved'
    });
  } catch (error) {
    console.error('Error fetching nearby users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch nearby users'
    });
  }
});

export default router;

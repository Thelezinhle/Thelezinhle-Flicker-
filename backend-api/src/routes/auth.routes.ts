import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import { User, Session } from '../models';

const router = Router();

/**
 * Register a new user
 */
router.post('/register', [
  body('deviceId').notEmpty().isLength({ min: 5 }),
  body('publicKey').notEmpty().isLength({ min: 50 })
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { deviceId, publicKey } = req.body;

    // Check if device already registered
    const existingUser = await User.findOne({ where: { deviceId } });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Device already registered'
      });
    }

    // Create new user
    const user = await User.create({
      deviceId,
      publicKey,
      isVerified: false
    });

    res.status(201).json({
      success: true,
      data: {
        userId: user.id,
        deviceId: user.deviceId,
        isVerified: user.isVerified
      },
      message: 'User registered successfully'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register user'
    });
  }
});

/**
 * Login and generate session token
 */
router.post('/login', [
  body('userId').isUUID().notEmpty(),
  body('deviceId').notEmpty().isLength({ min: 5 })
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId, deviceId } = req.body;

    // Find user
    const user = await User.findByPk(userId);
    if (!user || user.deviceId !== deviceId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const sessionToken = jwt.sign(
      {
        userId: user.id,
        deviceId: user.deviceId
      },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '24h' }
    );

    // Create session record
    const session = await Session.create({
      userId: user.id,
      sessionToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'active'
    });

    res.status(200).json({
      success: true,
      data: {
        userId: user.id,
        sessionId: session.id,
        sessionToken,
        expiresAt: session.expiresAt,
        deviceId: user.deviceId
      },
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to login'
    });
  }
});

/**
 * Verify session token
 */
router.post('/verify', [
  body('sessionToken').notEmpty()
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { sessionToken } = req.body;

    // Find session
    const session = await Session.findOne({
      where: { sessionToken, status: 'active' }
    });

    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired session'
      });
    }

    // Check expiration
    if (new Date() > session.expiresAt) {
      await session.update({ status: 'expired' });
      return res.status(401).json({
        success: false,
        message: 'Session expired'
      });
    }

    // Verify JWT
    try {
      jwt.verify(sessionToken, process.env.JWT_SECRET || 'default_secret');
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token signature'
      });
    }

    const user = await User.findByPk(session.userId);

    res.status(200).json({
      success: true,
      data: {
        userId: user?.id,
        deviceId: user?.deviceId,
        isVerified: user?.isVerified,
        expiresAt: session.expiresAt
      },
      message: 'Session valid'
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify session'
    });
  }
});

/**
 * Logout and revoke session
 */
router.post('/logout', [
  body('sessionToken').notEmpty()
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { sessionToken } = req.body;

    const session = await Session.findOne({
      where: { sessionToken }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Revoke session
    await session.update({ status: 'revoked' });

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to logout'
    });
  }
});

export default router;

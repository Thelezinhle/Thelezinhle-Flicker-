import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { mockDB } from '../db/mock';

const router = Router();

/**
 * Register a new user with email and password
 * Uses in-memory storage (no database required)
 */
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').notEmpty().trim(),
  body('role').isIn(['client', 'driver'])
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: errors.array().map(e => e.msg).join(', '),
        errors: errors.array() 
      });
    }

    const { email, password, name, role } = req.body;

    // Check if email already registered
    const existingUser = mockDB.findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered. Please login instead.'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user in memory
    const user = mockDB.createUser({
      email,
      password: hashedPassword,
      name,
      role,
      isVerified: false
    });

    // Generate session token
    const sessionToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'flicker_secret_key',
      { expiresIn: '7d' }
    );

    // Create session
    mockDB.createSession({
      userId: user.id,
      sessionToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'active'
    });

    console.log(`✅ User registered: ${email} as ${role}`);

    res.status(201).json({
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        sessionToken
      },
      message: 'Registration successful!'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register. Please try again.'
    });
  }
});

/**
 * Login with email and password
 */
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  body('role').isIn(['client', 'driver'])
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid email or password format',
        errors: errors.array() 
      });
    }

    const { email, password, role } = req.body;

    // Find user by email
    const user = mockDB.findUserByEmail(email) as any;
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password. Please register first.'
      });
    }

    // Check if role matches
    if (user.role !== role) {
      return res.status(401).json({
        success: false,
        message: `This account is registered as a ${user.role}, not a ${role}`
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const sessionToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'flicker_secret_key',
      { expiresIn: '7d' }
    );

    // Create session record
    const session = mockDB.createSession({
      userId: user.id,
      sessionToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'active'
    });

    console.log(`✅ User logged in: ${email} as ${role}`);

    res.status(200).json({
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        sessionId: session.id,
        sessionToken,
        expiresAt: session.expiresAt
      },
      message: 'Login successful!'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to login. Please try again.'
    });
  }
});

/**
 * Verify session token
 */
router.post('/verify', [
  body('sessionToken').notEmpty()
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { sessionToken } = req.body;

    // Find session
    const session = mockDB.findSessionByToken(sessionToken) as any;

    if (!session || session.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired session'
      });
    }

    // Check expiration
    if (new Date() > new Date(session.expiresAt)) {
      session.status = 'expired';
      return res.status(401).json({
        success: false,
        message: 'Session expired'
      });
    }

    // Verify JWT
    try {
      jwt.verify(sessionToken, process.env.JWT_SECRET || 'flicker_secret_key');
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token signature'
      });
    }

    const user = mockDB.findUserByPk(session.userId) as any;

    res.status(200).json({
      success: true,
      data: {
        userId: user?.id,
        email: user?.email,
        name: user?.name,
        role: user?.role,
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
], async (req: Request, res: Response): Promise<any> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { sessionToken } = req.body;

    const deleted = mockDB.deleteSession(sessionToken);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

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

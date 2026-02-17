import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Session } from '../models';

/**
 * Extended Request with user context
 */
export interface AuthRequest extends Request {
  user?: {
    userId: string;
    deviceId: string;
    sessionId: string;
  };
  headers: Request['headers'];
  ip: string | undefined;
}

/**
 * Verify JWT token and session validity
 */
export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Missing or invalid authorization header'
      });
      return;
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Verify JWT signature
    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
    } catch (jwtError) {
      res.status(401).json({
        success: false,
        message: 'Invalid token signature'
      });
      return;
    }

    // Check if session exists and is active
    const session = await Session.findOne({
      where: {
        sessionToken: token,
        status: 'active'
      }
    });

    if (!session) {
      res.status(401).json({
        success: false,
        message: 'Session not found or revoked'
      });
      return;
    }

    // Check if session is expired
    if (new Date() > session.expiresAt) {
      await session.update({ status: 'expired' });
      res.status(401).json({
        success: false,
        message: 'Session expired'
      });
      return;
    }

    // Attach user context to request
    req.user = {
      userId: decoded.userId,
      deviceId: decoded.deviceId,
      sessionId: session.id
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};

/**
 * Optional authentication (doesn't fail if token is missing)
 */
export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      try {
        const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
        
        const session = await Session.findOne({
          where: { sessionToken: token, status: 'active' }
        });

        if (session && new Date() <= session.expiresAt) {
          req.user = {
            userId: decoded.userId,
            deviceId: decoded.deviceId,
            sessionId: session.id
          };
        }
      } catch (error) {
        // Silently fail - this is optional auth
      }
    }

    next();
  } catch (error) {
    console.error('Optional auth error:', error);
    next();
  }
};

/**
 * Rate limiting key generator (per user or per IP)
 */
export const getRateLimitKey = (req: AuthRequest): string => {
  return req.user?.userId || req.ip || 'unknown';
};

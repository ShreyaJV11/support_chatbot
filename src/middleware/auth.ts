import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
// Interface for Request with User data
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * 1. Verify JWT Token
 * (Checks if the user is logged in)
 */
export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <TOKEN>

  if (!token) {
    logger.warn('Auth failed: No token provided', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role
    };
    next();
  } catch (error) {
    logger.warn('Auth failed: Invalid token', { ip: req.ip, path: req.path });
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

/**
 * 2. Verify Admin Access
 * (Checks if user is logged in AND is an Admin)
 * This is the function your route was missing!
 */
export const authenticateAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // First, verify the token
  authenticateToken(req, res, () => {
    // Then check the role
    if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
      next(); // Success
    } else {
      logger.warn('Admin access denied', { user: req.user?.email });
      return res.status(403).json({ error: 'Admin access required.' });
    }
  });
};

/**
 * 3. Role-Based Authorization (Generic)
 */
export const requireRole = (requiredRole: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (req.user.role !== requiredRole && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }

    next();
  };
};

/**
 * 4. Generate Token Helper
 */
export const generateToken = (user: { id: string; email: string; role: string }): string => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
  );
};
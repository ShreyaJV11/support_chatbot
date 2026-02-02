import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * JWT Authentication middleware for admin routes
 */
export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    logger.warn('Authentication failed: No token provided', { 
      ip: req.ip, 
      path: req.path 
    });
    return res.status(401).json({ 
      error: 'Access denied. No token provided.' 
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role
    };
    
    logger.debug('User authenticated successfully', { 
      user_id: req.user.id,
      email: req.user.email 
    });
    
    next();
  } catch (error) {
    logger.warn('Authentication failed: Invalid token', { 
      ip: req.ip, 
      path: req.path,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return res.status(403).json({ 
      error: 'Invalid token.' 
    });
  }
};

/**
 * Role-based authorization middleware
 */
export const requireRole = (requiredRole: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required.' 
      });
    }

    if (req.user.role !== requiredRole && req.user.role !== 'super_admin') {
      logger.warn('Authorization failed: Insufficient permissions', {
        user_id: req.user.id,
        required_role: requiredRole,
        user_role: req.user.role
      });
      
      return res.status(403).json({ 
        error: 'Insufficient permissions.' 
      });
    }

    next();
  };
};

/**
 * Generate JWT token for authenticated user
 */
export const generateToken = (user: { id: string; email: string; role: string }): string => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role 
    },
    config.jwt.secret,
    { 
      expiresIn: config.jwt.expiresIn 
    } as jwt.SignOptions
  );
};

/**
 * Extract user info from request for logging
 */
export const getUserInfo = (req: AuthenticatedRequest) => {
  return req.user ? {
    id: req.user.id,
    email: req.user.email,
    role: req.user.role
  } : null;
};
import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Rate limiter for chat API
 * Prevents abuse of the chat endpoint
 */
const chatRateLimiter = new RateLimiterMemory({
  points: 30, // Number of requests
  duration: 60, // Per 60 seconds (1 minute)
  blockDuration: 60, // Block for 60 seconds if limit exceeded
});

/**
 * Rate limiter for admin API
 * More restrictive for admin operations
 */
const adminRateLimiter = new RateLimiterMemory({
  points: config.rateLimit.maxRequests, // From config
  duration: config.rateLimit.windowMs / 1000, // Convert ms to seconds
  blockDuration: 300, // Block for 5 minutes if limit exceeded
});

/**
 * Rate limiter for login attempts
 * Very restrictive to prevent brute force attacks
 */
const loginRateLimiter = new RateLimiterMemory({
  points: 5, // 5 attempts
  duration: 900, // Per 15 minutes
  blockDuration: 900, // Block for 15 minutes
});

/**
 * Chat rate limiting middleware
 */
export const rateLimitChat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await chatRateLimiter.consume(req.ip);
    next();
  } catch (rateLimiterRes) {
    const remainingPoints = rateLimiterRes?.remainingPoints || 0;
    const msBeforeNext = rateLimiterRes?.msBeforeNext || 0;
    
    logger.warn('Chat rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      remaining_points: remainingPoints,
      retry_after: Math.round(msBeforeNext / 1000)
    });

    res.set('Retry-After', Math.round(msBeforeNext / 1000).toString());
    
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retry_after: Math.round(msBeforeNext / 1000)
    });
  }
};

/**
 * Admin rate limiting middleware
 */
export const rateLimitAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await adminRateLimiter.consume(req.ip);
    next();
  } catch (rateLimiterRes) {
    const remainingPoints = rateLimiterRes?.remainingPoints || 0;
    const msBeforeNext = rateLimiterRes?.msBeforeNext || 0;
    
    logger.warn('Admin rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      remaining_points: remainingPoints,
      retry_after: Math.round(msBeforeNext / 1000)
    });

    res.set('Retry-After', Math.round(msBeforeNext / 1000).toString());
    
    return res.status(429).json({
      error: 'Too many admin requests. Please try again later.',
      retry_after: Math.round(msBeforeNext / 1000)
    });
  }
};

/**
 * Login rate limiting middleware
 */
export const rateLimitLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await loginRateLimiter.consume(req.ip);
    next();
  } catch (rateLimiterRes) {
    const remainingPoints = rateLimiterRes?.remainingPoints || 0;
    const msBeforeNext = rateLimiterRes?.msBeforeNext || 0;
    
    logger.warn('Login rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      remaining_points: remainingPoints,
      retry_after: Math.round(msBeforeNext / 1000)
    });

    res.set('Retry-After', Math.round(msBeforeNext / 1000).toString());
    
    return res.status(429).json({
      error: 'Too many login attempts. Please try again later.',
      retry_after: Math.round(msBeforeNext / 1000)
    });
  }
};

/**
 * Generic rate limiter factory
 */
export const createRateLimiter = (options: {
  points: number;
  duration: number;
  blockDuration: number;
}) => {
  const limiter = new RateLimiterMemory({
    points: options.points,
    duration: options.duration,
    blockDuration: options.blockDuration,
  });

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await limiter.consume(req.ip);
      next();
    } catch (rateLimiterRes) {
      const msBeforeNext = rateLimiterRes?.msBeforeNext || 0;
      
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        retry_after: Math.round(msBeforeNext / 1000)
      });

      res.set('Retry-After', Math.round(msBeforeNext / 1000).toString());
      
      return res.status(429).json({
        error: 'Rate limit exceeded. Please try again later.',
        retry_after: Math.round(msBeforeNext / 1000)
      });
    }
  };
};
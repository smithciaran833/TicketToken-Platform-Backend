import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';
import { Request } from 'express';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379'
});

redisClient.connect().catch(console.error);

export const createRateLimiter = (options = {}) => {
  return rateLimit({
    store: new RedisStore({
      sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    }),
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    ...options
  });
};

export const apiRateLimiter = createRateLimiter();

// ISSUE #26 FIX: Stricter rate limiting for QR scanning
export const scanRateLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 10, // max 10 scan attempts per minute per IP
  message: 'Too many scan attempts. Please wait before trying again.',
  skipSuccessfulRequests: false, // Count all requests, not just failed ones
  keyGenerator: (req: Request) => {
    // Use combination of IP and device ID for rate limiting
    const deviceId = (req.body as any)?.device_id || 'unknown';
    return `${req.ip}:${deviceId}`;
  }
});

// ISSUE #26 FIX: Per-device rate limiting
export const deviceRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // max 50 scans per device per 5 minutes
  keyGenerator: (req: Request) => {
    return (req.body as any)?.device_id || req.ip;
  }
});

// ISSUE #26 FIX: Per-staff rate limiting
export const staffRateLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // max 30 scans per staff member per minute
  keyGenerator: (req: Request) => {
    return (req.body as any)?.staff_user_id || req.ip;
  }
});

// ISSUE #26 FIX: Failed attempt tracking
export const failedAttemptLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // max 5 failed attempts per 10 minutes
  skipSuccessfulRequests: true, // Only count failed requests
  message: 'Too many failed scan attempts. Account temporarily locked.',
  keyGenerator: (req: Request) => {
    const deviceId = (req.body as any)?.device_id || 'unknown';
    const staffId = (req.body as any)?.staff_user_id || 'unknown';
    return `failed:${req.ip}:${deviceId}:${staffId}`;
  }
});

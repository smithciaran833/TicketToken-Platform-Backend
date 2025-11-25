import { FastifyRequest } from 'fastify';

// For Fastify rate limiting, we'll use simple in-memory or let the plugin handle Redis
export const createRateLimiter = (options: any = {}) => {
  return {
    global: false,
    max: options.max || 100,
    timeWindow: options.windowMs || 15 * 60 * 1000,
    // Let @fastify/rate-limit use its default store (memory) for now
    // or configure redis properly later if needed
    keyGenerator: options.keyGenerator,
    errorResponseBuilder: options.errorResponseBuilder || (() => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: options.message || 'Rate limit exceeded'
    })),
    ...options
  };
};

export const apiRateLimiter = createRateLimiter();

// ISSUE #26 FIX: Stricter rate limiting for QR scanning
export const scanRateLimiter = createRateLimiter({
  timeWindow: 1 * 60 * 1000, // 1 minute window
  max: 10, // max 10 scan attempts per minute per IP
  errorResponseBuilder: () => ({
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many scan attempts. Please wait before trying again.'
  }),
  keyGenerator: (req: FastifyRequest) => {
    // Use combination of IP and device ID for rate limiting
    const deviceId = (req.body as any)?.device_id || 'unknown';
    return `${req.ip}:${deviceId}`;
  }
});

// ISSUE #26 FIX: Per-device rate limiting
export const deviceRateLimiter = createRateLimiter({
  timeWindow: 5 * 60 * 1000, // 5 minutes
  max: 50, // max 50 scans per device per 5 minutes
  keyGenerator: (req: FastifyRequest) => {
    return (req.body as any)?.device_id || req.ip;
  }
});

// ISSUE #26 FIX: Per-staff rate limiting
export const staffRateLimiter = createRateLimiter({
  timeWindow: 1 * 60 * 1000, // 1 minute
  max: 30, // max 30 scans per staff member per minute
  keyGenerator: (req: FastifyRequest) => {
    return (req.body as any)?.staff_user_id || req.ip;
  }
});

// ISSUE #26 FIX: Failed attempt tracking
export const failedAttemptLimiter = createRateLimiter({
  timeWindow: 10 * 60 * 1000, // 10 minutes
  max: 5, // max 5 failed attempts per 10 minutes
  skipSuccessfulRequests: true, // Only count failed requests
  errorResponseBuilder: () => ({
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many failed scan attempts. Account temporarily locked.'
  }),
  keyGenerator: (req: FastifyRequest) => {
    const deviceId = (req.body as any)?.device_id || 'unknown';
    const staffId = (req.body as any)?.staff_user_id || 'unknown';
    return `failed:${req.ip}:${deviceId}:${staffId}`;
  }
});

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { createClient } from 'redis';

// Extend Express Request type
declare module 'express' {
  interface Request {
    id?: string;
    clientIp?: string;
  }
}

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.connect().catch(console.error);

// Helmet configuration
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// Rate limiters for different endpoint types
export const rateLimiters = {
  // General API endpoints - 100 req/min
  general: rateLimit({
    store: new RedisStore({
      sendCommand: (...args: string[]) => (redisClient as any).sendCommand(args),
      prefix: 'rl:general:',
    }),
    windowMs: 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP',
    standardHeaders: true,
    legacyHeaders: false,
  }),

  // Auth endpoints - 5 req/15min
  auth: rateLimit({
    store: new RedisStore({
      sendCommand: (...args: string[]) => (redisClient as any).sendCommand(args),
      prefix: 'rl:auth:',
    }),
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many authentication attempts',
    skipSuccessfulRequests: false,
  }),

  // Payment endpoints - 20 req/min
  payment: rateLimit({
    store: new RedisStore({
      sendCommand: (...args: string[]) => (redisClient as any).sendCommand(args),
      prefix: 'rl:payment:',
    }),
    windowMs: 60 * 1000,
    max: 20,
    message: 'Too many payment requests',
    skipSuccessfulRequests: true,
  }),

  // Admin endpoints - 50 req/min
  admin: rateLimit({
    store: new RedisStore({
      sendCommand: (...args: string[]) => (redisClient as any).sendCommand(args),
      prefix: 'rl:admin:',
    }),
    windowMs: 60 * 1000,
    max: 50,
    message: 'Admin rate limit exceeded',
  }),

  // Scanning endpoints - 500 req/min
  scanning: rateLimit({
    store: new RedisStore({
      sendCommand: (...args: string[]) => (redisClient as any).sendCommand(args),
      prefix: 'rl:scan:',
    }),
    windowMs: 60 * 1000,
    max: 500,
    message: 'Scanning rate limit exceeded',
  }),
};

// SQL Injection Protection
export function sqlInjectionProtection(req: Request, res: Response, next: NextFunction) {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
    /(--|#|\/\*|\*\/)/g,
    /(\bOR\b\s*\d+\s*=\s*\d+)/gi,
    /(\bAND\b\s*\d+\s*=\s*\d+)/gi,
    /(['";])/g,
  ];

  const checkValue = (value: any): boolean => {
    if (typeof value === 'string') {
      return sqlPatterns.some(pattern => pattern.test(value));
    }
    return false;
  };

  // Check all request inputs
  const inputs = { ...req.query, ...req.body, ...req.params };

  for (const [key, value] of Object.entries(inputs)) {
    if (checkValue(value)) {
      console.error(`SQL Injection attempt detected: ${key}=${value}`);
      return res.status(400).json({
        error: 'Invalid input detected',
        code: 'SECURITY_VIOLATION'
      });
    }
  }

  next();
}

// XSS Protection
export function xssProtection(req: Request, res: Response, next: NextFunction) {
  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe/gi,
    /<object/gi,
    /<embed/gi,
  ];

  const sanitize = (value: any): any => {
    if (typeof value === 'string') {
      let sanitized = value;
      xssPatterns.forEach(pattern => {
        sanitized = sanitized.replace(pattern, '');
      });
      return sanitized;
    }
    return value;
  };

  // Sanitize request body
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      req.body[key] = sanitize(req.body[key]);
    });
  }

  next();
}

// Request ID middleware for tracing
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  req.id = req.headers['x-request-id'] as string || crypto.randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
}

// IP extraction middleware
export function ipMiddleware(req: Request, res: Response, next: NextFunction) {
  req.clientIp = req.headers['x-forwarded-for'] as string ||
                  req.socket.remoteAddress ||
                  'unknown';
  next();
}

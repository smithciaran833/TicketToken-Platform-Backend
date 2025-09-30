import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Extend Express Request type to include session
declare module 'express' {
  interface Request {
    session?: any;
    rateLimit?: any;
  }
}

// Security headers with helmet
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// Rate limiting configurations
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: req.rateLimit?.resetTime,
    });
  },
});

export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests from this IP',
});

// Prevent MongoDB injection attacks
export const sanitizeInput = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    console.warn(`Sanitized ${key} in request from ${req.ip}`);
  },
});

// CSRF token generation and validation
export const generateCSRFToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export const validateCSRFToken = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.headers['x-csrf-token'] || req.body._csrf;
  const sessionToken = req.session?.csrfToken;
  
  if (!token || token !== sessionToken) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }
  
  next();
};

// XSS protection
export const xssProtection = (req: Request, _res: Response, next: NextFunction): void => {
  // Clean all string inputs
  const cleanInput = (obj: any): any => {
    if (typeof obj === 'string') {
      return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    } else if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        obj[key] = cleanInput(obj[key]);
      }
    }
    return obj;
  };
  
  req.body = cleanInput(req.body);
  req.query = cleanInput(req.query);
  req.params = cleanInput(req.params);
  
  next();
};

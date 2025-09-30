import { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import crypto from 'crypto';
import { ValidationChain, validationResult } from 'express-validator';

// Extend Express Request type
declare module 'express' {
  interface Request {
    id?: string;
    clientIp?: string;
    realIp?: string;
    startTime?: number;
    session?: {
      csrfToken?: string;
      regenerate?: (callback: (err: any) => void) => void;
      [key: string]: any;
    };
  }
}

// Initialize Redis for distributed rate limiting
const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  enableOfflineQueue: false,
});

export class SecurityOrchestrator {
  private rateLimiters: Map<string, RateLimiterRedis>;
  private requestCounter: Map<string, number>;
  private suspiciousIPs: Set<string>;

  constructor() {
    this.rateLimiters = new Map();
    this.requestCounter = new Map();
    this.suspiciousIPs = new Set();
    this.initializeRateLimiters();
  }

  private initializeRateLimiters() {
    // Different rate limiters for different severity levels
    const configs = [
      { name: 'auth', points: 5, duration: 900, blockDuration: 1800 }, // 5 per 15min, block 30min
      { name: 'payment', points: 10, duration: 60, blockDuration: 300 }, // 10 per min, block 5min
      { name: 'general', points: 100, duration: 60, blockDuration: 60 }, // 100 per min
      { name: 'strict', points: 3, duration: 60, blockDuration: 600 }, // 3 per min, block 10min
      { name: 'admin', points: 30, duration: 60, blockDuration: 120 }, // 30 per min
      { name: 'scan', points: 500, duration: 60, blockDuration: 10 }, // 500 per min for scanning
      { name: 'search', points: 30, duration: 60, blockDuration: 60 }, // 30 searches per min
      { name: 'export', points: 5, duration: 3600, blockDuration: 3600 }, // 5 exports per hour
    ];

    configs.forEach(config => {
      this.rateLimiters.set(config.name, new RateLimiterRedis({
        storeClient: redisClient,
        keyPrefix: `rl:${config.name}:`,
        points: config.points,
        duration: config.duration,
        blockDuration: config.blockDuration,
        execEvenly: true,
      }));
    });
  }

  // Apply all security middlewares
  public applyAll(app: Application) {
    // 1. Request ID and timing
    app.use(this.requestTracking());

    // 2. Helmet security headers
    app.use(this.helmetConfig());

    // 3. CORS with strict configuration
    app.use(this.corsConfig());

    // 4. Body parsing limits
    app.use(this.bodyParserLimits());

    // 5. HTTP Parameter Pollution prevention
    app.use(hpp());

    // 6. MongoDB injection prevention (also works for SQL)
    app.use(mongoSanitize());

    // 7. IP extraction and geolocation
    app.use(this.ipExtraction());

    // 8. User agent parsing and bot detection
    app.use(this.botDetection());

    // 9. Request signature validation for webhooks
    app.use('/webhook', this.webhookSignatureValidation());

    // 10. Content type validation
    app.use(this.contentTypeValidation());

    // 11. SQL injection prevention
    app.use(this.sqlInjectionPrevention());

    // 12. XSS prevention
    app.use(this.xssPrevention());

    // 13. Path traversal prevention
    app.use(this.pathTraversalPrevention());

    // 14. Command injection prevention
    app.use(this.commandInjectionPrevention());

    // 15. CSRF protection
    app.use(this.csrfProtection());

    // 16. Clickjacking prevention
    app.use(this.clickjackingPrevention());

    // 17. Session fixation prevention
    app.use(this.sessionFixationPrevention());

    // 18. DNS rebinding protection
    app.use(this.dnsRebindingProtection());

    // 19. Request size anomaly detection
    app.use(this.anomalyDetection());

    // 20. Honeypot endpoints
    this.setupHoneypots(app);
  }

  private requestTracking() {
    return (req: Request, res: Response, next: NextFunction) => {
      req.id = req.headers['x-request-id'] as string || crypto.randomUUID();
      req.startTime = Date.now();
      res.setHeader('X-Request-ID', req.id);

      res.on('finish', () => {
        const duration = Date.now() - (req.startTime || 0);
        if (duration > 5000) {
          console.warn(`Slow request detected: ${req.method} ${req.path} took ${duration}ms`);
        }
      });

      next();
    };
  }

  private helmetConfig() {
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          sandbox: ['allow-forms', 'allow-scripts', 'allow-same-origin'],
          reportUri: '/api/csp-report',
        },
        reportOnly: false,
      },
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: true,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      dnsPrefetchControl: true,
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      ieNoOpen: true,
      noSniff: true,
      originAgentCluster: true,
      permittedCrossDomainPolicies: false,
      referrerPolicy: { policy: "same-origin" },
      xssFilter: true,
    });
  }

  private corsConfig() {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',');

    return cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('CORS policy violation'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
      exposedHeaders: ['X-Request-ID', 'X-RateLimit-Remaining'],
      maxAge: 86400,
    });
  }

  private bodyParserLimits() {
    return (req: Request, res: Response, next: NextFunction) => {
      const contentLength = parseInt(req.headers['content-length'] || '0');
      const maxSize = 10 * 1024 * 1024; // 10MB

      if (contentLength > maxSize) {
        return res.status(413).json({ error: 'Payload too large' });
      }

      next();
    };
  }

  private ipExtraction() {
    return (req: Request, res: Response, next: NextFunction) => {
      const forwarded = req.headers['x-forwarded-for'] as string;
      const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;

      req.clientIp = ip || 'unknown';
      req.realIp = req.headers['x-real-ip'] as string || req.clientIp;

      // Check if IP is in suspicious list
      if (req.clientIp && this.suspiciousIPs.has(req.clientIp)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      next();
    };
  }

  private botDetection() {
    return (req: Request, res: Response, next: NextFunction) => {
      const userAgent = req.headers['user-agent'] || '';
      const botPatterns = [
        /bot/i, /crawler/i, /spider/i, /scraper/i, /curl/i,
        /wget/i, /python/i, /java/i, /ruby/i, /perl/i
      ];

      const isBot = botPatterns.some(pattern => pattern.test(userAgent));

      if (isBot && !req.path.includes('/api/public')) {
        // Log bot activity
        console.warn(`Bot detected: ${req.clientIp} - ${userAgent}`);

        // Apply stricter rate limiting for bots
        const limiter = this.rateLimiters.get('strict');
        if (limiter && req.clientIp) {
          limiter.consume(req.clientIp)
            .then(() => next())
            .catch(() => res.status(429).json({ error: 'Too many requests' }));
          return;
        }
      }

      next();
    };
  }

  private webhookSignatureValidation() {
    return (req: Request, res: Response, next: NextFunction) => {
      const signature = req.headers['x-webhook-signature'] as string;

      if (!signature) {
        return res.status(401).json({ error: 'Missing webhook signature' });
      }

      const payload = JSON.stringify(req.body);
      const secret = process.env.WEBHOOK_SECRET!;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      if (signature !== expectedSignature) {
        console.error('Invalid webhook signature', {
          ip: req.clientIp,
          path: req.path
        });
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }

      next();
    };
  }

  private contentTypeValidation() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        const contentType = req.headers['content-type'];

        if (!contentType || !contentType.includes('application/json')) {
          return res.status(415).json({ error: 'Unsupported media type' });
        }
      }

      next();
    };
  }

  private sqlInjectionPrevention() {
    return (req: Request, res: Response, next: NextFunction) => {
      const sqlPatterns = [
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE|ALTER|GRANT|REVOKE|UNION|EXEC|EXECUTE)\b)/gi,
        /(--|#|\/\*|\*\/|xp_|sp_|0x)/gi,
        /(\bOR\b|\bAND\b)\s*[\(\)'"=]/gi,
        /(WAITFOR|DELAY|SLEEP|BENCHMARK)/gi,
        /(INTO\s+(OUTFILE|DUMPFILE))/gi,
      ];

      const checkForSQLInjection = (value: any): boolean => {
        if (typeof value === 'string') {
          return sqlPatterns.some(pattern => pattern.test(value));
        } else if (typeof value === 'object' && value !== null) {
          return Object.values(value).some(checkForSQLInjection);
        }
        return false;
      };

      const inputs = { ...req.query, ...req.body, ...req.params };

      if (checkForSQLInjection(inputs)) {
        // Log the attempt
        console.error('SQL injection attempt detected', {
          ip: req.clientIp,
          path: req.path,
          method: req.method,
        });

        // Add IP to suspicious list
        if (req.clientIp) {
          this.suspiciousIPs.add(req.clientIp);
        }

        return res.status(400).json({ error: 'Invalid input detected' });
      }

      next();
    };
  }

  private xssPrevention() {
    return (req: Request, res: Response, next: NextFunction) => {
      const xssPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,
        /<iframe/gi,
        /<object/gi,
        /<embed/gi,
        /<applet/gi,
        /document\.(cookie|write|location)/gi,
        /window\.(location|open)/gi,
        /<img[^>]+src[\\s]*=[\\s]*["\']javascript:/gi,
      ];

      const sanitizeXSS = (value: any): any => {
        if (typeof value === 'string') {
          let sanitized = value;
          xssPatterns.forEach(pattern => {
            sanitized = sanitized.replace(pattern, '[BLOCKED]');
          });

          // HTML entity encoding for special characters
          sanitized = sanitized
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');

          return sanitized;
        } else if (typeof value === 'object' && value !== null) {
          const sanitized: any = Array.isArray(value) ? [] : {};
          for (const key in value) {
            sanitized[key] = sanitizeXSS(value[key]);
          }
          return sanitized;
        }
        return value;
      };

      if (req.body) {
        req.body = sanitizeXSS(req.body);
      }

      next();
    };
  }

  private pathTraversalPrevention() {
    return (req: Request, res: Response, next: NextFunction) => {
      const pathPatterns = [
        /\.\./g,
        /\.\.;/g,
        /%2e%2e/gi,
        /\.\//g,
        /~\//g,
        /\\/g,
      ];

      const checkPath = req.path + req.originalUrl;

      if (pathPatterns.some(pattern => pattern.test(checkPath))) {
        console.error('Path traversal attempt', {
          ip: req.clientIp,
          path: req.path,
        });

        return res.status(400).json({ error: 'Invalid path' });
      }

      next();
    };
  }

  private commandInjectionPrevention() {
    return (req: Request, res: Response, next: NextFunction) => {
      const cmdPatterns = [
        /(\||&|;|`|\$\(|\))/g,
        /(nc|netcat|bash|sh|cmd|powershell)/gi,
        /(chmod|chown|sudo|su\s)/gi,
        /(wget|curl|fetch|ping|traceroute)/gi,
      ];

      const checkForCommands = (value: any): boolean => {
        if (typeof value === 'string') {
          return cmdPatterns.some(pattern => pattern.test(value));
        }
        return false;
      };

      const inputs = { ...req.query, ...req.body };

      for (const value of Object.values(inputs)) {
        if (checkForCommands(value)) {
          console.error('Command injection attempt', {
            ip: req.clientIp,
            path: req.path,
          });

          return res.status(400).json({ error: 'Invalid input' });
        }
      }

      next();
    };
  }

  private csrfProtection() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        const token = req.headers['x-csrf-token'] || req.body._csrf;
        const sessionToken = req.session?.csrfToken;

        if (!token || token !== sessionToken) {
          return res.status(403).json({ error: 'Invalid CSRF token' });
        }
      }

      next();
    };
  }

  private clickjackingPrevention() {
    return (req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
      next();
    };
  }

  private sessionFixationPrevention() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (req.session && req.method === 'POST' && req.path.includes('/login')) {
        req.session.regenerate?.((err) => {
          if (err) next(err);
          else next();
        });
      } else {
        next();
      }
    };
  }

  private dnsRebindingProtection() {
    return (req: Request, res: Response, next: NextFunction) => {
      const host = req.headers.host;
      const allowedHosts = (process.env.ALLOWED_HOSTS || 'localhost').split(',');

      if (!host || !allowedHosts.some(allowed => host.includes(allowed))) {
        return res.status(400).json({ error: 'Invalid host header' });
      }

      next();
    };
  }

  private anomalyDetection() {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = `${req.clientIp}:${req.path}`;
      const count = (this.requestCounter.get(key) || 0) + 1;
      this.requestCounter.set(key, count);

      // Reset counter every minute
      setTimeout(() => this.requestCounter.delete(key), 60000);

      // Detect anomalies
      if (count > 100) {
        console.warn('Anomaly detected: High request rate', {
          ip: req.clientIp,
          path: req.path,
          count,
        });
      }

      next();
    };
  }

  private setupHoneypots(app: Application) {
    const honeypots = [
      '/admin.php',
      '/wp-admin',
      '/.env',
      '/config.json',
      '/backup.sql',
      '/phpMyAdmin',
    ];

    honeypots.forEach(path => {
      app.all(path, (req: Request, res: Response) => {
        console.error('🍯 Honeypot triggered', {
          ip: req.clientIp,
          path: req.path,
          userAgent: req.headers['user-agent'],
        });

        // Add to suspicious IPs
        if (req.clientIp) {
          this.suspiciousIPs.add(req.clientIp);
        }

        // Slow response to waste attacker's time
        setTimeout(() => {
          res.status(404).send('Not found');
        }, 5000);
      });
    });
  }

  // Rate limiting with different strategies
  public async applyRateLimit(
    req: Request,
    res: Response,
    next: NextFunction,
    limiterName: string = 'general'
  ) {
    const limiter = this.rateLimiters.get(limiterName);

    if (!limiter) {
      return next();
    }

    const key = req.clientIp || 'unknown';

    try {
      const rateLimiterRes = await limiter.consume(key);

      res.setHeader('X-RateLimit-Limit', limiter.points.toString());
      res.setHeader('X-RateLimit-Remaining', rateLimiterRes.remainingPoints.toString());
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString());

      next();
    } catch (rejRes: any) {
      res.setHeader('X-RateLimit-Limit', limiter.points.toString());
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + rejRes.msBeforeNext).toISOString());
      res.setHeader('Retry-After', Math.ceil(rejRes.msBeforeNext / 1000).toString());

      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil(rejRes.msBeforeNext / 1000),
      });
    }
  }
}

export const securityOrchestrator = new SecurityOrchestrator();

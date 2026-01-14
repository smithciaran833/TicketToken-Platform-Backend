import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Redis, { RedisOptions } from 'ioredis';
// Import routes
import ticketRoutes from './routes/ticketRoutes';
import purchaseRoutes from './routes/purchaseRoutes';
import orderRoutes from './routes/orders.routes';
import webhookRoutes from './routes/webhookRoutes';
import healthRoutes from './routes/health.routes';
import internalRoutes from './routes/internalRoutes';
import transferRoutes from './routes/transferRoutes';
import qrRoutes from './routes/qrRoutes';
import validationRoutes from './routes/validationRoutes';
import mintRoutes from './routes/mintRoutes';
// Import middleware
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
// Import idempotency hooks - Fixes Batch 4 audit findings
import { idempotencyResponseHook, idempotencyErrorHook } from './middleware/idempotency.middleware';
// Import services
import { DatabaseService } from './services/databaseService';
// Import config
import { config } from './config';
import { logger } from './utils/logger';
// Import observability - Fixes audit findings DT1-DT7, M1-M5, LC4
import { shutdownTracing, getTraceContext } from './utils/tracing';
import { registerMetricsMiddleware } from './utils/metrics';

const log = logger.child({ component: 'App' });

/**
 * Create Redis client for rate limiting
 * SECURITY: Rate limiting MUST use Redis in production for distributed consistency
 */
function createRateLimitRedisClient(): Redis | undefined {
  if (!config.rateLimit.useRedis) {
    log.warn('Rate limiting using in-memory storage - NOT suitable for production');
    return undefined;
  }

  try {
    const redisOptions: RedisOptions = {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times: number) => {
        if (times > 3) {
          log.error('Redis rate limit connection failed after 3 retries');
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000);
      },
    };

    // Add password if configured
    if (config.redis.password) {
      redisOptions.password = config.redis.password;
    }

    // Add TLS if configured
    if (config.redis.tls) {
      redisOptions.tls = {};
    }

    const client = new Redis(config.redis.url, redisOptions);

    client.on('error', (err: Error) => {
      log.error('Redis rate limit client error', { error: err.message });
    });

    client.on('connect', () => {
      log.info('Redis rate limit client connected');
    });

    return client;
  } catch (error) {
    log.error('Failed to create Redis client for rate limiting', { error });
    if (config.env === 'production') {
      throw new Error('Redis is required for rate limiting in production');
    }
    return undefined;
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  // Initialize database connection FIRST
  await DatabaseService.initialize();

  const app = Fastify({
    logger: true,
    bodyLimit: 10 * 1024 * 1024, // 10MB
    /**
     * SECURITY: Trust only specific proxies instead of all
     * 
     * Using `trustProxy: true` trusts ALL proxies which allows attackers to spoof
     * X-Forwarded-For headers and bypass rate limiting by IP.
     * 
     * The trusted proxy list is configured via TRUSTED_PROXIES env var.
     * In production, this should be your load balancer IPs.
     * 
     * @see https://www.fastify.io/docs/latest/Reference/Server/#trustproxy
     */
    trustProxy: config.proxy.trustedProxies,
    // Generate request IDs for tracing
    genReqId: () => {
      return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    },
  });

  // Log trusted proxy configuration for debugging
  log.info('Trusted proxy configuration', { 
    trustedProxies: config.proxy.trustedProxies,
    environment: config.env 
  });

  // ============================================================================
  // ERROR HANDLING - Registered BEFORE routes for proper error catching
  // ============================================================================
  app.setErrorHandler(errorHandler as any);

  // 404 handler - Uses RFC 7807 Problem Details format
  app.setNotFoundHandler(notFoundHandler);

  // ============================================================================
  // OBSERVABILITY - Fixes M1-M5, DT1-DT7, LC4
  // ============================================================================
  
  // Register metrics middleware for automatic HTTP metrics collection
  if (config.features.enableMetrics) {
    registerMetricsMiddleware(app);
    log.info('Prometheus metrics middleware registered');
  }

  // ============================================================================
  // IDEMPOTENCY HOOKS - Fixes Batch 4 audit findings
  // ============================================================================
  
  // Register idempotency response hook to save responses for replay
  app.addHook('onSend', idempotencyResponseHook);
  
  // Register idempotency error hook to release locks on failures
  app.addHook('onError', idempotencyErrorHook);
  
  log.info('Idempotency hooks registered');

  // ============================================================================
  // PLUGINS
  // ============================================================================

  // ============================================================================
  // CORS - SEC-EXT6: Explicit origins configuration
  // ============================================================================
  const corsOrigins = process.env.CORS_ORIGINS 
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()) 
    : [];
  
  await app.register(cors, {
    /**
     * SECURITY: Explicit CORS origins
     * 
     * Never use '*' in production. Always specify allowed origins explicitly.
     * Configure via CORS_ORIGINS env var (comma-separated list).
     * 
     * Example: CORS_ORIGINS=https://app.tickettoken.io,https://admin.tickettoken.io
     */
    origin: config.env === 'production' 
      ? corsOrigins.length > 0 
        ? corsOrigins 
        : false // Block all if no origins configured in production
      : true, // Allow all in development
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-Tenant-Id',
      'Idempotency-Key',
      'X-Api-Key',
    ],
    exposedHeaders: [
      'X-Request-Id',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'Retry-After',
    ],
    maxAge: 86400, // 24 hours - browsers cache preflight requests
  });

  log.info('CORS configured', { 
    origins: config.env === 'production' ? corsOrigins : 'all (development)',
    environment: config.env 
  });

  // ============================================================================
  // HELMET - Comprehensive Security Headers
  // HSTS, CSP, X-Content-Type-Options, Referrer-Policy
  // ============================================================================
  await app.register(helmet, {
    /**
     * Content-Security-Policy (CSP)
     * Prevents XSS attacks by controlling which resources can be loaded
     */
    contentSecurityPolicy: config.env === 'production' 
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for error pages
            imgSrc: ["'self'", 'data:', 'https:'],
            fontSrc: ["'self'"],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"], // Prevent clickjacking
            upgradeInsecureRequests: [], // Upgrade HTTP to HTTPS
          },
        }
      : false, // Disable CSP in development for easier debugging

    /**
     * HTTP Strict Transport Security (HSTS)
     * Forces browsers to use HTTPS for all future requests
     */
    strictTransportSecurity: config.env === 'production'
      ? {
          maxAge: 31536000, // 1 year in seconds
          includeSubDomains: true,
          preload: true, // Allow inclusion in browser preload lists
        }
      : false,

    /**
     * X-Content-Type-Options
     * Prevents MIME type sniffing attacks
     */
    noSniff: true, // Sets X-Content-Type-Options: nosniff

    /**
     * X-Frame-Options
     * Prevents clickjacking by disabling iframe embedding
     */
    frameguard: {
      action: 'deny', // Sets X-Frame-Options: DENY
    },

    /**
     * X-XSS-Protection
     * Legacy XSS filter (modern browsers use CSP instead)
     */
    xssFilter: true, // Sets X-XSS-Protection: 1; mode=block

    /**
     * Referrer-Policy
     * Controls how much referrer information is sent with requests
     */
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin',
    },

    /**
     * X-DNS-Prefetch-Control
     * Controls browser DNS prefetching
     */
    dnsPrefetchControl: {
      allow: false, // Sets X-DNS-Prefetch-Control: off
    },

    /**
     * X-Download-Options
     * Prevents IE from executing downloads in site's context
     */
    ieNoOpen: true, // Sets X-Download-Options: noopen

    /**
     * X-Permitted-Cross-Domain-Policies
     * Restricts Adobe Flash and PDF cross-domain policies
     */
    permittedCrossDomainPolicies: {
      permittedPolicies: 'none',
    },

    /**
     * Cross-Origin-Embedder-Policy
     * Disabled for API service (not serving HTML)
     */
    crossOriginEmbedderPolicy: false,

    /**
     * Cross-Origin-Opener-Policy
     * Isolates browsing context
     */
    crossOriginOpenerPolicy: {
      policy: 'same-origin',
    },

    /**
     * Cross-Origin-Resource-Policy
     * Controls which origins can load this resource
     */
    crossOriginResourcePolicy: {
      policy: 'same-origin',
    },

    /**
     * Origin-Agent-Cluster
     * Enables origin-keyed agent clustering
     */
    originAgentCluster: true,
  });

  log.info('Helmet security headers configured', {
    environment: config.env,
    hsts: config.env === 'production',
    csp: config.env === 'production',
  });

  // ============================================================================
  // RATE LIMITING - Uses Redis in production for distributed consistency
  // ============================================================================
  if (config.rateLimit.enabled) {
    const redisClient = createRateLimitRedisClient();

    const rateLimitConfig: Parameters<typeof rateLimit>[1] = {
      global: true,
      max: config.rateLimit.max,
      timeWindow: config.rateLimit.windowMs,
      // SECURITY: Include tenant in key for tenant-scoped rate limiting
      keyGenerator: (request) => {
        const tenantId = (request as any).tenantId || 'anonymous';
        const userId = (request as any).user?.id || request.ip;
        return `ratelimit:${tenantId}:${userId}`;
      },
      // Custom error response
      errorResponseBuilder: (request, context) => {
        return {
          error: 'Too Many Requests',
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
          retryAfter: Math.ceil(context.ttl / 1000),
        };
      },
      // Skip rate limiting for health checks
      allowList: (request: FastifyRequest) => {
        return request.url === '/health' || 
               request.url === '/health/ready' || 
               request.url === '/health/live';
      },
      // Add rate limit headers
      addHeadersOnExceeding: {
        'x-ratelimit-limit': true,
        'x-ratelimit-remaining': true,
        'x-ratelimit-reset': true,
      },
      addHeaders: {
        'x-ratelimit-limit': true,
        'x-ratelimit-remaining': true,
        'x-ratelimit-reset': true,
        'retry-after': true,
      },
    };

    // SECURITY: Use Redis storage in production
    if (redisClient) {
      (rateLimitConfig as any).redis = redisClient;
      log.info('Rate limiting configured with Redis storage');
    } else {
      log.warn('Rate limiting using in-memory storage (development only)');
    }

    await app.register(rateLimit, rateLimitConfig);
  } else {
    log.warn('Rate limiting is DISABLED - this should only be for testing');
  }

  // ============================================================================
  // ROUTES
  // ============================================================================

  // Health routes (no prefix) - should be first and not rate limited
  await app.register(healthRoutes);

  // Internal routes (no prefix - they define their own paths)
  await app.register(internalRoutes);

  // Webhook routes - with specific rate limits
  await app.register(async (instance) => {
    // Webhooks have their own rate limit (higher for payment processors)
    if (config.rateLimit.enabled) {
      instance.addHook('onRequest', async (request, reply) => {
        // Payment webhooks from Stripe need higher limits
        const isPaymentWebhook = request.url.includes('/stripe') || 
                                  request.headers['stripe-signature'];
        if (isPaymentWebhook) {
          // Skip global rate limit for payment webhooks (they have their own signature validation)
          (request as any).skipRateLimit = true;
        }
      });
    }
    await instance.register(webhookRoutes);
  }, { prefix: '/api/v1/webhooks' });

  // API routes with auth - standard rate limits
  await app.register(ticketRoutes, { prefix: '/api/v1/tickets' });
  await app.register(purchaseRoutes, { prefix: '/api/v1/purchase' });
  await app.register(orderRoutes, { prefix: '/api/v1/orders' });
  await app.register(transferRoutes, { prefix: '/api/v1/transfer' });
  await app.register(qrRoutes, { prefix: '/api/v1/qr' });
  await app.register(validationRoutes, { prefix: '/api/v1/validation' });
  await app.register(mintRoutes, { prefix: '/mint' });

  // ============================================================================
  // GRACEFUL SHUTDOWN
  // ============================================================================
  const shutdown = async (signal: string) => {
    log.info(`${signal} received, starting graceful shutdown`);
    
    try {
      // Close the Fastify server (stops accepting new connections)
      await app.close();
      log.info('Server closed');

      // Shutdown OpenTelemetry tracing (flush any pending spans)
      await shutdownTracing();
      log.info('Tracing shut down');

      // Close database connections
      await DatabaseService.close();
      log.info('Database connections closed');

      process.exit(0);
    } catch (error) {
      log.error('Error during shutdown', { error });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return app;
}

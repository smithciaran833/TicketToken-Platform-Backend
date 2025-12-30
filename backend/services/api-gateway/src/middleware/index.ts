import { FastifyInstance } from 'fastify';
import fastifyHelmet from '@fastify/helmet';
import { setupRedisMiddleware } from './redis.middleware';
import { setupMetricsMiddleware } from './metrics.middleware';
import { setupCorsMiddleware } from './cors.middleware';
import { setupAuthMiddleware } from './auth.middleware';
import { setupRateLimitMiddleware, adjustRateLimits } from './rate-limit.middleware';
import { setupCircuitBreakerMiddleware } from './circuit-breaker.middleware';
import { setupLoggingMiddleware } from './logging.middleware';
import { setupValidationMiddleware } from './validation.middleware';
import { setupTimeoutMiddleware } from './timeout.middleware';
import { setupVenueIsolationMiddleware } from './venue-isolation.middleware';
import { setupErrorHandler, errorRecoveryMiddleware } from './error-handler.middleware';
import { domainRoutingMiddleware } from './domain-routing.middleware';
import { createLogger } from '../utils/logger';

const logger = createLogger('middleware');

// API version - update when making breaking changes
const API_VERSION = '1.0.0';

export async function setupMiddleware(server: FastifyInstance) {
  logger.info('Setting up middleware in correct order...');

  // 1. Error recovery (process-level)
  errorRecoveryMiddleware(server);

  // 2. Redis connection (needed by many other middleware)
  await setupRedisMiddleware(server);

  // 3. Metrics collection
  await setupMetricsMiddleware(server);

  // 4. HTTPS redirect (production only, before other processing)
  // Checks x-forwarded-proto since gateway is typically behind a load balancer
  if (process.env.NODE_ENV === 'production' && process.env.ENFORCE_HTTPS !== 'false') {
    server.addHook('onRequest', async (request, reply) => {
      // Skip for health checks (load balancer needs HTTP access)
      if (request.url.startsWith('/health') || request.url === '/ready' || request.url === '/metrics') {
        return;
      }

      const proto = request.headers['x-forwarded-proto'];
      if (proto === 'http') {
        const host = request.headers['x-forwarded-host'] || request.headers.host || request.hostname;
        const redirectUrl = `https://${host}${request.url}`;

        logger.debug({ from: request.url, to: redirectUrl }, 'Redirecting HTTP to HTTPS');

        return reply
          .code(301)
          .header('Location', redirectUrl)
          .header('Cache-Control', 'max-age=31536000') // Cache redirect for 1 year
          .send();
      }
    });
    logger.info('HTTPS redirect middleware enabled');
  }

  // 5. Security headers (before everything)
  await server.register(fastifyHelmet, {
    // HSTS - Strict Transport Security
    // Forces browsers to use HTTPS for all future requests
    hsts: {
      maxAge: 31536000,           // 1 year in seconds
      includeSubDomains: true,    // Apply to all subdomains
      preload: true               // Allow inclusion in browser preload lists
    },
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    // Other security headers
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
  });

  // 6. CORS (before authentication)
  await setupCorsMiddleware(server);

  // 7. Request ID and correlation ID (for tracing)
  server.addHook('onRequest', async (request, reply) => {
    // Request ID is already set by Fastify
    reply.header('X-Request-ID', request.id);
    reply.header('X-Correlation-ID', request.id);

    // Add request start time for performance tracking
    request.startTime = Date.now();
  });

  // 8. Domain routing for white-label (early, so it's available for all requests)
  server.addHook('onRequest', domainRoutingMiddleware);

  // 9. Logging (log all requests)
  await setupLoggingMiddleware(server);

  // 10. Rate limiting (before expensive operations)
  await setupRateLimitMiddleware(server);

  // Start dynamic rate limit adjustments
  adjustRateLimits(server);

  // 11. Circuit breaker setup
  await setupCircuitBreakerMiddleware(server);

  // 12. Request validation
  await setupValidationMiddleware(server);

  // 13. Authentication setup
  await setupAuthMiddleware(server);

  // 14. Venue isolation (after auth)
  await setupVenueIsolationMiddleware(server);

  // 15. Timeout handling
  await setupTimeoutMiddleware(server);

  // 16. Error handler (last)
  await setupErrorHandler(server);

  // Add response headers (API version, response time)
  server.addHook('onSend', async (request, reply) => {
    // API version header
    reply.header('X-API-Version', API_VERSION);
    
    // Response time
    if (request.startTime) {
      const responseTime = Date.now() - request.startTime;
      reply.header('X-Response-Time', `${responseTime}ms`);
    }
  });

  logger.info('All middleware configured successfully (including domain routing)');
}

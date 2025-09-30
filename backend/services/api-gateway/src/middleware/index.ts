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
import { createLogger } from '../utils/logger';

const logger = createLogger('middleware');

export async function setupMiddleware(server: FastifyInstance) {
  logger.info('Setting up middleware in correct order...');

  // 1. Error recovery (process-level)
  errorRecoveryMiddleware(server);

  // 2. Redis connection (needed by many other middleware)
  await setupRedisMiddleware(server);
  // 3. Metrics collection
  await setupMetricsMiddleware(server);

  // 3. Security headers (before everything)
  await server.register(fastifyHelmet, {
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
    crossOriginEmbedderPolicy: false,
  });

  // 4. CORS (before authentication)
  await setupCorsMiddleware(server);

  // 5. Request ID and context (for tracing)
  server.addHook('onRequest', async (request, reply) => {
    // Request ID is already set by Fastify
    reply.header('X-Request-ID', request.id);

    // Add request start time for performance tracking
    request.startTime = Date.now();
  });

  // 6. Logging (log all requests)
  await setupLoggingMiddleware(server);

  // 7. Rate limiting (before expensive operations)
  await setupRateLimitMiddleware(server);

  // Start dynamic rate limit adjustments
  adjustRateLimits(server);

  // 8. Circuit breaker setup
  await setupCircuitBreakerMiddleware(server);

  // 9. Request validation
  await setupValidationMiddleware(server);

  // 10. Authentication setup
  await setupAuthMiddleware(server);

  // 11. Venue isolation (after auth)
  await setupVenueIsolationMiddleware(server);

  // 12. Timeout handling
  await setupTimeoutMiddleware(server);

  // 13. Error handler (last)
  await setupErrorHandler(server);

  // Add response time header
  server.addHook('onSend', async (request, reply) => {
    if (request.startTime) {
      const responseTime = Date.now() - request.startTime;
      reply.header('X-Response-Time', `${responseTime}ms`);
    }
  });

  logger.info('All middleware configured successfully');
}

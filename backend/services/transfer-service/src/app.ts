import 'dotenv/config';
import fastify, { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import logger from './utils/logger';
import { register } from './utils/metrics';
import { transferRoutes } from './routes/transfer.routes';
import { internalRoutes } from './routes/internal.routes';
import { setTenantContext } from './middleware/tenant-context';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { idempotencyMiddleware } from './middleware/idempotency';

/**
 * APPLICATION SETUP
 * 
 * Fastify application configuration
 * 
 * AUDIT FIXES:
 * - ERR-1: Error handler registered after routes → Now BEFORE routes
 * - ERR-2: Generic error messages → Detailed errors with codes
 * - ERR-3: No request ID in errors → Request ID included
 * - RL-1/RL-2: Added custom rate limiting middleware
 * - IDP-1/IDP-2/IDP-3: Added idempotency middleware
 * - REQ-1: Added request ID middleware
 */

// =============================================================================
// ERROR CODES
// =============================================================================

const ERROR_CODES: Record<string, { status: number; message: string }> = {
  VALIDATION_ERROR: { status: 400, message: 'Request validation failed' },
  UNAUTHORIZED: { status: 401, message: 'Authentication required' },
  FORBIDDEN: { status: 403, message: 'Access denied' },
  NOT_FOUND: { status: 404, message: 'Resource not found' },
  CONFLICT: { status: 409, message: 'Resource conflict' },
  RATE_LIMITED: { status: 429, message: 'Too many requests' },
  INTERNAL_ERROR: { status: 500, message: 'Internal server error' },
  SERVICE_UNAVAILABLE: { status: 503, message: 'Service temporarily unavailable' }
};

// =============================================================================
// APPLICATION FACTORY
// =============================================================================

export async function createApp(pool: Pool) {
  const app = fastify({
    logger: false,
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    genReqId: () => uuidv4()
  });

  // Make pool available to middleware
  app.decorate('db', pool);

  // =============================================================================
  // AUDIT FIX ERR-1: Register error handler BEFORE routes
  // This ensures ALL errors are caught, including those from routes
  // =============================================================================
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.id as string;
    const tenantId = request.tenantId || 'unknown';
    
    // Determine error details
    let statusCode = error.statusCode || 500;
    let errorCode = 'INTERNAL_ERROR';
    let message = error.message || 'An unexpected error occurred';
    
    // Map known error types
    if (error.validation) {
      statusCode = 400;
      errorCode = 'VALIDATION_ERROR';
      message = 'Request validation failed';
    } else if (error.code === 'FST_ERR_NOT_FOUND') {
      statusCode = 404;
      errorCode = 'NOT_FOUND';
      message = 'Resource not found';
    } else if (error.code === 'FST_ERR_RATE_LIMIT') {
      statusCode = 429;
      errorCode = 'RATE_LIMITED';
      message = 'Rate limit exceeded';
    }
    
    // Map error codes from our error classes
    const knownErrorCode = ERROR_CODES[error.code || ''];
    if (knownErrorCode) {
      statusCode = knownErrorCode.status;
      errorCode = error.code || 'INTERNAL_ERROR';
    }
    
    // Log the error
    if (statusCode >= 500) {
      logger.error({
        err: error,
        requestId,
        tenantId,
        url: request.url,
        method: request.method,
        userId: (request as any).user?.id
      }, 'Server error');
    } else {
      logger.warn({
        error: error.message,
        code: errorCode,
        requestId,
        tenantId,
        url: request.url,
        method: request.method
      }, 'Client error');
    }
    
    // AUDIT FIX ERR-2: Don't expose internal error details in production
    const isProduction = process.env.NODE_ENV === 'production';
    
    reply.status(statusCode).send({
      error: ERROR_CODES[errorCode]?.message || message,
      code: errorCode,
      ...(error.validation && { 
        validation: error.validation.map(v => ({
          field: v.params?.missingProperty || v.instancePath,
          message: v.message
        }))
      }),
      // AUDIT FIX ERR-3: Always include request ID for tracing
      requestId,
      // Include stack trace only in development
      ...((!isProduction && statusCode >= 500) && { stack: error.stack })
    });
  });

  // =============================================================================
  // NOT FOUND HANDLER
  // =============================================================================
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    logger.debug({
      url: request.url,
      method: request.method,
      requestId: request.id
    }, 'Route not found');
    
    reply.status(404).send({
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      code: 'ROUTE_NOT_FOUND',
      requestId: request.id
    });
  });

  // =============================================================================
  // SECURITY MIDDLEWARE
  // =============================================================================
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"]
      }
    }
  });
  
  // Basic rate limiting (our custom middleware adds endpoint-specific limits)
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true
    }
  });

  // =============================================================================
  // REQUEST MIDDLEWARE (Order matters!)
  // =============================================================================
  
  // 1. Request ID middleware (first - sets ID for all subsequent logging)
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-ID', request.id);
  });

  // 2. Tenant context middleware
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await setTenantContext(request, reply);
    } catch (error) {
      logger.error({ error }, 'Failed to set tenant context');
    }
  });

  // 3. Custom rate limiting (endpoint-specific)
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    await rateLimitMiddleware(request, reply);
  });

  // 4. Idempotency middleware (for POST/PUT/PATCH)
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    await idempotencyMiddleware(request, reply);
  });

  // =============================================================================
  // HEALTH CHECK ROUTES (No auth required)
  // =============================================================================
  app.get('/health', async () => {
    return { 
      status: 'healthy', 
      service: 'transfer-service',
      timestamp: new Date().toISOString()
    };
  });

  app.get('/health/ready', async (_, reply) => {
    try {
      await pool.query('SELECT 1');
      return {
        status: 'ready',
        database: 'connected',
        service: 'transfer-service'
      };
    } catch (err: unknown) {
      const error = err as Error;
      reply.status(503);
      return {
        status: 'not_ready',
        database: 'disconnected',
        error: error.message,
        service: 'transfer-service'
      };
    }
  });

  app.get('/health/live', async () => {
    return { status: 'alive', service: 'transfer-service' };
  });

  app.get('/health/db', async (_, reply) => {
    try {
      const start = Date.now();
      await pool.query('SELECT 1');
      const latency = Date.now() - start;
      
      return {
        status: 'ok',
        database: 'connected',
        latencyMs: latency,
        service: 'transfer-service'
      };
    } catch (err: unknown) {
      const error = err as Error;
      reply.status(503);
      return {
        status: 'error',
        database: 'disconnected',
        error: error.message,
        service: 'transfer-service'
      };
    }
  });

  // =============================================================================
  // METRICS ROUTE
  // =============================================================================
  app.get('/metrics', async (_, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });

  // =============================================================================
  // API ROUTES (After all middleware)
  // =============================================================================
  await transferRoutes(app, pool);

  // =============================================================================
  // INTERNAL ROUTES (Service-to-service communication)
  // =============================================================================
  await app.register(internalRoutes, { prefix: '/internal' });

  // =============================================================================
  // RESPONSE LOGGING
  // =============================================================================
  app.addHook('onResponse', async (request, reply) => {
    logger.info({
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
      tenantId: request.tenantId
    }, 'Request completed');
  });

  return app;
}

import 'dotenv/config';
import fastify, { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Redis from 'ioredis';
import { Counter } from 'prom-client';
import logger from './utils/logger';
import { loadSecrets } from './config/secrets';
import { validateAll } from './utils/validate-config';
import { initializeDatabase, db } from './config/database';
import { initializeSolana } from './config/solana';
import { startMintingWorker } from './workers/mintingWorker';
import { initializeQueues, getMintQueue, getRetryQueue, getDLQ } from './queues/mintQueue';
import { startBalanceMonitoring, stopBalanceMonitoring } from './services/BalanceMonitor';
import { registerRequestIdMiddleware } from './middleware/request-id';
import { registerRequestLogger } from './middleware/request-logger';
import {
  BaseError,
  ErrorCode,
  isBaseError,
  isValidationError,
  isRateLimitError,
  ValidationError,
  RateLimitError
} from './errors';
import webhookRoutes from './routes/webhook';
import internalMintRoutes from './routes/internal-mint';
import metricsRoutes from './routes/metrics';
import healthRoutes from './routes/health';
import adminRoutes from './routes/admin';

// =============================================================================
// RATE LIMIT CONFIGURATION
// =============================================================================

// Redis client for rate limiting (shared across instances)
let rateLimitRedis: Redis | null = null;

function getRateLimitRedis(): Redis {
  if (!rateLimitRedis) {
    rateLimitRedis = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false
    });

    rateLimitRedis.on('error', (error) => {
      logger.warn('Rate limit Redis error (falling back to memory)', { error: error.message });
    });
  }
  return rateLimitRedis;
}

// Paths that should bypass rate limiting
const RATE_LIMIT_BYPASS_PATHS = [
  '/health',
  '/health/live',
  '/health/ready',
  '/health/startup',
  '/health/detailed',
  '/metrics'
];

// Rate limit hit counter for monitoring
const rateLimitHits = new Counter({
  name: 'minting_rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['endpoint', 'tenant_id', 'method']
});

// Track if shutdown is in progress
let isShuttingDown = false;

// =============================================================================
// PROCESS ERROR HANDLERS
// =============================================================================

/**
 * Handle unhandled promise rejections
 * Log and continue - these shouldn't crash the process
 */
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: String(promise)
  });
});

/**
 * Handle uncaught exceptions
 * Log and exit - these are serious errors
 */
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception - Process will exit', {
    error: error.message,
    stack: error.stack,
    name: error.name
  });

  // Give time to flush logs before exiting
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

/**
 * Handle process warnings
 */
process.on('warning', (warning: Error) => {
  logger.warn('Process Warning', {
    name: warning.name,
    message: warning.message,
    stack: warning.stack
  });
});

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

/**
 * Graceful shutdown handler
 * Closes all connections in the correct order
 */
async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress, ignoring signal', { signal });
    return;
  }

  isShuttingDown = true;
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  const shutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timeout - forcing exit');
    process.exit(1);
  }, 30000); // 30 second timeout

  try {
    // 1. Stop accepting new requests
    if (app) {
      logger.info('Closing HTTP server...');
      await app.close();
      logger.info('HTTP server closed');
    }

    // 2. Stop balance monitoring
    logger.info('Stopping balance monitoring...');
    stopBalanceMonitoring();

    // 3. Close queue workers (stop processing new jobs)
    try {
      const mintQueue = getMintQueue();
      const retryQueue = getRetryQueue();
      
      logger.info('Closing mint queue...');
      await mintQueue.close();
      
      logger.info('Closing retry queue...');
      await retryQueue.close();
      
      logger.info('Queue workers closed');
    } catch (queueError) {
      logger.warn('Error closing queues', { error: (queueError as Error).message });
    }

    // 4. Close database connections
    try {
      logger.info('Closing database connections...');
      await db.destroy();
      logger.info('Database connections closed');
    } catch (dbError) {
      logger.warn('Error closing database', { error: (dbError as Error).message });
    }

    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown complete');
    process.exit(0);

  } catch (error) {
    clearTimeout(shutdownTimeout);
    logger.error('Error during graceful shutdown', {
      error: (error as Error).message,
      stack: (error as Error).stack
    });
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// =============================================================================
// APP SETUP
// =============================================================================

// Create Fastify app
const app = fastify({
  logger: false,
  disableRequestLogging: true, // We handle this ourselves
  trustProxy: true
});

// =============================================================================
// GLOBAL ERROR HANDLER
// =============================================================================

/**
 * Global error handler for all unhandled errors in routes
 * Handles custom error classes with proper status codes and error codes
 */
app.setErrorHandler((error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply): void => {
  const requestId = request.id || 'unknown';
  
  // Check if this is one of our custom errors
  if (isBaseError(error)) {
    // Log custom error with full context
    logger.error('Request error (custom)', {
      errorType: error.name,
      errorCode: error.code,
      message: error.message,
      statusCode: error.statusCode,
      context: error.context,
      requestId,
      path: request.url,
      method: request.method,
      userId: (request as any).user?.id,
      tenantId: (request as any).user?.tenant_id,
      isOperational: error.isOperational,
      stack: error.stack
    });

    // Build response for custom errors
    const response: Record<string, unknown> = {
      error: error.statusCode >= 500 ? 'Internal server error' : error.message,
      code: error.code,
      requestId
    };

    // For client errors, include more details
    if (error.statusCode < 500) {
      response.message = error.message;
      
      // Include validation errors if present
      if (isValidationError(error) && error.validationErrors) {
        response.validationErrors = error.validationErrors;
      }

      // Include retry-after for rate limit errors
      if (isRateLimitError(error)) {
        response.retryAfter = error.retryAfter;
        reply.header('Retry-After', String(error.retryAfter));
      }

      // Include context for debugging (only for non-500 errors)
      if (error.context && Object.keys(error.context).length > 0) {
        // Filter out sensitive context keys
        const safeContext = Object.fromEntries(
          Object.entries(error.context).filter(([key]) => 
            !['password', 'secret', 'token', 'key', 'signature'].includes(key.toLowerCase())
          )
        );
        if (Object.keys(safeContext).length > 0) {
          response.details = safeContext;
        }
      }
    }

    reply.status(error.statusCode).send(response);
    return;
  }

  // Handle Fastify errors (validation, etc.)
  const fastifyError = error as FastifyError;
  
  // Log full error internally with stack trace
  logger.error('Request error (fastify/unknown)', {
    err: error,
    requestId,
    path: request.url,
    method: request.method,
    statusCode: fastifyError.statusCode || 500,
    errorCode: fastifyError.code,
    userId: (request as any).user?.id,
    tenantId: (request as any).user?.tenant_id
  });

  // Determine status code
  const statusCode = fastifyError.statusCode || 500;

  // Build response - don't expose internal error details for unknown errors
  const response: {
    error: string;
    code: string;
    requestId: string;
    message?: string;
  } = {
    error: statusCode >= 500 ? 'Internal server error' : (error.message || 'Request failed'),
    code: fastifyError.code || ErrorCode.INTERNAL_ERROR,
    requestId
  };

  // For client errors (4xx), include the message
  if (statusCode < 500 && error.message) {
    response.message = error.message;
  }

  reply.status(statusCode).send(response);
});

/**
 * Not found handler
 */
app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
  logger.warn('Route not found', {
    requestId: request.id,
    method: request.method,
    url: request.url
  });

  reply.status(404).send({
    error: 'Not found',
    code: 'NOT_FOUND',
    requestId: request.id,
    message: `Route ${request.method} ${request.url} not found`
  });
});

// =============================================================================
// MAIN STARTUP
// =============================================================================

async function main(): Promise<void> {
  try {
    logger.info('🚀 Starting Minting Service...');

    // ==========================================================================
    // STEP 1: Load secrets FIRST (before any other initialization)
    // ==========================================================================
    logger.info('Loading secrets...');
    await loadSecrets();

    // ==========================================================================
    // STEP 2: Validate configuration (secrets and required config)
    // ==========================================================================
    logger.info('Validating configuration...');
    validateAll();

    // ==========================================================================
    // STEP 3: Initialize connections (now that secrets are loaded)
    // ==========================================================================
    await initializeDatabase();
    await initializeSolana();
    await initializeQueues();

    // Start worker
    await startMintingWorker();

    // Start balance monitoring
    startBalanceMonitoring();

    logger.info('✅ Minting Service initialized successfully');
    logger.info(`   Port: ${process.env.MINTING_SERVICE_PORT || 3018}`);
    logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);

    // Register request ID middleware (must be first)
    registerRequestIdMiddleware(app);

    // Register request logging middleware (after request ID)
    registerRequestLogger(app);

    // Apply security middleware
    await app.register(helmet);
    
    // Rate limiting with Redis store (works across multiple instances)
    await app.register(rateLimit, {
      global: true,
      max: 100,
      timeWindow: '1 minute',
      redis: getRateLimitRedis(),
      
      // Use tenant ID if available, fall back to IP
      keyGenerator: (request: FastifyRequest) => {
        return (request as any).user?.tenant_id || request.ip;
      },
      
      // Bypass rate limits for health and metrics endpoints
      allowList: (request: FastifyRequest) => {
        return RATE_LIMIT_BYPASS_PATHS.some(path => 
          request.url === path || request.url.startsWith(path + '/')
        );
      },
      
      // Track rate limit hits for monitoring
      onExceeded: (request: FastifyRequest, key: string) => {
        const tenantId = (request as any).user?.tenant_id || 'anonymous';
        
        rateLimitHits.inc({
          endpoint: request.url.split('?')[0], // Remove query params
          tenant_id: tenantId,
          method: request.method
        });
        
        logger.warn('Rate limit exceeded', {
          key,
          url: request.url,
          method: request.method,
          tenantId,
          ip: request.ip,
          requestId: request.id
        });
      },
      
      // Custom error response
      errorResponseBuilder: (request: FastifyRequest, context) => {
        return {
          error: 'Too Many Requests',
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
          requestId: request.id,
          retryAfter: Math.ceil(context.ttl / 1000)
        };
      }
    });

    // Register routes
    await app.register(healthRoutes);
    await app.register(metricsRoutes);
    await app.register(adminRoutes);
    await app.register(webhookRoutes, { prefix: '/api' });
    await app.register(internalMintRoutes);

    // Start server
    const port = parseInt(process.env.MINTING_SERVICE_PORT || '3018');
    await app.listen({ port, host: '0.0.0.0' });
    
    logger.info(`🌐 API listening on port ${port}`);
    logger.info('🚀 Minting Service ready to accept requests');

  } catch (error) {
    logger.error('Failed to start Minting Service', {
      error: (error as Error).message,
      stack: (error as Error).stack
    });
    process.exit(1);
  }
}

// Start the service
main();

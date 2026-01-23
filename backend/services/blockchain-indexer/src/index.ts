import 'dotenv/config';
import fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import { v4 as uuidv4 } from 'uuid';
import { connectMongoDB, disconnectMongoDB } from './config/mongodb';
import { setTenantContext } from './middleware/tenant-context';
import BlockchainIndexer from './indexer';
import config from './config';
import logger from './utils/logger';
import queryRoutes from './routes/query.routes';
import internalRoutes from './routes/internal.routes';
import { register, isHealthy } from './utils/metrics';
import db from './utils/database';
import { validateConfigOrExit, testAllConnections, getConfigSummary } from './config/validate';
import { toProblemDetails, isBaseError, NotFoundError } from './errors';
import { getJobTracker, shutdownJobTracker, initializeJobTracker } from './utils/job-tracker';
import { stopCacheMetricsUpdates, startCacheMetricsUpdates } from './utils/cache';

const SERVICE_NAME = process.env.SERVICE_NAME || 'blockchain-indexer';
const PORT = parseInt(process.env.PORT || '3012', 10);
const HOST = process.env.HOST || '0.0.0.0';

// =============================================================================
// EXPLICIT COLUMN DEFINITIONS
// AUDIT FIX: INP-5/DB-7 - Avoid SELECT *, use explicit columns
// =============================================================================

const COLUMNS = {
  indexer_state: [
    'id',
    'last_processed_slot',
    'last_processed_signature',
    'indexer_version',
    'is_running',
    'started_at',
    'updated_at'
  ].join(', ')
};

async function startService(): Promise<void> {
  try {
    logger.info(`Starting ${SERVICE_NAME}...`);

    // Validate configuration
    validateConfigOrExit();

    // Log configuration summary
    const configSummary = getConfigSummary();
    logger.info({ config: configSummary }, 'Service configuration');

    // Test all connections before starting
    logger.info('Testing service connections...');
    const connectionsOk = await testAllConnections();
    if (!connectionsOk) {
      logger.warn('Some connections failed during testing, but service will attempt to start');
    }

    // Connect to MongoDB
    await connectMongoDB();

    // Initialize BlockchainIndexer
    let indexer: BlockchainIndexer | null = null;

    try {
      logger.info('Initializing BlockchainIndexer...');

      indexer = new BlockchainIndexer({
        solana: {
          rpcUrl: process.env.SOLANA_RPC_URL!,
          wsUrl: process.env.SOLANA_WS_URL,
          commitment: (process.env.SOLANA_COMMITMENT as any) || 'confirmed',
          programId: process.env.SOLANA_PROGRAM_ID
        }
      });

      const initialized = await indexer.initialize();
      if (!initialized) {
        throw new Error('Failed to initialize indexer');
      }

      await indexer.start();
      logger.info('✅ BlockchainIndexer started successfully');

    } catch (error) {
      logger.error({ error }, '❌ Failed to start BlockchainIndexer');
      throw error;
    }

    const app = fastify({
      logger: false,
      trustProxy: true,
      requestIdHeader: 'x-request-id',
      genReqId: () => uuidv4()
    });

    // AUDIT FIX: SEC-3 - Add HSTS header and security headers
    await app.register(helmet, {
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
      },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameSrc: ["'none'"]
        }
      }
    });
    await app.register(cors);
    await app.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute'
    });

    // Tenant isolation middleware
    // AUDIT FIX: SEC-1, ERR-2, MT-1 - Do NOT swallow tenant context errors
    // Swallowing errors allows requests to proceed without RLS context, bypassing security
    app.addHook('onRequest', async (request, reply) => {
      // Skip tenant context for health/metrics endpoints
      const publicPaths = ['/health', '/live', '/ready', '/startup', '/metrics', '/info'];
      if (publicPaths.some(path => request.url.startsWith(path))) {
        return;
      }

      try {
        await setTenantContext(request, reply);
      } catch (error) {
        // AUDIT FIX: Log and reject request instead of swallowing
        logger.error({
          error,
          path: request.url,
          method: request.method,
          ip: request.ip
        }, 'Failed to set tenant context - rejecting request');

        return reply.code(401).send({
          type: 'https://api.tickettoken.com/errors/TENANT_CONTEXT_MISSING',
          title: 'Unauthorized',
          status: 401,
          detail: 'Missing or invalid tenant context - valid JWT with tenant_id required',
          instance: request.url,
          timestamp: new Date().toISOString()
        });
      }
    });

    app.get('/health', async (request, reply) => {
      try {
        // Check indexer status
        const indexerRunning = indexer && (indexer as any).isRunning;

        // Check MongoDB connection
        const mongooseConnection = require('./config/mongodb').mongoose.connection;
        const mongoConnected = mongooseConnection.readyState === 1;

        // Check PostgreSQL connection
        let pgConnected = false;
        try {
          await db.query('SELECT 1');
          pgConnected = true;
        } catch (err) {
          logger.error({ error: err }, 'PostgreSQL health check failed');
        }

        // Check indexer state - AUDIT FIX: INP-5 - explicit columns
        let indexerState: any = null;
        let lag = 0;
        try {
          const result = await db.query(
            `SELECT ${COLUMNS.indexer_state} FROM indexer_state WHERE id = 1`
          );
          if (result.rows.length > 0) {
            indexerState = result.rows[0];
            // Calculate lag (would need current slot from indexer)
            lag = (indexer as any).syncStats?.lag || 0;
          }
        } catch (err) {
          logger.error({ error: err }, 'Failed to get indexer state');
        }

        const allHealthy = mongoConnected && pgConnected && indexerRunning;
        const status = allHealthy ? 'healthy' : 'degraded';

        // Update Prometheus health metric
        isHealthy.set(allHealthy ? 1 : 0);

        if (!allHealthy) {
          return reply.code(503).send({
            status,
            service: SERVICE_NAME,
            timestamp: new Date().toISOString(),
            checks: {
              mongodb: mongoConnected ? 'ok' : 'failed',
              postgresql: pgConnected ? 'ok' : 'failed',
              indexer: indexerRunning ? 'running' : 'stopped'
            },
            indexer: indexerState ? {
              lastProcessedSlot: indexerState.last_processed_slot,
              lag,
              isRunning: indexerState.is_running
            } : null
          });
        }

        return {
          status,
          service: SERVICE_NAME,
          timestamp: new Date().toISOString(),
          checks: {
            mongodb: 'ok',
            postgresql: 'ok',
            indexer: 'running'
          },
          indexer: indexerState ? {
            lastProcessedSlot: indexerState.last_processed_slot,
            lag,
            isRunning: indexerState.is_running
          } : null
        };
      } catch (error) {
        logger.error({ error }, 'Health check error');
        isHealthy.set(0);
        return reply.code(503).send({
          status: 'unhealthy',
          service: SERVICE_NAME,
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    app.get('/info', async (request, reply) => {
      return {
        service: SERVICE_NAME,
        version: '1.0.0',
        port: PORT,
        status: 'healthy'
      };
    });

    app.get('/api/v1/status', async (request, reply) => {
      return {
        status: 'running',
        service: SERVICE_NAME,
        port: PORT
      };
    });

    app.get('/api/v1/test-communication', async (request, reply) => {
      return {
        success: true,
        service: SERVICE_NAME,
        message: 'Service communication not yet implemented'
      };
    });

    // Register query routes
    await app.register(queryRoutes);
    logger.info('Query routes registered');

    // Register internal routes for service-to-service communication
    await app.register(internalRoutes, { prefix: '/internal' });
    logger.info('Internal routes registered at /internal');

    // AUDIT FIX: RL-9 - Protect metrics endpoint
    // Metrics endpoint with optional basic auth for Prometheus
    app.get('/metrics', async (request, reply) => {
      try {
        // Check for metrics auth if configured
        const metricsAuthToken = process.env.METRICS_AUTH_TOKEN;
        if (metricsAuthToken) {
          const authHeader = request.headers.authorization;
          
          if (!authHeader) {
            // Allow internal/localhost requests without auth
            const isInternalRequest = 
              request.ip === '127.0.0.1' || 
              request.ip === '::1' ||
              request.ip?.startsWith('10.') ||
              request.ip?.startsWith('172.') ||
              request.ip?.startsWith('192.168.');
            
            if (!isInternalRequest) {
              return reply.code(401).send({ 
                error: 'Unauthorized',
                message: 'Metrics endpoint requires authentication'
              });
            }
          } else {
            // Validate Bearer token
            const token = authHeader.replace('Bearer ', '');
            if (token !== metricsAuthToken) {
              logger.warn({ ip: request.ip }, 'Invalid metrics auth attempt');
              return reply.code(403).send({ 
                error: 'Forbidden',
                message: 'Invalid metrics authentication'
              });
            }
          }
        }
        
        reply.header('Content-Type', register.contentType);
        return await register.metrics();
      } catch (error) {
        logger.error({ error }, 'Error generating metrics');
        return reply.code(500).send({ error: 'Failed to generate metrics' });
      }
    });
    logger.info('Metrics endpoint registered at /metrics');

    // AUDIT FIX: ERR-8 - 404 handler
    app.setNotFoundHandler((request, reply) => {
      const problemDetails = toProblemDetails(
        new NotFoundError('Route', request.url),
        request.id,
        request.url
      );
      reply.code(404).send(problemDetails);
    });

    // AUDIT FIX: ERR-3 - RFC 7807 error handler
    app.setErrorHandler((error, request, reply) => {
      // Log error with context
      logger.error({
        error,
        requestId: request.id,
        path: request.url,
        method: request.method
      }, 'Request error');

      // Convert to RFC 7807 Problem Details format
      const problemDetails = toProblemDetails(error, request.id, request.url);

      // Add rate limit headers if applicable
      if (isBaseError(error) && error.statusCode === 429) {
        const retryAfter = (error as any).retryAfter || 60;
        reply.header('Retry-After', retryAfter);
      }

      reply.code(problemDetails.status).send(problemDetails);
    });

    await app.listen({ port: PORT, host: HOST });
    logger.info(`✅ ${SERVICE_NAME} running on port ${PORT}`);
    logger.info(`   - Health: http://${HOST}:${PORT}/health`);
    logger.info(`   - Info: http://${HOST}:${PORT}/info`);

    // AUDIT FIX: GD-5 - Complete graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down ${SERVICE_NAME}...`);

      // Stop accepting new requests
      logger.info('Stopping HTTP server...');
      await app.close();
      logger.info('✅ HTTP server stopped');

      // Stop cache metrics updates
      logger.info('Stopping cache metrics updates...');
      stopCacheMetricsUpdates();
      logger.info('✅ Cache metrics updates stopped');

      // Wait for in-flight jobs to complete
      logger.info('Waiting for in-flight jobs...');
      await shutdownJobTracker();
      logger.info('✅ Job tracker shutdown complete');

      // Stop blockchain indexer
      if (indexer) {
        logger.info('Stopping BlockchainIndexer...');
        await indexer.stop();
        logger.info('✅ BlockchainIndexer stopped');
      }

      // Disconnect databases
      logger.info('Disconnecting from MongoDB...');
      await disconnectMongoDB();
      logger.info('✅ MongoDB disconnected');

      logger.info(`✅ ${SERVICE_NAME} shutdown complete`);
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error({ error }, `Failed to start ${SERVICE_NAME}`);
    process.exit(1);
  }
}

// =============================================================================
// AUDIT FIX: ERR-4, ERR-5 - Process-level error handlers
// =============================================================================

/**
 * Handle unhandled promise rejections
 * AUDIT FIX: ERR-4 - Prevent silent failures from unhandled promises
 */
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error({
    reason: reason?.message || reason,
    stack: reason?.stack,
    type: 'unhandledRejection'
  }, 'Unhandled Promise Rejection - this should be investigated');

  // In production, log and continue (crash can cause cascading failures)
  // In development, exit to catch issues early
  if (process.env.NODE_ENV === 'development') {
    logger.error('Exiting due to unhandled rejection in development mode');
    process.exit(1);
  }
});

/**
 * Handle uncaught exceptions
 * AUDIT FIX: ERR-5 - Graceful shutdown on uncaught exceptions
 */
process.on('uncaughtException', (error: Error) => {
  logger.error({
    error: error.message,
    stack: error.stack,
    type: 'uncaughtException'
  }, 'Uncaught Exception - shutting down gracefully');

  // Give time for logs to flush before exiting
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

/**
 * Handle SIGTERM for graceful shutdown (Kubernetes, Docker)
 */
process.on('SIGTERM', () => {
  logger.info('SIGTERM received - initiating graceful shutdown');
});

/**
 * Handle SIGINT for graceful shutdown (Ctrl+C)
 */
process.on('SIGINT', () => {
  logger.info('SIGINT received - initiating graceful shutdown');
});

// Start the service
startService().catch((error) => {
  logger.error({ error }, 'Failed to start service');
  process.exit(1);
});

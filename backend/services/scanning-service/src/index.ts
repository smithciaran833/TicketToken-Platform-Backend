import dotenv from 'dotenv';
dotenv.config();

// Phase 2.3: Validate environment before anything else
import { validateEnv } from './config/env.validator';
validateEnv();

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { initializeDatabase, getPool } from './config/database';
import { initializeRedis, getRedis } from './config/redis';
import logger from './utils/logger';
import { setTenantContext } from './middleware/tenant-context';

// Import routes
import scanRoutes from './routes/scan';
import qrRoutes from './routes/qr';
import deviceRoutes from './routes/devices';
import offlineRoutes from './routes/offline';
import policyRoutes from './routes/policies';
import internalRoutes from './routes/internal.routes';

// Import metrics
import { register } from './utils/metrics';

// Global state for graceful shutdown
let isShuttingDown = false;
let fastifyInstance: FastifyInstance | null = null;

async function startService(): Promise<void> {
  try {
    logger.info('🚀 Starting Scanning Service...');

    // Initialize connections
    await initializeDatabase();
    await initializeRedis();

    // Create Fastify app with timeout configuration (Phase 2.4)
    const app: FastifyInstance = Fastify({
      logger: false, // Using winston instead
      trustProxy: true,
      requestTimeout: 30000,        // 30 seconds
      connectionTimeout: 10000,     // 10 seconds  
      keepAliveTimeout: 5000        // 5 seconds
    });
    
    fastifyInstance = app;

    // Decorate with database pool for middleware
    app.decorate('db', getPool());

    // Register plugins
    await app.register(helmet);
    await app.register(cors);

    // ====================================
    // TENANT ISOLATION MIDDLEWARE
    // ====================================
    // This middleware sets the PostgreSQL session variable for Row Level Security
    // IMPORTANT: Register AFTER authentication middleware (when added)
    app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await setTenantContext(request, reply);
      } catch (error) {
        logger.error('Failed to set tenant context', error);
        // Allow request to proceed - RLS will block unauthorized access
      }
    });

    // Phase 3.5: Enhanced health check (Returns 503 during shutdown)
    app.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
      if (isShuttingDown) {
        return reply.status(503).send({
          status: 'shutting_down',
          service: 'scanning-service',
          version: '1.0.0',
          timestamp: new Date().toISOString()
        });
      }

      // Check component health
      const health = {
        status: 'healthy',
        service: 'scanning-service',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks: {
          database: 'unknown',
          redis: 'unknown'
        }
      };

      // Quick database check
      try {
        const pool = getPool();
        await pool.query('SELECT 1');
        health.checks.database = 'healthy';
      } catch (error) {
        health.checks.database = 'unhealthy';
        health.status = 'degraded';
      }

      // Quick Redis check
      try {
        const redis = getRedis();
        await redis.ping();
        health.checks.redis = 'healthy';
      } catch (error) {
        health.checks.redis = 'unhealthy';
        health.status = 'degraded';
      }

      const statusCode = health.status === 'healthy' ? 200 : 503;
      return reply.status(statusCode).send(health);
    });

    // Readiness check (Kubernetes-friendly)
    app.get('/health/ready', async (request: FastifyRequest, reply: FastifyReply) => {
      if (isShuttingDown) {
        return reply.status(503).send({ ready: false, reason: 'shutting_down' });
      }

      try {
        const pool = getPool();
        await pool.query('SELECT 1');
        const redis = getRedis();
        await redis.ping();

        return reply.send({ 
          ready: true,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        return reply.status(503).send({ 
          ready: false, 
          reason: 'dependencies_unavailable',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Liveness check (Kubernetes-friendly)
    app.get('/health/live', async (request: FastifyRequest, reply: FastifyReply) => {
      if (isShuttingDown) {
        return reply.status(503).send({ alive: false });
      }

      return reply.send({ 
        alive: true,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    // Metrics endpoint
    app.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Content-Type', register.contentType);
      return reply.send(await register.metrics());
    });

    // Register API Routes
    await app.register(scanRoutes, { prefix: '/api/scan' });
    await app.register(qrRoutes, { prefix: '/api/qr' });
    await app.register(deviceRoutes, { prefix: '/api/devices' });
    await app.register(offlineRoutes, { prefix: '/api/offline' });
    await app.register(policyRoutes, { prefix: '/api/policies' });

    // Internal routes (service-to-service communication)
    await app.register(internalRoutes, { prefix: '/internal' });
    logger.info('Internal routes registered at /internal');

    // Global error handler
    app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      logger.error('Unhandled error:', error);
      reply.status(500).send({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Internal server error'
      });
    });

    // Start server
    const PORT = parseInt(process.env.PORT || '3009', 10);
    const HOST = process.env.HOST || '0.0.0.0';
    
    await app.listen({ port: PORT, host: HOST });
    logger.info(`✅ Scanning Service running on ${HOST}:${PORT}`);
  } catch (error) {
    logger.error('Failed to start service:', error);
    process.exit(1);
  }
}

// Phase 2.1: Graceful Shutdown Handler
async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress');
    return;
  }
  
  isShuttingDown = true;
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  try {
    // Stop accepting new requests
    if (fastifyInstance) {
      logger.info('Closing HTTP server...');
      await fastifyInstance.close();
      logger.info('✅ HTTP server closed');
    }
    
    // Close database connections
    const pool = getPool();
    if (pool) {
      logger.info('Closing database connections...');
      await pool.end();
      logger.info('✅ Database connections closed');
    }
    
    // Close Redis connections
    const redis = getRedis();
    if (redis) {
      logger.info('Closing Redis connection...');
      await redis.quit();
      logger.info('✅ Redis connection closed');
    }
    
    // Wait for in-flight requests (max 10s)
    logger.info('Waiting for in-flight requests to complete (max 10s)...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    logger.info('✅ Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection:', { reason, promise });
  gracefulShutdown('unhandledRejection');
});

// Start the service
startService();

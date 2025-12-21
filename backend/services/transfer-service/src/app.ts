import 'dotenv/config';
import fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import logger from './utils/logger';
import { register } from './utils/metrics';
import { transferRoutes } from './routes/transfer.routes';
import { setTenantContext } from './middleware/tenant-context';

/**
 * APPLICATION SETUP
 * 
 * Fastify application configuration
 * Phase 2: Code Restructuring
 */

export async function createApp(pool: Pool) {
  const app = fastify({
    logger: false,
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    genReqId: () => uuidv4()
  });

  // Make pool available to middleware
  app.decorate('db', pool);

  // Security & Rate Limiting
  await app.register(helmet);
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  });

  // ====================================
  // TENANT ISOLATION MIDDLEWARE
  // ====================================
  // This middleware sets the PostgreSQL session variable for Row Level Security
  // IMPORTANT: Register AFTER authentication middleware (when added)
  app.addHook('onRequest', async (request, reply) => {
    try {
      await setTenantContext(request, reply);
    } catch (error) {
      logger.error({ error }, 'Failed to set tenant context');
      // Allow request to proceed - RLS will block unauthorized access
    }
  });

  // Health Checks
  app.get('/health', async () => {
    return { status: 'healthy', service: 'transfer-service' };
  });

  app.get('/health/db', async (_, reply) => {
    try {
      await pool.query('SELECT 1');
      return {
        status: 'ok',
        database: 'connected',
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

  // Metrics
  app.get('/metrics', async (_, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });

  // Transfer Routes
  await transferRoutes(app, pool);

  // Global Error Handler
  app.setErrorHandler((error, request, reply) => {
    logger.error({ err: error, url: request.url, method: request.method }, 'Unhandled error');
    reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message
    });
  });

  return app;
}

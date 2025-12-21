import Fastify, { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { logger } from './utils/logger';
import { setTenantContext } from './middleware/tenant-context';

// Import routes
import { connectionRoutes } from './routes/connection.routes';
import { oauthRoutes } from './routes/oauth.routes';
import { syncRoutes } from './routes/sync.routes';
import { mappingRoutes } from './routes/mapping.routes';
import { webhookRoutes } from './routes/webhook.routes';
import { healthRoutes } from './routes/health.routes';
import { adminRoutes } from './routes/admin.routes';

export async function createServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    trustProxy: true,
    bodyLimit: 10485760 // 10MB
  });

  // Register plugins
  await app.register(helmet);
  await app.register(cors);

  // Rate limiting for /api routes
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  });

  // Tenant isolation middleware
  app.addHook('onRequest', async (request, reply) => {
    try {
      await setTenantContext(request, reply);
    } catch (error) {
      // Allow request to proceed - RLS will block unauthorized access
    }
  });

  // Health check (no auth required)
  app.get('/health', async (request, reply) => {
    return {
      status: 'healthy',
      service: process.env.SERVICE_NAME,
      timestamp: new Date().toISOString()
    };
  });

  // Register API routes
  await app.register(connectionRoutes, { prefix: '/api/v1/integrations' });
  await app.register(oauthRoutes, { prefix: '/api/v1/integrations/oauth' });
  await app.register(syncRoutes, { prefix: '/api/v1/integrations/sync' });
  await app.register(mappingRoutes, { prefix: '/api/v1/integrations/mappings' });
  await app.register(webhookRoutes, { prefix: '/api/v1/integrations/webhooks' });
  await app.register(healthRoutes, { prefix: '/api/v1/integrations/health' });
  await app.register(adminRoutes, { prefix: '/api/v1/integrations/admin' });

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    logger.error('Request error:', {
      error: error.message,
      stack: error.stack,
      url: request.url,
      statusCode: error.statusCode
    });

    reply.status(error.statusCode || 500).send({
      error: error.name || 'Internal Server Error',
      message: error.message,
      statusCode: error.statusCode || 500
    });
  });

  return app;
}

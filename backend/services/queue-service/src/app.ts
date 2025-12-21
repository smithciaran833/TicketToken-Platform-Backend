import { FastifyInstance } from 'fastify';
import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { errorMiddleware } from './middleware/error.middleware';
import { loggingMiddleware } from './middleware/logging.middleware';
import { metricsMiddleware } from './middleware/metrics.middleware';
import { authMiddleware } from './middleware/auth.middleware';
import { setTenantContext } from './middleware/tenant-context';

export async function createApp(): Promise<FastifyInstance> {
  const app = fastify({ logger: false });

  // Security middleware
  await app.register(helmet);
  await app.register(cors);

  // Compression
  await app.register(compress);

  // API Documentation (Swagger)
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Queue Service API',
        description: 'Background job processing and queue management for TicketToken platform',
        version: '1.0.0'
      },
      servers: [
        {
          url: 'http://localhost:3011',
          description: 'Development server'
        }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      },
      security: [{ bearerAuth: [] }]
    }
  });

  await app.register(swaggerUi, {
    routePrefix: '/api/v1/queue/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false
    },
    staticCSP: true
  });

  // Custom middleware
  app.addHook('onRequest', loggingMiddleware);
  app.addHook('onRequest', metricsMiddleware);

  // Authentication middleware (except health check and docs)
  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health' ||
        request.url.startsWith('/health') ||
        request.url.startsWith('/api/v1/queue/docs')) {
      return; // Skip auth for health checks and API documentation
    }
    await authMiddleware(request, reply);
  });

  // Tenant isolation middleware (after auth)
  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health' || request.url.startsWith('/health')) {
      return; // Skip tenant context for health checks
    }
    try {
      await setTenantContext(request, reply);
    } catch (error) {
      // Allow request to proceed - RLS will block unauthorized access
    }
  });

  // API Routes - loaded dynamically after database is initialized
  const { default: routes } = await import('./routes');
  await app.register(routes, { prefix: '/api/v1/queue' });

  // Root health check (public)
  app.get('/health', async (request, reply) => {
    return reply.send({ status: 'healthy', service: 'queue-service' });
  });

  // Error handling
  app.setErrorHandler(errorMiddleware);

  return app;
}

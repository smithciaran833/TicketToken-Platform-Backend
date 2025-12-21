import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { connectDatabase } from './config/database';
import { createDependencyContainer } from './config/dependencies';
import routes from './routes';
import { registerRateLimiting } from './middleware/rate-limit';
import { registerErrorHandler } from './middleware/error-handler';

export async function buildApp(): Promise<FastifyInstance> {
  // Initialize database connection FIRST
  await connectDatabase();

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV !== 'production' ? {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      } : undefined
    },
    requestTimeout: 30000,
    connectionTimeout: 10000,
    keepAliveTimeout: 72000
  });

  // Create dependency injection container (now db is initialized)
  const container = createDependencyContainer();

  // Decorate Fastify with container
  app.decorate('container', container);

  // Add hook to attach container to each request
  app.addHook('onRequest', async (request) => {
    (request as any).container = container;
  });

  // Register plugins
  await app.register(helmet, {
    contentSecurityPolicy: false
  });

  await app.register(cors, {
    origin: true,
    credentials: true
  });

  // Register rate limiting
  await registerRateLimiting(app);

  // Register error handler
  registerErrorHandler(app);

  // Health check endpoint
  app.get('/health', async (_request, reply) => {
    return reply.send({ status: 'healthy', service: 'event-service' });
  });

  // Register API routes with prefix
  await app.register(routes, { prefix: '/api/v1' });

  return app;
}

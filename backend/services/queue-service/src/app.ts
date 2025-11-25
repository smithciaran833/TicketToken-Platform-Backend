import { FastifyInstance } from 'fastify';
import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import { errorMiddleware } from './middleware/error.middleware';
import { loggingMiddleware } from './middleware/logging.middleware';
import { metricsMiddleware } from './middleware/metrics.middleware';
import routes from './routes';

export async function createApp(): Promise<FastifyInstance> {
  const app = fastify({ logger: false });

  // Security middleware
  await app.register(helmet);
  await app.register(cors);

  // Compression
  await app.register(compress);

  // Custom middleware
  app.addHook('onRequest', loggingMiddleware);
  app.addHook('onRequest', metricsMiddleware);

  // API Routes
  await app.register(routes, { prefix: '/api/v1/queue' });

  // Root health check
  app.get('/health', async (request, reply) => {
    return reply.send({ status: 'healthy', service: 'queue-service' });
  });

  // Error handling
  app.setErrorHandler(errorMiddleware);

  return app;
}

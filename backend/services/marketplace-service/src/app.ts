import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import routes from './routes';
import { errorHandler } from './middleware/error.middleware';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // Using our custom logger
    trustProxy: true,
  });

  // Register plugins
  await app.register(cors, {
    origin: true, // Allow all origins in development, configure for production
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false, // Adjust based on your needs
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(multipart);

  // Register routes
  await app.register(routes, { prefix: '/api/v1/marketplace' });

  // Set error handler
  app.setErrorHandler(errorHandler);

  return app;
}

// Default export for backwards compatibility with tests
export default buildApp;

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/error.middleware';
import { setupRoutes } from './routes';

export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    bodyLimit: 104857600, // 100MB
    trustProxy: true
  });
  
  // Register plugins
  await app.register(cors, {
    origin: process.env.NODE_ENV === 'production' 
      ? process.env.ALLOWED_ORIGINS?.split(',') 
      : true,
    credentials: true
  });
  
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  });
  
  await app.register(multipart, {
    limits: {
      fieldNameSize: 100,
      fieldSize: 100,
      fields: 10,
      fileSize: Number(process.env.MAX_FILE_SIZE_MB) * 1024 * 1024,
      files: 10,
      headerPairs: 2000
    }
  });
  
  await app.register(jwt, {
    secret: process.env.JWT_SECRET!
  });
  
  // Serve static files in development
  if (process.env.NODE_ENV === 'development') {
    await app.register(fastifyStatic, {
      root: path.join(__dirname, '../uploads'),
      prefix: '/files/',
      decorateReply: false
    });
  }
  
  // Setup error handling
  app.setErrorHandler(errorHandler);
  
  // Setup routes (includes health check)
  await setupRoutes(app);
  
  return app;
}

import { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('cors-middleware');

export async function setupCorsMiddleware(server: FastifyInstance) {
  await server.register(fastifyCors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., mobile apps, Postman, curl)
      if (!origin) {
        return callback(null, true);
      }
      
      // For development, allow all localhost origins
      if (process.env.NODE_ENV === 'development' && origin.includes('localhost')) {
        return callback(null, true);
      }
      
      // Check if origin is in allowed list
      const allowedOrigins = config.cors.origin;
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      logger.warn({ origin }, 'Blocked by CORS policy');
      callback(new Error('Not allowed by CORS'), false);
    },
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-API-Key',
      'X-Request-ID',
      'X-Venue-ID',
      'X-Venue-Tier',
      'X-Idempotency-Key',
      'X-Forwarded-For',
      'X-Real-IP',
    ],
    exposedHeaders: [
      'X-Request-ID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'Retry-After',
      'Location',
    ],
  });

  logger.info('CORS middleware configured');
}

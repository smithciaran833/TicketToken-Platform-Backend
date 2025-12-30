import { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('cors-middleware');

export async function setupCorsMiddleware(server: FastifyInstance) {
  // Strict mode: reject requests without Origin header in production
  // Set CORS_STRICT=true to enable (breaks mobile apps and server-to-server calls)
  const strictMode = process.env.CORS_STRICT === 'true';

  await server.register(fastifyCors, {
    origin: (origin, callback) => {
      // Requests without Origin header (mobile apps, server-to-server, curl)
      if (!origin) {
        if (strictMode && process.env.NODE_ENV === 'production') {
          // In strict mode, only allow no-origin for specific paths
          // This blocks browser requests that somehow lack Origin
          logger.warn('Blocked request with no Origin header (strict mode)');
          return callback(new Error('Origin header required'), false);
        }
        // Allow no-origin requests (mobile apps, API clients, webhooks)
        // This is necessary for:
        // - Native mobile apps (iOS/Android don't send Origin)
        // - Server-to-server API calls
        // - Webhooks from external services
        // - curl/Postman during development
        return callback(null, true);
      }

      // Development: allow all localhost origins
      if (process.env.NODE_ENV === 'development') {
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
          return callback(null, true);
        }
      }

      // Check if origin is in allowed list
      const allowedOrigins = config.cors.origin;
      
      // Handle wildcard
      if (allowedOrigins.includes('*')) {
        return callback(null, true);
      }

      // Exact match
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Pattern matching for subdomains (e.g., *.tickettoken.com)
      const isAllowed = allowedOrigins.some(allowed => {
        if (allowed.startsWith('*.')) {
          const domain = allowed.slice(2);
          return origin.endsWith(domain) || origin.endsWith('.' + domain);
        }
        return false;
      });

      if (isAllowed) {
        return callback(null, true);
      }

      logger.warn({ origin, allowedOrigins }, 'Blocked by CORS policy');
      callback(new Error('Not allowed by CORS'), false);
    },
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-API-Key',
      'X-Request-ID',
      'X-Correlation-ID',
      'Idempotency-Key',
      'X-Forwarded-For',
      'X-Real-IP',
      'Accept',
      'Accept-Language',
    ],
    exposedHeaders: [
      'X-Request-ID',
      'X-Correlation-ID',
      'X-API-Version',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-Response-Time',
      'X-Cache',
      'Retry-After',
      'Location',
      'Deprecation',
      'Sunset',
    ],
    maxAge: 86400, // Cache preflight for 24 hours
  });

  logger.info({ strictMode }, 'CORS middleware configured');
}

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import csrf from '@fastify/csrf-protection';
import rateLimit from '@fastify/rate-limit';
import underPressure from '@fastify/under-pressure';
import { createDependencyContainer } from './config/dependencies';
import { authRoutes } from './routes/auth.routes';
import { env } from './config/env';
import { setupHealthRoutes } from './services/monitoring.service';
import { pool } from './config/database';
import { getRedis } from './config/redis';
import { correlationMiddleware } from './middleware/correlation.middleware';
import { withCorrelation } from './utils/logger';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: env.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      } : undefined
    },
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    disableRequestLogging: false,
    connectionTimeout: 10000,
    keepAliveTimeout: 72000,
    requestTimeout: 30000,
    bodyLimit: 1048576,
    // Generate request IDs if not provided
    genReqId: (req) => {
      return (req.headers['x-correlation-id'] as string) || 
             (req.headers['x-request-id'] as string) || 
             require('crypto').randomUUID();
    },
  });

  // Register correlation ID middleware first
  await correlationMiddleware(app);

  // Wrap request handling with correlation context
  app.addHook('preHandler', async (request) => {
    // This ensures all async operations within the request have access to correlation ID
    const correlationId = request.correlationId || request.id;
    return withCorrelation(correlationId, () => {});
  });

  // HC-F7: Under pressure - automatic load shedding
  await app.register(underPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 500 * 1024 * 1024,
    maxRssBytes: 1024 * 1024 * 1024,
    maxEventLoopUtilization: 0.98,
    pressureHandler: (_req, rep, type, value) => {
      rep
        .status(503)
        .header('Content-Type', 'application/problem+json')
        .header('Retry-After', '30')
        .send({
          type: 'https://httpstatuses.com/503',
          title: 'Service Unavailable',
          status: 503,
          detail: `Server under pressure: ${type} at ${value}`,
          code: 'SERVICE_OVERLOADED',
        });
    },
    healthCheck: async () => {
      try {
        const redis = getRedis();
        await Promise.all([
          pool.query('SELECT 1'),
          redis.ping()
        ]);
        return true;
      } catch {
        return false;
      }
    },
    healthCheckInterval: 5000,
    exposeStatusRoute: {
      routeOpts: {
        logLevel: 'warn',
      },
      routeSchemaOpts: {
        hide: true,
      },
      url: '/health/pressure',
    },
  });

  // Register plugins
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // SEC-R14: HSTS header enabled
  await app.register(helmet, {
    contentSecurityPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  });

  // CSRF Protection
  await app.register(csrf, {
    cookieOpts: {
      signed: true,
      sameSite: 'strict',
      httpOnly: true,
      secure: env.NODE_ENV === 'production'
    }
  });

  // Rate limiting with standard headers
  await app.register(rateLimit, {
    global: false,
    max: 100,
    timeWindow: '15 minutes',
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
  });

  // Create and attach dependency container
  const container = createDependencyContainer();
  app.decorate('container', container);

  // 404 Not Found handler (RFC 7807)
  app.setNotFoundHandler((request, reply) => {
    reply
      .status(404)
      .header('Content-Type', 'application/problem+json')
      .send({
        type: 'https://httpstatuses.com/404',
        title: 'Not Found',
        status: 404,
        detail: `Route ${request.method} ${request.url} not found`,
        instance: request.url,
        correlationId: request.correlationId || request.id,
      });
  });

  // Global error handler (RFC 7807)
  app.setErrorHandler((error: any, request, reply) => {
    request.log.error(error);

    const statusCode = error.statusCode || 500;
    const correlationId = request.correlationId || request.id;

    // Under pressure errors
    if (error.code === 'FST_UNDER_PRESSURE') {
      return reply
        .status(503)
        .header('Content-Type', 'application/problem+json')
        .header('Retry-After', '30')
        .send({
          type: 'https://httpstatuses.com/503',
          title: 'Service Unavailable',
          status: 503,
          detail: 'Service is under heavy load. Please retry later.',
          instance: request.url,
          correlationId,
          code: 'SERVICE_OVERLOADED',
        });
    }

    // CSRF token errors
    if (error.code === 'FST_CSRF_INVALID_TOKEN' || error.code === 'FST_CSRF_MISSING_TOKEN') {
      return reply
        .status(403)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'https://httpstatuses.com/403',
          title: 'Forbidden',
          status: 403,
          detail: 'Invalid or missing CSRF token',
          instance: request.url,
          correlationId,
          code: 'CSRF_ERROR',
        });
    }

    // Rate limiting
    if (statusCode === 429) {
      return reply
        .status(429)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'https://httpstatuses.com/429',
          title: 'Too Many Requests',
          status: 429,
          detail: 'Too many requests. Please try again later.',
          instance: request.url,
          correlationId,
        });
    }

    const errorMessage = error.message || '';

    // 422 Unprocessable Entity
    if (statusCode === 422) {
      return reply
        .status(422)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'https://httpstatuses.com/422',
          title: 'Unprocessable Entity',
          status: 422,
          detail: error.message,
          instance: request.url,
          correlationId,
          ...(error.errors && { errors: error.errors }),
        });
    }

    // 409 Conflict
    if (errorMessage.includes('already registered') || errorMessage.includes('already exists')) {
      return reply
        .status(409)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'https://httpstatuses.com/409',
          title: 'Conflict',
          status: 409,
          detail: error.message,
          instance: request.url,
          correlationId,
        });
    }

    // 401 Unauthorized
    if (errorMessage.includes('Invalid credentials') ||
        errorMessage.includes('Invalid password') ||
        errorMessage.includes('Invalid refresh token') ||
        statusCode === 401) {
      return reply
        .status(401)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'https://httpstatuses.com/401',
          title: 'Unauthorized',
          status: 401,
          detail: error.message || 'Unauthorized',
          instance: request.url,
          correlationId,
        });
    }

    // 400 Bad Request - validation errors
    if (statusCode === 400 || error.validation) {
      const detail = error.validation
        ? 'Validation error'
        : (error.errors && Array.isArray(error.errors) && error.errors.length > 0)
          ? (typeof error.errors[0] === 'string' ? error.errors[0] : error.errors[0].message || error.message)
          : error.message;

      return reply
        .status(400)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'https://httpstatuses.com/400',
          title: 'Bad Request',
          status: 400,
          detail,
          instance: request.url,
          correlationId,
          ...(error.validation && { errors: error.validation }),
          ...(error.errors && { errors: error.errors }),
        });
    }

    // Default 500
    const detail = env.NODE_ENV === 'production'
      ? 'Internal server error'
      : error.message || 'Internal server error';

    return reply
      .status(statusCode)
      .header('Content-Type', 'application/problem+json')
      .send({
        type: `https://httpstatuses.com/${statusCode}`,
        title: 'Internal Server Error',
        status: statusCode,
        detail,
        instance: request.url,
        correlationId,
      });
  });

  // Setup health check routes
  await setupHealthRoutes(app);

  // Register auth routes
  await app.register(authRoutes, {
    prefix: '/auth',
    container
  });

  return app;
}

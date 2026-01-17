import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import csrf from '@fastify/csrf-protection';
import rateLimit from '@fastify/rate-limit';
import underPressure from '@fastify/under-pressure';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { createDependencyContainer } from './config/dependencies';
import { authRoutes } from './routes/auth.routes';
import { internalRoutes } from './routes/internal.routes';
import { env } from './config/env';
import { setupHealthRoutes } from './services/monitoring.service';
import { pool, db } from './config/database';
import { getRedis, closeRedisConnections } from './config/redis';
import { correlationMiddleware } from './middleware/correlation.middleware';
import { registerIdempotencyHooks } from './middleware/idempotency.middleware';
import { registerLoadShedding } from './middleware/load-shedding.middleware';
import { withCorrelation, logger } from './utils/logger';
import { RateLimitError } from './errors';
import { swaggerOptions, swaggerUiOptions } from './config/swagger';
import { httpRequestsTotal, httpRequestDurationSeconds } from './utils/metrics';

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
    trustProxy: env.NODE_ENV === 'production'
      ? (process.env.TRUSTED_PROXIES?.split(',') || true)
      : true,
    requestIdHeader: 'x-request-id',
    disableRequestLogging: false,
    connectionTimeout: 10000,
    keepAliveTimeout: 72000,
    requestTimeout: 30000,
    bodyLimit: 1048576,
    genReqId: (req) => {
      return (req.headers['x-correlation-id'] as string) ||
             (req.headers['x-request-id'] as string) ||
             require('crypto').randomUUID();
    },
  });

  if (env.NODE_ENV === 'production') {
    app.addHook('onRequest', async (request, reply) => {
      const proto = request.headers['x-forwarded-proto'];
      if (proto === 'http') {
        const host = request.headers['host'] || '';
        return reply.redirect(301, `https://${host}${request.url}`);
      }
    });
  }

  await correlationMiddleware(app);
  registerIdempotencyHooks(app);

  app.addHook('preHandler', async (request) => {
    const correlationId = request.correlationId || request.id;
    return withCorrelation(correlationId, () => {});
  });

  app.addHook('onRequest', async (request) => {
    (request as any).metricsStartTime = process.hrtime.bigint();
  });

  app.addHook('onResponse', async (request, reply) => {
    const startTime = (request as any).metricsStartTime;
    if (startTime) {
      const duration = Number(process.hrtime.bigint() - startTime) / 1e9;
      const route = request.routeOptions?.url || request.url.split('?')[0];
      const labels = {
        method: request.method,
        route: route,
        status_code: reply.statusCode.toString(),
      };
      httpRequestsTotal.inc(labels);
      httpRequestDurationSeconds.observe(labels, duration);
    }
  });

  await app.register(swagger, swaggerOptions);
  await app.register(swaggerUi, swaggerUiOptions);

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
      routeOpts: { logLevel: 'warn' },
      routeSchemaOpts: { hide: true },
      url: '/health/pressure',
    },
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  });

  // CSRF Protection - disabled in test environment
  if (env.NODE_ENV !== 'test') {
    await app.register(csrf, {
      cookieOpts: {
        signed: true,
        sameSite: 'strict',
        httpOnly: true,
        secure: env.NODE_ENV === 'production'
      }
    });
  }

  const redis = getRedis();
  await app.register(rateLimit, {
    global: true,
    max: 1000,
    timeWindow: '1 minute',
    redis: redis,
    skipOnError: true,
    keyGenerator: (request) => {
      const userId = (request as any).user?.id;
      return userId ? `${request.ip}:${userId}` : request.ip;
    },
    onExceeded: (request) => {
      logger.warn('Global rate limit exceeded', {
        ip: request.ip,
        path: request.url,
        method: request.method,
        userId: (request as any).user?.id,
        correlationId: request.correlationId || request.id,
      });
    },
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

  registerLoadShedding(app);

  const container = createDependencyContainer();
  app.decorate('container', container);

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

  app.setErrorHandler((error: any, request, reply) => {
    request.log.error(error);

    const statusCode = error.statusCode || 500;
    const correlationId = request.correlationId || request.id;

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

    if (error instanceof RateLimitError || error.name === 'RateLimitError' || error.constructor?.name === 'RateLimitError') {
      const ttl = error.ttl || 60;
      const limit = error.limit || 100;
      const resetTime = Math.ceil(Date.now() / 1000) + ttl;

      return reply
        .status(429)
        .header('Content-Type', 'application/problem+json')
        .header('RateLimit-Limit', String(limit))
        .header('RateLimit-Remaining', '0')
        .header('RateLimit-Reset', String(resetTime))
        .header('Retry-After', String(ttl))
        .send({
          type: 'https://httpstatuses.com/429',
          title: 'Too Many Requests',
          status: 429,
          detail: error.message || 'Too many requests. Please try again later.',
          instance: request.url,
          correlationId,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: ttl,
        });
    }

    if (error.code === 'FST_ERR_RATE_LIMIT_EXCEEDED' || statusCode === 429) {
      const retryAfter = error.retryAfter || 60;
      return reply
        .status(429)
        .header('Content-Type', 'application/problem+json')
        .header('RateLimit-Limit', '1000')
        .header('RateLimit-Remaining', '0')
        .header('Retry-After', String(retryAfter))
        .send({
          type: 'https://httpstatuses.com/429',
          title: 'Too Many Requests',
          status: 429,
          detail: 'Too many requests. Please try again later.',
          instance: request.url,
          correlationId,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter,
        });
    }

    const errorMessage = error.message || '';

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

  await setupHealthRoutes(app);

  await app.register(authRoutes, {
    prefix: '/auth',
    container
  });

  await app.register(internalRoutes, {
    prefix: '/auth/internal'
  });

  app.addHook('onClose', async () => {
    logger.info('App closing, cleaning up connections...');

    try {
      await db.destroy();
      logger.info('Knex connection closed');
    } catch (err) {
      logger.error('Error closing knex connection', { error: err });
    }

    try {
      await pool.end();
      logger.info('Database pool closed');
    } catch (err) {
      logger.error('Error closing database pool', { error: err });
    }

    try {
      await closeRedisConnections();
      logger.info('Redis connections closed');
    } catch (err) {
      logger.error('Error closing Redis connections', { error: err });
    }
  });

  return app;
}

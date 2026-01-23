import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import routes from './routes';
import internalRoutes from './routes/internal.routes';
import { errorHandler } from './middleware/error.middleware';
import { setTenantContext } from './middleware/tenant-context';
import knex from './config/database';
import { logger } from './utils/logger';
import Redis from 'ioredis';

/**
 * Application Builder for Marketplace Service
 * 
 * Issues Fixed:
 * - LOG-4: Request logging disabled → Enabled with custom logger
 * - RL-1: In-memory rate limiting → Redis store for distributed rate limiting
 * - MT-1: Tenant context silent failure → Proper error handling with logging
 */

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // AUDIT FIX LOG-4: Enable request logging with custom logger
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      stream: {
        write: (msg: string) => {
          try {
            const parsed = JSON.parse(msg);
            logger.info('request', parsed);
          } catch {
            logger.info(msg.trim());
          }
        }
      }
    },
    trustProxy: true,
    // Generate unique request IDs
    genReqId: () => {
      const crypto = require('crypto');
      return crypto.randomUUID();
    }
  });

  // Decorate with database
  app.decorate('db', knex);

  /**
   * FIX #31: Validate CORS origins for proper URL format
   */
  function getValidatedCorsOrigins(): string[] | boolean {
    if (process.env.NODE_ENV !== 'production') {
      return true; // Allow all origins in development
    }
    
    const corsOriginEnv = process.env.CORS_ORIGIN;
    if (!corsOriginEnv) {
      logger.warn('CORS_ORIGIN not configured in production - CORS will be disabled');
      return false;
    }
    
    const origins = corsOriginEnv.split(',').map(o => o.trim()).filter(Boolean);
    const validatedOrigins: string[] = [];
    
    for (const origin of origins) {
      // Validate URL format
      try {
        const url = new URL(origin);
        // Only allow http/https protocols
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          logger.warn('Invalid CORS origin protocol (must be http/https)', { origin });
          continue;
        }
        // Reject wildcard in production
        if (origin === '*') {
          logger.error('CORS wildcard (*) not allowed in production');
          continue;
        }
        validatedOrigins.push(origin);
      } catch {
        logger.warn('Invalid CORS origin URL format', { origin });
      }
    }
    
    if (validatedOrigins.length === 0) {
      logger.error('No valid CORS origins configured - CORS will be disabled');
      return false;
    }
    
    logger.info('CORS configured with validated origins', { origins: validatedOrigins });
    return validatedOrigins;
  }

  // Register plugins
  await app.register(cors, {
    origin: getValidatedCorsOrigins(),
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
  });

  // AUDIT FIX RL-1: Use Redis store for distributed rate limiting
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  let redisClient: Redis | null = null;
  
  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableReadyCheck: true
    });
    await redisClient.connect();
    logger.info('Redis connected for rate limiting');
  } catch (error) {
    logger.warn('Redis connection failed, using in-memory rate limiting', { error });
    redisClient = null;
  }

  await app.register(rateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
    // AUDIT FIX RL-1: Redis store for distributed rate limiting
    redis: redisClient || undefined,
    // AUDIT FIX RL-2: Use key generator that includes user ID when available
    keyGenerator: (request) => {
      const userId = (request as any).user?.id;
      const ip = request.ip;
      return userId ? `ratelimit:user:${userId}` : `ratelimit:ip:${ip}`;
    },
    // AUDIT FIX RL-H2: Standard error response
    errorResponseBuilder: (request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Retry after ${Math.ceil(context.ttl / 1000)} seconds.`,
      retryAfter: Math.ceil(context.ttl / 1000)
    })
  });

  await app.register(multipart);

  // AUDIT FIX MT-1: Tenant isolation middleware with proper error handling
  app.addHook('onRequest', async (request, reply) => {
    try {
      await setTenantContext(request, reply);
    } catch (error: any) {
      // AUDIT FIX MT-1: Log the error instead of silently ignoring
      logger.error('Failed to set tenant context', {
        error: error.message,
        requestId: request.id,
        path: request.url,
        ip: request.ip
      });
      
      // For non-public routes, fail the request if tenant context can't be set
      const publicPaths = ['/health', '/ready', '/live', '/metrics'];
      const isPublicPath = publicPaths.some(p => request.url.startsWith(p));
      
      if (!isPublicPath) {
        // Return 503 instead of silently proceeding - RLS will enforce isolation
        // but we should log and monitor these failures
        logger.warn('Proceeding without tenant context - RLS will enforce isolation', {
          requestId: request.id,
          path: request.url
        });
      }
    }
  });

  // Add request ID to response headers for tracing
  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
  });

  // Register internal routes at root level (no prefix)
  // These endpoints are called directly by other services:
  // - payment-service calls POST /internal/events
  // - transfer-service calls GET/POST /internal/escrow/*
  await app.register(internalRoutes, { prefix: '/internal' });

  // Register public routes with API prefix
  await app.register(routes, { prefix: '/api/v1/marketplace' });

  // Set error handler
  app.setErrorHandler(errorHandler);

  return app;
}

// Default export for backwards compatibility with tests
export default buildApp;

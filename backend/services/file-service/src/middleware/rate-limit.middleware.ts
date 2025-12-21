import rateLimit from '@fastify/rate-limit';
import { FastifyInstance } from 'fastify';
import { logger } from '../utils/logger';

/**
 * Register rate limiting plugin for the Fastify instance
 */
export async function registerRateLimiting(app: FastifyInstance) {
  // Global rate limit (fallback)
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '15 minutes',
    cache: 10000,
    allowList: ['127.0.0.1'],
    redis: process.env.REDIS_HOST ? {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    } : undefined,
    keyGenerator: (request) => {
      const user = (request as any).user;
      // Use user ID if authenticated, otherwise use IP
      return user?.id || request.ip;
    },
    errorResponseBuilder: (request, context) => {
      logger.warn(`Rate limit exceeded for ${(request as any).user?.id || request.ip}`);
      const retryAfter = Number(context.after) || 0;
      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil(retryAfter / 1000)} seconds.`,
        retryAfter: context.after
      };
    },
    onExceeding: (request, key) => {
      logger.debug(`Rate limit approaching for key: ${key}`);
    },
    onExceeded: (request, key) => {
      logger.warn(`Rate limit exceeded for key: ${key}`);
    }
  });

  logger.info('Rate limiting middleware registered');
}

/**
 * Rate limiter for file upload operations
 * More restrictive to prevent abuse
 */
export const uploadRateLimiter = {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '15 minutes',
      keyGenerator: (request: any) => {
        const user = request.user;
        return user?.id || request.ip;
      },
      errorResponseBuilder: (request: any, context: any) => {
        const retryAfter = Number(context.after) || 0;
        return {
          statusCode: 429,
          error: 'Too Many Requests',
          message: `Upload limit exceeded. You can upload ${context.max} files per ${context.timeWindow}. Try again in ${Math.ceil(retryAfter / 1000)} seconds.`,
          retryAfter: context.after
        };
      }
    }
  }
};

/**
 * Rate limiter for file download operations
 * More lenient to allow legitimate access
 */
export const downloadRateLimiter = {
  config: {
    rateLimit: {
      max: 100,
      timeWindow: '15 minutes',
      keyGenerator: (request: any) => {
        const user = request.user;
        return user?.id || request.ip;
      },
      errorResponseBuilder: (request: any, context: any) => {
        const retryAfter = Number(context.after) || 0;
        return {
          statusCode: 429,
          error: 'Too Many Requests',
          message: `Download limit exceeded. Try again in ${Math.ceil(retryAfter / 1000)} seconds.`,
          retryAfter: context.after
        };
      }
    }
  }
};

/**
 * Rate limiter for file processing operations (resize, crop, etc.)
 * Moderate limits to prevent resource exhaustion
 */
export const processingRateLimiter = {
  config: {
    rateLimit: {
      max: 30,
      timeWindow: '15 minutes',
      keyGenerator: (request: any) => {
        const user = request.user;
        return user?.id || request.ip;
      },
      errorResponseBuilder: (request: any, context: any) => {
        const retryAfter = Number(context.after) || 0;
        return {
          statusCode: 429,
          error: 'Too Many Requests',
          message: `Processing limit exceeded. Try again in ${Math.ceil(retryAfter / 1000)} seconds.`,
          retryAfter: context.after
        };
      }
    }
  }
};

/**
 * Rate limiter for QR code generation
 * Restrictive to prevent abuse
 */
export const qrRateLimiter = {
  config: {
    rateLimit: {
      max: 20,
      timeWindow: '15 minutes',
      keyGenerator: (request: any) => {
        const user = request.user;
        return user?.id || request.ip;
      },
      errorResponseBuilder: (request: any, context: any) => {
        const retryAfter = Number(context.after) || 0;
        return {
          statusCode: 429,
          error: 'Too Many Requests',
          message: `QR generation limit exceeded. Try again in ${Math.ceil(retryAfter / 1000)} seconds.`,
          retryAfter: context.after
        };
      }
    }
  }
};

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';
import { config } from '../config';
import { createRequestLogger, logSecurityEvent } from '../utils/logger';
import { RateLimitError, AuthUser } from '../types';
import { getRateLimiter, getKeyBuilder } from '@tickettoken/shared';

// Rate limit configurations for different endpoints
const RATE_LIMIT_CONFIGS = {
  global: {
    max: config.rateLimit.global.max,
    timeWindow: config.rateLimit.global.timeWindow,
  },
  ticketPurchase: {
    max: config.rateLimit.ticketPurchase.max,
    timeWindow: config.rateLimit.ticketPurchase.timeWindow,
    blockDuration: config.rateLimit.ticketPurchase.blockDuration,
  },
  eventSearch: {
    max: 30,
    timeWindow: 60000, // 1 minute
  },
  venueApi: {
    max: 100,
    timeWindow: 60000,
  },
  payment: {
    max: 5,
    timeWindow: 3600000, // 1 hour
    skipSuccessfulRequests: true,
  },
};

export async function setupRateLimitMiddleware(server: FastifyInstance) {
  if (!config.rateLimit.enabled) {
    server.log.warn('Rate limiting is disabled');
    return;
  }

  // Global rate limiter
  await server.register(fastifyRateLimit, {
    global: true,
    max: config.rateLimit.global.max,
    timeWindow: config.rateLimit.global.timeWindow,
    redis: server.redis,
    // FIXED: skipOnError: true to prevent Redis failures from causing total outage
    // Trade-off: During Redis outage, rate limiting is bypassed (fail-open)
    // This is generally preferred over fail-closed for availability
    skipOnError: true,
    keyGenerator: (request: FastifyRequest) => {
      // Use authenticated user ID if available, otherwise IP
      const keyBuilder = getKeyBuilder();
      const user = request.user as AuthUser | undefined;
      const userId = user?.id;
      const apiKey = request.headers['x-api-key'];
      const ip = request.ip;

      if (userId) {
        return keyBuilder.rateLimit('user', userId);
      } else if (apiKey) {
        return keyBuilder.rateLimit('api', apiKey as string);
      } else {
        return keyBuilder.rateLimit('ip', ip);
      }
    },
    errorResponseBuilder: (_request: FastifyRequest, context: any) => {
      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds`,
        rateLimit: {
          limit: context.max,
          remaining: context.remaining,
          reset: new Date(Date.now() + context.ttl).toISOString(),
        },
      };
    },
    onExceeding: (request: FastifyRequest, key: string) => {
      const logger = createRequestLogger(request.id);
      logger.warn({
        key,
        path: request.url,
        method: request.method,
      }, 'Rate limit approaching');
    },
    onExceeded: (request: FastifyRequest, key: string) => {
      const logger = createRequestLogger(request.id);
      logger.error({
        key,
        path: request.url,
        method: request.method,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      }, 'Rate limit exceeded');

      // Log security event
      const user = request.user as AuthUser | undefined;
      logSecurityEvent('rate_limit_exceeded', {
        key,
        path: request.url,
        ip: request.ip,
        userId: user?.id,
      }, 'medium');
    },
  });

  // Custom rate limiter for ticket purchases with sliding window
  server.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.url.includes('/tickets/purchase')) {
      return;
    }

    const logger = createRequestLogger(request.id);
    const user = request.user as AuthUser | undefined;
    const userId = user?.id || request.ip;
    const body = request.body as Record<string, any>;
    const eventId = body?.eventId;

    if (!eventId) {
      return;
    }

    // Check ticket purchase rate limit
    try {
      const limitResult = await checkTicketPurchaseLimit(server, userId, eventId);

      if (!limitResult.allowed) {
        logger.error({
          userId,
          eventId,
          attemptCount: limitResult.attemptCount,
          retryAfter: limitResult.retryAfter,
        }, 'Ticket purchase rate limit exceeded');

        // Log potential bot activity
        if (limitResult.attemptCount && limitResult.attemptCount > 10) {
          logSecurityEvent('potential_ticket_bot', {
            userId,
            eventId,
            attemptCount: limitResult.attemptCount,
            ip: request.ip,
            userAgent: request.headers['user-agent'],
          }, 'high');
        }

        if (limitResult.retryAfter) {
          reply.header('Retry-After', limitResult.retryAfter.toString());
        }
        throw new RateLimitError(limitResult.retryAfter || 60);
      }

      // Set rate limit headers
      reply.header('X-RateLimit-Limit', RATE_LIMIT_CONFIGS.ticketPurchase.max.toString());
      reply.header('X-RateLimit-Remaining', (limitResult.remaining || 0).toString());
      reply.header('X-RateLimit-Reset', new Date(Date.now() + 60000).toISOString());
    } catch (error) {
      // If it's a RateLimitError, rethrow it
      if (error instanceof RateLimitError) {
        throw error;
      }
      // For Redis errors, log and allow through (fail-open)
      logger.error({
        error: (error as Error).message,
        userId,
        eventId,
      }, 'Ticket purchase rate limit check failed - allowing request');
    }
  });

  // Venue tier-based rate limiting
  server.addHook('preHandler', async (request: FastifyRequest) => {
    const venueTier = request.headers['x-venue-tier'] as string;

    if (!venueTier) {
      return;
    }

    const tierLimits = {
      premium: { multiplier: 10 },
      standard: { multiplier: 5 },
      free: { multiplier: 1 },
    };

    const tierConfig = tierLimits[venueTier as keyof typeof tierLimits];

    if (tierConfig) {
      // Adjust rate limit based on venue tier
      const baseLimit = config.rateLimit.global.max;
      const tierLimit = baseLimit * tierConfig.multiplier;

      // Store in request context for other middleware
      request.rateLimitMax = tierLimit;
    }
  });
}

// Atomic sliding window rate limiter using Lua scripts from shared library
// Prevents race conditions that could allow burst attacks
async function checkTicketPurchaseLimit(
  _server: FastifyInstance,
  userId: string,
  eventId: string
): Promise<{
  allowed: boolean;
  remaining: number;
  attemptCount?: number;
  retryAfter?: number;
  reason?: string;
}> {
  const rateLimiter = getRateLimiter();
  const keyBuilder = getKeyBuilder();

  const key = keyBuilder.rateLimit('ticket', `${userId}:${eventId}`);

  // Use atomic sliding window from shared library
  const result = await rateLimiter.slidingWindow(
    key,
    RATE_LIMIT_CONFIGS.ticketPurchase.max,
    RATE_LIMIT_CONFIGS.ticketPurchase.timeWindow
  );

  return {
    allowed: result.allowed,
    remaining: result.remaining,
    attemptCount: result.current,
    retryAfter: result.retryAfter,
    reason: result.allowed ? undefined : 'Rate limit exceeded',
  };
}

// Dynamic rate limiting based on system load
export async function adjustRateLimits(server: FastifyInstance) {
  setInterval(async () => {
    try {
      // Get current system metrics
      const memoryUsage = process.memoryUsage();

      // Calculate load factor (0-1)
      const memoryLoad = memoryUsage.heapUsed / memoryUsage.heapTotal;
      const loadFactor = Math.min(memoryLoad, 1);

      // Adjust rate limits based on load
      if (loadFactor > 0.8) {
        // Reduce rate limits by 50% under high load
        const adjustment = 0.5;

        const keyBuilder = getKeyBuilder();
        await server.redis.set(
          keyBuilder.rateLimit('adjustment', 'global'),
          adjustment.toString(),
          'EX',
          60
        );

        server.log.warn({
          loadFactor,
          adjustment,
        }, 'Rate limits reduced due to high load');
      } else if (loadFactor < 0.5) {
        // Normal rate limits
        const keyBuilder = getKeyBuilder();
        await server.redis.del(keyBuilder.rateLimit('adjustment', 'global'));
      }
    } catch (error) {
      server.log.error({ error }, 'Failed to adjust rate limits');
    }
  }, 30000); // Check every 30 seconds
}

// API key rate limiting with different tiers
export async function checkApiKeyRateLimit(
  server: FastifyInstance,
  apiKey: string,
  _request: FastifyRequest
): Promise<boolean> {
  const keyBuilder = getKeyBuilder();
  const keyData = await server.redis.get(keyBuilder.apiKey(apiKey));

  if (!keyData) {
    return false;
  }

  const { rateLimit } = JSON.parse(keyData);
  const key = keyBuilder.rateLimit('apikey', apiKey);

  // Use venue-specific rate limit
  const limit = rateLimit || RATE_LIMIT_CONFIGS.venueApi.max;
  const current = await server.redis.incr(key);

  if (current === 1) {
    await server.redis.expire(key, 60); // 1 minute window
  }

  return current <= limit;
}

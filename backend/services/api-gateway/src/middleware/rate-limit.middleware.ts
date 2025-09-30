import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';
import { config } from '../config';
import { REDIS_KEYS } from '../config/redis';
import { createRequestLogger, logSecurityEvent } from '../utils/logger';
import { RateLimitError } from '../types';

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
    skipOnError: false,
    keyGenerator: (request: FastifyRequest) => {
      // Use authenticated user ID if available, otherwise IP
      const userId = request.user?.id;
      const apiKey = request.headers['x-api-key'];
      const ip = request.ip;

      if (userId) {
        return `${REDIS_KEYS.RATE_LIMIT}user:${userId}`;
      } else if (apiKey) {
        return `${REDIS_KEYS.RATE_LIMIT}api:${apiKey}`;
      } else {
        return `${REDIS_KEYS.RATE_LIMIT}ip:${ip}`;
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
      logSecurityEvent('rate_limit_exceeded', {
        key,
        path: request.url,
        ip: request.ip,
        userId: request.user?.id,
      }, 'medium');
    },
  });

  // Custom rate limiter for ticket purchases with sliding window
  server.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.url.includes('/tickets/purchase')) {
      return;
    }

    const logger = createRequestLogger(request.id);
    const userId = request.user?.id || request.ip;
    const body = request.body as Record<string, any>;
    const eventId = body?.eventId;

    if (!eventId) {
      return;
    }

    // Check ticket purchase rate limit
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

// Sliding window rate limiter for ticket purchases
async function checkTicketPurchaseLimit(
  server: FastifyInstance,
  userId: string,
  eventId: string
): Promise<{
  allowed: boolean;
  remaining: number;
  attemptCount?: number;
  retryAfter?: number;
  reason?: string;
}> {
  const key = `${REDIS_KEYS.RATE_LIMIT_TICKET}${userId}:${eventId}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_CONFIGS.ticketPurchase.timeWindow;

  // Remove old entries
  await server.redis.zremrangebyscore(key, '-inf', windowStart);

  // Count recent attempts
  const count = await server.redis.zcard(key);

  if (count >= RATE_LIMIT_CONFIGS.ticketPurchase.max) {
    // Check if user is blocked
    const blockKey = `${key}:blocked`;
    const blocked = await server.redis.get(blockKey);

    if (blocked) {
      return {
        allowed: false,
        remaining: 0,
        attemptCount: count,
        retryAfter: RATE_LIMIT_CONFIGS.ticketPurchase.blockDuration / 1000,
        reason: 'Blocked due to excessive attempts',
      };
    }

    // Block user
    await server.redis.setex(
      blockKey,
      RATE_LIMIT_CONFIGS.ticketPurchase.blockDuration / 1000,
      'blocked'
    );

    return {
      allowed: false,
      remaining: 0,
      attemptCount: count,
      retryAfter: RATE_LIMIT_CONFIGS.ticketPurchase.blockDuration / 1000,
      reason: 'Too many purchase attempts',
    };
  }

  // Add current attempt
  await server.redis.zadd(key, now, `${now}-${Math.random()}`);
  await server.redis.expire(key, 120); // Expire after 2 minutes

  return {
    allowed: true,
    remaining: RATE_LIMIT_CONFIGS.ticketPurchase.max - count - 1,
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

        await server.redis.set(
          `${REDIS_KEYS.RATE_LIMIT}adjustment`,
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
        await server.redis.del(`${REDIS_KEYS.RATE_LIMIT}adjustment`);
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
  const keyData = await server.redis.get(`${REDIS_KEYS.API_KEY}${apiKey}`);

  if (!keyData) {
    return false;
  }

  const { rateLimit } = JSON.parse(keyData);
  const key = `${REDIS_KEYS.RATE_LIMIT}apikey:${apiKey}`;

  // Use venue-specific rate limit
  const limit = rateLimit || RATE_LIMIT_CONFIGS.venueApi.max;
  const current = await server.redis.incr(key);

  if (current === 1) {
    await server.redis.expire(key, 60); // 1 minute window
  }

  return current <= limit;
}

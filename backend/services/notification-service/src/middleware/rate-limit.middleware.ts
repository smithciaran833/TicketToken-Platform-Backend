import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../config/logger';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

class RateLimiter {
  private store: RateLimitStore = {};
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const key in this.store) {
      if (this.store[key].resetTime < now) {
        delete this.store[key];
      }
    }
  }

  check(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const entry = this.store[key];

    if (!entry || entry.resetTime < now) {
      // New window
      this.store[key] = {
        count: 1,
        resetTime: now + windowMs
      };
      return {
        allowed: true,
        remaining: limit - 1,
        resetTime: now + windowMs
      };
    }

    if (entry.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime
      };
    }

    entry.count++;
    return {
      allowed: true,
      remaining: limit - entry.count,
      resetTime: entry.resetTime
    };
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

const emailLimiter = new RateLimiter();
const smsLimiter = new RateLimiter();
const batchLimiter = new RateLimiter();

function getClientKey(request: FastifyRequest): string {
  // Use IP address as the key, or authenticated user ID if available
  const ip = request.ip || request.headers['x-forwarded-for'] || request.socket.remoteAddress || 'unknown';
  const userId = (request as any).user?.id;
  return userId ? `user:${userId}` : `ip:${ip}`;
}

export async function emailRateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const key = getClientKey(request);
  const limit = parseInt(process.env.EMAIL_RATE_LIMIT || '100', 10);
  const windowMs = parseInt(process.env.EMAIL_RATE_WINDOW_MS || '60000', 10);

  const result = emailLimiter.check(key, limit, windowMs);

  reply.header('X-RateLimit-Limit', limit.toString());
  reply.header('X-RateLimit-Remaining', result.remaining.toString());
  reply.header('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
    reply.header('Retry-After', retryAfter.toString());

    logger.warn('Email rate limit exceeded', {
      key,
      limit,
      resetTime: new Date(result.resetTime).toISOString()
    });

    return reply.status(429).send({
      error: 'Too Many Requests',
      message: `Email rate limit exceeded. Try again in ${retryAfter} seconds.`,
      retryAfter
    });
  }
}

export async function smsRateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const key = getClientKey(request);
  const limit = parseInt(process.env.SMS_RATE_LIMIT || '50', 10);
  const windowMs = parseInt(process.env.SMS_RATE_WINDOW_MS || '60000', 10);

  const result = smsLimiter.check(key, limit, windowMs);

  reply.header('X-RateLimit-Limit', limit.toString());
  reply.header('X-RateLimit-Remaining', result.remaining.toString());
  reply.header('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
    reply.header('Retry-After', retryAfter.toString());

    logger.warn('SMS rate limit exceeded', {
      key,
      limit,
      resetTime: new Date(result.resetTime).toISOString()
    });

    return reply.status(429).send({
      error: 'Too Many Requests',
      message: `SMS rate limit exceeded. Try again in ${retryAfter} seconds.`,
      retryAfter
    });
  }
}

export async function batchRateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const key = getClientKey(request);
  const limit = parseInt(process.env.BATCH_RATE_LIMIT || '10', 10);
  const windowMs = parseInt(process.env.BATCH_RATE_WINDOW_MS || '60000', 10);

  const result = batchLimiter.check(key, limit, windowMs);

  reply.header('X-RateLimit-Limit', limit.toString());
  reply.header('X-RateLimit-Remaining', result.remaining.toString());
  reply.header('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
    reply.header('Retry-After', retryAfter.toString());

    logger.warn('Batch rate limit exceeded', {
      key,
      limit,
      resetTime: new Date(result.resetTime).toISOString()
    });

    return reply.status(429).send({
      error: 'Too Many Requests',
      message: `Batch notification rate limit exceeded. Try again in ${retryAfter} seconds.`,
      retryAfter
    });
  }
}

// Export rate limiter for channel-specific limiting based on request body
export async function channelRateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = request.body as any;
  const channel = body?.channel || 'email';

  if (channel === 'sms') {
    return smsRateLimitMiddleware(request, reply);
  } else {
    return emailRateLimitMiddleware(request, reply);
  }
}

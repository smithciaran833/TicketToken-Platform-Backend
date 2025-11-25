import { FastifyRequest, FastifyReply } from 'fastify';
import { RedisService } from '../services/redis.service';
import { validate as isUUID } from 'uuid';
import { logger } from '../utils/logger';

interface IdempotencyOptions {
  ttlMs: number;
}

export function idempotencyMiddleware(options: IdempotencyOptions) {
  const { ttlMs } = options;

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const idempotencyKey = request.headers['idempotency-key'] as string;

    // 1. Require key for mutations
    if (!idempotencyKey) {
      return reply.status(400).send({
        error: 'Idempotency-Key header required',
        code: 'IDEMPOTENCY_KEY_MISSING',
        details: 'All order operations require an Idempotency-Key header with a UUID value',
      });
    }

    // 2. Validate format (must be UUID)
    if (!isUUID(idempotencyKey)) {
      return reply.status(400).send({
        error: 'Idempotency-Key must be a valid UUID',
        code: 'IDEMPOTENCY_KEY_INVALID',
        details: 'Use a UUID v4 format like: 123e4567-e89b-12d3-a456-426614174000',
      });
    }

    // 3. Scope by user (required)
    const userId = request.user?.id;

    if (!userId) {
      return reply.status(401).send({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const redisKey = `idempotency:order:${userId}:${idempotencyKey}`;

    try {
      // 4. Check if request already processed
      const cached = await RedisService.get(redisKey);

      if (cached) {
        const cachedResponse = JSON.parse(cached);

        // If still processing (102), return 409
        if (cachedResponse.statusCode === 102) {
          logger.warn('Concurrent duplicate request detected', {
            idempotencyKey,
            userId,
            path: request.url,
          });

          return reply.status(409).send({
            error: 'Request already processing',
            code: 'DUPLICATE_IN_PROGRESS',
            details: 'A request with this idempotency key is currently being processed',
          });
        }

        // Return cached response
        logger.info('Returning cached idempotent response', {
          idempotencyKey,
          userId,
          originalStatus: cachedResponse.statusCode,
        });

        return reply.status(cachedResponse.statusCode).send(cachedResponse.body);
      }

      // 5. Mark as in-progress to prevent concurrent duplicates
      await RedisService.set(
        redisKey,
        JSON.stringify({
          statusCode: 102,
          body: { processing: true },
          startedAt: new Date().toISOString(),
        }),
        Math.floor(ttlMs / 1000)
      );

      // 6. Store idempotency info on request for later use
      request.idempotencyKey = idempotencyKey;
      request.idempotencyRedisKey = redisKey;

      // Continue to route handler
      return;
    } catch (err) {
      logger.error('Idempotency middleware error', { err, idempotencyKey });
      // On Redis failure, proceed without idempotency (degraded mode)
      return;
    }
  };
}

// Hook to cache response after sending
export async function idempotencyCacheHook(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: any
) {
  const redisKey = request.idempotencyRedisKey;

  if (!redisKey) {
    return payload; // No idempotency key, skip caching
  }

  const statusCode = reply.statusCode;

  let body: any;
  try {
    body = typeof payload === 'string' ? JSON.parse(payload) : payload;
  } catch {
    body = payload;
  }

  // Cache successful responses (2xx) for 24 hours
  if (statusCode >= 200 && statusCode < 300) {
    await RedisService.set(
      redisKey,
      JSON.stringify({
        statusCode,
        body,
        completedAt: new Date().toISOString(),
      }),
      86400 // 24 hours
    ).catch((err) => {
      logger.error('Failed to cache successful response', { err });
    });
  }
  // Delete key on server errors (5xx) to allow retry
  else if (statusCode >= 500) {
    await RedisService.del(redisKey).catch((err) => {
      logger.error('Failed to delete key after server error', { err });
    });
  }
  // Keep key for client errors (4xx) to prevent retry
  else if (statusCode >= 400 && statusCode < 500) {
    await RedisService.set(
      redisKey,
      JSON.stringify({
        statusCode,
        body,
        completedAt: new Date().toISOString(),
      }),
      3600 // 1 hour for errors
    ).catch((err) => {
      logger.error('Failed to cache error response', { err });
    });
  }

  return payload;
}

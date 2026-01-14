import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { RedisService } from '../services/redisService';
import { validate as isUUID } from 'uuid';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'IdempotencyMiddleware' });

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
        details: 'All payment operations require an Idempotency-Key header with a UUID value'
      });
    }

    // 2. Validate format (must be UUID)
    if (!isUUID(idempotencyKey)) {
      return reply.status(400).send({
        error: 'Idempotency-Key must be a valid UUID',
        code: 'IDEMPOTENCY_KEY_INVALID',
        details: 'Use a UUID v4 format like: 123e4567-e89b-12d3-a456-426614174000'
      });
    }

    // 3. Scope by user (required)
    const userId = (request as any).userId || (request as any).user?.sub || (request as any).user?.id;

    if (!userId) {
      return reply.status(401).send({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Use tenantId if available, otherwise use userId as scope
    const tenantId = (request as any).user?.tenantId || userId;
    const redisKey = `idempotency:${tenantId}:${userId}:${idempotencyKey}`;

    try {
      // 4. Check if request already processed
      const cached = await RedisService.get(redisKey);

      if (cached) {
        const cachedResponse = JSON.parse(cached);

        // If still processing (102), return 409
        if (cachedResponse.statusCode === 102) {
          log.warn({
            idempotencyKey,
            userId,
            tenantId,
            path: request.url
          }, 'Concurrent duplicate request detected');

          return reply.status(409).send({
            error: 'Request already processing',
            code: 'DUPLICATE_IN_PROGRESS',
            details: 'A request with this idempotency key is currently being processed'
          });
        }

        // Return cached response
        log.info({
          idempotencyKey,
          userId,
          tenantId,
          originalStatus: cachedResponse.statusCode
        }, 'Returning cached idempotent response');

        return reply.status(cachedResponse.statusCode).send(cachedResponse.body);
      }

      // 5. Mark as in-progress to prevent concurrent duplicates
      await RedisService.set(
        redisKey,
        JSON.stringify({
          statusCode: 102,
          body: { processing: true },
          startedAt: new Date().toISOString()
        }),
        Math.floor(ttlMs / 1000)
      );

      // 6. Store idempotency info on request for later use
      (request as any).idempotencyKey = idempotencyKey;
      (request as any).idempotencyRedisKey = redisKey;

      // Continue to route handler
      return;

    } catch (err) {
      log.error({ err, idempotencyKey }, 'Idempotency middleware error');
      // On Redis failure, proceed without idempotency (degraded mode)
      return;
    }
  };
}

// Hook to cache response after sending (register globally in app.ts)
export async function idempotencyCacheHook(request: FastifyRequest, reply: FastifyReply, payload: any) {
  const redisKey = (request as any).idempotencyRedisKey;

  if (!redisKey) {
    return payload; // No idempotency key, skip caching
  }

  const statusCode = reply.statusCode;

  let body: any;
  try {
    // Parse payload if it's a string
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
        completedAt: new Date().toISOString()
      }),
      86400  // 24 hours
    ).catch(err => {
      log.error({ err }, 'Failed to cache successful response');
    });
  }
  // Delete key on server errors (5xx) to allow retry
  else if (statusCode >= 500) {
    await RedisService.del(redisKey).catch(err => {
      log.error({ err }, 'Failed to delete key after server error');
    });
  }
  // Keep key for client errors (4xx) to prevent retry
  else if (statusCode >= 400 && statusCode < 500) {
    await RedisService.set(
      redisKey,
      JSON.stringify({
        statusCode,
        body,
        completedAt: new Date().toISOString()
      }),
      3600  // 1 hour for errors
    ).catch(err => {
      log.error({ err }, 'Failed to cache error response');
    });
  }

  return payload;  // Return original payload unchanged
}

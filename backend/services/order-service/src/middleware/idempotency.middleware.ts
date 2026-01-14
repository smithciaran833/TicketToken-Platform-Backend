import { FastifyRequest, FastifyReply } from 'fastify';
import { get, set, del } from '../config/redis';
import { getDatabase } from '../config/database';
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
      // 4. Check Redis first
      const cached = await get(redisKey);

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
          source: 'redis',
        });

        return reply.status(cachedResponse.statusCode).send(cachedResponse.body);
      }

      // LOW: Check database as fallback if Redis miss
      const dbResult = await checkDatabaseForIdempotencyKey(userId, idempotencyKey);
      if (dbResult) {
        logger.info('Returning cached idempotent response from database', {
          idempotencyKey,
          userId,
          source: 'database',
        });

        // Also re-populate Redis cache
        await set(
          redisKey,
          JSON.stringify(dbResult),
          Math.floor(ttlMs / 1000)
        ).catch(err => logger.warn('Failed to repopulate Redis cache', { err }));

        return reply.status(dbResult.statusCode).send(dbResult.body);
      }

      // 5. Mark as in-progress to prevent concurrent duplicates
      await set(
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
      
      // LOW: Try database fallback on Redis failure
      try {
        const dbResult = await checkDatabaseForIdempotencyKey(userId, idempotencyKey);
        if (dbResult) {
          logger.info('Redis failed, using database fallback', {
            idempotencyKey,
            userId,
          });
          return reply.status(dbResult.statusCode).send(dbResult.body);
        }
      } catch (dbErr) {
        logger.error('Database fallback also failed', { dbErr, idempotencyKey });
      }
      
      // On both Redis and DB failure, proceed without idempotency (degraded mode)
      logger.warn('Proceeding without idempotency check (degraded mode)', { idempotencyKey });
      return;
    }
  };
}

/**
 * LOW: Check database for existing order with idempotency key
 */
async function checkDatabaseForIdempotencyKey(
  userId: string,
  idempotencyKey: string
): Promise<{ statusCode: number; body: any } | null> {
  try {
    const db = getDatabase();
    
    const result = await db.query(
      `SELECT id, status, order_number, total_cents, currency, created_at
       FROM orders
       WHERE user_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [userId, idempotencyKey]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const order = result.rows[0];
    
    // Return the order data as if it was a successful creation
    return {
      statusCode: 200, // Already created
      body: {
        id: order.id,
        orderNumber: order.order_number,
        status: order.status,
        totalCents: order.total_cents,
        currency: order.currency,
        createdAt: order.created_at,
        _idempotent: true, // Indicate this is a cached response
        _source: 'database',
      },
    };
  } catch (error) {
    logger.error('Database idempotency check failed', { error, userId, idempotencyKey });
    throw error;
  }
}

// Hook to cache response after sending
export async function idempotencyCacheHook(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: any
) {
  const redisKey = request.idempotencyRedisKey;
  const idempotencyKey = request.idempotencyKey;

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
    await set(
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

    // LOW: Also persist to database for durability
    await persistIdempotencyToDatabase(request, statusCode, body).catch((err) => {
      logger.warn('Failed to persist idempotency to database', { err, idempotencyKey });
    });
  }
  // Delete key on server errors (5xx) to allow retry
  else if (statusCode >= 500) {
    await del(redisKey).catch((err) => {
      logger.error('Failed to delete key after server error', { err });
    });
  }
  // Keep key for client errors (4xx) to prevent retry
  else if (statusCode >= 400 && statusCode < 500) {
    await set(
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

/**
 * LOW: Persist idempotency result to database for durability
 * This is stored via the order's idempotency_key column, not a separate table
 */
async function persistIdempotencyToDatabase(
  request: FastifyRequest,
  statusCode: number,
  body: any
): Promise<void> {
  // The order is already stored with the idempotency_key in the orders table
  // This function is for logging/auditing purposes
  const idempotencyKey = request.idempotencyKey;
  const userId = request.user?.id;

  if (!idempotencyKey || !userId) {
    return;
  }

  // If the response contains an order ID, we can log it
  if (body?.id && statusCode === 201) {
    logger.debug('Idempotency key persisted with order', {
      idempotencyKey,
      userId,
      orderId: body.id,
    });
  }
}

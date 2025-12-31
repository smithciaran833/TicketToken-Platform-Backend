import { FastifyRequest, FastifyReply } from 'fastify';
import Redis from 'ioredis';
import { pino } from 'pino';

const logger = pino({ name: 'idempotency-middleware' });

// Default TTL for idempotency keys (24 hours in seconds)
const DEFAULT_TTL = 24 * 60 * 60;

// Redis client (will be set via initialize function)
let redis: Redis | null = null;

/**
 * Initialize the idempotency middleware with a Redis client.
 * Must be called before using the middleware.
 * 
 * @param redisClient - Redis client instance
 */
export function initializeIdempotency(redisClient: Redis): void {
  redis = redisClient;
  logger.info('Idempotency middleware initialized');
}

/**
 * Idempotency key format: idempotency:{tenant_id}:{key}
 * Including tenant_id prevents cross-tenant key collisions.
 */
function getRedisKey(tenantId: string | null, key: string): string {
  const tenant = tenantId || 'public';
  return `idempotency:${tenant}:${key}`;
}

/**
 * Validate idempotency key format.
 * Key must be a non-empty string, max 256 characters.
 */
function validateIdempotencyKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  if (key.length > 256) return false;
  // Only allow alphanumeric, hyphens, and underscores
  return /^[a-zA-Z0-9_-]+$/.test(key);
}

interface CachedResponse {
  statusCode: number;
  body: any;
  headers?: Record<string, string>;
  createdAt: string;
}

/**
 * Idempotency middleware for POST/PUT/PATCH requests.
 * 
 * If an Idempotency-Key header is provided:
 * 1. Check if we've seen this key before
 * 2. If yes, return the cached response
 * 3. If no, process the request and cache the response
 * 
 * CRITICAL: This middleware prevents duplicate operations from retried requests.
 */
export async function idempotencyMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Only apply to mutating methods
  const method = request.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH'].includes(method)) {
    return;
  }

  // Get idempotency key from header
  const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
  
  // If no key provided, skip idempotency handling
  if (!idempotencyKey) {
    return;
  }

  // Validate key format
  if (!validateIdempotencyKey(idempotencyKey)) {
    reply.code(400).send({
      error: 'Invalid Idempotency-Key',
      code: 'INVALID_IDEMPOTENCY_KEY',
      message: 'Idempotency-Key must be 1-256 alphanumeric characters, hyphens, or underscores'
    });
    return;
  }

  // Check if Redis is available
  if (!redis) {
    logger.warn('Redis not available for idempotency check, skipping');
    return;
  }

  const tenantId = (request as any).tenantId;
  const redisKey = getRedisKey(tenantId, idempotencyKey);

  try {
    // Check for existing response
    const cached = await redis.get(redisKey);
    
    if (cached) {
      // Return cached response
      const cachedResponse: CachedResponse = JSON.parse(cached);
      
      logger.info({
        idempotencyKey,
        tenantId,
        originalCreatedAt: cachedResponse.createdAt
      }, 'Returning cached idempotent response');

      reply.header('Idempotency-Replayed', 'true');
      reply.header('X-Idempotency-Key', idempotencyKey);
      
      if (cachedResponse.headers) {
        for (const [key, value] of Object.entries(cachedResponse.headers)) {
          reply.header(key, value);
        }
      }
      
      reply.code(cachedResponse.statusCode).send(cachedResponse.body);
      return;
    }

    // Try to acquire lock (prevent concurrent requests with same key)
    const lockKey = `${redisKey}:lock`;
    const lockAcquired = await redis.set(lockKey, '1', 'EX', 30, 'NX');
    
    if (!lockAcquired) {
      // Another request with the same key is in progress
      reply.code(409).send({
        error: 'Concurrent request in progress',
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'A request with this Idempotency-Key is already being processed'
      });
      return;
    }

    // Store original reply.send to intercept response
    const originalSend = reply.send.bind(reply);
    
    reply.send = function(payload: any): FastifyReply {
      // Cache the response
      const responseToCache: CachedResponse = {
        statusCode: reply.statusCode,
        body: payload,
        createdAt: new Date().toISOString()
      };

      // Store in Redis asynchronously (don't await)
      redis?.setex(redisKey, DEFAULT_TTL, JSON.stringify(responseToCache))
        .then(() => {
          logger.debug({ idempotencyKey, tenantId }, 'Cached idempotent response');
        })
        .catch((err) => {
          logger.error({ error: err, idempotencyKey }, 'Failed to cache idempotent response');
        })
        .finally(() => {
          // Release lock
          redis?.del(lockKey).catch(() => {});
        });

      // Add idempotency key to response headers
      reply.header('X-Idempotency-Key', idempotencyKey);

      return originalSend(payload);
    };

  } catch (error) {
    logger.error({ error, idempotencyKey }, 'Idempotency check failed');
    // Don't block request on idempotency errors - log and continue
  }
}

/**
 * Express-style middleware wrapper for Fastify preHandler.
 * Use this as a preHandler hook on routes that need idempotency.
 */
export const idempotencyPreHandler = idempotencyMiddleware;

/**
 * Clean up expired idempotency keys (called by scheduled job).
 * Redis handles expiration automatically via TTL, but this can be used
 * for manual cleanup if needed.
 */
export async function cleanupExpiredKeys(): Promise<number> {
  if (!redis) {
    logger.warn('Redis not available for cleanup');
    return 0;
  }

  // Redis handles TTL automatically, this is just for manual cleanup
  // if needed in the future
  logger.info('Idempotency key cleanup is handled by Redis TTL');
  return 0;
}

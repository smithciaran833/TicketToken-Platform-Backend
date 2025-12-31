import { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'IdempotencyMiddleware' });

/**
 * SECURITY FIX (SC1-SC5): Idempotency middleware for state-changing operations
 * 
 * This middleware:
 * - Checks for Idempotency-Key header on POST/PUT/PATCH requests
 * - Returns cached response for duplicate requests
 * - Stores response for successful operations
 * - Prevents duplicate operations during concurrent requests
 */

interface IdempotencyRecord {
  status: 'processing' | 'completed' | 'failed';
  statusCode?: number;
  response?: any;
  createdAt: number;
  completedAt?: number;
  requestFingerprint: string;
}

// TTL for idempotency keys (24 hours)
const IDEMPOTENCY_TTL_SECONDS = 86400;

// In-memory store for processing locks (Redis would be better for production)
const processingLocks = new Map<string, boolean>();

/**
 * Generate fingerprint from request to detect payload mismatches
 */
function generateRequestFingerprint(request: FastifyRequest): string {
  const payload = JSON.stringify({
    method: request.method,
    url: request.url,
    body: request.body,
  });
  return createHash('sha256').update(payload).digest('hex').substring(0, 16);
}

/**
 * Get Redis key for idempotency record
 */
function getIdempotencyKey(key: string, resourceType: string): string {
  return `idempotency:${resourceType}:${key}`;
}

/**
 * Idempotency middleware factory
 * @param resourceType - Type of resource (e.g., 'venue', 'integration')
 * @param options - Configuration options
 */
export function idempotency(
  resourceType: string,
  options: { required?: boolean } = {}
) {
  return async function idempotencyMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // Only apply to state-changing methods
    if (!['POST', 'PUT', 'PATCH'].includes(request.method)) {
      return;
    }

    const idempotencyKey = request.headers['idempotency-key'] as string;

    // If key is required but missing, reject request
    if (options.required && !idempotencyKey) {
      return reply.status(400).send({
        error: 'Idempotency-Key header is required for this operation',
        code: 'IDEMPOTENCY_KEY_REQUIRED',
      });
    }

    // If no key provided and not required, skip idempotency check
    if (!idempotencyKey) {
      return;
    }

    const server = request.server as any;
    const redis = server.container?.cradle?.redis;

    if (!redis) {
      log.warn('Redis not available, skipping idempotency check');
      return;
    }

    const redisKey = getIdempotencyKey(idempotencyKey, resourceType);
    const requestFingerprint = generateRequestFingerprint(request);

    try {
      // Check for existing record
      const existingRecord = await redis.get(redisKey);

      if (existingRecord) {
        const record: IdempotencyRecord = JSON.parse(existingRecord);

        // Check for payload mismatch (different request with same key)
        if (record.requestFingerprint !== requestFingerprint) {
          log.warn({
            idempotencyKey,
            resourceType,
            existingFingerprint: record.requestFingerprint,
            newFingerprint: requestFingerprint,
          }, 'Idempotency key reused with different payload');

          return reply.status(422).send({
            error: 'Idempotency-Key has already been used with a different request',
            code: 'IDEMPOTENCY_KEY_CONFLICT',
          });
        }

        // If still processing, return 409 Conflict
        if (record.status === 'processing') {
          log.info({ idempotencyKey, resourceType }, 'Request still processing');
          return reply.status(409).send({
            error: 'Request with this Idempotency-Key is still being processed',
            code: 'IDEMPOTENCY_PROCESSING',
          });
        }

        // Return cached response
        if (record.status === 'completed' && record.response) {
          log.info({ idempotencyKey, resourceType }, 'Returning cached idempotent response');
          reply.header('X-Idempotency-Replayed', 'true');
          return reply.status(record.statusCode || 200).send(record.response);
        }
      }

      // Lock for processing
      const lockKey = `${redisKey}:lock`;
      const lockAcquired = await redis.set(lockKey, '1', 'NX', 'EX', 30);

      if (!lockAcquired) {
        // Another request is processing with the same key
        return reply.status(409).send({
          error: 'Request with this Idempotency-Key is being processed',
          code: 'IDEMPOTENCY_PROCESSING',
        });
      }

      // Store initial processing record
      const processingRecord: IdempotencyRecord = {
        status: 'processing',
        createdAt: Date.now(),
        requestFingerprint,
      };
      await redis.setex(redisKey, IDEMPOTENCY_TTL_SECONDS, JSON.stringify(processingRecord));

      // Store key in request for response hook
      (request as any).idempotencyKey = idempotencyKey;
      (request as any).idempotencyRedisKey = redisKey;
      (request as any).idempotencyLockKey = lockKey;
      (request as any).idempotencyFingerprint = requestFingerprint;

    } catch (error) {
      log.error({ error, idempotencyKey, resourceType }, 'Idempotency check failed');
      // Don't block request on idempotency errors
    }
  };
}

/**
 * Hook to store response for idempotency
 * Call this in onResponse hook
 */
export async function storeIdempotencyResponse(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const idempotencyKey = (request as any).idempotencyKey;
  const redisKey = (request as any).idempotencyRedisKey;
  const lockKey = (request as any).idempotencyLockKey;
  const fingerprint = (request as any).idempotencyFingerprint;

  if (!idempotencyKey || !redisKey) {
    return;
  }

  const server = request.server as any;
  const redis = server.container?.cradle?.redis;

  if (!redis) {
    return;
  }

  try {
    // Get the response body (stored by Fastify serialization)
    const responseBody = (reply as any).payload;

    const completedRecord: IdempotencyRecord = {
      status: reply.statusCode >= 400 ? 'failed' : 'completed',
      statusCode: reply.statusCode,
      response: responseBody ? JSON.parse(responseBody) : null,
      createdAt: Date.now(),
      completedAt: Date.now(),
      requestFingerprint: fingerprint,
    };

    await redis.setex(redisKey, IDEMPOTENCY_TTL_SECONDS, JSON.stringify(completedRecord));

    // Release lock
    await redis.del(lockKey);

    log.debug({ idempotencyKey, statusCode: reply.statusCode }, 'Stored idempotency response');
  } catch (error) {
    log.error({ error, idempotencyKey }, 'Failed to store idempotency response');
    // Clean up lock on error
    try {
      await redis.del(lockKey);
    } catch (e) {
      // Ignore
    }
  }
}

// Export for use in other modules
export { IDEMPOTENCY_TTL_SECONDS };

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

// SECURITY FIX: TTL based on response status
const IDEMPOTENCY_TTL_SUCCESS = 86400;  // 24 hours for 2xx
const IDEMPOTENCY_TTL_CLIENT_ERROR = 3600;  // 1 hour for 4xx
const IDEMPOTENCY_TTL_SERVER_ERROR = 300;   // 5 minutes for 5xx

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
 * SECURITY FIX: Validate idempotency key format
 */
function validateIdempotencyKey(key: string): { valid: boolean; error?: string } {
  // Check length
  if (key.length > 128) {
    return { valid: false, error: 'Idempotency-Key must not exceed 128 characters' };
  }

  // Validate UUID format (with or without hyphens)
  const uuidRegex = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
  if (!uuidRegex.test(key)) {
    return { valid: false, error: 'Idempotency-Key must be a valid UUID format' };
  }

  return { valid: true };
}

/**
 * SECURITY FIX: Get Redis key with tenant isolation
 */
function getIdempotencyKey(key: string, resourceType: string, tenantId?: string): string {
  const tenant = tenantId || 'global';
  return `idempotency:${tenant}:${resourceType}:${key}`;
}

/**
 * SECURITY FIX: Get TTL based on status code
 */
function getTTLForStatus(statusCode: number): number {
  if (statusCode >= 500) {
    return IDEMPOTENCY_TTL_SERVER_ERROR;
  } else if (statusCode >= 400) {
    return IDEMPOTENCY_TTL_CLIENT_ERROR;
  }
  return IDEMPOTENCY_TTL_SUCCESS;
}

/**
 * Idempotency middleware factory
 * @param resourceType - Type of resource (e.g., 'venue', 'integration')
 * @param options - Configuration options
 */
export function idempotency(
  resourceType: string,
  options: { required?: boolean; lockTimeoutSeconds?: number } = {}
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

    // SECURITY FIX: Validate idempotency key format
    const validation = validateIdempotencyKey(idempotencyKey);
    if (!validation.valid) {
      return reply.status(400).send({
        error: validation.error,
        code: 'INVALID_IDEMPOTENCY_KEY',
      });
    }

    const server = request.server as any;
    const redis = server.container?.cradle?.redis;

    if (!redis) {
      log.warn('Redis not available, skipping idempotency check');
      return;
    }

    // SECURITY FIX: Extract tenant ID for isolation
    const tenantId = (request as any).tenantId;

    const redisKey = getIdempotencyKey(idempotencyKey, resourceType, tenantId);
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
          const replayStatusCode = (record.statusCode && record.statusCode >= 200 && record.statusCode < 300) ? 200 : record.statusCode || 200;
          return reply.status(replayStatusCode).send(record.response);
        }
      }

      // SECURITY FIX: Configurable lock timeout
      const lockTimeout = options.lockTimeoutSeconds || 30;
      const lockKey = `${redisKey}:lock`;
      const lockAcquired = await redis.set(lockKey, '1', 'NX', 'EX', lockTimeout);

      if (!lockAcquired) {
        // Another request is processing with the same key
        return reply.status(409).send({
          error: 'Request with this Idempotency-Key is being processed',
          code: 'IDEMPOTENCY_PROCESSING',
        });
      }

      // Store initial processing record with success TTL (will be updated on completion)
      const processingRecord: IdempotencyRecord = {
        status: 'processing',
        createdAt: Date.now(),
        requestFingerprint,
      };
      await redis.setex(redisKey, IDEMPOTENCY_TTL_SUCCESS, JSON.stringify(processingRecord));

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
 * FIX: Use onSend hook which receives payload parameter
 */
export async function storeIdempotencyResponse(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: any
): Promise<any> {
  const idempotencyKey = (request as any).idempotencyKey;
  const redisKey = (request as any).idempotencyRedisKey;
  const lockKey = (request as any).idempotencyLockKey;
  const fingerprint = (request as any).idempotencyFingerprint;

  if (!idempotencyKey || !redisKey) {
    return payload; // Must return payload in onSend hook
  }

  const server = request.server as any;
  const redis = server.container?.cradle?.redis;

  if (!redis) {
    return payload; // Must return payload in onSend hook
  }

  try {
    // FIX: Payload is passed as parameter in onSend hook
    let responseData = payload;
    
    // If payload is a string, try to parse it
    if (typeof payload === 'string') {
      try {
        responseData = JSON.parse(payload);
      } catch (e) {
        // Keep as string if not JSON
      }
    }

    const completedRecord: IdempotencyRecord = {
      status: reply.statusCode >= 400 ? 'failed' : 'completed',
      statusCode: reply.statusCode,
      response: responseData,
      createdAt: Date.now(),
      completedAt: Date.now(),
      requestFingerprint: fingerprint,
    };

    // SECURITY FIX: Use status-based TTL
    const ttl = getTTLForStatus(reply.statusCode);
    await redis.setex(redisKey, ttl, JSON.stringify(completedRecord));

    // Release lock
    await redis.del(lockKey);

    log.debug({
      idempotencyKey,
      statusCode: reply.statusCode,
      ttl
    }, 'Stored idempotency response');
  } catch (error) {
    log.error({ error, idempotencyKey }, 'Failed to store idempotency response');
    // Clean up lock on error
    try {
      await redis.del(lockKey);
    } catch (e) {
      // Ignore
    }
  }

  return payload; // Must return payload in onSend hook
}

// Export constants for backwards compatibility
export {
  IDEMPOTENCY_TTL_SUCCESS as IDEMPOTENCY_TTL_SECONDS,
  IDEMPOTENCY_TTL_SUCCESS,
  IDEMPOTENCY_TTL_CLIENT_ERROR,
  IDEMPOTENCY_TTL_SERVER_ERROR
};

/**
 * Idempotency Middleware
 *
 * Prevents duplicate processing of state-changing requests.
 * Uses Redis to store request results keyed by Idempotency-Key header.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';
import crypto from 'crypto';

interface IdempotencyRecord {
  statusCode: number;
  body: any;
  headers: Record<string, string>;
  createdAt: number;
  requestHash: string;
}

// Default TTL for idempotency keys (24 hours)
const DEFAULT_TTL = 24 * 60 * 60;

// Endpoints that should support idempotency
const IDEMPOTENT_ENDPOINTS = [
  '/auth/register',
  '/auth/forgot-password',
  '/auth/mfa/setup',
  '/auth/wallet/register',
  '/auth/gdpr/delete',
];

/**
 * Generate a hash of the request body to detect mismatched replays
 */
function hashRequestBody(body: any): string {
  const content = JSON.stringify(body || {});
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Build the Redis key for idempotency storage
 */
function buildIdempotencyKey(idempotencyKey: string, tenantId?: string): string {
  if (tenantId) {
    return `idempotency:tenant:${tenantId}:${idempotencyKey}`;
  }
  return `idempotency:${idempotencyKey}`;
}

/**
 * Check if the endpoint should use idempotency
 */
function shouldApplyIdempotency(url: string): boolean {
  const path = url.split('?')[0]; // Remove query string
  return IDEMPOTENT_ENDPOINTS.some(endpoint => path.endsWith(endpoint));
}

/**
 * Idempotency middleware for state-changing operations
 */
export async function idempotencyMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Only apply to POST/PUT/DELETE methods
  if (!['POST', 'PUT', 'DELETE'].includes(request.method)) {
    return;
  }

  // Check if this endpoint should be idempotent
  if (!shouldApplyIdempotency(request.url)) {
    return;
  }

  const idempotencyKey = request.headers['idempotency-key'] as string;

  // If no idempotency key provided, proceed normally
  if (!idempotencyKey) {
    return;
  }

  // Validate key format (should be a UUID or similar)
  if (idempotencyKey.length < 16 || idempotencyKey.length > 64) {
    return reply.status(400).send({
      error: 'Invalid Idempotency-Key format',
      code: 'INVALID_IDEMPOTENCY_KEY',
      detail: 'Idempotency-Key must be between 16 and 64 characters',
    });
  }

  const redis = getRedis();
  const tenantId = (request as any).user?.tenant_id;
  const redisKey = buildIdempotencyKey(idempotencyKey, tenantId);
  const requestHash = hashRequestBody(request.body);

  try {
    // Check if we have a cached response
    const cached = await redis.get(redisKey);

    if (cached) {
      const record: IdempotencyRecord = JSON.parse(cached);

      // Verify request body matches (prevent key reuse with different payload)
      if (record.requestHash !== requestHash) {
        logger.warn('Idempotency key reused with different request body', {
          idempotencyKey,
          path: request.url,
        });

        return reply.status(422).send({
          error: 'Idempotency key already used with different request',
          code: 'IDEMPOTENCY_KEY_MISMATCH',
        });
      }

      // Return cached response
      logger.info('Returning cached idempotent response', {
        idempotencyKey,
        path: request.url,
        originalCreatedAt: record.createdAt,
      });

      // FIX: Set flag BEFORE sending to prevent onSend from processing
      (request as any).idempotencyReplayed = true;

      // Set replay indicator header
      reply.header('Idempotency-Replayed', 'true');

      // Restore original headers
      Object.entries(record.headers).forEach(([key, value]) => {
        reply.header(key, value);
      });

      // Send the cached response (this prevents route handler from running)
      return reply.status(record.statusCode).send(record.body);
    }

    // No cached response - mark as in-progress to prevent concurrent duplicates
    const lockKey = `${redisKey}:lock`;
    const lockAcquired = await redis.set(lockKey, '1', 'EX', 30, 'NX');

    if (!lockAcquired) {
      // Another request is processing this key
      return reply.status(409).send({
        error: 'Request already in progress',
        code: 'IDEMPOTENCY_CONFLICT',
        detail: 'A request with this Idempotency-Key is currently being processed',
      });
    }

    // Store request info for later capture
    (request as any).idempotencyKey = idempotencyKey;
    (request as any).idempotencyRedisKey = redisKey;
    (request as any).idempotencyRequestHash = requestHash;
    (request as any).idempotencyLockKey = lockKey;

  } catch (error) {
    logger.error('Idempotency check failed', { error, idempotencyKey });
    // Don't block request if idempotency check fails
  }
}

/**
 * Hook to capture and store the response for idempotency
 */
export async function captureIdempotentResponse(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: any
): Promise<any> {
  // FIX: Return IMMEDIATELY if this is a replayed response
  // Don't do ANYTHING - the response was already sent in preHandler
  if ((request as any).idempotencyReplayed) {
    return payload;
  }

  const idempotencyKey = (request as any).idempotencyKey;
  const redisKey = (request as any).idempotencyRedisKey;
  const requestHash = (request as any).idempotencyRequestHash;
  const lockKey = (request as any).idempotencyLockKey;

  if (!idempotencyKey || !redisKey) {
    return payload;
  }

  const redis = getRedis();

  try {
    // Only cache successful responses (2xx)
    const statusCode = reply.statusCode;
    if (statusCode >= 200 && statusCode < 300) {
      const record: IdempotencyRecord = {
        statusCode,
        body: typeof payload === 'string' ? JSON.parse(payload) : payload,
        headers: {
          'content-type': reply.getHeader('content-type') as string || 'application/json',
        },
        createdAt: Date.now(),
        requestHash,
      };

      await redis.setex(redisKey, DEFAULT_TTL, JSON.stringify(record));

      logger.debug('Cached idempotent response', {
        idempotencyKey,
        path: request.url,
        statusCode,
      });
    }
  } catch (error) {
    logger.error('Failed to cache idempotent response', { error, idempotencyKey });
  } finally {
    // Release lock
    if (lockKey) {
      await redis.del(lockKey).catch(() => {});
    }
  }

  return payload;
}

/**
 * Register idempotency hooks on a Fastify instance
 */
export function registerIdempotencyHooks(app: any): void {
  app.addHook('preHandler', idempotencyMiddleware);
  app.addHook('onSend', captureIdempotentResponse);
}

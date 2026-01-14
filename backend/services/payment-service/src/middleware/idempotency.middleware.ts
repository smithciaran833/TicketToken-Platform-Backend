/**
 * Idempotency Middleware for Payment Service
 *
 * HIGH FIX: Prevents duplicate payment processing by caching request results.
 *
 * Key features:
 * - Stores request results with idempotency key
 * - Returns cached response for duplicate requests
 * - Uses Redis for distributed caching
 * - Supports configurable TTL
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

// Redis client instance - lazy initialization
let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redis.url || 'redis://localhost:6379');
  }
  return redis;
}
import { ConflictError, BadRequestError } from '../utils/errors';
import { generateIdempotencyKey } from '../utils/crypto.util';

const log = logger.child({ component: 'IdempotencyMiddleware' });

// =============================================================================
// Configuration
// =============================================================================

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const IDEMPOTENCY_PREFIX = 'idem:payment:';
const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24 hours

// Endpoints that require idempotency
const IDEMPOTENT_ENDPOINTS = [
  { method: 'POST', pathPrefix: '/api/v1/payments' },
  { method: 'POST', pathPrefix: '/api/v1/refunds' },
  { method: 'POST', pathPrefix: '/api/v1/transfers' },
  { method: 'POST', pathPrefix: '/api/v1/escrow' },
];

// =============================================================================
// Types
// =============================================================================

interface IdempotencyRecord {
  key: string;
  status: 'processing' | 'completed' | 'failed';
  statusCode?: number;
  responseBody?: any;
  requestFingerprint: string;
  createdAt: string;
  completedAt?: string;
  expiresAt: string;
}

// =============================================================================
// Middleware
// =============================================================================

/**
 * Idempotency middleware - ensures duplicate requests return same response.
 *
 * How it works:
 * 1. Client sends request with Idempotency-Key header
 * 2. If key exists and completed, return cached response
 * 3. If key exists and processing, return 409 Conflict
 * 4. If key doesn't exist, store as processing and continue
 * 5. After response, store the result
 */
export async function idempotencyMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Only apply to POST/PUT/PATCH requests
  if (!['POST', 'PUT', 'PATCH'].includes(request.method)) {
    return;
  }

  // Check if endpoint requires idempotency
  if (!requiresIdempotency(request)) {
    return;
  }

  const idempotencyKey = request.headers[IDEMPOTENCY_KEY_HEADER] as string;

  // Validate idempotency key is provided for payment-related POST requests
  if (!idempotencyKey) {
    throw new BadRequestError(
      'Idempotency-Key header is required for this endpoint',
      'MISSING_IDEMPOTENCY_KEY'
    );
  }

  // Validate key format (should be UUID or similar)
  if (!isValidIdempotencyKey(idempotencyKey)) {
    throw new BadRequestError(
      'Invalid Idempotency-Key format. Use a UUID or similar unique identifier.',
      'INVALID_IDEMPOTENCY_KEY'
    );
  }

  const cacheKey = buildCacheKey(idempotencyKey, request);
  const requestFingerprint = buildRequestFingerprint(request);

  try {
    // Check for existing record
    const existing = await getIdempotencyRecord(cacheKey);

    if (existing) {
      // Check if request fingerprint matches
      if (existing.requestFingerprint !== requestFingerprint) {
        log.warn({
          key: idempotencyKey,
          path: request.url,
        }, 'Idempotency key reused with different request');
        throw new ConflictError(
          'Idempotency key already used with a different request'
        );
      }

      // Request already processing
      if (existing.status === 'processing') {
        log.warn({
          key: idempotencyKey,
          path: request.url,
        }, 'Duplicate request while processing');
        throw new ConflictError('Request is already being processed');
      }

      // Return cached response
      if (existing.status === 'completed' && existing.responseBody !== undefined) {
        log.info({
          key: idempotencyKey,
          path: request.url,
        }, 'Returning cached idempotent response');

        reply.header('X-Idempotent-Replay', 'true');
        reply.status(existing.statusCode || 200).send(existing.responseBody);
        return;
      }
    }

    // Store as processing
    await storeIdempotencyRecord(cacheKey, {
      key: idempotencyKey,
      status: 'processing',
      requestFingerprint,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + DEFAULT_TTL_SECONDS * 1000).toISOString(),
    });

    // Store key in request for later use in hook
    (request as any).idempotencyKey = idempotencyKey;
    (request as any).idempotencyCacheKey = cacheKey;
    (request as any).requestFingerprint = requestFingerprint;

  } catch (error) {
    if (error instanceof ConflictError || error instanceof BadRequestError) {
      throw error;
    }

    // Redis errors shouldn't block the request
    log.error({
      error: (error as Error).message,
      key: idempotencyKey,
    }, 'Idempotency check failed');
    // Continue without idempotency in case of Redis failure
  }
}

/**
 * Hook to store response after handler completes.
 * Register this as an onResponse hook.
 */
export async function onResponseIdempotencyHook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const cacheKey = (request as any).idempotencyCacheKey;
  const idempotencyKey = (request as any).idempotencyKey;
  const requestFingerprint = (request as any).requestFingerprint;

  if (!cacheKey || !idempotencyKey) {
    return;
  }

  try {
    // Get the response body (need to access raw payload)
    const statusCode = reply.statusCode;
    const responseBody = (reply as any).payload || (request as any).responsePayload;

    await storeIdempotencyRecord(cacheKey, {
      key: idempotencyKey,
      status: statusCode >= 200 && statusCode < 500 ? 'completed' : 'failed',
      statusCode,
      responseBody,
      requestFingerprint,
      createdAt: (await getIdempotencyRecord(cacheKey))?.createdAt || new Date().toISOString(),
      completedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + DEFAULT_TTL_SECONDS * 1000).toISOString(),
    });

    log.debug({
      key: idempotencyKey,
      statusCode,
    }, 'Stored idempotent response');
  } catch (error) {
    log.error({
      error: (error as Error).message,
      key: idempotencyKey,
    }, 'Failed to store idempotent response');
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if the endpoint requires idempotency.
 */
function requiresIdempotency(request: FastifyRequest): boolean {
  const path = request.url.split('?')[0];

  return IDEMPOTENT_ENDPOINTS.some(
    ep => request.method === ep.method && path.startsWith(ep.pathPrefix)
  );
}

/**
 * Validate idempotency key format.
 */
function isValidIdempotencyKey(key: string): boolean {
  // Accept UUIDs, ULIDs, or any 8-64 character alphanumeric with hyphens
  const pattern = /^[a-zA-Z0-9-]{8,64}$/;
  return pattern.test(key);
}

/**
 * Build cache key from idempotency key and request context.
 */
function buildCacheKey(idempotencyKey: string, request: FastifyRequest): string {
  const tenantId = (request as any).tenantId || 'default';
  const path = request.url.split('?')[0];
  return `${IDEMPOTENCY_PREFIX}${tenantId}:${path}:${idempotencyKey}`;
}

/**
 * Build request fingerprint for comparing duplicate requests.
 * Ensures the same idempotency key is only used with identical requests.
 */
function buildRequestFingerprint(request: FastifyRequest): string {
  const parts = [
    request.method,
    request.url.split('?')[0],
    JSON.stringify(request.body || {}),
  ];

  // Use crypto to hash the fingerprint
  const { createHash } = require('crypto');
  return createHash('sha256')
    .update(parts.join(':'))
    .digest('hex');
}

/**
 * Get idempotency record from Redis.
 */
async function getIdempotencyRecord(key: string): Promise<IdempotencyRecord | null> {
  try {
    const data = await getRedis().get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

/**
 * Store idempotency record in Redis.
 */
async function storeIdempotencyRecord(
  key: string,
  record: IdempotencyRecord
): Promise<void> {
  await getRedis().set(key, JSON.stringify(record), 'EX', DEFAULT_TTL_SECONDS);
}

/**
 * Delete idempotency record (for cleanup or error cases).
 */
export async function deleteIdempotencyRecord(key: string): Promise<void> {
  await getRedis().del(key);
}

/**
 * Generate a new idempotency key for client use.
 * Exported for SDK/client libraries.
 */
export function generateNewIdempotencyKey(): string {
  return generateIdempotencyKey();
}

/**
 * Manually check if a request was already processed.
 * Useful for external checks.
 */
export async function checkIdempotencyStatus(
  idempotencyKey: string,
  tenantId: string,
  path: string
): Promise<IdempotencyRecord | null> {
  const cacheKey = `${IDEMPOTENCY_PREFIX}${tenantId}:${path}:${idempotencyKey}`;
  return getIdempotencyRecord(cacheKey);
}

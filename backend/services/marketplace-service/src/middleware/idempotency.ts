/**
 * Idempotency Middleware for Marketplace Service
 * 
 * Issues Fixed:
 * - IDP-1: No idempotency middleware → Request deduplication via idempotency keys
 * - IDP-2: No idempotency header support → Idempotency-Key header implementation
 * - IDP-4: Idempotency key type unused → Proper typing throughout
 * 
 * Features:
 * - Redis-backed request deduplication (with memory fallback)
 * - Cached responses for repeated requests
 * - TTL-based expiration
 * - Replay detection headers
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { cache } from '../config/redis';

// =============================================================================
// TYPES
// =============================================================================

interface IdempotencyEntry {
  requestId: string;
  status: 'processing' | 'completed' | 'failed';
  response?: {
    statusCode: number;
    body: any;
  };
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  tenantId: string;
  endpoint: string;
  method: string;
}

// Extend FastifyRequest for idempotency tracking
declare module 'fastify' {
  interface FastifyRequest {
    idempotencyCacheKey?: string;
    idempotencyKey?: string;
    idempotencyEntry?: IdempotencyEntry;
  }
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// Default TTL for idempotency keys (24 hours)
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const REDIS_PREFIX = 'marketplace:idempotency:';

// In-memory cache fallback when Redis unavailable
const memoryCache = new Map<string, IdempotencyEntry>();

// =============================================================================
// METRICS
// =============================================================================

interface IdempotencyMetrics {
  totalRequests: number;
  replays: number;
  processing: number;
  completed: number;
  failed: number;
}

const metrics: IdempotencyMetrics = {
  totalRequests: 0,
  replays: 0,
  processing: 0,
  completed: 0,
  failed: 0
};

export function getIdempotencyMetrics(): IdempotencyMetrics {
  return { ...metrics };
}

// =============================================================================
// CACHE OPERATIONS
// =============================================================================

function getCacheKey(idempotencyKey: string, tenantId: string): string {
  return `${REDIS_PREFIX}${tenantId}:${idempotencyKey}`;
}

async function getEntry(key: string): Promise<IdempotencyEntry | null> {
  try {
    // Try Redis first
    const data = await cache.get<string>(key);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    logger.warn('Redis idempotency get error, using memory', {
      error: (error as Error).message
    });
  }

  // Fallback to memory
  const entry = memoryCache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry;
  }
  if (entry) {
    memoryCache.delete(key);
  }
  return null;
}

async function setEntry(key: string, entry: IdempotencyEntry, ttlMs: number): Promise<void> {
  try {
    // Try Redis first
    await cache.set(key, JSON.stringify(entry), Math.ceil(ttlMs / 1000));
  } catch (error) {
    logger.warn('Redis idempotency set error, using memory', {
      error: (error as Error).message
    });
    // Fallback to memory
    memoryCache.set(key, entry);
  }
}

async function deleteEntry(key: string): Promise<void> {
  try {
    await cache.del(key);
  } catch (error) {
    logger.warn('Redis idempotency delete error', {
      error: (error as Error).message
    });
  }
  memoryCache.delete(key);
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Idempotency middleware
 * Checks for Idempotency-Key header and handles deduplication
 */
export async function idempotencyMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Only apply to mutating requests (POST, PUT, PATCH)
  if (!['POST', 'PUT', 'PATCH'].includes(request.method)) {
    return;
  }

  const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
  
  // If no idempotency key provided, skip
  if (!idempotencyKey) {
    return;
  }

  metrics.totalRequests++;

  // Validate idempotency key format (UUID or similar)
  if (idempotencyKey.length < 16 || idempotencyKey.length > 128) {
    return reply.status(400).send({
      error: 'Invalid Idempotency-Key header. Must be 16-128 characters.',
      code: 'INVALID_IDEMPOTENCY_KEY'
    });
  }

  const tenantId = (request as any).tenantId || 'anonymous';
  const cacheKey = getCacheKey(idempotencyKey, tenantId);
  
  // Check if we've seen this request before
  const existingEntry = await getEntry(cacheKey);

  if (existingEntry) {
    if (existingEntry.status === 'processing') {
      // Request is still being processed
      logger.warn('Duplicate request while still processing', {
        idempotencyKey,
        tenantId,
        requestId: request.id
      });
      
      reply.header('X-Idempotent-Status', 'processing');
      
      return reply.status(409).send({
        error: 'Request with this Idempotency-Key is still being processed',
        code: 'IDEMPOTENCY_CONFLICT'
      });
    }

    if (existingEntry.status === 'completed' && existingEntry.response) {
      // Return cached response
      metrics.replays++;

      logger.info('Returning cached response for idempotent request', {
        idempotencyKey,
        tenantId,
        originalRequestId: existingEntry.requestId,
        originalTimestamp: new Date(existingEntry.createdAt).toISOString()
      });

      // Set replay headers
      reply.header('X-Idempotent-Replayed', 'true');
      reply.header('X-Idempotent-Original-Timestamp', new Date(existingEntry.createdAt).toISOString());
      reply.header('X-Idempotent-Original-Request-Id', existingEntry.requestId);
      
      return reply
        .code(existingEntry.response.statusCode)
        .send(existingEntry.response.body);
    }

    if (existingEntry.status === 'failed') {
      // Previous attempt failed - allow retry
      logger.info('Previous idempotent request failed, allowing retry', {
        idempotencyKey,
        tenantId,
        previousRequestId: existingEntry.requestId
      });
      
      await deleteEntry(cacheKey);
    }
  }

  // Mark request as processing
  const entry: IdempotencyEntry = {
    requestId: request.id as string,
    status: 'processing',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    expiresAt: Date.now() + DEFAULT_TTL_MS,
    tenantId,
    endpoint: request.url,
    method: request.method
  };

  metrics.processing++;
  await setEntry(cacheKey, entry, DEFAULT_TTL_MS);

  // Store cache key for response capture
  request.idempotencyCacheKey = cacheKey;
  request.idempotencyKey = idempotencyKey;
  request.idempotencyEntry = entry;
}

// =============================================================================
// RESPONSE CAPTURE
// =============================================================================

/**
 * Capture response for idempotency caching
 * Call this after successful response
 */
export async function captureIdempotencyResponse(
  request: FastifyRequest,
  statusCode: number,
  body: any
): Promise<void> {
  const cacheKey = request.idempotencyCacheKey;
  
  if (!cacheKey) {
    return;
  }

  metrics.processing--;
  metrics.completed++;

  const entry: IdempotencyEntry = {
    requestId: request.id as string,
    status: 'completed',
    response: {
      statusCode,
      body
    },
    createdAt: request.idempotencyEntry?.createdAt || Date.now(),
    updatedAt: Date.now(),
    expiresAt: Date.now() + DEFAULT_TTL_MS,
    tenantId: (request as any).tenantId || 'anonymous',
    endpoint: request.url,
    method: request.method
  };

  await setEntry(cacheKey, entry, DEFAULT_TTL_MS);
  
  logger.debug('Cached idempotent response', {
    idempotencyKey: request.idempotencyKey,
    statusCode
  });
}

/**
 * Mark idempotent request as failed
 */
export async function markIdempotencyFailed(
  request: FastifyRequest,
  error: string
): Promise<void> {
  const cacheKey = request.idempotencyCacheKey;
  
  if (!cacheKey) {
    return;
  }

  metrics.processing--;
  metrics.failed++;

  const entry: IdempotencyEntry = {
    requestId: request.id as string,
    status: 'failed',
    createdAt: request.idempotencyEntry?.createdAt || Date.now(),
    updatedAt: Date.now(),
    expiresAt: Date.now() + DEFAULT_TTL_MS,
    tenantId: (request as any).tenantId || 'anonymous',
    endpoint: request.url,
    method: request.method,
    response: {
      statusCode: 500,
      body: { error }
    }
  };

  await setEntry(cacheKey, entry, DEFAULT_TTL_MS);
  
  logger.debug('Marked idempotent request as failed', {
    idempotencyKey: request.idempotencyKey,
    error
  });
}

/**
 * Clear idempotency entry on failure to allow retry
 */
export async function clearIdempotencyEntry(request: FastifyRequest): Promise<void> {
  const cacheKey = request.idempotencyCacheKey;
  
  if (!cacheKey) {
    return;
  }

  metrics.processing--;

  await deleteEntry(cacheKey);

  logger.debug('Cleared idempotency entry', {
    idempotencyKey: request.idempotencyKey
  });
}

// =============================================================================
// CLEANUP
// =============================================================================

// Cleanup expired entries from memory cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt < now) {
      memoryCache.delete(key);
    }
  }
}, 60 * 1000); // Every minute

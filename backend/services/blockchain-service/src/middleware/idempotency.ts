/**
 * Idempotency Middleware for Blockchain Service
 * 
 * Issues Fixed:
 * - #16: No idempotency → Request deduplication via idempotency keys
 * - #17: Duplicate minting → Prevent double-processing
 * - #26: Add X-Idempotent-Replayed header for cached responses
 * 
 * Features:
 * - Request deduplication via Idempotency-Key header
 * - Cached responses for repeated requests
 * - TTL-based expiration
 * - Recovery point tracking
 * - Replay detection headers
 * - Metrics tracking
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { BaseError, ErrorCode } from '../errors';
import { RecoveryPoint } from '../utils/recovery-points';

// =============================================================================
// TYPES
// =============================================================================

// Idempotency cache entry
interface IdempotencyEntry {
  requestId: string;
  status: 'processing' | 'completed' | 'failed';
  response?: {
    statusCode: number;
    body: any;
  };
  recoveryPoint?: RecoveryPoint;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  tenantId: string;
  endpoint: string;
  method: string;
}

// Status response for idempotency lookup
export interface IdempotencyStatus {
  key: string;
  status: 'processing' | 'completed' | 'failed' | 'not_found';
  recoveryPoint?: RecoveryPoint;
  createdAt?: string;
  updatedAt?: string;
  result?: any;
  requestId?: string;
  endpoint?: string;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// Default TTL for idempotency keys (24 hours)
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

// In-memory cache (fallback when Redis unavailable)
const memoryCache = new Map<string, IdempotencyEntry>();

// Redis client reference
let redisClient: any = null;
const REDIS_PREFIX = 'idempotency:';

// =============================================================================
// METRICS - AUDIT FIX #26
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

/**
 * Get idempotency metrics
 */
export function getIdempotencyMetrics(): IdempotencyMetrics {
  return { ...metrics };
}

/**
 * Reset metrics (for testing)
 */
export function resetIdempotencyMetrics(): void {
  metrics.totalRequests = 0;
  metrics.replays = 0;
  metrics.processing = 0;
  metrics.completed = 0;
  metrics.failed = 0;
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize Redis for idempotency
 */
export function initializeIdempotencyRedis(client: any): void {
  redisClient = client;
  logger.info('Idempotency Redis client initialized');
}

// =============================================================================
// CACHE OPERATIONS
// =============================================================================

/**
 * Generate cache key from idempotency key and tenant
 */
function getCacheKey(idempotencyKey: string, tenantId: string): string {
  return `${REDIS_PREFIX}${tenantId}:${idempotencyKey}`;
}

/**
 * Get entry from cache
 */
async function getEntry(key: string): Promise<IdempotencyEntry | null> {
  if (redisClient) {
    try {
      const data = await redisClient.get(key);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      logger.warn('Redis idempotency get error, using memory', {
        error: (error as Error).message
      });
    }
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

/**
 * Set entry in cache
 */
async function setEntry(key: string, entry: IdempotencyEntry, ttlMs: number): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.set(key, JSON.stringify(entry), 'PX', ttlMs);
      return;
    } catch (error) {
      logger.warn('Redis idempotency set error, using memory', {
        error: (error as Error).message
      });
    }
  }

  // Fallback to memory
  memoryCache.set(key, entry);
}

/**
 * Delete entry from cache
 */
async function deleteEntry(key: string): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.del(key);
      return;
    } catch (error) {
      logger.warn('Redis idempotency delete error', {
        error: (error as Error).message
      });
    }
  }

  memoryCache.delete(key);
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Idempotency middleware
 * Checks for Idempotency-Key header and handles deduplication
 * AUDIT FIX #26: Add X-Idempotent-Replayed header
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
    throw new BaseError(
      'Invalid Idempotency-Key header. Must be 16-128 characters.',
      ErrorCode.VALIDATION_FAILED,
      400
    );
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
        requestId: request.id,
        recoveryPoint: existingEntry.recoveryPoint
      });
      
      // AUDIT FIX #26: Add recovery point header for in-progress requests
      reply.header('X-Idempotent-Status', 'processing');
      if (existingEntry.recoveryPoint) {
        reply.header('X-Idempotent-Recovery-Point', existingEntry.recoveryPoint);
      }
      
      throw new BaseError(
        'Request with this Idempotency-Key is still being processed',
        ErrorCode.CONFLICT,
        409
      );
    }

    if (existingEntry.status === 'completed' && existingEntry.response) {
      // Return cached response
      // AUDIT FIX #26: Add X-Idempotent-Replayed header
      metrics.replays++;

      logger.info('Returning cached response for idempotent request', {
        idempotencyKey,
        tenantId,
        originalRequestId: existingEntry.requestId,
        originalTimestamp: new Date(existingEntry.createdAt).toISOString()
      });

      // Set replay headers - AUDIT FIX #26
      reply.header('X-Idempotent-Replayed', 'true');
      reply.header('X-Idempotent-Original-Timestamp', new Date(existingEntry.createdAt).toISOString());
      reply.header('X-Idempotent-Original-Request-Id', existingEntry.requestId);
      
      if (existingEntry.recoveryPoint) {
        reply.header('X-Idempotent-Recovery-Point', existingEntry.recoveryPoint);
      }
      
      return reply
        .code(existingEntry.response.statusCode)
        .send(existingEntry.response.body);
    }

    if (existingEntry.status === 'failed') {
      // Previous attempt failed - allow retry
      logger.info('Previous idempotent request failed, allowing retry', {
        idempotencyKey,
        tenantId,
        previousRequestId: existingEntry.requestId,
        recoveryPoint: existingEntry.recoveryPoint
      });
      
      // Clear the failed entry to allow retry
      await deleteEntry(cacheKey);
    }
  }

  // Mark request as processing
  const entry: IdempotencyEntry = {
    requestId: request.id as string,
    status: 'processing',
    recoveryPoint: RecoveryPoint.INITIATED,
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
  (request as any).idempotencyCacheKey = cacheKey;
  (request as any).idempotencyKey = idempotencyKey;
  (request as any).idempotencyEntry = entry;
}

// =============================================================================
// RESPONSE CAPTURE
// =============================================================================

/**
 * Update recovery point for an idempotent request
 * AUDIT FIX #24: Track recovery points in idempotency
 */
export async function updateIdempotencyRecoveryPoint(
  request: FastifyRequest,
  recoveryPoint: RecoveryPoint
): Promise<void> {
  const cacheKey = (request as any).idempotencyCacheKey;
  
  if (!cacheKey) {
    return;
  }

  const entry = await getEntry(cacheKey);
  if (!entry) {
    return;
  }

  entry.recoveryPoint = recoveryPoint;
  entry.updatedAt = Date.now();
  
  await setEntry(cacheKey, entry, entry.expiresAt - Date.now());
  
  logger.debug('Updated idempotency recovery point', {
    idempotencyKey: (request as any).idempotencyKey,
    recoveryPoint
  });
}

/**
 * Capture response for idempotency caching
 * Call this after successful response
 */
export async function captureIdempotencyResponse(
  request: FastifyRequest,
  statusCode: number,
  body: any,
  recoveryPoint?: RecoveryPoint
): Promise<void> {
  const cacheKey = (request as any).idempotencyCacheKey;
  
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
    recoveryPoint: recoveryPoint || RecoveryPoint.COMPLETED,
    createdAt: (request as any).idempotencyEntry?.createdAt || Date.now(),
    updatedAt: Date.now(),
    expiresAt: Date.now() + DEFAULT_TTL_MS,
    tenantId: (request as any).tenantId || 'anonymous',
    endpoint: request.url,
    method: request.method
  };

  await setEntry(cacheKey, entry, DEFAULT_TTL_MS);
  
  logger.debug('Cached idempotent response', {
    idempotencyKey: (request as any).idempotencyKey,
    statusCode,
    recoveryPoint: entry.recoveryPoint
  });
}

/**
 * Mark idempotent request as failed
 */
export async function markIdempotencyFailed(
  request: FastifyRequest,
  error: string,
  recoveryPoint?: RecoveryPoint
): Promise<void> {
  const cacheKey = (request as any).idempotencyCacheKey;
  
  if (!cacheKey) {
    return;
  }

  metrics.processing--;
  metrics.failed++;

  const existingEntry = await getEntry(cacheKey);
  
  const entry: IdempotencyEntry = {
    requestId: request.id as string,
    status: 'failed',
    recoveryPoint: recoveryPoint || existingEntry?.recoveryPoint || RecoveryPoint.FAILED,
    createdAt: existingEntry?.createdAt || Date.now(),
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
    idempotencyKey: (request as any).idempotencyKey,
    error,
    recoveryPoint: entry.recoveryPoint
  });
}

/**
 * Cleanup idempotency entry on failure
 * Call this if the request fails and should allow retry
 */
export async function clearIdempotencyEntry(request: FastifyRequest): Promise<void> {
  const cacheKey = (request as any).idempotencyCacheKey;
  
  if (!cacheKey) {
    return;
  }

  metrics.processing--;

  await deleteEntry(cacheKey);

  logger.debug('Cleared idempotency entry', {
    idempotencyKey: (request as any).idempotencyKey
  });
}

// =============================================================================
// STATUS LOOKUP
// =============================================================================

/**
 * Get idempotency status for a key
 * AUDIT FIX #26: Add endpoint to query idempotency status
 */
export async function getIdempotencyStatus(
  idempotencyKey: string,
  tenantId: string
): Promise<IdempotencyStatus> {
  const cacheKey = getCacheKey(idempotencyKey, tenantId);
  const entry = await getEntry(cacheKey);

  if (!entry) {
    return {
      key: idempotencyKey,
      status: 'not_found'
    };
  }

  return {
    key: idempotencyKey,
    status: entry.status,
    recoveryPoint: entry.recoveryPoint,
    createdAt: new Date(entry.createdAt).toISOString(),
    updatedAt: new Date(entry.updatedAt).toISOString(),
    result: entry.response?.body,
    requestId: entry.requestId,
    endpoint: entry.endpoint
  };
}

/**
 * List all active idempotency entries for a tenant
 */
export async function listIdempotencyEntries(
  tenantId: string,
  status?: 'processing' | 'completed' | 'failed'
): Promise<IdempotencyStatus[]> {
  const results: IdempotencyStatus[] = [];

  // Search memory cache
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.tenantId === tenantId && entry.expiresAt > Date.now()) {
      if (!status || entry.status === status) {
        results.push({
          key: key.replace(`${REDIS_PREFIX}${tenantId}:`, ''),
          status: entry.status,
          recoveryPoint: entry.recoveryPoint,
          createdAt: new Date(entry.createdAt).toISOString(),
          updatedAt: new Date(entry.updatedAt).toISOString(),
          requestId: entry.requestId,
          endpoint: entry.endpoint
        });
      }
    }
  }

  // Note: For Redis, would need SCAN to find all keys for tenant
  // This is simplified for single-process scenarios

  return results;
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

/**
 * Redis-backed Idempotency Middleware for Integration Service
 * 
 * AUDIT FIXES:
 * - IDP-1: No idempotency middleware → Request deduplication
 * - IDP-2: In-memory Map with weak hash → Redis with SHA-256
 * - IDP-3: No Idempotency-Key header → Proper header support
 * - IDP-H1: No replay detection → X-Idempotent-Replayed header
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import Redis from 'ioredis';
import { getRedisConfig } from '../config/index';
import { logger } from '../utils/logger';
import { IdempotencyConflictError } from '../errors/index';

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
  tenantId?: string;
  endpoint: string;
  method: string;
}

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

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REDIS_PREFIX = 'integration:idempotency:';

// Memory fallback when Redis unavailable
const memoryCache = new Map<string, IdempotencyEntry>();

// Redis client singleton
let redisClient: InstanceType<typeof Redis> | null = null;

// =============================================================================
// REDIS CONNECTION
// =============================================================================

function getRedisClient(): InstanceType<typeof Redis> | null {
  if (!redisClient) {
    try {
      const config = getRedisConfig();
      redisClient = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db,
        tls: config.tls,
        retryStrategy: (times) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3
      });
      
      redisClient.on('error', (err) => {
        logger.error('Redis idempotency client error', { error: err.message });
      });
      
    } catch (error) {
      logger.warn('Failed to create Redis client for idempotency', {
        error: (error as Error).message
      });
      return null;
    }
  }
  return redisClient;
}

// =============================================================================
// HASH FUNCTIONS
// =============================================================================

/**
 * Generate strong SHA-256 hash for idempotency key
 * AUDIT FIX IDP-2: Replace weak 32-bit hash with SHA-256
 */
function generateHash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getCacheKey(idempotencyKey: string, tenantId: string = 'global'): string {
  return `${REDIS_PREFIX}${tenantId}:${generateHash(idempotencyKey)}`;
}

// =============================================================================
// CACHE OPERATIONS
// =============================================================================

async function getEntry(key: string): Promise<IdempotencyEntry | null> {
  const redis = getRedisClient();
  
  // Try Redis first
  if (redis) {
    try {
      const data = await redis.get(key);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      logger.warn('Redis idempotency get error', { error: (error as Error).message });
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

async function setEntry(key: string, entry: IdempotencyEntry, ttlMs: number): Promise<void> {
  const redis = getRedisClient();
  
  // Try Redis first
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(entry), 'PX', ttlMs);
    } catch (error) {
      logger.warn('Redis idempotency set error', { error: (error as Error).message });
    }
  }
  
  // Always store in memory as backup
  memoryCache.set(key, entry);
}

async function deleteEntry(key: string): Promise<void> {
  const redis = getRedisClient();
  
  if (redis) {
    try {
      await redis.del(key);
    } catch (error) {
      logger.warn('Redis idempotency delete error', { error: (error as Error).message });
    }
  }
  
  memoryCache.delete(key);
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Idempotency middleware
 * AUDIT FIX IDP-1, IDP-2, IDP-3: Proper idempotency with Redis
 */
export async function idempotencyMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Only apply to mutating requests
  if (!['POST', 'PUT', 'PATCH'].includes(request.method)) {
    return;
  }
  
  const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
  
  if (!idempotencyKey) {
    return;
  }
  
  // Validate idempotency key format
  if (idempotencyKey.length < 16 || idempotencyKey.length > 128) {
    return reply.status(400).send({
      type: 'urn:error:integration-service:invalid_idempotency_key',
      title: 'Invalid Idempotency Key',
      status: 400,
      detail: 'Idempotency-Key header must be 16-128 characters',
      instance: request.id
    });
  }
  
  const tenantId = request.tenantId || 'global';
  const cacheKey = getCacheKey(idempotencyKey, tenantId);
  
  // Check for existing request
  const existingEntry = await getEntry(cacheKey);
  
  if (existingEntry) {
    if (existingEntry.status === 'processing') {
      logger.warn('Duplicate request while processing', {
        requestId: request.id,
        idempotencyKey,
        originalRequestId: existingEntry.requestId
      });
      
      throw new IdempotencyConflictError(idempotencyKey, 5, request.id as string);
    }
    
    if (existingEntry.status === 'completed' && existingEntry.response) {
      // AUDIT FIX IDP-H1: Return cached response with replay headers
      logger.info('Returning cached idempotent response', {
        requestId: request.id,
        idempotencyKey,
        originalRequestId: existingEntry.requestId
      });
      
      reply.header('X-Idempotent-Replayed', 'true');
      reply.header('X-Idempotent-Original-Timestamp', new Date(existingEntry.createdAt).toISOString());
      reply.header('X-Idempotent-Original-Request-Id', existingEntry.requestId);
      
      return reply
        .code(existingEntry.response.statusCode)
        .send(existingEntry.response.body);
    }
    
    if (existingEntry.status === 'failed') {
      // Allow retry on failure
      await deleteEntry(cacheKey);
    }
  }
  
  // Mark as processing
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
  
  await setEntry(cacheKey, entry, DEFAULT_TTL_MS);
  
  request.idempotencyCacheKey = cacheKey;
  request.idempotencyKey = idempotencyKey;
  request.idempotencyEntry = entry;
}

/**
 * Capture response for caching
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
  
  const entry: IdempotencyEntry = {
    requestId: request.id as string,
    status: 'completed',
    response: { statusCode, body },
    createdAt: request.idempotencyEntry?.createdAt || Date.now(),
    updatedAt: Date.now(),
    expiresAt: Date.now() + DEFAULT_TTL_MS,
    tenantId: request.tenantId,
    endpoint: request.url,
    method: request.method
  };
  
  await setEntry(cacheKey, entry, DEFAULT_TTL_MS);
}

/**
 * Mark request as failed
 */
export async function markIdempotencyFailed(request: FastifyRequest): Promise<void> {
  const cacheKey = request.idempotencyCacheKey;
  
  if (!cacheKey) {
    return;
  }
  
  const entry: IdempotencyEntry = {
    requestId: request.id as string,
    status: 'failed',
    createdAt: request.idempotencyEntry?.createdAt || Date.now(),
    updatedAt: Date.now(),
    expiresAt: Date.now() + DEFAULT_TTL_MS,
    tenantId: request.tenantId,
    endpoint: request.url,
    method: request.method
  };
  
  await setEntry(cacheKey, entry, DEFAULT_TTL_MS);
}

// Cleanup expired entries periodically
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt < now) {
      memoryCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.debug('Cleaned expired idempotency entries', { cleaned });
  }
}, 60 * 1000);

export default {
  idempotencyMiddleware,
  captureIdempotencyResponse,
  markIdempotencyFailed
};

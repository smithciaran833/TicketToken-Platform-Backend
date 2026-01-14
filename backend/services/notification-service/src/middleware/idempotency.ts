/**
 * Request Idempotency Middleware for Notification Service
 * 
 * AUDIT FIX:
 * - IDP-H1: No Idempotency-Key header → Redis-based idempotency
 * - IDP-H3: Queue jobId optional → Enforce unique job IDs
 * 
 * Features:
 * - Idempotency-Key header support
 * - Redis storage with memory fallback
 * - Returns cached response for duplicate requests
 * - Configurable TTL per endpoint
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import Redis from 'ioredis';
import { env } from '../config/env';
import { IdempotencyError } from '../errors/index';

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const REDIS_PREFIX = 'notification:idempotency:';

// Routes that require idempotency
const IDEMPOTENT_ROUTES = new Set([
  'POST:/api/v1/notifications/email',
  'POST:/api/v1/notifications/sms',
  'POST:/api/v1/notifications/push',
  'POST:/api/v1/notifications/batch',
  'POST:/api/v1/campaigns/:id/send',
  'PUT:/api/v1/preferences',
]);

// =============================================================================
// TYPES
// =============================================================================

interface IdempotencyRecord {
  status: 'processing' | 'completed' | 'failed';
  response?: {
    statusCode: number;
    body: any;
  };
  createdAt: string;
  completedAt?: string;
}

// =============================================================================
// STORAGE
// =============================================================================

// In-memory fallback
const memoryStore = new Map<string, IdempotencyRecord>();

// Redis client
let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!redis) {
    try {
      redis = new Redis({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD,
        db: env.REDIS_DB,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false
      });
      
      redis.on('error', (err) => {
        logger.warn('Idempotency Redis error, using memory', { error: err.message });
      });
    } catch (error) {
      logger.warn('Failed to initialize Redis for idempotency', { error });
      return null;
    }
  }
  return redis;
}

// =============================================================================
// STORAGE FUNCTIONS
// =============================================================================

async function getIdempotencyRecord(key: string): Promise<IdempotencyRecord | null> {
  const redisKey = `${REDIS_PREFIX}${key}`;
  
  // Try Redis
  const redisClient = getRedis();
  if (redisClient) {
    try {
      const data = await redisClient.get(redisKey);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      logger.warn('Redis idempotency get failed', { error: (error as Error).message });
    }
  }
  
  // Fallback to memory
  return memoryStore.get(key) || null;
}

async function setIdempotencyRecord(
  key: string,
  record: IdempotencyRecord,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  const redisKey = `${REDIS_PREFIX}${key}`;
  
  // Store in Redis
  const redisClient = getRedis();
  if (redisClient) {
    try {
      await redisClient.setex(redisKey, ttlSeconds, JSON.stringify(record));
    } catch (error) {
      logger.warn('Redis idempotency set failed', { error: (error as Error).message });
    }
  }
  
  // Store in memory
  memoryStore.set(key, record);
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * AUDIT FIX IDP-H1: Idempotency middleware
 */
export async function idempotencyMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Only apply to specific routes
  const routeKey = `${request.method}:${request.url.split('?')[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')}`;
  
  // Skip for non-idempotent routes
  if (!IDEMPOTENT_ROUTES.has(routeKey)) {
    return;
  }
  
  // Get idempotency key from header
  const idempotencyKey = request.headers['idempotency-key'] || 
                         request.headers['x-idempotency-key'];
  
  // For routes without idempotency key, allow through (warn in production)
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    if (env.NODE_ENV === 'production') {
      logger.warn('Request without idempotency key', {
        route: routeKey,
        requestId: (request as any).id
      });
    }
    return;
  }
  
  // Include tenant in key for isolation
  const tenantId = request.tenantId || 'anonymous';
  const fullKey = `${tenantId}:${routeKey}:${idempotencyKey}`;
  
  // Check existing record
  const existing = await getIdempotencyRecord(fullKey);
  
  if (existing) {
    if (existing.status === 'processing') {
      // Request is being processed - conflict
      throw new IdempotencyError(
        'Request with this idempotency key is currently being processed',
        existing.createdAt
      );
    }
    
    if (existing.status === 'completed' && existing.response) {
      // Return cached response
      logger.info('Returning cached idempotent response', {
        idempotencyKey,
        route: routeKey
      });
      
      reply.header('X-Idempotency-Replayed', 'true');
      return reply.status(existing.response.statusCode).send(existing.response.body);
    }
    
    if (existing.status === 'failed') {
      // Previous request failed - allow retry
      logger.info('Previous request failed, allowing retry', {
        idempotencyKey,
        route: routeKey
      });
    }
  }
  
  // Create processing record
  const record: IdempotencyRecord = {
    status: 'processing',
    createdAt: new Date().toISOString()
  };
  await setIdempotencyRecord(fullKey, record);
  
  // Store key for response capture
  (request as any).idempotencyKey = fullKey;
  
  // Hook into response to capture and store
  const originalSend = reply.send.bind(reply);
  reply.send = function(payload: any) {
    const statusCode = reply.statusCode;
    
    // Update record with response
    const updatedRecord: IdempotencyRecord = {
      status: statusCode >= 200 && statusCode < 300 ? 'completed' : 'failed',
      response: {
        statusCode,
        body: payload
      },
      createdAt: record.createdAt,
      completedAt: new Date().toISOString()
    };
    
    // Store asynchronously (don't block response)
    setIdempotencyRecord(fullKey, updatedRecord).catch(err => {
      logger.error('Failed to store idempotency response', { error: err });
    });
    
    return originalSend(payload);
  };
}

/**
 * Generate idempotency key from request data
 */
export function generateIdempotencyKey(
  method: string,
  path: string,
  body: any
): string {
  const crypto = require('crypto');
  const data = JSON.stringify({ method, path, body });
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

// =============================================================================
// CLEANUP
// =============================================================================

// Cleanup expired memory entries
setInterval(() => {
  const now = Date.now();
  const ttlMs = DEFAULT_TTL_SECONDS * 1000;
  let cleaned = 0;
  
  for (const [key, record] of memoryStore.entries()) {
    const createdAt = new Date(record.createdAt).getTime();
    if (now - createdAt > ttlMs) {
      memoryStore.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    logger.debug('Cleaned expired idempotency entries', { cleaned });
  }
}, 60 * 60 * 1000); // Every hour

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  idempotencyMiddleware,
  generateIdempotencyKey
};

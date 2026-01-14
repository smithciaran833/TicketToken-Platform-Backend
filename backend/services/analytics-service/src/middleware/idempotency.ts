/**
 * Idempotency Middleware
 * AUDIT FIX: IDP-1,2,3,4,5 - Prevent duplicate POST/PUT/PATCH operations
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { logger } from '../utils/logger';
import { BadRequestError, ConflictError } from '../errors';
import Redis from 'ioredis';

// =============================================================================
// Configuration
// =============================================================================

const IDEMPOTENCY_HEADER = 'idempotency-key';
const IDEMPOTENCY_TTL = 24 * 60 * 60; // 24 hours in seconds
const IDEMPOTENCY_PREFIX = 'analytics:idempotency:';

// Redis client (lazy initialization)
let redisClient: Redis | null = null;

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });
  }
  return redisClient;
}

// =============================================================================
// Types
// =============================================================================

interface IdempotencyRecord {
  status: 'processing' | 'completed' | 'failed';
  statusCode?: number;
  response?: any;
  createdAt: string;
  completedAt?: string;
  requestHash?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    idempotencyKey?: string;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function generateKey(tenantId: string | undefined, idempotencyKey: string): string {
  return `${IDEMPOTENCY_PREFIX}${tenantId || 'global'}:${idempotencyKey}`;
}

function hashRequest(request: FastifyRequest): string {
  const data = JSON.stringify({
    method: request.method,
    url: request.url,
    body: request.body,
  });
  // Simple hash for request validation
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

// =============================================================================
// Middleware
// =============================================================================

/**
 * Idempotency middleware for POST/PUT/PATCH operations
 */
export async function idempotencyMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Only apply to mutating operations
  if (!['POST', 'PUT', 'PATCH'].includes(request.method)) {
    return;
  }

  const idempotencyKey = request.headers[IDEMPOTENCY_HEADER] as string;
  
  // Idempotency key is optional but recommended
  if (!idempotencyKey) {
    logger.debug({
      event: 'idempotency_key_missing',
      method: request.method,
      url: request.url,
    }, 'No idempotency key provided');
    return;
  }

  // Validate key format (UUID or custom)
  if (idempotencyKey.length < 8 || idempotencyKey.length > 64) {
    throw new BadRequestError(
      'Invalid idempotency key format. Must be 8-64 characters.',
      'INVALID_IDEMPOTENCY_KEY'
    );
  }

  request.idempotencyKey = idempotencyKey;
  const tenantId = (request as any).tenantContext?.tenantId;
  const cacheKey = generateKey(tenantId, idempotencyKey);
  const requestHash = hashRequest(request);
  const redis = getRedis();

  try {
    // Check for existing record
    const existingData = await redis.get(cacheKey);
    
    if (existingData) {
      const record: IdempotencyRecord = JSON.parse(existingData);
      
      // Verify request matches (same request body)
      if (record.requestHash && record.requestHash !== requestHash) {
        throw new ConflictError(
          'Idempotency key was used with a different request payload',
          'IDEMPOTENCY_KEY_MISMATCH'
        );
      }
      
      // If still processing, return 409 Conflict
      if (record.status === 'processing') {
        logger.warn({
          event: 'idempotency_request_in_progress',
          idempotencyKey,
          createdAt: record.createdAt,
        }, 'Duplicate request still processing');
        
        throw new ConflictError(
          'Request with this idempotency key is still being processed',
          'IDEMPOTENCY_IN_PROGRESS'
        );
      }
      
      // If completed, return cached response
      if (record.status === 'completed' && record.response !== undefined) {
        logger.info({
          event: 'idempotency_cache_hit',
          idempotencyKey,
          statusCode: record.statusCode,
        }, 'Returning cached idempotent response');
        
        reply.header('x-idempotent-replayed', 'true');
        return reply.status(record.statusCode || 200).send(record.response);
      }
      
      // If failed, allow retry
      if (record.status === 'failed') {
        logger.info({
          event: 'idempotency_retry_after_failure',
          idempotencyKey,
        }, 'Allowing retry after previous failure');
      }
    }
    
    // Create processing record
    const processingRecord: IdempotencyRecord = {
      status: 'processing',
      createdAt: new Date().toISOString(),
      requestHash,
    };
    
    // Use NX to ensure we only set if not exists (atomic)
    const setResult = await redis.set(
      cacheKey,
      JSON.stringify(processingRecord),
      'EX',
      IDEMPOTENCY_TTL,
      'NX'
    );
    
    // If set failed, another request beat us
    if (!setResult) {
      throw new ConflictError(
        'Request with this idempotency key is being processed',
        'IDEMPOTENCY_RACE_CONDITION'
      );
    }
    
    // Store response when request completes using addHook pattern
    const storeCompletedRecord = async () => {
      try {
        const completedRecord: IdempotencyRecord = {
          status: reply.statusCode >= 400 ? 'failed' : 'completed',
          statusCode: reply.statusCode,
          response: reply.statusCode < 400 ? (reply as any).payload : undefined,
          createdAt: processingRecord.createdAt,
          completedAt: new Date().toISOString(),
          requestHash,
        };
        
        await redis.set(
          cacheKey,
          JSON.stringify(completedRecord),
          'EX',
          IDEMPOTENCY_TTL
        );
        
        logger.debug({
          event: 'idempotency_stored',
          idempotencyKey,
          status: completedRecord.status,
        }, 'Idempotency record stored');
      } catch (err) {
        logger.error({
          event: 'idempotency_store_error',
          idempotencyKey,
          error: (err as Error).message,
        }, 'Failed to store idempotency record');
      }
    };
    
    // Use reply.then with both onfulfilled and onrejected handlers
    reply.then(storeCompletedRecord, storeCompletedRecord);
    
  } catch (err) {
    // Re-throw known errors
    if (err instanceof ConflictError || err instanceof BadRequestError) {
      throw err;
    }
    
    // Log and continue on Redis errors (don't fail the request)
    logger.error({
      event: 'idempotency_check_error',
      idempotencyKey,
      error: (err as Error).message,
    }, 'Idempotency check failed, continuing without');
  }
}

/**
 * Require idempotency key - rejects requests without it
 */
export async function requireIdempotencyKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!['POST', 'PUT', 'PATCH'].includes(request.method)) {
    return;
  }
  
  const idempotencyKey = request.headers[IDEMPOTENCY_HEADER] as string;
  
  if (!idempotencyKey) {
    throw new BadRequestError(
      `${IDEMPOTENCY_HEADER} header is required for ${request.method} requests`,
      'IDEMPOTENCY_KEY_REQUIRED'
    );
  }
  
  await idempotencyMiddleware(request, reply);
}

// =============================================================================
// Fastify Plugin
// =============================================================================

export async function registerIdempotency(fastify: FastifyInstance): Promise<void> {
  fastify.decorateRequest('idempotencyKey', null);
}

// =============================================================================
// Cleanup
// =============================================================================

export async function closeIdempotency(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

export default {
  idempotencyMiddleware,
  requireIdempotencyKey,
  registerIdempotency,
  closeIdempotency,
};

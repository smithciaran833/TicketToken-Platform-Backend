/**
 * Idempotency Middleware for Ticket Service
 * 
 * Fixes audit findings:
 * - Key format includes tenant_id - Combines tenant + client key
 * - Idempotency includes tenant_id - Uses tenant-scoped table
 * - Concurrent returns 409 - Returns 409 Conflict for locked keys
 * - Uses idempotency (reservation) - Supports all operations
 * - Duplicates prevented (reservation) - Atomic INSERT ON CONFLICT
 * - All POST support idempotency - Works for all POST/PUT/DELETE
 * - Checks are atomic - Uses database function with ON CONFLICT
 * - Keys scoped to tenant - Composite key with tenant_id
 * 
 * MEDIUM/LOW Batch 24 fixes:
 * - Key expiration policy - TTL-based cleanup for old idempotency keys
 * - Idempotency metrics - Prometheus metrics for monitoring
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { createHash, randomUUID } from 'crypto';
import { Counter, Histogram, Gauge } from 'prom-client';
import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';
import { registry } from '../utils/metrics';

const log = logger.child({ component: 'IdempotencyMiddleware' });

// =============================================================================
// IDEMPOTENCY METRICS - Batch 24 Fix
// =============================================================================

export const idempotencyMetrics = {
  /** Counter for idempotency key operations */
  operationsTotal: new Counter({
    name: 'idempotency_operations_total',
    help: 'Total idempotency key operations',
    labelNames: ['operation', 'status', 'result'] as const,
    registers: [registry],
  }),
  
  /** Counter for cache hits/misses */
  cacheTotal: new Counter({
    name: 'idempotency_cache_total',
    help: 'Idempotency cache operations',
    labelNames: ['result'] as const, // hit, miss, replay
    registers: [registry],
  }),
  
  /** Histogram for idempotency key acquisition time */
  acquisitionDurationSeconds: new Histogram({
    name: 'idempotency_acquisition_duration_seconds',
    help: 'Time taken to acquire idempotency key',
    labelNames: ['operation'] as const,
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
    registers: [registry],
  }),
  
  /** Counter for concurrent request conflicts */
  conflictsTotal: new Counter({
    name: 'idempotency_conflicts_total',
    help: 'Total idempotency conflicts (409 responses)',
    labelNames: ['operation'] as const,
    registers: [registry],
  }),
  
  /** Gauge for active idempotency locks */
  activeLocks: new Gauge({
    name: 'idempotency_active_locks',
    help: 'Number of active idempotency locks',
    labelNames: ['operation'] as const,
    registers: [registry],
  }),
  
  /** Counter for key expirations */
  expirationsTotal: new Counter({
    name: 'idempotency_expirations_total',
    help: 'Total idempotency keys expired/cleaned up',
    registers: [registry],
  }),
};

// =============================================================================
// KEY EXPIRATION CONFIGURATION - Batch 24 Fix
// =============================================================================

export interface IdempotencyTTLConfig {
  /** TTL for completed keys in hours (default: 24) */
  completedTTLHours: number;
  /** TTL for failed keys in hours (default: 1) */
  failedTTLHours: number;
  /** TTL for processing keys in minutes (default: 15) */
  processingTTLMinutes: number;
  /** Cleanup batch size (default: 1000) */
  cleanupBatchSize: number;
  /** Cleanup interval in minutes (default: 60) */
  cleanupIntervalMinutes: number;
}

const DEFAULT_TTL_CONFIG: IdempotencyTTLConfig = {
  completedTTLHours: parseInt(process.env.IDEMPOTENCY_COMPLETED_TTL_HOURS || '24', 10),
  failedTTLHours: parseInt(process.env.IDEMPOTENCY_FAILED_TTL_HOURS || '1', 10),
  processingTTLMinutes: parseInt(process.env.IDEMPOTENCY_PROCESSING_TTL_MINUTES || '15', 10),
  cleanupBatchSize: parseInt(process.env.IDEMPOTENCY_CLEANUP_BATCH_SIZE || '1000', 10),
  cleanupIntervalMinutes: parseInt(process.env.IDEMPOTENCY_CLEANUP_INTERVAL_MINUTES || '60', 10),
};

let ttlConfig: IdempotencyTTLConfig = { ...DEFAULT_TTL_CONFIG };
let cleanupInterval: NodeJS.Timeout | null = null;

// =============================================================================
// TYPES
// =============================================================================

interface IdempotencyResult {
  keyId: string | null;
  status: string;
  isNew: boolean;
  isLocked: boolean;
  responseStatus: number | null;
  responseBody: any;
  resourceId: string | null;
}

interface IdempotencyOptions {
  /** Operation type (purchase, reservation, transfer, etc.) */
  operation: string;
  /** Whether idempotency key is required (default: true for POST) */
  required?: boolean;
  /** Lock duration in minutes (default: 5) */
  lockDurationMinutes?: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Header name for client-provided idempotency key */
const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/** Header name for X-Idempotency-Key (alternative) */
const ALT_IDEMPOTENCY_KEY_HEADER = 'x-idempotency-key';

/** Methods that support idempotency */
const IDEMPOTENT_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * MEDIUM Fix: Generate hash of request body (payload fingerprint)
 * Ensures the same idempotency key isn't reused with different requests
 * 
 * Fixes: "No payload fingerprint - Body hash not stored"
 */
function hashRequestBody(body: any): string {
  if (!body) return '';
  
  // Normalize the body - sort keys for consistent hashing
  const normalizedBody = typeof body === 'string' 
    ? body 
    : JSON.stringify(body, Object.keys(body).sort());
  
  return createHash('sha256').update(normalizedBody).digest('hex');
}

/**
 * Verify payload fingerprint matches previous request
 * Returns error message if mismatch, null if valid
 */
function verifyPayloadFingerprint(stored: string, current: string): string | null {
  if (!stored) return null; // No stored fingerprint, allow
  if (stored === current) return null; // Match
  
  return 'Request body differs from original request with this idempotency key';
}

/**
 * Generate a unique lock holder ID for this request
 */
function generateLockHolder(): string {
  return `${process.env.HOSTNAME || 'worker'}-${randomUUID().substring(0, 8)}`;
}

/**
 * Extract idempotency key from request headers
 */
function extractIdempotencyKey(request: FastifyRequest): string | undefined {
  return (
    request.headers[IDEMPOTENCY_KEY_HEADER] ||
    request.headers[ALT_IDEMPOTENCY_KEY_HEADER]
  ) as string | undefined;
}

// =============================================================================
// DATABASE OPERATIONS
// =============================================================================

/**
 * Acquire or check idempotency key using atomic database function
 * 
 * Fixes: "Checks are atomic - SELECT before INSERT"
 */
async function acquireIdempotencyKey(
  tenantId: string,
  idempotencyKey: string,
  operation: string,
  requestHash: string,
  lockDurationMinutes: number = 5
): Promise<IdempotencyResult> {
  const lockHolder = generateLockHolder();
  
  const result = await DatabaseService.query(
    `SELECT * FROM acquire_idempotency_key($1, $2, $3, $4, $5, $6 * INTERVAL '1 minute')`,
    [tenantId, idempotencyKey, operation, requestHash, lockHolder, lockDurationMinutes]
  );

  const row = result.rows?.[0];
  
  return {
    keyId: row?.key_id || null,
    status: row?.status || 'unknown',
    isNew: row?.is_new || false,
    isLocked: row?.is_locked || false,
    responseStatus: row?.response_status || null,
    responseBody: row?.response_body || null,
    resourceId: row?.resource_id || null
  };
}

/**
 * Complete idempotency key with response data
 */
async function completeIdempotencyKey(
  keyId: string,
  status: 'completed' | 'failed',
  responseStatus: number,
  responseBody: any,
  resourceId?: string,
  resourceType?: string
): Promise<boolean> {
  const result = await DatabaseService.query(
    `SELECT complete_idempotency_key($1, $2, $3, $4, $5, $6)`,
    [keyId, status, responseStatus, JSON.stringify(responseBody), resourceId, resourceType]
  );
  
  return result.rows?.[0]?.complete_idempotency_key || false;
}

/**
 * Release idempotency lock (e.g., on error before completion)
 */
async function releaseIdempotencyLock(keyId: string, setFailed: boolean = false): Promise<boolean> {
  const result = await DatabaseService.query(
    `SELECT release_idempotency_lock($1, $2)`,
    [keyId, setFailed]
  );
  
  return result.rows?.[0]?.release_idempotency_lock || false;
}

// =============================================================================
// MIDDLEWARE FACTORY
// =============================================================================

/**
 * Create idempotency middleware for a specific operation
 * 
 * Usage:
 * ```typescript
 * app.post('/purchase', {
 *   preHandler: [authMiddleware, tenantMiddleware, createIdempotencyMiddleware({ operation: 'purchase' })]
 * }, purchaseHandler);
 * ```
 */
export function createIdempotencyMiddleware(options: IdempotencyOptions) {
  const {
    operation,
    required = true,
    lockDurationMinutes = 5
  } = options;

  return async function idempotencyMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // Only process idempotent methods
    if (!IDEMPOTENT_METHODS.includes(request.method)) {
      return;
    }

    // Get tenant ID from request (set by tenant middleware)
    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      log.warn('Idempotency middleware called without tenant context', {
        path: request.url,
        method: request.method
      });
      
      if (required) {
        reply.status(400).send({
          error: 'Bad Request',
          code: 'TENANT_REQUIRED',
          message: 'Tenant context required for this operation'
        });
        return;
      }
      return;
    }

    // Extract idempotency key from headers
    const clientKey = extractIdempotencyKey(request);
    
    if (!clientKey) {
      if (required) {
        // Fixes: "All POST support idempotency - Purchase yes, reservation no"
        reply.status(400).send({
          error: 'Bad Request',
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'Idempotency-Key header is required for this operation'
        });
        return;
      }
      return;
    }

    // Validate key format (prevent injection)
    if (clientKey.length > 255 || !/^[\w\-:.]+$/.test(clientKey)) {
      reply.status(400).send({
        error: 'Bad Request',
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency key must be alphanumeric with hyphens, max 255 chars'
      });
      return;
    }

    // Generate request hash for validation
    const requestHash = hashRequestBody(request.body);

    // Create composite key with tenant ID
    // Fixes: "Key format includes tenant_id - Client key, tenant validated separately"
    const compositeKey = `${tenantId}:${clientKey}`;

    try {
      // Attempt to acquire the idempotency key
      // Fixes: "Checks are atomic - SELECT before INSERT"
      const result = await acquireIdempotencyKey(
        tenantId,
        clientKey,
        operation,
        requestHash,
        lockDurationMinutes
      );

      if (result.isNew && result.isLocked) {
        // New request - store key ID for completion later
        (request as any).idempotencyKeyId = result.keyId;
        (request as any).idempotencyOperation = operation;
        
        log.debug('Idempotency key acquired', {
          keyId: result.keyId,
          operation,
          tenantId
        });
        return; // Continue to handler
      }

      if (result.status === 'completed') {
        // Return cached response
        log.info('Returning cached idempotent response', {
          operation,
          tenantId,
          originalStatus: result.responseStatus
        });

        reply
          .status(result.responseStatus || 200)
          .header('X-Idempotent-Replay', 'true')
          .send(result.responseBody);
        return;
      }

      if (result.status === 'processing' && !result.isLocked) {
        // Another request is processing this key
        // Fixes: "Concurrent returns 409 - No locking, race window"
        log.warn('Concurrent idempotent request detected', {
          operation,
          tenantId,
          clientKey
        });

        reply.status(409).send({
          error: 'Conflict',
          code: 'REQUEST_IN_PROGRESS',
          message: 'A request with this idempotency key is already being processed. Please retry later.',
          retryAfter: 5
        });
        return;
      }

      if (result.status === 'failed') {
        // Previous request failed - allow retry
        (request as any).idempotencyKeyId = result.keyId;
        (request as any).idempotencyOperation = operation;
        
        log.debug('Retrying failed idempotent request', {
          keyId: result.keyId,
          operation,
          tenantId
        });
        return; // Continue to handler
      }

      // Unexpected state
      log.error('Unexpected idempotency state', { result, operation, tenantId });
      reply.status(500).send({
        error: 'Internal Server Error',
        code: 'IDEMPOTENCY_ERROR',
        message: 'Failed to process idempotency key'
      });
    } catch (error) {
      log.error('Idempotency check failed', {
        error: error instanceof Error ? error.message : String(error),
        operation,
        tenantId
      });

      // Don't block the request on idempotency errors in non-production
      if (process.env.NODE_ENV === 'production') {
        reply.status(500).send({
          error: 'Internal Server Error',
          code: 'IDEMPOTENCY_ERROR',
          message: 'Failed to verify idempotency key'
        });
        return;
      }
      
      // In development, continue without idempotency
      log.warn('Continuing without idempotency check (development mode)');
    }
  };
}

// =============================================================================
// RESPONSE HOOK
// =============================================================================

/**
 * Hook to complete idempotency key after successful response
 * 
 * Add this as an onSend hook to save the response for idempotent replay:
 * ```typescript
 * app.addHook('onSend', idempotencyResponseHook);
 * ```
 */
export async function idempotencyResponseHook(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: any
): Promise<any> {
  const keyId = (request as any).idempotencyKeyId;
  
  if (!keyId) {
    return payload;
  }

  try {
    // Parse response body if it's a string
    let responseBody = payload;
    if (typeof payload === 'string') {
      try {
        responseBody = JSON.parse(payload);
      } catch {
        responseBody = { raw: payload };
      }
    }

    // Extract resource ID from response if available
    const resourceId = responseBody?.data?.id || responseBody?.id;
    const resourceType = (request as any).idempotencyOperation;

    // Determine status based on response code
    const status = reply.statusCode >= 200 && reply.statusCode < 300 
      ? 'completed' 
      : 'failed';

    await completeIdempotencyKey(
      keyId,
      status,
      reply.statusCode,
      responseBody,
      resourceId,
      resourceType
    );

    log.debug('Idempotency key completed', {
      keyId,
      status,
      statusCode: reply.statusCode,
      resourceId
    });
  } catch (error) {
    log.error('Failed to complete idempotency key', {
      keyId,
      error: error instanceof Error ? error.message : String(error)
    });
    // Don't fail the response, just log the error
  }

  return payload;
}

/**
 * Hook to release idempotency lock on error
 * 
 * Add this as an onError hook:
 * ```typescript
 * app.addHook('onError', idempotencyErrorHook);
 * ```
 */
export async function idempotencyErrorHook(
  request: FastifyRequest,
  reply: FastifyReply,
  error: Error
): Promise<void> {
  const keyId = (request as any).idempotencyKeyId;
  
  if (!keyId) {
    return;
  }

  try {
    // Release the lock and mark as failed
    await releaseIdempotencyLock(keyId, true);
    
    log.debug('Idempotency lock released on error', {
      keyId,
      error: error.message
    });
  } catch (releaseError) {
    log.error('Failed to release idempotency lock', {
      keyId,
      error: releaseError instanceof Error ? releaseError.message : String(releaseError)
    });
  }
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

/**
 * Manually complete an idempotency key (for use in handlers)
 */
export async function completeIdempotency(
  request: FastifyRequest,
  responseStatus: number,
  responseBody: any,
  resourceId?: string
): Promise<void> {
  const keyId = (request as any).idempotencyKeyId;
  
  if (!keyId) {
    return;
  }

  const operation = (request as any).idempotencyOperation;
  const status = responseStatus >= 200 && responseStatus < 300 ? 'completed' : 'failed';

  await completeIdempotencyKey(keyId, status, responseStatus, responseBody, resourceId, operation);
}

/**
 * Pre-configured middlewares for common operations
 */
export const idempotencyMiddleware = {
  /** For purchase operations */
  purchase: createIdempotencyMiddleware({ operation: 'purchase' }),
  
  /** For reservation operations - Fixes: "Uses idempotency (reservation) - No idempotency key" */
  reservation: createIdempotencyMiddleware({ operation: 'reservation' }),
  
  /** For transfer operations */
  transfer: createIdempotencyMiddleware({ operation: 'transfer' }),
  
  /** For refund operations */
  refund: createIdempotencyMiddleware({ operation: 'refund' }),
  
  /** For any POST operation */
  generic: createIdempotencyMiddleware({ operation: 'generic' }),
  
  /** Optional (non-required) idempotency */
  optional: (operation: string) => createIdempotencyMiddleware({ operation, required: false })
};

// =============================================================================
// KEY EXPIRATION & CLEANUP - Batch 24 Fix
// =============================================================================

/**
 * Cleanup expired idempotency keys based on TTL policy
 * 
 * Policy:
 * - Completed keys: expire after completedTTLHours (default 24h)
 * - Failed keys: expire after failedTTLHours (default 1h) 
 * - Processing keys: expire after processingTTLMinutes (default 15min) - stale locks
 * 
 * Returns the number of keys cleaned up
 */
export async function cleanupExpiredIdempotencyKeys(): Promise<number> {
  const startTime = Date.now();
  
  try {
    // Use a single efficient query to clean up all expired keys
    const result = await DatabaseService.query(
      `WITH deleted AS (
        DELETE FROM ticket_idempotency_keys
        WHERE 
          -- Completed keys past TTL
          (status = 'completed' AND updated_at < NOW() - $1 * INTERVAL '1 hour')
          OR
          -- Failed keys past TTL (shorter TTL to allow retry sooner)
          (status = 'failed' AND updated_at < NOW() - $2 * INTERVAL '1 hour')
          OR
          -- Processing keys that are stale (lock abandoned)
          (status = 'processing' AND updated_at < NOW() - $3 * INTERVAL '1 minute')
        RETURNING id
      )
      SELECT COUNT(*) as deleted_count FROM deleted`,
      [
        ttlConfig.completedTTLHours,
        ttlConfig.failedTTLHours,
        ttlConfig.processingTTLMinutes
      ]
    );
    
    const deletedCount = parseInt(result.rows?.[0]?.deleted_count || '0', 10);
    
    // Track metrics
    if (deletedCount > 0) {
      idempotencyMetrics.expirationsTotal.inc(deletedCount);
      
      log.info('Cleaned up expired idempotency keys', {
        deletedCount,
        durationMs: Date.now() - startTime,
        config: {
          completedTTLHours: ttlConfig.completedTTLHours,
          failedTTLHours: ttlConfig.failedTTLHours,
          processingTTLMinutes: ttlConfig.processingTTLMinutes
        }
      });
    }
    
    return deletedCount;
  } catch (error) {
    log.error('Failed to cleanup expired idempotency keys', {
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime
    });
    throw error;
  }
}

/**
 * Start scheduled cleanup of expired idempotency keys
 */
export function startIdempotencyCleanup(config?: Partial<IdempotencyTTLConfig>): void {
  // Merge with defaults
  if (config) {
    ttlConfig = { ...ttlConfig, ...config };
  }
  
  // Clear any existing interval
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  
  const intervalMs = ttlConfig.cleanupIntervalMinutes * 60 * 1000;
  
  log.info('Starting idempotency key cleanup scheduler', {
    intervalMinutes: ttlConfig.cleanupIntervalMinutes,
    completedTTLHours: ttlConfig.completedTTLHours,
    failedTTLHours: ttlConfig.failedTTLHours,
    processingTTLMinutes: ttlConfig.processingTTLMinutes
  });
  
  // Run cleanup on interval
  cleanupInterval = setInterval(async () => {
    try {
      await cleanupExpiredIdempotencyKeys();
    } catch (error) {
      // Error already logged in cleanupExpiredIdempotencyKeys
    }
  }, intervalMs);
  
  // Run initial cleanup after a short delay
  setTimeout(() => {
    cleanupExpiredIdempotencyKeys().catch(() => {});
  }, 5000);
}

/**
 * Stop scheduled cleanup
 */
export function stopIdempotencyCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    log.info('Stopped idempotency key cleanup scheduler');
  }
}

/**
 * Get current TTL configuration
 */
export function getIdempotencyTTLConfig(): IdempotencyTTLConfig {
  return { ...ttlConfig };
}

/**
 * Update TTL configuration at runtime
 */
export function setIdempotencyTTLConfig(config: Partial<IdempotencyTTLConfig>): void {
  ttlConfig = { ...ttlConfig, ...config };
  log.info('Updated idempotency TTL configuration', { config: ttlConfig });
}

// =============================================================================
// METRICS HELPERS - Batch 24 Fix
// =============================================================================

/**
 * Record an idempotency operation in metrics
 */
export function recordIdempotencyOperation(
  operation: string,
  status: 'acquired' | 'completed' | 'failed' | 'conflict' | 'replay',
  result: 'success' | 'error'
): void {
  idempotencyMetrics.operationsTotal.inc({ operation, status, result });
  
  if (status === 'conflict') {
    idempotencyMetrics.conflictsTotal.inc({ operation });
  }
  
  if (status === 'replay') {
    idempotencyMetrics.cacheTotal.inc({ result: 'hit' });
  } else if (status === 'acquired') {
    idempotencyMetrics.cacheTotal.inc({ result: 'miss' });
  }
}

/**
 * Update active locks gauge
 */
export function updateActiveLocks(operation: string, delta: number): void {
  if (delta > 0) {
    idempotencyMetrics.activeLocks.inc({ operation }, delta);
  } else {
    idempotencyMetrics.activeLocks.dec({ operation }, Math.abs(delta));
  }
}

/**
 * Observe idempotency acquisition duration
 */
export function observeAcquisitionDuration(operation: string, durationSeconds: number): void {
  idempotencyMetrics.acquisitionDurationSeconds.observe({ operation }, durationSeconds);
}

/**
 * Get idempotency metrics summary
 */
export async function getIdempotencyMetricsSummary(): Promise<{
  totalOperations: number;
  cacheHitRate: number;
  conflictCount: number;
  activeLocks: number;
  expiredKeys: number;
}> {
  // Get metrics values - these are accumulated counters
  const opsMetric = await idempotencyMetrics.operationsTotal.get();
  const cacheMetric = await idempotencyMetrics.cacheTotal.get();
  const conflictMetric = await idempotencyMetrics.conflictsTotal.get();
  const locksMetric = await idempotencyMetrics.activeLocks.get();
  const expirationMetric = await idempotencyMetrics.expirationsTotal.get();
  
  const totalOps = opsMetric.values.reduce((sum, v) => sum + v.value, 0);
  const cacheHits = cacheMetric.values.find(v => v.labels.result === 'hit')?.value || 0;
  const cacheMisses = cacheMetric.values.find(v => v.labels.result === 'miss')?.value || 0;
  const cacheTotal = cacheHits + cacheMisses;
  
  return {
    totalOperations: totalOps,
    cacheHitRate: cacheTotal > 0 ? cacheHits / cacheTotal : 0,
    conflictCount: conflictMetric.values.reduce((sum, v) => sum + v.value, 0),
    activeLocks: locksMetric.values.reduce((sum, v) => sum + v.value, 0),
    expiredKeys: expirationMetric.values.reduce((sum, v) => sum + v.value, 0),
  };
}

export default idempotencyMiddleware;

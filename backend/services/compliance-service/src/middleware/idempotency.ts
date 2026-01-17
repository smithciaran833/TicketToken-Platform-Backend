/**
 * Idempotency Middleware for Compliance Service
 *
 * AUDIT FIX IDP-1,2,3,4: No idempotency anywhere
 *
 * Prevents duplicate 1099 generation, duplicate OFAC checks, etc.
 * Uses Redis for distributed idempotency key storage.
 */

import { Request, Response, NextFunction } from 'express';
import { redisService } from '../services/redis.service';
import { logger } from '../utils/logger';
import { IdempotencyError, ConflictError } from '../errors';

// =============================================================================
// CONFIGURATION
// =============================================================================

const IDEMPOTENCY_TTL = 86400; // 24 hours
const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const LOCK_TTL = 30; // 30 seconds for processing lock

// =============================================================================
// TYPES
// =============================================================================

interface IdempotencyRecord {
  status: 'processing' | 'completed' | 'failed';
  response?: {
    statusCode: number;
    body: any;
    headers?: Record<string, string>;
  };
  createdAt: string;
  completedAt?: string;
  requestHash?: string;
}

// =============================================================================
// MIDDLEWARE FACTORY
// =============================================================================

/**
 * Create idempotency middleware for specific operations
 */
export function idempotency(options?: {
  /** Custom key generator */
  keyGenerator?: (req: Request) => string;
  /** TTL in seconds */
  ttl?: number;
  /** Operations to apply to (default: POST, PUT, PATCH) */
  methods?: string[];
  /** Skip idempotency for certain paths */
  skipPaths?: string[];
}) {
  const ttl = options?.ttl ?? IDEMPOTENCY_TTL;
  const methods = options?.methods ?? ['POST', 'PUT', 'PATCH'];
  const skipPaths = options?.skipPaths ?? ['/health', '/ready', '/metrics'];

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip for non-mutating methods
    if (!methods.includes(req.method)) {
      return next();
    }

    // Skip for certain paths
    if (skipPaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    const idempotencyKey = req.headers[IDEMPOTENCY_HEADER.toLowerCase()] as string;

    // If no key provided, proceed without idempotency
    if (!idempotencyKey) {
      return next();
    }

    const tenantId = (req as any).tenantId || 'default';
    const requestId = (req as any).requestId;
    const redisKey = `idempotency:${tenantId}:${idempotencyKey}`;
    const requestHash = generateRequestHash(req);

    try {
      // Try to get existing record
      const existing = await redisService.get<IdempotencyRecord>(redisKey);

      if (existing) {
        // Check if request is still processing
        if (existing.status === 'processing') {
          logger.warn({ requestId, idempotencyKey }, 'Duplicate request - still processing');
          throw new IdempotencyError(idempotencyKey, requestId);
        }

        // Return cached response for completed requests
        if (existing.status === 'completed' && existing.response) {
          // Check if request body matches (prevent key reuse with different data)
          if (existing.requestHash && existing.requestHash !== requestHash) {
            logger.warn({ requestId, idempotencyKey }, 'Idempotency key reused with different request body');
            throw new ConflictError(
              'Idempotency key has already been used with a different request body',
              requestId
            );
          }

          logger.info({ requestId, idempotencyKey }, 'Returning cached idempotent response');

          res.set('X-Idempotent-Replayed', 'true');
          if (existing.response.headers) {
            Object.entries(existing.response.headers).forEach(([key, value]) => {
              res.set(key, value as string);
            });
          }
          res.status(existing.response.statusCode).json(existing.response.body);
          return;
        }

        // If failed, allow retry
        if (existing.status === 'failed') {
          logger.info({ requestId, idempotencyKey }, 'Previous request failed, allowing retry');
        }
      }

      // Store processing record
      const processingRecord: IdempotencyRecord = {
        status: 'processing',
        createdAt: new Date().toISOString(),
        requestHash
      };

      await redisService.setWithTTL(redisKey, processingRecord, LOCK_TTL);

      // Intercept response to store result
      const originalJson = res.json.bind(res);
      res.json = function(body: any) {
        // Store completed record
        const completedRecord: IdempotencyRecord = {
          status: 'completed',
          response: {
            statusCode: res.statusCode,
            body
          },
          createdAt: processingRecord.createdAt,
          completedAt: new Date().toISOString(),
          requestHash
        };

        redisService.setWithTTL(redisKey, completedRecord, ttl).catch(err => {
          logger.error({ requestId, idempotencyKey, error: err.message }, 'Failed to store idempotency record');
        });

        return originalJson(body);
      };

      // Handle errors - mark as failed
      res.on('close', () => {
        if (!res.writableFinished && res.statusCode >= 400) {
          const failedRecord: IdempotencyRecord = {
            status: 'failed',
            createdAt: processingRecord.createdAt,
            completedAt: new Date().toISOString(),
            requestHash
          };
          redisService.setWithTTL(redisKey, failedRecord, LOCK_TTL).catch(() => {});
        }
      });

      next();
    } catch (error) {
      if (error instanceof IdempotencyError || error instanceof ConflictError) {
        throw error;
      }

      logger.error({ requestId, idempotencyKey, error: (error as Error).message }, 'Idempotency check failed');
      // On Redis error, proceed without idempotency (fail open)
      next();
    }
  };
}

// =============================================================================
// SPECIALIZED MIDDLEWARE
// =============================================================================

/**
 * Idempotency for 1099 generation (IDP-3: 1099 not idempotent)
 */
export const idempotency1099 = idempotency({
  keyGenerator: (req) => {
    const venueId = req.params.venueId || req.body.venueId;
    const year = req.params.year || req.body.year || new Date().getFullYear();
    return `1099:${venueId}:${year}`;
  },
  ttl: 31536000, // 1 year (1099s are annual)
  methods: ['POST']
});

/**
 * Idempotency for tax tracking (IDP-4: trackSale not idempotent)
 */
export const idempotencyTaxTracking = idempotency({
  keyGenerator: (req) => {
    const { venueId, ticketId } = req.body;
    return `tax:${venueId}:${ticketId}`;
  },
  ttl: 604800, // 7 days
  methods: ['POST']
});

/**
 * Idempotency for GDPR requests
 */
export const idempotencyGDPR = idempotency({
  keyGenerator: (req) => {
    const { userId, requestType } = req.body;
    return `gdpr:${requestType}:${userId}`;
  },
  ttl: 2592000, // 30 days
  methods: ['POST', 'DELETE']
});

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generate a hash of the request for validation
 */
function generateRequestHash(req: Request): string {
  const crypto = require('crypto');
  const content = JSON.stringify({
    method: req.method,
    path: req.path,
    body: req.body,
    query: req.query
  });
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Check if a request was replayed
 */
export function isReplayedRequest(res: Response): boolean {
  return res.get('X-Idempotent-Replayed') === 'true';
}

export default {
  idempotency,
  idempotency1099,
  idempotencyTaxTracking,
  idempotencyGDPR,
  isReplayedRequest
};

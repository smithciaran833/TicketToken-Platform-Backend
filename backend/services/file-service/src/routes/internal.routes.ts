/**
 * Internal Routes - file-service
 *
 * For service-to-service communication only.
 * These endpoints provide file data to other services
 * (compliance-service for GDPR exports, ticket-service, etc.)
 *
 * Phase A HMAC Standardization - Decision #2 Implementation
 *
 * Endpoints:
 * - GET /internal/users/:userId/files - Get user's files (GDPR)
 * - GET /internal/files/:fileId - Get file metadata
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'crypto';
import { logger } from '../utils/logger';
import { db } from '../config/database';

const log = logger.child({ component: 'InternalRoutes' });

// Internal authentication configuration
const INTERNAL_HMAC_SECRET = process.env.INTERNAL_HMAC_SECRET || process.env.INTERNAL_SERVICE_SECRET;
const USE_NEW_HMAC = process.env.USE_NEW_HMAC === 'true';

// CRITICAL: Fail hard in production if secret is not set
if (!INTERNAL_HMAC_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('INTERNAL_HMAC_SECRET must be set in production');
}

if (!INTERNAL_HMAC_SECRET) {
  log.warn('INTERNAL_HMAC_SECRET not set - internal routes will be disabled');
}

// Allowed services that can call internal endpoints
const ALLOWED_SERVICES = new Set(
  (process.env.ALLOWED_INTERNAL_SERVICES || 'api-gateway,payment-service,order-service,event-service,ticket-service,venue-service,notification-service,transfer-service,minting-service,blockchain-service,marketplace-service,scanning-service,compliance-service,analytics-service')
    .split(',')
    .map(s => s.trim().toLowerCase())
);

/**
 * Verify internal service authentication using HMAC-SHA256 signature
 *
 * Expected headers:
 * - x-internal-service: Service name
 * - x-internal-timestamp: Unix timestamp (ms)
 * - x-internal-nonce: Unique nonce for replay protection
 * - x-internal-signature: HMAC-SHA256 signature
 * - x-internal-body-hash: SHA256 hash of request body (for POST/PUT)
 */
async function verifyInternalService(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Skip validation if feature flag is disabled
  if (!USE_NEW_HMAC) {
    log.debug('HMAC validation disabled (USE_NEW_HMAC=false)');
    return;
  }

  const serviceName = request.headers['x-internal-service'] as string;
  const timestamp = request.headers['x-internal-timestamp'] as string;
  const nonce = request.headers['x-internal-nonce'] as string;
  const signature = request.headers['x-internal-signature'] as string;
  const bodyHash = request.headers['x-internal-body-hash'] as string;

  // Check required headers
  if (!serviceName || !timestamp || !signature) {
    log.warn({
      path: request.url,
      hasService: !!serviceName,
      hasTimestamp: !!timestamp,
      hasSignature: !!signature,
    }, 'Internal request missing required headers');
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing required authentication headers',
    });
  }

  // Validate timestamp (60-second window per Audit #16)
  const requestTime = parseInt(timestamp);
  const now = Date.now();
  const timeDiff = Math.abs(now - requestTime);

  if (isNaN(requestTime) || timeDiff > 60000) {
    log.warn({
      timeDiff: timeDiff / 1000,
      service: serviceName,
      path: request.url,
    }, 'Internal request with expired timestamp');
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Request timestamp expired or invalid',
    });
  }

  // Validate service name
  const normalizedService = serviceName.toLowerCase();
  if (!ALLOWED_SERVICES.has(normalizedService)) {
    log.warn({
      serviceName,
      path: request.url,
    }, 'Unknown service attempted internal access');
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'Service not authorized',
    });
  }

  // Verify HMAC signature
  if (!INTERNAL_HMAC_SECRET) {
    log.error('INTERNAL_HMAC_SECRET not configured');
    return reply.status(500).send({
      error: 'Internal server error',
      message: 'Service authentication not configured',
    });
  }

  // Build signature payload
  // Format: serviceName:timestamp:nonce:method:path[:bodyHash]
  let signaturePayload = `${serviceName}:${timestamp}:${nonce || ''}:${request.method}:${request.url}`;
  if (bodyHash) {
    signaturePayload += `:${bodyHash}`;
  }

  const expectedSignature = crypto
    .createHmac('sha256', INTERNAL_HMAC_SECRET)
    .update(signaturePayload)
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  try {
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (signatureBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      log.warn({
        service: serviceName,
        path: request.url,
      }, 'Invalid internal service signature');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid signature',
      });
    }
  } catch (error) {
    log.warn({
      service: serviceName,
      path: request.url,
      error: (error as Error).message,
    }, 'Signature verification error');
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid signature format',
    });
  }

  // Verify body hash if present (for POST/PUT requests)
  if (request.body && bodyHash) {
    const actualBodyHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(request.body))
      .digest('hex');

    if (actualBodyHash !== bodyHash) {
      log.warn({
        service: serviceName,
        path: request.url,
      }, 'Body hash mismatch');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Body hash mismatch',
      });
    }
  }

  log.debug({
    serviceName,
    path: request.url,
    method: request.method,
  }, 'Internal service authenticated');
}

export async function internalRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply internal authentication to all routes
  fastify.addHook('preHandler', verifyInternalService);

  /**
   * GET /internal/users/:userId/files
   * Get all files for a user (GDPR data export)
   * Used by: compliance-service (for GDPR requests)
   */
  fastify.get<{
    Params: { userId: string };
    Querystring: { limit?: number; offset?: number; includeDeleted?: boolean };
  }>('/users/:userId/files', async (request, reply) => {
    const { userId } = request.params;
    const { limit = 100, offset = 0, includeDeleted = false } = request.query;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    if (!userId) {
      return reply.status(400).send({ error: 'User ID required' });
    }

    try {
      // Build query based on includeDeleted flag (for GDPR compliance)
      let query = db('files')
        .where('user_id', userId)
        .select(
          'id',
          'user_id',
          'tenant_id',
          'file_name',
          'original_name',
          'mime_type',
          'size_bytes',
          'storage_key',
          'storage_provider',
          'status',
          'metadata',
          'created_at',
          'updated_at',
          'deleted_at'
        )
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset);

      if (!includeDeleted) {
        query = query.whereNull('deleted_at');
      }

      const files = await query;

      // Get total count
      let countQuery = db('files')
        .where('user_id', userId)
        .count('* as total')
        .first();

      if (!includeDeleted) {
        countQuery = countQuery.whereNull('deleted_at');
      }

      const countResult = await countQuery;
      const total = parseInt((countResult as any)?.total || '0');

      log.info({
        userId,
        fileCount: files.length,
        total,
        callingService,
        traceId,
      }, 'Internal user files lookup (GDPR)');

      return reply.send({
        userId,
        files: files.map(f => ({
          id: f.id,
          tenantId: f.tenant_id,
          fileName: f.file_name,
          originalName: f.original_name,
          mimeType: f.mime_type,
          sizeBytes: f.size_bytes,
          storageKey: f.storage_key,
          storageProvider: f.storage_provider,
          status: f.status,
          metadata: f.metadata,
          createdAt: f.created_at,
          updatedAt: f.updated_at,
          deletedAt: f.deleted_at,
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + files.length < total,
        },
      });
    } catch (error: any) {
      log.error({ error: error.message, userId, traceId }, 'Failed to get user files');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /internal/files/:fileId
   * Get file metadata by ID
   * Used by: ticket-service, notification-service
   */
  fastify.get<{ Params: { fileId: string } }>('/files/:fileId', async (request, reply) => {
    const { fileId } = request.params;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    if (!fileId) {
      return reply.status(400).send({ error: 'File ID required' });
    }

    try {
      const file = await db('files')
        .where('id', fileId)
        .whereNull('deleted_at')
        .select(
          'id',
          'user_id',
          'tenant_id',
          'file_name',
          'original_name',
          'mime_type',
          'size_bytes',
          'storage_key',
          'storage_provider',
          'status',
          'metadata',
          'created_at',
          'updated_at'
        )
        .first();

      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }

      log.info({
        fileId,
        fileName: file.file_name,
        callingService,
        traceId,
      }, 'Internal file lookup');

      return reply.send({
        file: {
          id: file.id,
          userId: file.user_id,
          tenantId: file.tenant_id,
          fileName: file.file_name,
          originalName: file.original_name,
          mimeType: file.mime_type,
          sizeBytes: file.size_bytes,
          storageKey: file.storage_key,
          storageProvider: file.storage_provider,
          status: file.status,
          metadata: file.metadata,
          createdAt: file.created_at,
          updatedAt: file.updated_at,
        },
      });
    } catch (error: any) {
      log.error({ error: error.message, fileId, traceId }, 'Failed to get file');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}

export default internalRoutes;

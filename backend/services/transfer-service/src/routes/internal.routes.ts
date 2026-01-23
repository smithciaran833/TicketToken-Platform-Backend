/**
 * Internal Routes - transfer-service
 *
 * For service-to-service communication only.
 * These endpoints provide transfer and ownership data to other services
 * (scanning-service, marketplace-service, compliance-service, etc.)
 *
 * Phase A HMAC Standardization - Decision #2 Implementation
 *
 * Endpoints:
 * - GET /internal/transfers/:transferId - Get transfer details
 * - GET /internal/ownership/:ticketId - Get current ticket ownership
 * - GET /internal/users/:userId/transfers - Get user's transfers (GDPR)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'crypto';
import logger from '../utils/logger';
import { query } from '../config/database';

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
  (process.env.ALLOWED_INTERNAL_SERVICES || 'api-gateway,payment-service,order-service,event-service,ticket-service,venue-service,notification-service,marketplace-service,minting-service,blockchain-service,scanning-service,compliance-service,analytics-service')
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
   * GET /internal/transfers/:transferId
   * Get transfer details by ID
   * Used by: marketplace-service, compliance-service
   */
  fastify.get<{ Params: { transferId: string } }>('/transfers/:transferId', async (request, reply) => {
    const { transferId } = request.params;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    if (!transferId) {
      return reply.status(400).send({ error: 'Transfer ID required' });
    }

    try {
      const result = await query(
        `SELECT
          id, tenant_id, ticket_id, from_user_id, to_user_id,
          transfer_type, status, price, currency,
          blockchain_tx_hash, blockchain_status,
          initiated_at, completed_at, cancelled_at,
          cancellation_reason, metadata,
          created_at, updated_at
        FROM transfers
        WHERE id = $1
        AND deleted_at IS NULL`,
        [transferId]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Transfer not found' });
      }

      const transfer = result.rows[0];

      log.info({
        transferId,
        status: transfer.status,
        callingService,
        traceId,
      }, 'Internal transfer lookup');

      return reply.send({
        transfer: {
          id: transfer.id,
          tenantId: transfer.tenant_id,
          ticketId: transfer.ticket_id,
          fromUserId: transfer.from_user_id,
          toUserId: transfer.to_user_id,
          transferType: transfer.transfer_type,
          status: transfer.status,
          price: transfer.price,
          currency: transfer.currency,
          blockchain: {
            txHash: transfer.blockchain_tx_hash,
            status: transfer.blockchain_status,
          },
          initiatedAt: transfer.initiated_at,
          completedAt: transfer.completed_at,
          cancelledAt: transfer.cancelled_at,
          cancellationReason: transfer.cancellation_reason,
          metadata: transfer.metadata,
          createdAt: transfer.created_at,
          updatedAt: transfer.updated_at,
        },
      });
    } catch (error: any) {
      log.error({ error: error.message, transferId, traceId }, 'Failed to get transfer');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /internal/ownership/:ticketId
   * Get current ownership information for a ticket
   * Used by: scanning-service (for validation), marketplace-service
   */
  fastify.get<{ Params: { ticketId: string } }>('/ownership/:ticketId', async (request, reply) => {
    const { ticketId } = request.params;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    if (!ticketId) {
      return reply.status(400).send({ error: 'Ticket ID required' });
    }

    try {
      // Get the most recent completed transfer for this ticket
      const transferResult = await query(
        `SELECT
          id, ticket_id, from_user_id, to_user_id,
          transfer_type, status, completed_at,
          blockchain_tx_hash
        FROM transfers
        WHERE ticket_id = $1
        AND status = 'COMPLETED'
        AND deleted_at IS NULL
        ORDER BY completed_at DESC
        LIMIT 1`,
        [ticketId]
      );

      // Get total transfer count
      const countResult = await query(
        `SELECT COUNT(*) as transfer_count
        FROM transfers
        WHERE ticket_id = $1
        AND status = 'COMPLETED'
        AND deleted_at IS NULL`,
        [ticketId]
      );

      const lastTransfer = transferResult.rows[0];
      const transferCount = parseInt(countResult.rows[0]?.transfer_count || '0');

      log.info({
        ticketId,
        hasTransfers: !!lastTransfer,
        transferCount,
        callingService,
        traceId,
      }, 'Internal ownership lookup');

      return reply.send({
        ticketId,
        ownership: {
          currentOwnerId: lastTransfer?.to_user_id || null,
          previousOwnerId: lastTransfer?.from_user_id || null,
          lastTransferAt: lastTransfer?.completed_at || null,
          lastTransferId: lastTransfer?.id || null,
          lastTransferType: lastTransfer?.transfer_type || null,
          totalTransfers: transferCount,
          isOriginalOwner: transferCount === 0,
          blockchainTxHash: lastTransfer?.blockchain_tx_hash || null,
        },
      });
    } catch (error: any) {
      log.error({ error: error.message, ticketId, traceId }, 'Failed to get ownership');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /internal/users/:userId/transfers
   * Get all transfers for a user (GDPR data export)
   * Used by: compliance-service (for GDPR requests)
   */
  fastify.get<{
    Params: { userId: string };
    Querystring: { limit?: number; offset?: number; includeDeleted?: boolean };
  }>('/users/:userId/transfers', async (request, reply) => {
    const { userId } = request.params;
    const { limit = 100, offset = 0, includeDeleted = false } = request.query;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    if (!userId) {
      return reply.status(400).send({ error: 'User ID required' });
    }

    try {
      // Build query based on includeDeleted flag (for GDPR compliance)
      const deletedFilter = includeDeleted ? '' : 'AND deleted_at IS NULL';

      // Get transfers where user is sender or receiver
      const result = await query(
        `SELECT
          id, tenant_id, ticket_id, from_user_id, to_user_id,
          transfer_type, status, price, currency,
          blockchain_tx_hash, blockchain_status,
          initiated_at, completed_at, cancelled_at,
          cancellation_reason, metadata,
          created_at, updated_at, deleted_at
        FROM transfers
        WHERE (from_user_id = $1 OR to_user_id = $1)
        ${deletedFilter}
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      // Get total count
      const countResult = await query(
        `SELECT COUNT(*) as total
        FROM transfers
        WHERE (from_user_id = $1 OR to_user_id = $1)
        ${deletedFilter}`,
        [userId]
      );

      const total = parseInt(countResult.rows[0]?.total || '0');

      log.info({
        userId,
        transferCount: result.rows.length,
        total,
        callingService,
        traceId,
      }, 'Internal user transfers lookup (GDPR)');

      return reply.send({
        userId,
        transfers: result.rows.map(t => ({
          id: t.id,
          tenantId: t.tenant_id,
          ticketId: t.ticket_id,
          fromUserId: t.from_user_id,
          toUserId: t.to_user_id,
          direction: t.from_user_id === userId ? 'outgoing' : 'incoming',
          transferType: t.transfer_type,
          status: t.status,
          price: t.price,
          currency: t.currency,
          blockchain: {
            txHash: t.blockchain_tx_hash,
            status: t.blockchain_status,
          },
          initiatedAt: t.initiated_at,
          completedAt: t.completed_at,
          cancelledAt: t.cancelled_at,
          cancellationReason: t.cancellation_reason,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
          deletedAt: t.deleted_at,
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + result.rows.length < total,
        },
      });
    } catch (error: any) {
      log.error({ error: error.message, userId, traceId }, 'Failed to get user transfers');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}

export default internalRoutes;

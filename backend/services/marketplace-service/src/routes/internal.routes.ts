/**
 * Internal Routes - marketplace-service
 *
 * For service-to-service communication only.
 * These endpoints handle internal events from other services
 * (payment-service, order-service, etc.)
 *
 * Phase A HMAC Standardization - Decision #2 Implementation
 *
 * Endpoints:
 * - POST /internal/events - Handle events from payment-service
 * - GET /internal/listings/:id - Get listing details for internal services
 * - GET /internal/escrow/:transferId - Get escrow status
 * - POST /internal/escrow/release - Release escrow funds
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'crypto';
import { logger } from '../utils/logger';
import knex from '../config/database';

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
  (process.env.ALLOWED_INTERNAL_SERVICES || 'api-gateway,payment-service,order-service,event-service,ticket-service,venue-service,notification-service,transfer-service,minting-service,blockchain-service,scanning-service,compliance-service,analytics-service')
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
    log.warn('Internal request missing required headers', {
      path: request.url,
      hasService: !!serviceName,
      hasTimestamp: !!timestamp,
      hasSignature: !!signature,
    });
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
    log.warn('Internal request with expired timestamp', {
      timeDiff: timeDiff / 1000,
      service: serviceName,
      path: request.url,
    });
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Request timestamp expired or invalid',
    });
  }

  // Validate service name
  const normalizedService = serviceName.toLowerCase();
  if (!ALLOWED_SERVICES.has(normalizedService)) {
    log.warn('Unknown service attempted internal access', {
      serviceName,
      path: request.url,
    });
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
      log.warn('Invalid internal service signature', {
        service: serviceName,
        path: request.url,
      });
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid signature',
      });
    }
  } catch (error) {
    log.warn('Signature verification error', {
      service: serviceName,
      path: request.url,
      error: (error as Error).message,
    });
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
      log.warn('Body hash mismatch', {
        service: serviceName,
        path: request.url,
      });
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Body hash mismatch',
      });
    }
  }

  log.debug('Internal service authenticated', {
    serviceName,
    path: request.url,
    method: request.method,
  });
}

/**
 * Event type handlers for internal events from payment-service
 */
interface InternalEvent {
  event: string;
  data: any;
}

async function handleOrderCompleted(data: any, traceId?: string): Promise<{ success: boolean; message: string }> {
  log.info('Processing order.completed event', { traceId, paymentIntentId: data?.id });

  try {
    // Update listing status to SOLD
    if (data?.metadata?.listingId) {
      await knex('listings')
        .where('id', data.metadata.listingId)
        .update({
          status: 'SOLD',
          sold_at: new Date(),
          updated_at: new Date(),
        });

      log.info('Listing marked as sold', { listingId: data.metadata.listingId, traceId });
    }

    return { success: true, message: 'Order completed processed' };
  } catch (error: any) {
    log.error('Failed to process order.completed', { error: error.message, traceId });
    throw error;
  }
}

async function handlePaymentFailed(data: any, traceId?: string): Promise<{ success: boolean; message: string }> {
  log.info('Processing payment.failed event', { traceId, paymentIntentId: data?.id });

  try {
    // Revert listing status if it was reserved
    if (data?.metadata?.listingId) {
      await knex('listings')
        .where('id', data.metadata.listingId)
        .where('status', 'RESERVED')
        .update({
          status: 'ACTIVE',
          updated_at: new Date(),
        });

      log.info('Listing reverted to active', { listingId: data.metadata.listingId, traceId });
    }

    return { success: true, message: 'Payment failed processed' };
  } catch (error: any) {
    log.error('Failed to process payment.failed', { error: error.message, traceId });
    throw error;
  }
}

async function handleRefundProcessed(data: any, traceId?: string): Promise<{ success: boolean; message: string }> {
  log.info('Processing refund.processed event', { traceId, refundId: data?.id });

  try {
    // Update listing/transfer status for refund
    if (data?.metadata?.listingId) {
      await knex('listings')
        .where('id', data.metadata.listingId)
        .update({
          status: 'REFUNDED',
          refunded_at: new Date(),
          updated_at: new Date(),
        });

      log.info('Listing marked as refunded', { listingId: data.metadata.listingId, traceId });
    }

    return { success: true, message: 'Refund processed' };
  } catch (error: any) {
    log.error('Failed to process refund.processed', { error: error.message, traceId });
    throw error;
  }
}

export default async function internalRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply internal authentication to all routes
  fastify.addHook('preHandler', verifyInternalService);

  /**
   * POST /internal/events
   * Handle internal events from payment-service and other services
   *
   * Events:
   * - order.completed: Payment succeeded, update listing status
   * - payment.failed: Payment failed, revert reservation
   * - refund.processed: Refund completed, update status
   */
  fastify.post<{ Body: InternalEvent }>('/events', {
    schema: {
      body: {
        type: 'object',
        required: ['event', 'data'],
        properties: {
          event: { type: 'string' },
          data: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const { event, data } = request.body;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    log.info('Received internal event', {
      event,
      callingService,
      traceId,
    });

    try {
      let result;

      switch (event) {
        case 'order.completed':
          result = await handleOrderCompleted(data, traceId);
          break;

        case 'payment.failed':
          result = await handlePaymentFailed(data, traceId);
          break;

        case 'refund.processed':
          result = await handleRefundProcessed(data, traceId);
          break;

        default:
          log.warn('Unknown event type received', { event, traceId });
          return reply.status(400).send({
            error: 'Bad Request',
            message: `Unknown event type: ${event}`,
          });
      }

      return reply.send(result);
    } catch (error: any) {
      log.error('Failed to process internal event', {
        error: error.message,
        event,
        traceId,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to process event',
      });
    }
  });

  /**
   * GET /internal/listings/:listingId
   * Get listing details for internal services
   * Used by: payment-service, order-service
   */
  fastify.get<{ Params: { listingId: string } }>('/listings/:listingId', async (request, reply) => {
    const { listingId } = request.params;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    if (!listingId) {
      return reply.status(400).send({ error: 'Listing ID required' });
    }

    try {
      const listing = await knex('listings')
        .where('id', listingId)
        .whereNull('deleted_at')
        .first();

      if (!listing) {
        return reply.status(404).send({ error: 'Listing not found' });
      }

      log.info('Internal listing lookup', {
        listingId,
        status: listing.status,
        callingService,
        traceId,
      });

      return reply.send({
        listing: {
          id: listing.id,
          tenantId: listing.tenant_id,
          ticketId: listing.ticket_id,
          eventId: listing.event_id,
          sellerId: listing.seller_id,
          status: listing.status,
          price: listing.price,
          currency: listing.currency,
          listedAt: listing.listed_at,
          soldAt: listing.sold_at,
          buyerId: listing.buyer_id,
          escrowStatus: listing.escrow_status,
          createdAt: listing.created_at,
          updatedAt: listing.updated_at,
        },
      });
    } catch (error: any) {
      log.error('Failed to get listing', { error: error.message, listingId, traceId });
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /internal/escrow/:transferId
   * Get escrow status for a transfer
   * Used by: transfer-service, payment-service
   */
  fastify.get<{ Params: { transferId: string } }>('/escrow/:transferId', async (request, reply) => {
    const { transferId } = request.params;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    if (!transferId) {
      return reply.status(400).send({ error: 'Transfer ID required' });
    }

    try {
      // Look up escrow by transfer ID
      const escrow = await knex('escrow_transactions')
        .where('transfer_id', transferId)
        .first();

      if (!escrow) {
        return reply.status(404).send({ error: 'Escrow not found' });
      }

      log.info('Internal escrow lookup', {
        transferId,
        escrowId: escrow.id,
        status: escrow.status,
        callingService,
        traceId,
      });

      return reply.send({
        escrow: {
          id: escrow.id,
          transferId: escrow.transfer_id,
          listingId: escrow.listing_id,
          sellerId: escrow.seller_id,
          buyerId: escrow.buyer_id,
          amount: escrow.amount,
          currency: escrow.currency,
          status: escrow.status,
          platformFee: escrow.platform_fee,
          sellerPayout: escrow.seller_payout,
          releasedAt: escrow.released_at,
          createdAt: escrow.created_at,
          updatedAt: escrow.updated_at,
        },
      });
    } catch (error: any) {
      log.error('Failed to get escrow', { error: error.message, transferId, traceId });
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /internal/escrow/release
   * Release escrow funds to seller
   * Used by: transfer-service (after successful transfer)
   */
  fastify.post<{
    Body: {
      escrowId: string;
      transferId: string;
      releaseReason: string;
    };
  }>('/escrow/release', {
    schema: {
      body: {
        type: 'object',
        required: ['escrowId', 'transferId'],
        properties: {
          escrowId: { type: 'string' },
          transferId: { type: 'string' },
          releaseReason: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { escrowId, transferId, releaseReason } = request.body;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    try {
      // Verify escrow exists and is in correct state
      const escrow = await knex('escrow_transactions')
        .where('id', escrowId)
        .where('transfer_id', transferId)
        .first();

      if (!escrow) {
        return reply.status(404).send({ error: 'Escrow not found' });
      }

      if (escrow.status === 'RELEASED') {
        log.warn('Escrow already released', {
          escrowId,
          transferId,
          traceId,
        });
        return reply.send({
          success: true,
          message: 'Escrow already released',
          escrow: { id: escrow.id, status: escrow.status },
        });
      }

      if (escrow.status !== 'HELD') {
        return reply.status(400).send({
          error: 'Bad Request',
          message: `Cannot release escrow in status: ${escrow.status}`,
        });
      }

      // Release escrow
      await knex('escrow_transactions')
        .where('id', escrowId)
        .update({
          status: 'RELEASED',
          released_at: new Date(),
          release_reason: releaseReason || 'transfer_completed',
          updated_at: new Date(),
        });

      log.info('Escrow released', {
        escrowId,
        transferId,
        sellerId: escrow.seller_id,
        amount: escrow.seller_payout,
        callingService,
        traceId,
      });

      return reply.send({
        success: true,
        message: 'Escrow released successfully',
        escrow: {
          id: escrowId,
          status: 'RELEASED',
          releasedAt: new Date(),
          sellerPayout: escrow.seller_payout,
        },
      });
    } catch (error: any) {
      log.error('Failed to release escrow', {
        error: error.message,
        escrowId,
        transferId,
        traceId,
      });

      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}

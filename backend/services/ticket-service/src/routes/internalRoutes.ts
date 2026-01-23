/**
 * Internal Routes - ticket-service
 *
 * For service-to-service communication only.
 * These endpoints provide ticket data to other services
 * (scanning-service, payment-service, transfer-service, etc.)
 *
 * Phase A HMAC Standardization - Decision #2 Implementation
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TicketService } from '../services/ticketService';
import { TransferService } from '../services/transferService';
import { DatabaseService } from '../services/databaseService';
import { RedisService } from '../services/redisService';
import { setTenantContext } from '../utils/tenant-db';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';

const log = logger.child({ component: 'InternalRoutes' });
const ticketService = new TicketService();
const transferService = new TransferService();

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
  (process.env.ALLOWED_INTERNAL_SERVICES || 'api-gateway,payment-service,order-service,event-service,venue-service,notification-service,transfer-service,minting-service,blockchain-service,marketplace-service,scanning-service,compliance-service,analytics-service,file-service,blockchain-indexer')
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

export default async function internalRoutes(fastify: FastifyInstance) {
  fastify.get('/internal/tickets/:ticketId/status', {
    preHandler: [verifyInternalService]
  }, async (request, reply) => {
    try {
      const { ticketId } = request.params as any;

      if (!ticketId) {
        return reply.status(400).send({ error: 'Ticket ID required' });
      }

      const ticket = await ticketService.getTicket(ticketId);

      if (!ticket) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      const hasBeenTransferred = ticket.status === 'TRANSFERRED' ||
                                (ticket.transfer_history && ticket.transfer_history.length > 0);
      const nftMinted = !!ticket.nft_token_id || !!ticket.nft_transaction_hash || !!ticket.nft_minted_at;
      const nftTransferred = nftMinted && hasBeenTransferred;

      const response = {
        ticketId: ticket.id,
        status: ticket.status,
        userId: ticket.user_id,  // FIXED: single user_id only
        hasBeenTransferred,
        nftMinted,
        nftTransferred,
        isUsed: ticket.status === 'USED' || !!ticket.validated_at || !!ticket.used_at,
        validatedAt: ticket.validated_at,
        canRefund: !hasBeenTransferred &&
                   ticket.status !== 'USED' &&
                   ticket.status !== 'CANCELLED' &&
                   !ticket.validated_at &&
                   !nftTransferred
      };

      log.info('Ticket status check for refund', {
        ticketId,
        status: response.status,
        canRefund: response.canRefund,
        requestingService: request.headers['x-internal-service']
      });

      return reply.send(response);

    } catch (error) {
      log.error('Failed to check ticket status', { error, ticketId: (request.params as any).ticketId });
      return reply.status(500).send({ error: 'Failed to check ticket status' });
    }
  });

  fastify.post('/internal/tickets/cancel-batch', {
    preHandler: [verifyInternalService]
  }, async (request, reply) => {
    try {
      const { ticketIds, reason, refundId } = request.body as any;

      if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
        return reply.status(400).send({ error: 'Ticket IDs required' });
      }

      const results = [];

      for (const ticketId of ticketIds) {
        try {
          await DatabaseService.query(
            `UPDATE tickets
             SET status = 'CANCELLED',
                 updated_at = NOW(),
                 metadata = jsonb_set(
                   COALESCE(metadata, '{}'::jsonb),
                   '{refund}',
                   $1::jsonb
                 )
             WHERE id = $2 AND status NOT IN ('TRANSFERRED', 'USED')`,
            [
              JSON.stringify({
                refundId,
                reason,
                cancelledAt: new Date().toISOString()
              }),
              ticketId
            ]
          );

          results.push({ ticketId, status: 'cancelled' });
          await RedisService.del(`ticket:${ticketId}`);

        } catch (error) {
          log.error('Failed to cancel ticket', { ticketId, error });
          results.push({ ticketId, status: 'failed', error: (error as Error).message });
        }
      }

      log.info('Batch ticket cancellation completed', {
        totalTickets: ticketIds.length,
        cancelled: results.filter(r => r.status === 'cancelled').length,
        failed: results.filter(r => r.status === 'failed').length,
        refundId,
        requestingService: request.headers['x-internal-service']
      });

      return reply.send({
        success: true,
        results
      });

    } catch (error) {
      log.error('Failed to cancel tickets', { error });
      return reply.status(500).send({ error: 'Failed to cancel tickets' });
    }
  });

  fastify.post('/internal/tickets/calculate-price', {
    preHandler: [verifyInternalService]
  }, async (request, reply) => {
    try {
      const { ticketIds } = request.body as any;

      if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
        return reply.status(400).send({ error: 'Ticket IDs required' });
      }

      let totalCents = 0;
      const priceBreakdown = [];

      const query = `
        SELECT t.id, t.ticket_type_id, tt.price_cents, tt.name
        FROM tickets t
        JOIN ticket_types tt ON t.ticket_type_id = tt.id
        WHERE t.id = ANY($1)
      `;

      const result = await DatabaseService.query(query, [ticketIds]);

      if (result.rows.length !== ticketIds.length) {
        const foundIds = result.rows.map(r => r.id);
        const missingIds = ticketIds.filter(id => !foundIds.includes(id));

        return reply.status(404).send({
          error: 'Some tickets not found',
          missingIds
        });
      }

      for (const ticket of result.rows) {
        const priceCents = ticket.price_cents;
        totalCents += priceCents;

        priceBreakdown.push({
          ticketId: ticket.id,
          ticketType: ticket.name,
          priceCents
        });
      }

      log.info('Price calculation for internal request', {
        ticketCount: ticketIds.length,
        totalCents,
        requestingService: request.headers['x-internal-service']
      });

      return reply.send({
        totalCents,
        priceBreakdown,
        ticketCount: ticketIds.length
      });

    } catch (error) {
      log.error('Failed to calculate ticket prices', { error });
      return reply.status(500).send({ error: 'Failed to calculate prices' });
    }
  });

  // ============================================================================
  // PHASE 3 NEW ENDPOINTS - Internal APIs for service-to-service communication
  // ============================================================================

  /**
   * GET /internal/tickets/:ticketId/full
   * Get full ticket details with event data
   * Used by: scanning-service, venue-service, payment-service
   */
  fastify.get('/internal/tickets/:ticketId/full', {
    preHandler: [verifyInternalService]
  }, async (request, reply) => {
    const traceId = request.headers['x-trace-id'] as string;
    const tenantId = request.headers['x-tenant-id'] as string;
    
    try {
      const { ticketId } = request.params as { ticketId: string };

      if (!ticketId) {
        return reply.status(400).send({ error: 'Ticket ID required' });
      }

      // Set tenant context for RLS if provided
      if (tenantId) {
        await setTenantContext(tenantId);
      }

      // Query ticket with event data joined
      const query = `
        SELECT 
          t.id, t.tenant_id, t.event_id, t.ticket_type_id, t.user_id,
          t.status, t.qr_code, t.ticket_number, t.seat_number, t.seat_section, t.seat_row,
          t.price, t.price_cents, t.nft_token_id as token_id, t.nft_minted_at as is_minted,
          t.nft_transaction_hash as mint_transaction_id, t.validated_at, t.used_at,
          t.transfer_count, t.is_transferable, t.purchased_at, t.created_at, t.updated_at,
          e.id as event_id, e.name as event_name, e.venue_id, 
          e.starts_at as event_starts_at, e.ends_at as event_ends_at,
          e.status as event_status, e.timezone as event_timezone,
          tt.name as ticket_type_name, tt.description as ticket_type_description
        FROM tickets t
        LEFT JOIN events e ON t.event_id = e.id
        LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
        WHERE t.id = $1 AND t.deleted_at IS NULL
      `;

      const result = await DatabaseService.query(query, [ticketId]);

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      const row = result.rows[0];

      const response = {
        ticket: {
          id: row.id,
          tenantId: row.tenant_id,
          eventId: row.event_id,
          ticketTypeId: row.ticket_type_id,
          userId: row.user_id,
          status: row.status,
          qrCode: row.qr_code,
          ticketNumber: row.ticket_number,
          seatNumber: row.seat_number,
          seatSection: row.seat_section,
          seatRow: row.seat_row,
          priceCents: row.price_cents,
          tokenId: row.token_id,
          isMinted: !!row.is_minted,
          mintTransactionId: row.mint_transaction_id,
          validatedAt: row.validated_at,
          usedAt: row.used_at,
          transferCount: row.transfer_count,
          isTransferable: row.is_transferable,
          purchasedAt: row.purchased_at,
          ticketTypeName: row.ticket_type_name,
          ticketTypeDescription: row.ticket_type_description
        },
        event: row.event_name ? {
          id: row.event_id,
          name: row.event_name,
          venueId: row.venue_id,
          startsAt: row.event_starts_at,
          endsAt: row.event_ends_at,
          status: row.event_status,
          timezone: row.event_timezone
        } : null
      };

      log.info('Internal full ticket lookup', {
        ticketId,
        eventId: row.event_id,
        requestingService: request.headers['x-internal-service'],
        traceId
      });

      return reply.send(response);

    } catch (error) {
      log.error('Failed to get full ticket', { error, ticketId: (request.params as any).ticketId, traceId });
      return reply.status(500).send({ error: 'Failed to get ticket' });
    }
  });

  /**
   * GET /internal/tickets/by-event/:eventId
   * Get all tickets for an event (for scanning-service offline cache)
   * Used by: scanning-service
   */
  fastify.get('/internal/tickets/by-event/:eventId', {
    preHandler: [verifyInternalService]
  }, async (request, reply) => {
    const traceId = request.headers['x-trace-id'] as string;
    const tenantId = request.headers['x-tenant-id'] as string;
    
    try {
      const { eventId } = request.params as { eventId: string };
      const { status, limit, offset } = request.query as { status?: string; limit?: string; offset?: string };

      if (!eventId) {
        return reply.status(400).send({ error: 'Event ID required' });
      }

      // Set tenant context for RLS if provided
      if (tenantId) {
        await setTenantContext(tenantId);
      }

      // Build query with optional status filter
      let query = `
        SELECT 
          t.id, t.user_id, t.status, t.qr_code, t.ticket_number,
          t.seat_number, t.seat_section, t.seat_row,
          t.nft_token_id as token_id, t.validated_at, t.used_at,
          tt.name as ticket_type_name
        FROM tickets t
        LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
        WHERE t.event_id = $1 AND t.deleted_at IS NULL
      `;
      const params: any[] = [eventId];
      let paramIndex = 2;

      if (status) {
        query += ` AND t.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      query += ` ORDER BY t.created_at DESC`;

      // Apply pagination
      const limitNum = Math.min(parseInt(limit || '1000'), 5000); // Max 5000 tickets per request
      const offsetNum = parseInt(offset || '0');
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limitNum, offsetNum);

      const result = await DatabaseService.query(query, params);

      // Get total count
      let countQuery = `
        SELECT COUNT(*) as count FROM tickets t
        WHERE t.event_id = $1 AND t.deleted_at IS NULL
      `;
      const countParams: any[] = [eventId];
      if (status) {
        countQuery += ` AND t.status = $2`;
        countParams.push(status);
      }
      const countResult = await DatabaseService.query(countQuery, countParams);
      const totalCount = parseInt(countResult.rows[0]?.count || '0');

      const response = {
        eventId,
        tickets: result.rows.map(row => ({
          id: row.id,
          userId: row.user_id,
          status: row.status,
          qrCode: row.qr_code,
          ticketNumber: row.ticket_number,
          seatNumber: row.seat_number,
          seatSection: row.seat_section,
          seatRow: row.seat_row,
          tokenId: row.token_id,
          validatedAt: row.validated_at,
          usedAt: row.used_at,
          ticketTypeName: row.ticket_type_name
        })),
        count: result.rows.length,
        totalCount,
        hasMore: offsetNum + result.rows.length < totalCount
      };

      log.info('Internal event tickets lookup', {
        eventId,
        count: result.rows.length,
        totalCount,
        requestingService: request.headers['x-internal-service'],
        traceId
      });

      return reply.send(response);

    } catch (error) {
      log.error('Failed to get tickets by event', { error, eventId: (request.params as any).eventId, traceId });
      return reply.status(500).send({ error: 'Failed to get tickets' });
    }
  });

  /**
   * GET /internal/tickets/by-token/:tokenId
   * Get ticket by blockchain token ID
   * Used by: blockchain-indexer
   */
  fastify.get('/internal/tickets/by-token/:tokenId', {
    preHandler: [verifyInternalService]
  }, async (request, reply) => {
    const traceId = request.headers['x-trace-id'] as string;
    
    try {
      const { tokenId } = request.params as { tokenId: string };

      if (!tokenId) {
        return reply.status(400).send({ error: 'Token ID required' });
      }

      const query = `
        SELECT 
          t.id, t.tenant_id, t.event_id, t.user_id, t.status,
          t.nft_token_id as token_id, 
          t.nft_minted_at IS NOT NULL as is_minted,
          t.nft_transaction_hash as mint_transaction_id,
          t.nft_minted_at as minted_at,
          t.ticket_number
        FROM tickets t
        WHERE t.nft_token_id = $1 AND t.deleted_at IS NULL
      `;

      const result = await DatabaseService.query(query, [tokenId]);

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Ticket not found for token' });
      }

      const row = result.rows[0];

      const response = {
        ticket: {
          id: row.id,
          tenantId: row.tenant_id,
          eventId: row.event_id,
          userId: row.user_id,
          status: row.status,
          tokenId: row.token_id,
          isMinted: row.is_minted,
          mintTransactionId: row.mint_transaction_id,
          mintedAt: row.minted_at,
          ticketNumber: row.ticket_number
        }
      };

      log.info('Internal token lookup', {
        tokenId,
        ticketId: row.id,
        requestingService: request.headers['x-internal-service'],
        traceId
      });

      return reply.send(response);

    } catch (error) {
      log.error('Failed to get ticket by token', { error, tokenId: (request.params as any).tokenId, traceId });
      return reply.status(500).send({ error: 'Failed to get ticket' });
    }
  });

  /**
   * POST /internal/tickets/:ticketId/transfer
   * Transfer a ticket to another user
   * Used by: transfer-service
   */
  fastify.post('/internal/tickets/:ticketId/transfer', {
    preHandler: [verifyInternalService]
  }, async (request, reply) => {
    const traceId = request.headers['x-trace-id'] as string;
    const tenantId = request.headers['x-tenant-id'] as string;
    
    try {
      const { ticketId } = request.params as { ticketId: string };
      const { toUserId, reason } = request.body as { toUserId: string; reason?: string };

      if (!ticketId) {
        return reply.status(400).send({ error: 'Ticket ID required' });
      }

      if (!toUserId) {
        return reply.status(400).send({ error: 'toUserId required' });
      }

      // Set tenant context for RLS if provided
      if (tenantId) {
        await setTenantContext(tenantId);
      }

      // First, get the current ticket to find the current owner
      const ticket = await ticketService.getTicket(ticketId);
      
      if (!ticket) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      const fromUserId = ticket.user_id;

      // Use the existing transfer service method
      const transfer = await transferService.transferTicket(
        ticketId,
        fromUserId,
        toUserId,
        reason
      );

      // Get updated ticket data
      const updatedTicket = await ticketService.getTicket(ticketId);

      const response = {
        success: true,
        ticket: {
          id: updatedTicket.id,
          userId: updatedTicket.user_id,
          status: updatedTicket.status,
          transferCount: updatedTicket.transfer_count
        },
        transfer: {
          id: transfer.id,
          ticketId: transfer.ticketId,
          fromUserId: transfer.fromUserId,
          toUserId: transfer.toUserId,
          status: transfer.status,
          transferredAt: transfer.transferredAt,
          reason: transfer.reason
        }
      };

      log.info('Internal ticket transfer', {
        ticketId,
        fromUserId,
        toUserId,
        transferId: transfer.id,
        requestingService: request.headers['x-internal-service'],
        traceId
      });

      return reply.send(response);

    } catch (error: any) {
      log.error('Failed to transfer ticket', { 
        error: error.message, 
        ticketId: (request.params as any).ticketId,
        traceId 
      });
      
      // Return appropriate error status based on error type
      if (error.name === 'NotFoundError') {
        return reply.status(404).send({ error: error.message });
      }
      if (error.name === 'ValidationError') {
        return reply.status(400).send({ error: error.message });
      }
      if (error.name === 'ForbiddenError') {
        return reply.status(403).send({ error: error.message });
      }
      
      return reply.status(500).send({ error: 'Failed to transfer ticket' });
    }
  });

  // ============================================================================
  // PHASE 5a NEW ENDPOINTS - Additional internal APIs for bypass refactoring
  // ============================================================================

  /**
   * GET /internal/orders/:orderId/tickets/count
   * Get count of tickets for an order
   * Used by: payment-service (reconciliation)
   */
  fastify.get('/internal/orders/:orderId/tickets/count', {
    preHandler: [verifyInternalService]
  }, async (request, reply) => {
    const traceId = request.headers['x-trace-id'] as string;
    const tenantId = request.headers['x-tenant-id'] as string;
    
    try {
      const { orderId } = request.params as { orderId: string };

      if (!orderId) {
        return reply.status(400).send({ error: 'Order ID required' });
      }

      // Set tenant context for RLS if provided
      if (tenantId) {
        await setTenantContext(tenantId);
      }

      const countQuery = `
        SELECT COUNT(*) as count
        FROM tickets
        WHERE order_id = $1 AND deleted_at IS NULL
      `;

      const result = await DatabaseService.query(countQuery, [orderId]);
      const count = parseInt(result.rows[0]?.count || '0');

      log.info('Internal order ticket count', {
        orderId,
        count,
        requestingService: request.headers['x-internal-service'],
        traceId
      });

      return reply.send({
        orderId,
        count,
        hasTickets: count > 0
      });

    } catch (error) {
      log.error('Failed to get ticket count for order', { 
        error, 
        orderId: (request.params as any).orderId,
        traceId 
      });
      return reply.status(500).send({ error: 'Failed to get ticket count' });
    }
  });

  /**
   * POST /internal/tickets/:ticketId/record-scan
   * Record a scan event on a ticket (increment scan count, update last_scanned_at)
   * Used by: scanning-service
   */
  fastify.post('/internal/tickets/:ticketId/record-scan', {
    preHandler: [verifyInternalService]
  }, async (request, reply) => {
    const traceId = request.headers['x-trace-id'] as string;
    const tenantId = request.headers['x-tenant-id'] as string;
    
    try {
      const { ticketId } = request.params as { ticketId: string };
      const { deviceId, venueId, scanType } = request.body as { 
        deviceId?: string; 
        venueId?: string;
        scanType?: string;
      };

      if (!ticketId) {
        return reply.status(400).send({ error: 'Ticket ID required' });
      }

      // Set tenant context for RLS if provided
      if (tenantId) {
        await setTenantContext(tenantId);
      }

      // Update ticket scan count and last_scanned_at
      const updateQuery = `
        UPDATE tickets 
        SET 
          scan_count = COALESCE(scan_count, 0) + 1, 
          last_scanned_at = NOW(),
          updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, scan_count, last_scanned_at, status
      `;

      const result = await DatabaseService.query(updateQuery, [ticketId]);

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      const ticket = result.rows[0];

      // Invalidate cache
      await RedisService.del(`ticket:${ticketId}`);

      log.info('Ticket scan recorded', {
        ticketId,
        scanCount: ticket.scan_count,
        deviceId,
        venueId,
        scanType,
        requestingService: request.headers['x-internal-service'],
        traceId
      });

      return reply.send({
        success: true,
        ticket: {
          id: ticket.id,
          scanCount: ticket.scan_count,
          lastScannedAt: ticket.last_scanned_at,
          status: ticket.status
        }
      });

    } catch (error) {
      log.error('Failed to record scan', { 
        error, 
        ticketId: (request.params as any).ticketId,
        traceId 
      });
      return reply.status(500).send({ error: 'Failed to record scan' });
    }
  });

  /**
   * POST /internal/tickets/:ticketId/update-nft
   * Update NFT-related fields on a ticket
   * Used by: blockchain-indexer, transfer-service
   */
  fastify.post('/internal/tickets/:ticketId/update-nft', {
    preHandler: [verifyInternalService]
  }, async (request, reply) => {
    const traceId = request.headers['x-trace-id'] as string;
    const tenantId = request.headers['x-tenant-id'] as string;
    
    try {
      const { ticketId } = request.params as { ticketId: string };
      const { 
        nftMintAddress, 
        nftTransferSignature,
        walletAddress,
        metadataUri,
        isMinted,
        mintedAt
      } = request.body as { 
        nftMintAddress?: string;
        nftTransferSignature?: string;
        walletAddress?: string;
        metadataUri?: string;
        isMinted?: boolean;
        mintedAt?: string;
      };

      if (!ticketId) {
        return reply.status(400).send({ error: 'Ticket ID required' });
      }

      // Set tenant context for RLS if provided
      if (tenantId) {
        await setTenantContext(tenantId);
      }

      // Build dynamic update query based on provided fields
      const updates: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (nftMintAddress !== undefined) {
        updates.push(`nft_token_id = $${paramIndex}`);
        params.push(nftMintAddress);
        paramIndex++;
      }
      if (nftTransferSignature !== undefined) {
        updates.push(`nft_last_transfer_signature = $${paramIndex}`);
        params.push(nftTransferSignature);
        paramIndex++;
      }
      if (walletAddress !== undefined) {
        updates.push(`wallet_address = $${paramIndex}`);
        params.push(walletAddress);
        paramIndex++;
      }
      if (metadataUri !== undefined) {
        updates.push(`nft_metadata_uri = $${paramIndex}`);
        params.push(metadataUri);
        paramIndex++;
      }
      if (isMinted !== undefined) {
        updates.push(`nft_minted_at = $${paramIndex}`);
        params.push(isMinted ? (mintedAt || new Date().toISOString()) : null);
        paramIndex++;
      }

      if (updates.length === 0) {
        return reply.status(400).send({ error: 'No NFT fields provided to update' });
      }

      updates.push('updated_at = NOW()');
      params.push(ticketId);

      const updateQuery = `
        UPDATE tickets 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex} AND deleted_at IS NULL
        RETURNING id, nft_token_id, nft_minted_at, wallet_address, nft_metadata_uri, nft_last_transfer_signature
      `;

      const result = await DatabaseService.query(updateQuery, params);

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      const ticket = result.rows[0];

      // Invalidate cache
      await RedisService.del(`ticket:${ticketId}`);

      log.info('Ticket NFT info updated', {
        ticketId,
        nftMintAddress,
        isMinted: !!ticket.nft_minted_at,
        requestingService: request.headers['x-internal-service'],
        traceId
      });

      return reply.send({
        success: true,
        ticket: {
          id: ticket.id,
          nftMintAddress: ticket.nft_token_id,
          mintedAt: ticket.nft_minted_at,
          walletAddress: ticket.wallet_address,
          metadataUri: ticket.nft_metadata_uri,
          lastTransferSignature: ticket.nft_last_transfer_signature
        }
      });

    } catch (error) {
      log.error('Failed to update ticket NFT info', { 
        error, 
        ticketId: (request.params as any).ticketId,
        traceId 
      });
      return reply.status(500).send({ error: 'Failed to update NFT info' });
    }
  });

  /**
   * POST /internal/tickets/batch-by-token
   * Get multiple tickets by their blockchain token IDs
   * Used by: blockchain-indexer (for batch reconciliation)
   */
  fastify.post('/internal/tickets/batch-by-token', {
    preHandler: [verifyInternalService]
  }, async (request, reply) => {
    const traceId = request.headers['x-trace-id'] as string;
    
    try {
      const { tokenIds } = request.body as { tokenIds: string[] };

      if (!tokenIds || !Array.isArray(tokenIds) || tokenIds.length === 0) {
        return reply.status(400).send({ error: 'Token IDs array required' });
      }

      if (tokenIds.length > 100) {
        return reply.status(400).send({ error: 'Maximum 100 token IDs per request' });
      }

      const query = `
        SELECT 
          t.id, t.tenant_id, t.event_id, t.user_id, t.status,
          t.nft_token_id as token_id, 
          t.nft_minted_at IS NOT NULL as is_minted,
          t.nft_transaction_hash as mint_transaction_id,
          t.wallet_address,
          t.ticket_number,
          t.transfer_count
        FROM tickets t
        WHERE t.nft_token_id = ANY($1) AND t.deleted_at IS NULL
      `;

      const result = await DatabaseService.query(query, [tokenIds]);

      // Create a map of tokenId -> ticket for easy lookup
      const ticketMap: Record<string, any> = {};
      for (const row of result.rows) {
        ticketMap[row.token_id] = {
          id: row.id,
          tenantId: row.tenant_id,
          eventId: row.event_id,
          userId: row.user_id,
          status: row.status,
          tokenId: row.token_id,
          isMinted: row.is_minted,
          mintTransactionId: row.mint_transaction_id,
          walletAddress: row.wallet_address,
          ticketNumber: row.ticket_number,
          transferCount: row.transfer_count
        };
      }

      // List which tokens were not found
      const notFoundTokenIds = tokenIds.filter(tid => !ticketMap[tid]);

      log.info('Batch token lookup', {
        requested: tokenIds.length,
        found: result.rows.length,
        notFound: notFoundTokenIds.length,
        requestingService: request.headers['x-internal-service'],
        traceId
      });

      return reply.send({
        tickets: ticketMap,
        found: result.rows.length,
        notFoundTokenIds
      });

    } catch (error) {
      log.error('Failed to batch lookup tickets by token', { error, traceId });
      return reply.status(500).send({ error: 'Failed to batch lookup tickets' });
    }
  });

  /**
   * GET /internal/tickets/:ticketId/for-validation
   * Get ticket with minimal data needed for QR validation
   * Used by: scanning-service (optimized for validation workflow)
   */
  fastify.get('/internal/tickets/:ticketId/for-validation', {
    preHandler: [verifyInternalService]
  }, async (request, reply) => {
    const traceId = request.headers['x-trace-id'] as string;
    const tenantId = request.headers['x-tenant-id'] as string;
    
    try {
      const { ticketId } = request.params as { ticketId: string };

      if (!ticketId) {
        return reply.status(400).send({ error: 'Ticket ID required' });
      }

      // Set tenant context for RLS if provided
      if (tenantId) {
        await setTenantContext(tenantId);
      }

      const query = `
        SELECT 
          t.id, t.tenant_id, t.event_id, t.user_id, t.status,
          t.qr_code, t.qr_hmac_secret, t.ticket_number,
          t.scan_count, t.last_scanned_at, t.validated_at, t.used_at,
          t.is_transferable, t.transfer_count,
          e.id as event_id, e.name as event_name, e.venue_id,
          e.starts_at as event_starts_at, e.ends_at as event_ends_at,
          e.status as event_status
        FROM tickets t
        LEFT JOIN events e ON t.event_id = e.id
        WHERE t.id = $1 AND t.deleted_at IS NULL
      `;

      const result = await DatabaseService.query(query, [ticketId]);

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      const row = result.rows[0];

      // Check if ticket is valid for entry
      const now = new Date();
      const eventStart = row.event_starts_at ? new Date(row.event_starts_at) : null;
      const eventEnd = row.event_ends_at ? new Date(row.event_ends_at) : null;
      
      const validationStatus = {
        isValid: row.status === 'SOLD' || row.status === 'TRANSFERRED',
        isUsed: row.status === 'USED' || !!row.validated_at || !!row.used_at,
        isExpired: eventEnd ? now > eventEnd : false,
        isTooEarly: eventStart ? now < new Date(eventStart.getTime() - 4 * 60 * 60 * 1000) : false, // 4 hours before
        eventStatus: row.event_status
      };

      log.info('Ticket validation lookup', {
        ticketId,
        status: row.status,
        isValid: validationStatus.isValid,
        requestingService: request.headers['x-internal-service'],
        traceId
      });

      return reply.send({
        ticket: {
          id: row.id,
          tenantId: row.tenant_id,
          eventId: row.event_id,
          userId: row.user_id,
          status: row.status,
          qrCode: row.qr_code,
          qrHmacSecret: row.qr_hmac_secret,
          ticketNumber: row.ticket_number,
          scanCount: row.scan_count || 0,
          lastScannedAt: row.last_scanned_at,
          validatedAt: row.validated_at,
          usedAt: row.used_at,
          isTransferable: row.is_transferable,
          transferCount: row.transfer_count || 0
        },
        event: row.event_name ? {
          id: row.event_id,
          name: row.event_name,
          venueId: row.venue_id,
          startsAt: row.event_starts_at,
          endsAt: row.event_ends_at,
          status: row.event_status
        } : null,
        validation: validationStatus
      });

    } catch (error) {
      log.error('Failed to get ticket for validation', { 
        error, 
        ticketId: (request.params as any).ticketId,
        traceId 
      });
      return reply.status(500).send({ error: 'Failed to get ticket' });
    }
  });

  /**
   * GET /internal/tickets/:ticketId/for-refund
   * Get ticket with data needed for refund eligibility check
   * Used by: payment-service (refund workflow)
   */
  fastify.get('/internal/tickets/:ticketId/for-refund', {
    preHandler: [verifyInternalService]
  }, async (request, reply) => {
    const traceId = request.headers['x-trace-id'] as string;
    const tenantId = request.headers['x-tenant-id'] as string;
    
    try {
      const { ticketId } = request.params as { ticketId: string };

      if (!ticketId) {
        return reply.status(400).send({ error: 'Ticket ID required' });
      }

      // Set tenant context for RLS if provided
      if (tenantId) {
        await setTenantContext(tenantId);
      }

      const query = `
        SELECT 
          t.id, t.tenant_id, t.event_id, t.user_id, t.order_id,
          t.status, t.price_cents, t.ticket_type_id,
          t.nft_token_id, t.nft_minted_at,
          t.validated_at, t.used_at, t.purchased_at,
          t.transfer_count, t.is_transferable,
          e.id as event_id, e.name as event_name, e.venue_id,
          e.starts_at as event_starts_at, e.ends_at as event_ends_at,
          e.status as event_status, e.event_type,
          v.id as venue_id, v.name as venue_name,
          v.refund_policy_hours
        FROM tickets t
        LEFT JOIN events e ON t.event_id = e.id
        LEFT JOIN venues v ON e.venue_id = v.id
        WHERE t.id = $1 AND t.deleted_at IS NULL
      `;

      const result = await DatabaseService.query(query, [ticketId]);

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      const row = result.rows[0];

      // Calculate refund eligibility
      const now = new Date();
      const eventStart = row.event_starts_at ? new Date(row.event_starts_at) : null;
      const hoursUntilEvent = eventStart ? (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60) : null;
      const refundPolicyHours = row.refund_policy_hours || 24; // Default 24 hours
      
      const hasBeenTransferred = (row.transfer_count || 0) > 0;
      const isNftMinted = !!row.nft_minted_at;
      const isUsed = row.status === 'USED' || !!row.validated_at || !!row.used_at;
      const isCancelled = row.status === 'CANCELLED';
      const withinRefundWindow = hoursUntilEvent !== null && hoursUntilEvent > refundPolicyHours;
      
      const refundEligibility = {
        canRefund: !hasBeenTransferred && !isNftMinted && !isUsed && !isCancelled && withinRefundWindow,
        reasons: [] as string[]
      };

      if (hasBeenTransferred) refundEligibility.reasons.push('Ticket has been transferred');
      if (isNftMinted) refundEligibility.reasons.push('NFT has been minted');
      if (isUsed) refundEligibility.reasons.push('Ticket has been used');
      if (isCancelled) refundEligibility.reasons.push('Ticket is already cancelled');
      if (!withinRefundWindow) refundEligibility.reasons.push(`Outside refund window (${refundPolicyHours}h before event)`);

      log.info('Ticket refund lookup', {
        ticketId,
        status: row.status,
        canRefund: refundEligibility.canRefund,
        requestingService: request.headers['x-internal-service'],
        traceId
      });

      return reply.send({
        ticket: {
          id: row.id,
          tenantId: row.tenant_id,
          eventId: row.event_id,
          userId: row.user_id,
          orderId: row.order_id,
          status: row.status,
          priceCents: row.price_cents,
          ticketTypeId: row.ticket_type_id,
          nftMinted: isNftMinted,
          validatedAt: row.validated_at,
          usedAt: row.used_at,
          purchasedAt: row.purchased_at,
          transferCount: row.transfer_count || 0,
          isTransferable: row.is_transferable
        },
        event: row.event_name ? {
          id: row.event_id,
          name: row.event_name,
          venueId: row.venue_id,
          startsAt: row.event_starts_at,
          endsAt: row.event_ends_at,
          status: row.event_status,
          eventType: row.event_type
        } : null,
        venue: row.venue_name ? {
          id: row.venue_id,
          name: row.venue_name,
          refundPolicyHours: row.refund_policy_hours
        } : null,
        refundEligibility
      });

    } catch (error) {
      log.error('Failed to get ticket for refund', { 
        error, 
        ticketId: (request.params as any).ticketId,
        traceId 
      });
      return reply.status(500).send({ error: 'Failed to get ticket' });
    }
  });
}

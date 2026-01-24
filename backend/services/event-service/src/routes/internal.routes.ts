/**
 * Internal Routes - For service-to-service communication only
 *
 * These endpoints are protected by HMAC-based internal authentication
 * and are not accessible to end users.
 *
 * Phase B HMAC Standardization - Routes now use shared middleware
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../config/database';
import { internalAuthMiddlewareNew } from '../middleware/internal-auth.middleware';
import { logger } from '../utils/logger';
import {
  getTicketStatsFromTicketService,
  getDefaultTicketStats,
  TicketStats,
} from '../clients/ticket-stats';

/**
 * Ticket Service Client for internal S2S calls
 *
 * CRITICAL FIX: Service Boundary Violation
 * Previously, event-service directly queried the 'tickets' table owned by ticket-service.
 * This violated microservices architecture principles. Now we call ticket-service via HTTP.
 *
 * TODO #14 IMPLEMENTED: Extracted to src/clients/ticket-stats.ts for reuse
 */

export default async function internalRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply internal authentication to all routes using standardized middleware
  fastify.addHook('preHandler', internalAuthMiddlewareNew);

  /**
   * @openapi
   * /internal/events/{eventId}:
   *   get:
   *     summary: Get event by ID (internal)
   *     description: |
   *       Retrieves event details including blockchain fields (event_pda, artist_wallet, etc.)
   *       This endpoint is for internal S2S use only and requires HMAC authentication.
   *     tags:
   *       - Internal
   *     security:
   *       - hmacAuth: []
   *     parameters:
   *       - in: path
   *         name: eventId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Event UUID
   *       - in: header
   *         name: x-tenant-id
   *         schema:
   *           type: string
   *         description: Tenant ID for multi-tenant isolation
   *       - in: header
   *         name: x-trace-id
   *         schema:
   *           type: string
   *         description: Distributed tracing ID
   *     responses:
   *       200:
   *         description: Event data with blockchain fields
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 event:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: string
   *                     name:
   *                       type: string
   *                     status:
   *                       type: string
   *                     eventPda:
   *                       type: string
   *                     artistWallet:
   *                       type: string
   *       400:
   *         description: Event ID required
   *       404:
   *         description: Event not found
   *       500:
   *         description: Internal error
   *
   * Used by: minting-service, payment-service
   */
  fastify.get('/internal/events/:eventId', async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const tenantId = request.headers['x-tenant-id'] as string;
    const traceId = request.headers['x-trace-id'] as string;

    if (!eventId) {
      return reply.status(400).send({ error: 'Event ID required' });
    }

    try {
      const db = getDb();
      let query = db('events')
        .select(
          'id', 'tenant_id', 'name', 'description', 'short_description',
          'venue_id', 'venue_layout_id', 'event_type', 'status', 'visibility',
          'starts_at', 'ends_at', 'doors_open', 'timezone',
          'banner_image_url', 'thumbnail_image_url',
          'capacity', 'is_virtual', 'is_hybrid',
          // Blockchain fields
          'event_pda', 'artist_wallet', 'artist_percentage',
          'venue_percentage', 'resaleable',
          // Additional metadata
          'cancellation_policy', 'refund_policy',
          'created_at', 'updated_at', 'published_at'
        )
        .where('id', eventId)
        .whereNull('deleted_at');

      if (tenantId) {
        query = query.where('tenant_id', tenantId);
      }

      const event = await query.first();

      if (!event) {
        return reply.status(404).send({ error: 'Event not found' });
      }

      request.log.info({
        eventId,
        status: event.status,
        requestingService: request.headers['x-internal-service'],
        traceId,
      }, 'Internal event lookup');

      return reply.send({
        event: {
          id: event.id,
          tenantId: event.tenant_id,
          name: event.name,
          description: event.description,
          shortDescription: event.short_description,
          venueId: event.venue_id,
          venueLayoutId: event.venue_layout_id,
          eventType: event.event_type,
          status: event.status,
          visibility: event.visibility,
          startsAt: event.starts_at,
          endsAt: event.ends_at,
          doorsOpen: event.doors_open,
          timezone: event.timezone,
          bannerImageUrl: event.banner_image_url,
          thumbnailImageUrl: event.thumbnail_image_url,
          capacity: event.capacity,
          isVirtual: event.is_virtual,
          isHybrid: event.is_hybrid,
          // Blockchain fields - critical for minting-service
          eventPda: event.event_pda,
          artistWallet: event.artist_wallet,
          artistPercentage: event.artist_percentage,
          venuePercentage: event.venue_percentage,
          resaleable: event.resaleable,
          // Additional metadata
          cancellationPolicy: event.cancellation_policy,
          refundPolicy: event.refund_policy,
          createdAt: event.created_at,
          updatedAt: event.updated_at,
          publishedAt: event.published_at,
        },
      });
    } catch (error: any) {
      request.log.error({ error, eventId, traceId }, 'Failed to get event');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * @openapi
   * /internal/events/{eventId}/pda:
   *   get:
   *     summary: Get event blockchain PDA data (internal)
   *     description: |
   *       Retrieves blockchain-specific data including Program Derived Address (PDA),
   *       merkle tree address, collection mint, and royalty percentages.
   *       Required for minting tickets as NFTs.
   *     tags:
   *       - Internal
   *       - Blockchain
   *     security:
   *       - hmacAuth: []
   *     parameters:
   *       - in: path
   *         name: eventId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: header
   *         name: x-tenant-id
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Event blockchain data
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 eventId:
   *                   type: string
   *                 blockchain:
   *                   type: object
   *                   properties:
   *                     eventPda:
   *                       type: string
   *                     merkleTreeAddress:
   *                       type: string
   *                     collectionMint:
   *                       type: string
   *                     artistWallet:
   *                       type: string
   *                     artistPercentage:
   *                       type: number
   *                 hasBlockchainConfig:
   *                   type: boolean
   *       404:
   *         description: Event not found
   *
   * Used by: minting-service, blockchain-service
   */
  fastify.get('/internal/events/:eventId/pda', async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const tenantId = request.headers['x-tenant-id'] as string;
    const traceId = request.headers['x-trace-id'] as string;

    if (!eventId) {
      return reply.status(400).send({ error: 'Event ID required' });
    }

    try {
      const db = getDb();
      let query = db('events')
        .select(
          'id', 'tenant_id', 'name', 'status',
          // Blockchain-specific fields
          'event_pda', 'merkle_tree_address', 'collection_mint',
          'artist_wallet', 'artist_percentage',
          'venue_percentage', 'platform_percentage',
          'resaleable', 'max_resale_price_percentage',
          // Related IDs for context
          'venue_id'
        )
        .where('id', eventId)
        .whereNull('deleted_at');

      if (tenantId) {
        query = query.where('tenant_id', tenantId);
      }

      const event = await query.first();

      if (!event) {
        return reply.status(404).send({ error: 'Event not found' });
      }

      // Validate blockchain data completeness
      const hasBlockchainConfig = !!(event.event_pda && event.artist_wallet);

      request.log.info({
        eventId,
        hasPda: !!event.event_pda,
        hasBlockchainConfig,
        requestingService: request.headers['x-internal-service'],
        traceId,
      }, 'Internal event PDA lookup');

      return reply.send({
        eventId: event.id,
        tenantId: event.tenant_id,
        name: event.name,
        status: event.status,
        venueId: event.venue_id,
        blockchain: {
          eventPda: event.event_pda,
          merkleTreeAddress: event.merkle_tree_address,
          collectionMint: event.collection_mint,
          artistWallet: event.artist_wallet,
          artistPercentage: event.artist_percentage,
          venuePercentage: event.venue_percentage,
          platformPercentage: event.platform_percentage,
          resaleable: event.resaleable,
          maxResalePricePercentage: event.max_resale_price_percentage,
        },
        hasBlockchainConfig,
      });
    } catch (error: any) {
      request.log.error({ error, eventId, traceId }, 'Failed to get event PDA');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * @openapi
   * /internal/events/{eventId}/blockchain-status:
   *   put:
   *     summary: Update event blockchain sync status (internal)
   *     description: |
   *       Callback endpoint for blockchain-service to update event with
   *       blockchain sync status (PDA, transaction signature, etc.)
   *       This is called after async blockchain sync completes.
   *     tags:
   *       - Internal
   *       - Blockchain
   *     security:
   *       - hmacAuth: []
   *     parameters:
   *       - in: path
   *         name: eventId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - status
   *             properties:
   *               status:
   *                 type: string
   *                 enum: [synced, failed]
   *               eventPda:
   *                 type: string
   *                 description: Program Derived Address of the event on Solana
   *               signature:
   *                 type: string
   *                 description: Transaction signature
   *               error:
   *                 type: string
   *                 description: Error message if status is failed
   *               syncedAt:
   *                 type: string
   *                 format: date-time
   *     responses:
   *       200:
   *         description: Blockchain status updated
   *       400:
   *         description: Invalid request
   *       404:
   *         description: Event not found
   *       500:
   *         description: Internal error
   *
   * Used by: blockchain-service (after processing event.blockchain_sync_requested)
   */
  fastify.put('/internal/events/:eventId/blockchain-status', async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const tenantId = request.headers['x-tenant-id'] as string;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    const { status, eventPda, signature, error, syncedAt } = request.body as {
      status: 'synced' | 'failed';
      eventPda?: string;
      signature?: string;
      error?: string;
      syncedAt?: string;
    };

    if (!eventId) {
      return reply.status(400).send({ error: 'Event ID required' });
    }

    if (!status || !['synced', 'failed'].includes(status)) {
      return reply.status(400).send({ error: 'Valid status (synced/failed) required' });
    }

    try {
      const db = getDb();

      // Verify event exists
      let eventQuery = db('events')
        .where('id', eventId)
        .whereNull('deleted_at');

      if (tenantId) {
        eventQuery = eventQuery.where('tenant_id', tenantId);
      }

      const event = await eventQuery.first();

      if (!event) {
        return reply.status(404).send({ error: 'Event not found' });
      }

      // Update event with blockchain data
      const updateData: Record<string, any> = {
        blockchain_sync_status: status,
        blockchain_synced_at: status === 'synced' ? (syncedAt || new Date().toISOString()) : null,
        blockchain_sync_error: status === 'failed' ? error : null,
        updated_at: new Date(),
      };

      if (status === 'synced' && eventPda) {
        updateData.event_pda = eventPda;
      }

      if (signature) {
        updateData.blockchain_tx_signature = signature;
      }

      await db('events')
        .where('id', eventId)
        .update(updateData);

      request.log.info({
        eventId,
        status,
        eventPda,
        signature: signature ? `${signature.substring(0, 20)}...` : null,
        callingService,
        traceId,
      }, 'Blockchain status updated');

      return reply.send({
        success: true,
        eventId,
        status,
        eventPda: status === 'synced' ? eventPda : null,
        message: status === 'synced'
          ? 'Event successfully synced to blockchain'
          : `Blockchain sync failed: ${error}`,
      });
    } catch (err: any) {
      request.log.error({ error: err, eventId, traceId }, 'Failed to update blockchain status');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * @openapi
   * /internal/events/{eventId}/scan-stats:
   *   get:
   *     summary: Get event scan statistics (internal)
   *     description: |
   *       Retrieves aggregated ticket scan statistics for an event including
   *       sold/used/validated counts, entry rate, and capacity utilization.
   *       Ticket data is fetched from ticket-service via HTTP.
   *     tags:
   *       - Internal
   *       - Analytics
   *     security:
   *       - hmacAuth: []
   *     parameters:
   *       - in: path
   *         name: eventId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: header
   *         name: x-tenant-id
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Event scan statistics
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 event:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: string
   *                     name:
   *                       type: string
   *                     status:
   *                       type: string
   *                 ticketStats:
   *                   type: object
   *                   properties:
   *                     totalTickets:
   *                       type: integer
   *                     soldTickets:
   *                       type: integer
   *                     validatedTickets:
   *                       type: integer
   *                 metrics:
   *                   type: object
   *                   properties:
   *                     entryRate:
   *                       type: integer
   *                       description: Percentage of sold tickets that were validated
   *                     capacityUtilization:
   *                       type: integer
   *                 eventTiming:
   *                   type: object
   *                   properties:
   *                     isUpcoming:
   *                       type: boolean
   *                     isOngoing:
   *                       type: boolean
   *                     isPast:
   *                       type: boolean
   *       404:
   *         description: Event not found
   *
   * Used by: scanning-service (analytics-dashboard.service)
   * Note: This provides event-level context; actual scan data is in scanning-service
   */
  fastify.get('/internal/events/:eventId/scan-stats', async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const tenantId = request.headers['x-tenant-id'] as string;
    const traceId = request.headers['x-trace-id'] as string;

    if (!eventId) {
      return reply.status(400).send({ error: 'Event ID required' });
    }

    try {
      const db = getDb();
      // Get event details
      let eventQuery = db('events')
        .select(
          'id', 'tenant_id', 'name', 'status',
          'venue_id', 'starts_at', 'ends_at', 'doors_open',
          'capacity', 'timezone'
        )
        .where('id', eventId)
        .whereNull('deleted_at');

      if (tenantId) {
        eventQuery = eventQuery.where('tenant_id', tenantId);
      }

      const event = await eventQuery.first();

      if (!event) {
        return reply.status(404).send({ error: 'Event not found' });
      }

      // CRITICAL FIX: Call ticket-service via HTTP instead of direct DB query
      // This fixes the service boundary violation (audit issue #1)
      // TODO #14 IMPLEMENTED: Using shared ticket-stats client
      const ticketStatsFromService = await getTicketStatsFromTicketService(
        eventId,
        { tenantId, traceId }
      );

      // Use service response or fallback to zeros if service unavailable
      const stats: TicketStats = ticketStatsFromService || getDefaultTicketStats();

      // Calculate event timing
      const now = new Date();
      const startsAt = event.starts_at ? new Date(event.starts_at) : null;
      const endsAt = event.ends_at ? new Date(event.ends_at) : null;
      const doorsOpen = event.doors_open ? new Date(event.doors_open) : null;

      const eventTiming = {
        isUpcoming: startsAt ? now < startsAt : false,
        isOngoing: startsAt && endsAt ? now >= startsAt && now <= endsAt : false,
        isPast: endsAt ? now > endsAt : false,
        doorsAreOpen: doorsOpen ? now >= doorsOpen : false,
        minutesUntilStart: startsAt ? Math.round((startsAt.getTime() - now.getTime()) / (1000 * 60)) : null,
        minutesSinceEnd: endsAt ? Math.round((now.getTime() - endsAt.getTime()) / (1000 * 60)) : null,
      };

      // Calculate entry rate (validated / sold)
      const soldCount = stats.soldTickets || 0;
      const validatedCount = stats.validatedTickets || 0;
      const entryRate = soldCount > 0 ? Math.round((validatedCount / soldCount) * 100) : 0;

      request.log.info({
        eventId,
        totalTickets: stats.totalTickets,
        validatedTickets: stats.validatedTickets,
        entryRate,
        requestingService: request.headers['x-internal-service'],
        traceId,
        source: ticketStatsFromService ? 'ticket-service' : 'fallback',
      }, 'Internal event scan stats lookup');

      return reply.send({
        event: {
          id: event.id,
          tenantId: event.tenant_id,
          name: event.name,
          status: event.status,
          venueId: event.venue_id,
          startsAt: event.starts_at,
          endsAt: event.ends_at,
          doorsOpen: event.doors_open,
          timezone: event.timezone,
          capacity: event.capacity,
        },
        ticketStats: {
          totalTickets: stats.totalTickets,
          soldTickets: stats.soldTickets,
          usedTickets: stats.usedTickets,
          transferredTickets: stats.transferredTickets,
          cancelledTickets: stats.cancelledTickets,
          validatedTickets: validatedCount,
          lastValidationAt: stats.lastValidationAt,
        },
        metrics: {
          entryRate,
          capacityUtilization: event.capacity > 0
            ? Math.round((soldCount / event.capacity) * 100)
            : 0,
          availableCapacity: event.capacity > 0
            ? event.capacity - soldCount
            : null,
        },
        eventTiming,
      });
    } catch (error: any) {
      request.log.error({ error, eventId, traceId }, 'Failed to get event scan stats');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}

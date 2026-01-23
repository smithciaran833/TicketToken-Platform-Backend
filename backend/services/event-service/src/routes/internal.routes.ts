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

export default async function internalRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply internal authentication to all routes using standardized middleware
  fastify.addHook('preHandler', internalAuthMiddlewareNew);

  /**
   * GET /internal/events/:eventId
   * Get event details with blockchain fields
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
   * GET /internal/events/:eventId/pda
   * Get event's blockchain PDA (Program Derived Address) and related blockchain data
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
   * GET /internal/events/:eventId/scan-stats
   * Get aggregated scan statistics for an event
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

      // Get ticket statistics using query builder instead of raw SQL
      const ticketStats = await db('tickets')
        .where('event_id', eventId)
        .whereNull('deleted_at')
        .select(
          db.raw('COUNT(*) as total_tickets'),
          db.raw("COUNT(CASE WHEN status = 'SOLD' THEN 1 END) as sold_tickets"),
          db.raw("COUNT(CASE WHEN status = 'USED' THEN 1 END) as used_tickets"),
          db.raw("COUNT(CASE WHEN status = 'TRANSFERRED' THEN 1 END) as transferred_tickets"),
          db.raw("COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled_tickets"),
          db.raw('COUNT(CASE WHEN validated_at IS NOT NULL THEN 1 END) as validated_tickets'),
          db.raw('MAX(validated_at) as last_validation_at')
        )
        .first();

      const stats = ticketStats || {
        total_tickets: 0,
        sold_tickets: 0,
        used_tickets: 0,
        transferred_tickets: 0,
        cancelled_tickets: 0,
        validated_tickets: 0,
        last_validation_at: null,
      };

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
      const soldCount = parseInt(stats.sold_tickets || '0');
      const validatedCount = parseInt(stats.validated_tickets || '0');
      const entryRate = soldCount > 0 ? Math.round((validatedCount / soldCount) * 100) : 0;

      request.log.info({
        eventId,
        totalTickets: stats.total_tickets,
        validatedTickets: stats.validated_tickets,
        entryRate,
        requestingService: request.headers['x-internal-service'],
        traceId,
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
          totalTickets: parseInt(stats.total_tickets || '0'),
          soldTickets: parseInt(stats.sold_tickets || '0'),
          usedTickets: parseInt(stats.used_tickets || '0'),
          transferredTickets: parseInt(stats.transferred_tickets || '0'),
          cancelledTickets: parseInt(stats.cancelled_tickets || '0'),
          validatedTickets: validatedCount,
          lastValidationAt: stats.last_validation_at,
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

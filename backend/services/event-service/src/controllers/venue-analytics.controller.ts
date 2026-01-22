import { AuthenticatedHandler } from '../types';
import { logger } from '../utils/logger';
import { createProblemError } from '../middleware/error-handler';

export const getVenueDashboard: AuthenticatedHandler = async (request, reply) => {
  try {
    const { venueId } = request.params as { venueId: string };
    const { db } = request.container.cradle;
    
    // CRITICAL FIX: Enforce tenant isolation
    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      throw createProblemError(400, 'TENANT_REQUIRED', 'Tenant ID required');
    }

    // Get events for this venue
    const events = await db('events')
      .where({ venue_id: venueId })
      .where('tenant_id', tenantId)
      .whereNull('deleted_at')
      .select('*');

    // Get capacity stats from event_capacity table
    const stats = await db('event_capacity')
      .join('events', 'event_capacity.event_id', 'events.id')
      .where('events.venue_id', venueId)
      .where('events.tenant_id', tenantId)
      .select(
        db.raw('SUM(event_capacity.total_capacity) as total_capacity'),
        db.raw('SUM(event_capacity.sold_count) as total_sold'),
        db.raw('SUM(event_capacity.reserved_capacity) as total_reserved'),
        db.raw('SUM(event_capacity.available_capacity) as total_available')
      )
      .first();

    return reply.send({
      success: true,
      venue: {
        id: venueId,
        name: 'Venue Dashboard'
      },
      events: events.length,
      stats: {
        // MEDIUM PRIORITY FIX for Issue #17: Safe parseInt with null checks
        total_capacity: parseInt(stats?.total_capacity as string || '0') || 0,
        total_sold: parseInt(stats?.total_sold as string || '0') || 0,
        total_reserved: parseInt(stats?.total_reserved as string || '0') || 0,
        available: parseInt(stats?.total_available as string || '0') || 0
      }
    });
  } catch (error: any) {
    logger.error({ error, venueId: (request.params as any).venueId }, 'Dashboard error');
    
    // HIGH PRIORITY FIX for Issue #4: Return appropriate status codes
    if (error.statusCode && error.code) {
      throw createProblemError(error.statusCode, error.code, error.message);
    }
    
    throw createProblemError(500, 'INTERNAL_ERROR', error.message || 'Failed to get venue dashboard');
  }
};

export const getVenueAnalytics: AuthenticatedHandler = async (request, reply) => {
  try {
    const { venueId } = request.params as { venueId: string };
    const { db } = request.container.cradle;
    
    // CRITICAL FIX: Enforce tenant isolation
    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      throw createProblemError(400, 'TENANT_REQUIRED', 'Tenant ID required');
    }

    // Get revenue and sales analytics from event_capacity + event_pricing
    const analytics = await db('events')
      .leftJoin('event_capacity', 'events.id', 'event_capacity.event_id')
      .leftJoin('event_pricing', 'event_capacity.id', 'event_pricing.capacity_id')
      .where('events.venue_id', venueId)
      .where('events.tenant_id', tenantId)
      .select(
        db.raw('COUNT(DISTINCT events.id) as total_events'),
        db.raw('SUM(event_capacity.sold_count * event_pricing.base_price) as total_revenue'),
        db.raw('SUM(event_capacity.sold_count) as total_tickets_sold')
      )
      .first();

    return reply.send({
      success: true,
      venueId,
      analytics: {
        // MEDIUM PRIORITY FIX for Issue #17: Safe parseInt/parseFloat with null checks
        total_events: parseInt(analytics?.total_events as string || '0') || 0,
        total_revenue: parseFloat(analytics?.total_revenue as string || '0') || 0,
        total_tickets_sold: parseInt(analytics?.total_tickets_sold as string || '0') || 0
      }
    });
  } catch (error: any) {
    logger.error({ error, venueId: (request.params as any).venueId }, 'Analytics error');
    
    // HIGH PRIORITY FIX for Issue #4: Return appropriate status codes
    if (error.statusCode && error.code) {
      throw createProblemError(error.statusCode, error.code, error.message);
    }
    
    throw createProblemError(500, 'INTERNAL_ERROR', error.message || 'Failed to get analytics');
  }
};

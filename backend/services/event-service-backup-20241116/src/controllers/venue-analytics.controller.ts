import { AuthenticatedHandler } from '../types';
import { logger } from '../utils/logger';

export const getVenueDashboard: AuthenticatedHandler = async (request, reply) => {
  try {
    const { venueId } = request.params as { venueId: string };
    const { db } = request.container.cradle;

    // Get events for this venue
    const events = await db('events')
      .where({ venue_id: venueId })
      .whereNull('deleted_at')
      .select('*');

    // Get capacity stats from event_capacity table
    const stats = await db('event_capacity')
      .join('events', 'event_capacity.event_id', 'events.id')
      .where('events.venue_id', venueId)
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
        total_capacity: parseInt(stats?.total_capacity || '0'),
        total_sold: parseInt(stats?.total_sold || '0'),
        total_reserved: parseInt(stats?.total_reserved || '0'),
        available: parseInt(stats?.total_available || '0')
      }
    });
  } catch (error) {
    logger.error({ error, venueId: (request.params as any).venueId }, 'Dashboard error');
    return reply.status(500).send({
      success: false,
      error: 'Failed to get venue dashboard'
    });
  }
};

export const getVenueAnalytics: AuthenticatedHandler = async (request, reply) => {
  try {
    const { venueId } = request.params as { venueId: string };
    const { db } = request.container.cradle;

    // Get revenue and sales analytics from event_capacity + event_pricing
    const analytics = await db('events')
      .leftJoin('event_capacity', 'events.id', 'event_capacity.event_id')
      .leftJoin('event_pricing', 'event_capacity.id', 'event_pricing.capacity_id')
      .where('events.venue_id', venueId)
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
        total_events: parseInt(analytics?.total_events || '0'),
        total_revenue: parseFloat(analytics?.total_revenue || '0'),
        total_tickets_sold: parseInt(analytics?.total_tickets_sold || '0')
      }
    });
  } catch (error) {
    logger.error({ error, venueId: (request.params as any).venueId }, 'Analytics error');
    return reply.status(500).send({
      success: false,
      error: 'Failed to get analytics'
    });
  }
};

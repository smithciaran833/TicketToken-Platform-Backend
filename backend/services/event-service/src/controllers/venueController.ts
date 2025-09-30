import { Request, Response } from 'express';
import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'VenueController' });

export class VenueController {
  async getVenueDashboard(req: Request, res: Response): Promise<void> {
    const { venueId } = req.params;

    try {
      const db = DatabaseService.getPool();

      // Get venue details with stats
      const venueQuery = await db.query(
        `SELECT
          v.*,
          COUNT(DISTINCT e.id) as total_events,
          COUNT(DISTINCT CASE WHEN e.status = 'PUBLISHED' THEN e.id END) as active_events,
          COUNT(DISTINCT CASE WHEN e.start_date > NOW() THEN e.id END) as upcoming_events,
          COALESCE(SUM(tt.quantity), 0) as total_capacity
        FROM venues v
        LEFT JOIN events e ON e.venue_id = v.id
        LEFT JOIN ticket_types tt ON tt.event_id = e.id
        WHERE v.id = $1
        GROUP BY v.id`,
        [venueId]
      );

      if (venueQuery.rows.length === 0) {
        res.status(404).json({ error: 'Venue not found' });
        return;
      }

      // Get upcoming events
      const upcomingEvents = await db.query(
        `SELECT
          e.id,
          e.name,
          e.start_date,
          e.category,
          COALESCE(SUM(tt.quantity), 0) as total_tickets,
          COALESCE(MIN(tt.price), 0) as min_price,
          COALESCE(MAX(tt.price), 0) as max_price
        FROM events e
        LEFT JOIN ticket_types tt ON tt.event_id = e.id
        WHERE e.venue_id = $1
          AND e.start_date > NOW()
          AND e.status = 'PUBLISHED'
        GROUP BY e.id
        ORDER BY e.start_date ASC
        LIMIT 10`,
        [venueId]
      );

      // Get completed orders for revenue (from our Phase 1 work)
      const revenueData = await db.query(
        `SELECT
          COUNT(*) as total_orders,
          COALESCE(SUM(total_amount), 0) as total_revenue
        FROM orders o
        JOIN events e ON e.id = o.event_id
        WHERE e.venue_id = $1
          AND o.status = 'COMPLETED'`,
        [venueId]
      );

      // Get event categories distribution
      const categoryStats = await db.query(
        `SELECT
          category,
          COUNT(*) as count
        FROM events
        WHERE venue_id = $1
        GROUP BY category
        ORDER BY count DESC`,
        [venueId]
      );

      const dashboard = {
        venue: {
          ...venueQuery.rows[0],
          total_events: parseInt(venueQuery.rows[0].total_events) || 0,
          active_events: parseInt(venueQuery.rows[0].active_events) || 0,
          upcoming_events: parseInt(venueQuery.rows[0].upcoming_events) || 0,
          total_capacity: parseInt(venueQuery.rows[0].total_capacity) || 0
        },
        upcomingEvents: upcomingEvents.rows,
        revenue: revenueData.rows[0],
        categoryDistribution: categoryStats.rows,
        stats: {
          totalEvents: parseInt(venueQuery.rows[0].total_events) || 0,
          activeEvents: parseInt(venueQuery.rows[0].active_events) || 0,
          upcomingEvents: parseInt(venueQuery.rows[0].upcoming_events) || 0,
          totalCapacity: parseInt(venueQuery.rows[0].total_capacity) || 0,
          totalRevenue: parseFloat(revenueData.rows[0]?.total_revenue) || 0
        }
      };

      log.info('Venue dashboard generated', { venueId });
      res.json(dashboard);

    } catch (error) {
      log.error('Failed to get venue dashboard', error);
      res.status(500).json({ error: 'Failed to get venue dashboard' });
    }
  }

  async getVenueAnalytics(req: Request, res: Response): Promise<void> {
    const { venueId } = req.params;
    const { startDate, endDate } = req.query;

    try {
      const db = DatabaseService.getPool();

      // Get analytics by event category
      const analytics = await db.query(
        `SELECT
          e.category,
          COUNT(DISTINCT e.id) as events,
          SUM(tt.quantity) as total_tickets,
          AVG(tt.price) as avg_ticket_price,
          SUM(tt.price * tt.quantity) as potential_revenue
        FROM events e
        LEFT JOIN ticket_types tt ON tt.event_id = e.id
        WHERE e.venue_id = $1
          AND ($2::date IS NULL OR e.start_date >= $2)
          AND ($3::date IS NULL OR e.end_date <= $3)
        GROUP BY e.category
        ORDER BY potential_revenue DESC NULLS LAST`,
        [venueId, startDate || null, endDate || null]
      );

      res.json({
        venueId,
        period: { startDate, endDate },
        analytics: analytics.rows
      });

    } catch (error) {
      log.error('Failed to get venue analytics', error);
      res.status(500).json({ error: 'Failed to get analytics' });
    }
  }
}

export const venueController = new VenueController();

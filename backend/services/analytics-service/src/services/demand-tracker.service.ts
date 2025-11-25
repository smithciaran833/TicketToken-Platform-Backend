import { getDb } from '../config/database';
import { influxDBService } from './influxdb.service';
import { logger } from '../utils/logger';

interface DemandMetrics {
  eventId: string;
  salesVelocity: number;
  timeUntilEvent: number;
  sellThroughRate: number;
  currentCapacity: number;
  ticketsSold: number;
  priceElasticity: number;
}

export class DemandTrackerService {
  private static instance: DemandTrackerService;
  private log = logger.child({ component: 'DemandTrackerService' });

  static getInstance(): DemandTrackerService {
    if (!this.instance) {
      this.instance = new DemandTrackerService();
    }
    return this.instance;
  }

  async calculateDemand(eventId: string): Promise<DemandMetrics> {
    try {
      const db = getDb();
      const eventResult = await db.raw(`SELECT e.id, e.start_time, e.capacity, COUNT(t.id) as tickets_sold FROM events e LEFT JOIN tickets t ON e.id = t.event_id AND t.status = 'sold' WHERE e.id = ? GROUP BY e.id, e.start_time, e.capacity`, [eventId]);
      if (eventResult.rows.length === 0) throw new Error('Event not found');

      const event = eventResult.rows[0];
      const now = new Date();
      const eventTime = new Date(event.start_time);
      const timeUntilEvent = (eventTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      const salesVelocity = await this.getSalesVelocity(eventId, 24);
      const sellThroughRate = event.tickets_sold / event.capacity;
      const priceElasticity = await this.calculatePriceElasticity(eventId);

      return { eventId, salesVelocity, timeUntilEvent, sellThroughRate, currentCapacity: event.capacity, ticketsSold: event.tickets_sold, priceElasticity };
    } catch (error) {
      this.log.error('Failed to calculate demand', { error, eventId });
      throw error;
    }
  }

  private async getSalesVelocity(eventId: string, hours: number): Promise<number> {
    try {
      const db = getDb();
      const result = await db.raw(`SELECT COUNT(*) as count FROM orders WHERE event_id = ? AND status = 'completed' AND created_at >= NOW() - INTERVAL '? hours'`, [eventId, hours]);
      return parseInt(result.rows[0].count) / hours;
    } catch (error) {
      this.log.error('Failed to get sales velocity', { error, eventId });
      return 0;
    }
  }

  private async calculatePriceElasticity(eventId: string): Promise<number> {
    try {
      const db = getDb();
      const result = await db.raw(`SELECT price_cents, COUNT(*) as sales_count, created_at FROM orders o WHERE o.event_id = ? AND o.status = 'completed' AND o.created_at >= NOW() - INTERVAL '30 days' GROUP BY price_cents, DATE_TRUNC('day', created_at) ORDER BY created_at`, [eventId]);
      if (result.rows.length < 2) return 1.0;

      let totalElasticity = 0;
      let count = 0;
      for (let i = 1; i < result.rows.length; i++) {
        const prev = result.rows[i - 1];
        const curr = result.rows[i];
        const priceChange = (curr.price_cents - prev.price_cents) / prev.price_cents;
        const quantityChange = (curr.sales_count - prev.sales_count) / prev.sales_count;
        if (priceChange !== 0) {
          const elasticity = Math.abs(quantityChange / priceChange);
          totalElasticity += elasticity;
          count++;
        }
      }
      return count > 0 ? totalElasticity / count : 1.0;
    } catch (error) {
      this.log.error('Failed to calculate price elasticity', { error, eventId });
      return 1.0;
    }
  }

  async trackSalesVelocity(eventId: string) {
    try {
      const db = getDb();
      const result = await db.raw(`SELECT COUNT(*) as count FROM orders WHERE event_id = ? AND status = 'completed' AND created_at >= NOW() - INTERVAL '1 hour'`, [eventId]);
      const ticketsPerHour = parseInt(result.rows[0].count);
      const venueResult = await db.raw('SELECT venue_id FROM events WHERE id = ?', [eventId]);
      
      // Just write as custom metric string for now
      await influxDBService.writeMetric(venueResult.rows[0].venue_id, 'sales_velocity' as any, ticketsPerHour, { event_id: eventId });
      return ticketsPerHour;
    } catch (error) {
      this.log.error('Failed to track sales velocity', { error, eventId });
      throw error;
    }
  }
}

export const demandTrackerService = DemandTrackerService.getInstance();

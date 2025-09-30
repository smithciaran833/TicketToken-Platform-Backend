import { pgPool } from '../../utils/database';
import { metricsService } from '../../services/metrics.service';
import { logger } from '../../utils/logger';

export class BusinessMetricsCollector {
  private interval: NodeJS.Timeout | null = null;
  private name = 'BusinessMetricsCollector';

  getName(): string {
    return this.name;
  }

  async start(): Promise<void> {
    this.interval = setInterval(async () => {
      await this.collect();
    }, 300000); // Every 5 minutes
    
    await this.collect();
  }

  async stop(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async collect(): Promise<void> {
    if (!pgPool) {
      logger.debug('PostgreSQL not available for business metrics');
      return;
    }

    try {
      // Collect venue metrics
      const venueResult = await pgPool.query(`
        SELECT COUNT(*) as total_venues,
               COUNT(CASE WHEN status = 'active' THEN 1 END) as active_venues
        FROM venues
      `).catch(() => ({ rows: [{ total_venues: 0, active_venues: 0 }] }));

      await metricsService.pushMetrics({
        name: 'business_total_venues',
        type: 'gauge',
        service: 'monitoring-service',
        value: parseInt(venueResult.rows[0].total_venues),
        labels: { type: 'total' },
      });

      await metricsService.pushMetrics({
        name: 'business_active_venues',
        type: 'gauge',
        service: 'monitoring-service',
        value: parseInt(venueResult.rows[0].active_venues),
        labels: { type: 'active' },
      });

      // Collect event metrics
      const eventResult = await pgPool.query(`
        SELECT COUNT(*) as total_events,
               COUNT(CASE WHEN status = 'published' THEN 1 END) as published_events
        FROM events
        WHERE created_at > NOW() - INTERVAL '30 days'
      `).catch(() => ({ rows: [{ total_events: 0, published_events: 0 }] }));

      await metricsService.pushMetrics({
        name: 'business_events_last_30_days',
        type: 'gauge',
        service: 'monitoring-service',
        value: parseInt(eventResult.rows[0].total_events),
        labels: { period: '30d' },
      });

      // Collect ticket metrics
      const ticketResult = await pgPool.query(`
        SELECT COUNT(*) as tickets_sold
        FROM tickets
        WHERE status = 'sold'
          AND created_at > NOW() - INTERVAL '24 hours'
      `).catch(() => ({ rows: [{ tickets_sold: 0 }] }));

      await metricsService.pushMetrics({
        name: 'business_tickets_sold_24h',
        type: 'gauge',
        service: 'monitoring-service',
        value: parseInt(ticketResult.rows[0].tickets_sold),
        labels: { period: '24h' },
      });

      logger.debug('Business metrics collected successfully');
    } catch (error) {
      logger.error('Error collecting business metrics:', error);
    }
  }
}

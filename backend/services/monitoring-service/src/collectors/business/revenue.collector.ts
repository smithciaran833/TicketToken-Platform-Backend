import { metricsService } from '../../services/metrics.service';
import { logger } from '../../utils/logger';
import { venueServiceClient } from '@tickettoken/shared/clients';
import { eventServiceClient } from '@tickettoken/shared/clients';
import { ticketServiceClient } from '@tickettoken/shared/clients';
import { RequestContext } from '@tickettoken/shared/http-client/base-service-client';

/**
 * Helper to create request context for service calls
 * Monitoring service operates as a system service
 */
function createSystemContext(): RequestContext {
  return {
    tenantId: 'system',
    traceId: `metrics-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };
}

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
    const ctx = createSystemContext();

    try {
      // REFACTORED: Collect venue metrics via venueServiceClient
      await this.collectVenueMetrics(ctx);

      // REFACTORED: Collect event metrics via eventServiceClient  
      await this.collectEventMetrics(ctx);

      // REFACTORED: Collect ticket metrics via ticketServiceClient
      await this.collectTicketMetrics(ctx);

      logger.debug('Business metrics collected successfully');
    } catch (error) {
      logger.error('Error collecting business metrics:', error);
    }
  }

  /**
   * REFACTORED: Collect venue metrics via venue-service client
   * Previously did direct DB query: SELECT COUNT(*) FROM venues WHERE status = ...
   */
  private async collectVenueMetrics(ctx: RequestContext): Promise<void> {
    try {
      const venueMetrics = await venueServiceClient.getVenueMetrics(ctx);

      await metricsService.pushMetrics({
        name: 'business_total_venues',
        type: 'gauge',
        service: 'monitoring-service',
        value: venueMetrics.totalVenues,
        labels: { type: 'total' },
      });

      await metricsService.pushMetrics({
        name: 'business_active_venues',
        type: 'gauge',
        service: 'monitoring-service',
        value: venueMetrics.activeVenues,
        labels: { type: 'active' },
      });

      logger.debug({ metrics: venueMetrics }, 'Venue metrics collected via venue-service');
    } catch (error) {
      logger.warn({ error }, 'Failed to collect venue metrics, using default values');
      // Push default metrics if service is unavailable
      await metricsService.pushMetrics({
        name: 'business_total_venues',
        type: 'gauge',
        service: 'monitoring-service',
        value: 0,
        labels: { type: 'total' },
      });
      await metricsService.pushMetrics({
        name: 'business_active_venues',
        type: 'gauge',
        service: 'monitoring-service',
        value: 0,
        labels: { type: 'active' },
      });
    }
  }

  /**
   * REFACTORED: Collect event metrics via event-service client
   * Previously did direct DB query: SELECT COUNT(*) FROM events WHERE created_at > NOW() - INTERVAL '30 days'
   */
  private async collectEventMetrics(ctx: RequestContext): Promise<void> {
    try {
      const eventMetrics = await eventServiceClient.getEventMetrics(ctx, 30);

      await metricsService.pushMetrics({
        name: 'business_events_last_30_days',
        type: 'gauge',
        service: 'monitoring-service',
        value: eventMetrics.totalEvents,
        labels: { period: '30d' },
      });

      logger.debug({ metrics: eventMetrics }, 'Event metrics collected via event-service');
    } catch (error) {
      logger.warn({ error }, 'Failed to collect event metrics, using default values');
      await metricsService.pushMetrics({
        name: 'business_events_last_30_days',
        type: 'gauge',
        service: 'monitoring-service',
        value: 0,
        labels: { period: '30d' },
      });
    }
  }

  /**
   * REFACTORED: Collect ticket metrics via ticket-service client
   * Previously did direct DB query: SELECT COUNT(*) FROM tickets WHERE status = 'sold' AND created_at > NOW() - INTERVAL '24 hours'
   */
  private async collectTicketMetrics(ctx: RequestContext): Promise<void> {
    try {
      const ticketMetrics = await ticketServiceClient.getTicketMetrics(ctx, 24);

      await metricsService.pushMetrics({
        name: 'business_tickets_sold_24h',
        type: 'gauge',
        service: 'monitoring-service',
        value: ticketMetrics.ticketsSold,
        labels: { period: '24h' },
      });

      logger.debug({ metrics: ticketMetrics }, 'Ticket metrics collected via ticket-service');
    } catch (error) {
      logger.warn({ error }, 'Failed to collect ticket metrics, using default values');
      await metricsService.pushMetrics({
        name: 'business_tickets_sold_24h',
        type: 'gauge',
        service: 'monitoring-service',
        value: 0,
        labels: { period: '24h' },
      });
    }
  }
}

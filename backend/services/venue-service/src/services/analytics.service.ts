/**
 * Analytics Service
 *
 * PHASE 5c REFACTORED:
 * - Replaced custom HttpClient with shared analyticsServiceClient
 * - Circuit breaker and retry logic now handled by BaseServiceClient
 */
import { analyticsServiceClient, createRequestContext } from '@tickettoken/shared';

export class AnalyticsService {
  private logger: any;

  constructor(dependencies: { logger: any }) {
    this.logger = dependencies.logger;
  }

  async getVenueAnalytics(venueId: string, tenantId: string, options: any = {}): Promise<any> {
    const fallback = { metrics: [], timeRange: options.timeRange, venueId };
    const ctx = createRequestContext(tenantId);

    try {
      const response = await analyticsServiceClient.getVenueAnalytics(venueId, ctx, {
        timeRange: options.timeRange,
        granularity: options.granularity,
        includeEvents: options.includeEvents,
        includeTicketTypes: options.includeTicketTypes,
      });
      return response;
    } catch (error) {
      this.logger.warn({ error, venueId }, 'Analytics service unavailable');
      return fallback;
    }
  }

  async trackEvent(eventData: any, tenantId: string): Promise<boolean> {
    const ctx = createRequestContext(tenantId);

    try {
      await analyticsServiceClient.trackEvent({
        eventType: eventData.eventType || 'custom',
        eventName: eventData.eventName,
        userId: eventData.userId,
        entityType: eventData.entityType,
        entityId: eventData.entityId,
        properties: eventData.properties || {},
        source: eventData.source || 'venue-service',
      }, ctx);
      return true;
    } catch (error) {
      this.logger.warn({ error, eventData }, 'Failed to track event (non-critical)');
      return false;
    }
  }
}

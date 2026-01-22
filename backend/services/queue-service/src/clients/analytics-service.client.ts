/**
 * Analytics Service Client
 *
 * HMAC-authenticated client for communication with analytics-service.
 */

import {
  BaseServiceClient,
  ServiceClientConfig,
  RequestContext,
} from '@tickettoken/shared';

interface AnalyticsEvent {
  eventType: string;
  userId?: string;
  tenantId?: string;
  metadata: Record<string, unknown>;
  timestamp?: string;
}

interface AnalyticsResponse {
  success: boolean;
  eventId?: string;
}

export class AnalyticsServiceClient extends BaseServiceClient {
  constructor(config?: Partial<ServiceClientConfig>) {
    super({
      baseURL: process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:3000',
      serviceName: 'analytics-service',
      timeout: 5000,
      ...config,
    });
  }

  /**
   * Track an analytics event
   */
  async trackEvent(event: AnalyticsEvent, ctx: RequestContext): Promise<AnalyticsResponse> {
    const response = await this.post<AnalyticsResponse>('/api/v1/events/track', event, ctx);
    return response.data;
  }

  /**
   * Track batch events
   */
  async trackBatchEvents(events: AnalyticsEvent[], ctx: RequestContext): Promise<AnalyticsResponse> {
    const response = await this.post<AnalyticsResponse>('/api/v1/events/batch', { events }, ctx);
    return response.data;
  }
}

// Singleton instance
let analyticsServiceClient: AnalyticsServiceClient | null = null;

export function getAnalyticsServiceClient(): AnalyticsServiceClient {
  if (!analyticsServiceClient) {
    analyticsServiceClient = new AnalyticsServiceClient();
  }
  return analyticsServiceClient;
}

export default AnalyticsServiceClient;

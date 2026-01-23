/**
 * Analytics Service Client
 *
 * Client for communicating with analytics-service internal APIs.
 * Extends BaseServiceClient for circuit breaker, retry, and tracing support.
 *
 * Used by: venue-service, queue-service
 */

import { BaseServiceClient, RequestContext } from '../http-client/base-service-client';

// =============================================================================
// Request/Response Types
// =============================================================================

/**
 * Event types for analytics tracking
 */
export type AnalyticsEventType =
  | 'ticket.purchased'
  | 'ticket.transferred'
  | 'ticket.scanned'
  | 'ticket.listed'
  | 'ticket.sold'
  | 'event.viewed'
  | 'event.created'
  | 'user.registered'
  | 'user.login'
  | 'payment.completed'
  | 'payment.failed'
  | 'refund.processed'
  | 'custom';

/**
 * Request to track an analytics event
 */
export interface TrackEventRequest {
  /** Event type */
  eventType: AnalyticsEventType;
  /** Custom event name (if eventType is 'custom') */
  eventName?: string;
  /** User ID associated with event */
  userId?: string;
  /** Session ID */
  sessionId?: string;
  /** Entity type (ticket, event, order, etc.) */
  entityType?: string;
  /** Entity ID */
  entityId?: string;
  /** Event properties */
  properties: Record<string, string | number | boolean | null>;
  /** Event timestamp (defaults to now) */
  timestamp?: string;
  /** Source of event */
  source?: string;
  /** User agent string */
  userAgent?: string;
  /** IP address (for geo) */
  ipAddress?: string;
}

/**
 * Response from tracking an event
 */
export interface TrackEventResponse {
  /** Whether tracking succeeded */
  success: boolean;
  /** Event ID */
  eventId: string;
  /** Message */
  message?: string;
}

/**
 * Metric types
 */
export type MetricType = 'counter' | 'gauge' | 'histogram' | 'timing';

/**
 * Request to track a metric
 */
export interface TrackMetricRequest {
  /** Metric name */
  name: string;
  /** Metric type */
  type: MetricType;
  /** Metric value */
  value: number;
  /** Unit of measurement */
  unit?: string;
  /** Tags for filtering/grouping */
  tags?: Record<string, string>;
  /** Timestamp (defaults to now) */
  timestamp?: string;
}

/**
 * Response from tracking a metric
 */
export interface TrackMetricResponse {
  /** Whether tracking succeeded */
  success: boolean;
  /** Message */
  message?: string;
}

/**
 * Time range for analytics queries
 */
export interface TimeRange {
  /** Start timestamp */
  start: string;
  /** End timestamp */
  end: string;
}

/**
 * Granularity for time series data
 */
export type TimeGranularity = 'hour' | 'day' | 'week' | 'month';

/**
 * Options for venue analytics query
 */
export interface GetVenueAnalyticsOptions {
  /** Time range for data */
  timeRange?: TimeRange;
  /** Granularity for time series */
  granularity?: TimeGranularity;
  /** Include event breakdown */
  includeEvents?: boolean;
  /** Include ticket type breakdown */
  includeTicketTypes?: boolean;
}

/**
 * Time series data point
 */
export interface TimeSeriesPoint {
  /** Timestamp */
  timestamp: string;
  /** Value */
  value: number;
}

/**
 * Event analytics breakdown
 */
export interface EventAnalytics {
  /** Event ID */
  eventId: string;
  /** Event name */
  eventName: string;
  /** Total tickets sold */
  ticketsSold: number;
  /** Total revenue in cents */
  revenue: number;
  /** Tickets scanned */
  ticketsScanned: number;
  /** Scan rate percentage */
  scanRate: number;
}

/**
 * Venue analytics response
 */
export interface VenueAnalyticsResponse {
  /** Venue ID */
  venueId: string;
  /** Time range of data */
  timeRange: TimeRange;
  /** Summary metrics */
  summary: {
    /** Total events */
    totalEvents: number;
    /** Total tickets sold */
    totalTicketsSold: number;
    /** Total revenue in cents */
    totalRevenue: number;
    /** Average ticket price */
    averageTicketPrice: number;
    /** Total scans */
    totalScans: number;
    /** Overall scan rate */
    scanRate: number;
    /** Secondary market sales */
    secondarySales: number;
    /** Secondary market revenue */
    secondaryRevenue: number;
  };
  /** Time series data */
  timeSeries?: {
    /** Ticket sales over time */
    ticketSales: TimeSeriesPoint[];
    /** Revenue over time */
    revenue: TimeSeriesPoint[];
    /** Scans over time */
    scans: TimeSeriesPoint[];
  };
  /** Per-event breakdown */
  events?: EventAnalytics[];
}

// =============================================================================
// Client Class
// =============================================================================

/**
 * Client for analytics-service internal APIs
 *
 * @example
 * ```typescript
 * const client = new AnalyticsServiceClient();
 *
 * // Track an event
 * await client.trackEvent({
 *   eventType: 'ticket.purchased',
 *   userId: 'user-123',
 *   entityType: 'ticket',
 *   entityId: 'ticket-456',
 *   properties: { price: 5000, currency: 'USD' }
 * }, ctx);
 *
 * // Track a metric
 * await client.trackMetric({
 *   name: 'api.response_time',
 *   type: 'histogram',
 *   value: 125,
 *   unit: 'ms',
 *   tags: { endpoint: '/tickets', method: 'GET' }
 * }, ctx);
 *
 * // Get venue analytics
 * const analytics = await client.getVenueAnalytics('venue-123', ctx);
 * ```
 */
export class AnalyticsServiceClient extends BaseServiceClient {
  constructor() {
    super({
      baseURL: process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:3015',
      serviceName: 'analytics-service',
      timeout: 15000,
    });
  }

  /**
   * Track an analytics event
   *
   * @param event - Event details to track
   * @param ctx - Request context with tenant/user IDs
   * @returns Tracking result
   */
  async trackEvent(
    event: TrackEventRequest,
    ctx: RequestContext
  ): Promise<TrackEventResponse> {
    const response = await this.post<TrackEventResponse>(
      '/internal/events',
      ctx,
      event
    );
    return response.data;
  }

  /**
   * Track a metric value
   *
   * @param metric - Metric details to track
   * @param ctx - Request context with tenant/user IDs
   * @returns Tracking result
   */
  async trackMetric(
    metric: TrackMetricRequest,
    ctx: RequestContext
  ): Promise<TrackMetricResponse> {
    const response = await this.post<TrackMetricResponse>(
      '/internal/metrics',
      ctx,
      metric
    );
    return response.data;
  }

  /**
   * Get analytics data for a venue
   *
   * @param venueId - The venue ID
   * @param ctx - Request context with tenant/user IDs
   * @param options - Query options
   * @returns Venue analytics data
   */
  async getVenueAnalytics(
    venueId: string,
    ctx: RequestContext,
    options?: GetVenueAnalyticsOptions
  ): Promise<VenueAnalyticsResponse> {
    const params = new URLSearchParams();

    if (options?.timeRange) {
      params.append('start', options.timeRange.start);
      params.append('end', options.timeRange.end);
    }
    if (options?.granularity) {
      params.append('granularity', options.granularity);
    }
    if (options?.includeEvents !== undefined) {
      params.append('includeEvents', options.includeEvents.toString());
    }
    if (options?.includeTicketTypes !== undefined) {
      params.append('includeTicketTypes', options.includeTicketTypes.toString());
    }

    const queryString = params.toString();
    const path = `/internal/venues/${venueId}/analytics${queryString ? `?${queryString}` : ''}`;

    const response = await this.get<VenueAnalyticsResponse>(path, ctx);
    return response.data;
  }

  /**
   * Track ticket purchase event (helper method)
   *
   * @param data - Purchase data
   * @param ctx - Request context
   * @returns Tracking result
   */
  async trackTicketPurchase(
    data: {
      userId: string;
      ticketId: string;
      eventId: string;
      venueId: string;
      price: number;
      currency: string;
      ticketType: string;
    },
    ctx: RequestContext
  ): Promise<TrackEventResponse> {
    return this.trackEvent(
      {
        eventType: 'ticket.purchased',
        userId: data.userId,
        entityType: 'ticket',
        entityId: data.ticketId,
        properties: {
          eventId: data.eventId,
          venueId: data.venueId,
          price: data.price,
          currency: data.currency,
          ticketType: data.ticketType,
        },
      },
      ctx
    );
  }

  /**
   * Track ticket scan event (helper method)
   *
   * @param data - Scan data
   * @param ctx - Request context
   * @returns Tracking result
   */
  async trackTicketScan(
    data: {
      userId: string;
      ticketId: string;
      eventId: string;
      venueId: string;
      scanType: 'entry' | 'exit' | 'reentry';
      deviceId?: string;
    },
    ctx: RequestContext
  ): Promise<TrackEventResponse> {
    return this.trackEvent(
      {
        eventType: 'ticket.scanned',
        userId: data.userId,
        entityType: 'ticket',
        entityId: data.ticketId,
        properties: {
          eventId: data.eventId,
          venueId: data.venueId,
          scanType: data.scanType,
          deviceId: data.deviceId || null,
        },
      },
      ctx
    );
  }

  /**
   * Track API response time (helper method)
   *
   * @param endpoint - API endpoint
   * @param method - HTTP method
   * @param durationMs - Response time in milliseconds
   * @param statusCode - HTTP status code
   * @param ctx - Request context
   * @returns Tracking result
   */
  async trackApiLatency(
    endpoint: string,
    method: string,
    durationMs: number,
    statusCode: number,
    ctx: RequestContext
  ): Promise<TrackMetricResponse> {
    return this.trackMetric(
      {
        name: 'api.response_time',
        type: 'histogram',
        value: durationMs,
        unit: 'ms',
        tags: {
          endpoint,
          method,
          status: statusCode.toString(),
        },
      },
      ctx
    );
  }
}

/** Singleton instance of AnalyticsServiceClient */
export const analyticsServiceClient = new AnalyticsServiceClient();

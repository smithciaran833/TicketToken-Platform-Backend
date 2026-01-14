import { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import { createCircuitBreaker } from '../utils/circuit-breaker';
import { createSecureServiceClient, executeWithRetry, getServiceUrl } from '../utils/http-client.util';

/**
 * SC1, SC2, OR1-OR4: Secure Event Service Client
 * Uses HTTPS, authentication headers, and correlation ID propagation
 * HIGH: Includes fallback responses when circuit breaker is open
 */

const EVENT_SERVICE_URL = getServiceUrl('event-service', 'http://tickettoken-event:3003');

interface RequestContext {
  requestId?: string;
  tenantId?: string;
  userId?: string;
  traceId?: string;
  spanId?: string;
}

// HIGH: Default fallback responses when event service is unavailable
const DEFAULT_EVENT_STATUS = {
  status: 'unknown',
  isCancelled: false,
  isPostponed: false,
  isRescheduled: false,
  originalDate: undefined,
  newDate: undefined,
};

export class EventClient {
  private client: AxiosInstance;
  private getEventBreaker;
  private getEventStatusBreaker;

  constructor() {
    // Create secure client with S2S authentication
    this.client = createSecureServiceClient({
      baseUrl: EVENT_SERVICE_URL,
      serviceName: 'event-service',
      timeout: 5000,
    });

    // HIGH: Circuit breaker with fallback for getEvent
    this.getEventBreaker = createCircuitBreaker(
      this._getEvent.bind(this),
      { 
        name: 'event-service-get-event', 
        timeout: 3000,
        fallback: (eventId: string) => {
          logger.warn('Event service unavailable - returning null for getEvent', { eventId });
          return null;
        },
      }
    );

    // HIGH: Circuit breaker with fallback for getEventStatus
    this.getEventStatusBreaker = createCircuitBreaker(
      this._getEventStatus.bind(this),
      {
        name: 'event-service-get-status',
        timeout: 3000,
        fallback: (eventId: string) => {
          logger.warn('Event service unavailable - returning default status', { eventId });
          return DEFAULT_EVENT_STATUS;
        },
      }
    );
  }

  private async _getEvent(eventId: string, context?: RequestContext): Promise<any> {
    const response = await executeWithRetry(
      () => this.client.get(`/api/v1/events/${eventId}`, { context } as any),
      2,
      'event-service'
    );
    return response.data;
  }

  async getEvent(eventId: string, context?: RequestContext): Promise<any> {
    try {
      return await this.getEventBreaker.fire(eventId, context);
    } catch (error) {
      logger.error('Error fetching event', { error, eventId });
      // HIGH: Return null instead of throwing when service unavailable
      return null;
    }
  }

  private async _getEventStatus(eventId: string, context?: RequestContext): Promise<{
    status: string;
    isCancelled: boolean;
    isPostponed: boolean;
    isRescheduled: boolean;
    originalDate?: string;
    newDate?: string;
  }> {
    const response = await executeWithRetry(
      () => this.client.get(`/api/v1/events/${eventId}/status`, { context } as any),
      2,
      'event-service'
    );
    return response.data;
  }

  /**
   * Get event status - useful for refund eligibility (cancelled/postponed events)
   * HIGH: Returns safe default when service is unavailable
   */
  async getEventStatus(eventId: string, context?: RequestContext): Promise<{
    status: string;
    isCancelled: boolean;
    isPostponed: boolean;
    isRescheduled: boolean;
    originalDate?: string;
    newDate?: string;
  }> {
    try {
      return await this.getEventStatusBreaker.fire(eventId, context);
    } catch (error) {
      logger.error('Error fetching event status', { error, eventId });
      // HIGH: Return safe default instead of throwing
      return DEFAULT_EVENT_STATUS;
    }
  }
}

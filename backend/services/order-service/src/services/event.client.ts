/**
 * Event Service Client - order-service
 *
 * PHASE 5c REFACTORED:
 * Extends BaseServiceClient from @tickettoken/shared for standardized
 * HMAC auth, circuit breaker, retry, and tracing.
 *
 * Uses public event API for read operations with graceful fallbacks.
 */

import {
  BaseServiceClient,
  RequestContext,
  ServiceClientError,
} from '@tickettoken/shared';
import { logger } from '../utils/logger';

// Default fallback responses when event service is unavailable
const DEFAULT_EVENT_STATUS = {
  status: 'unknown',
  isCancelled: false,
  isPostponed: false,
  isRescheduled: false,
  originalDate: undefined,
  newDate: undefined,
};

/**
 * Event client for order-service
 *
 * Uses internal endpoints with graceful fallbacks for read operations.
 */
export class EventClient extends BaseServiceClient {
  constructor() {
    super({
      baseURL: process.env.EVENT_SERVICE_URL || 'http://event-service:3004',
      serviceName: 'event-service',
      timeout: 5000,
    });
  }

  /**
   * Get event details
   *
   * @param eventId - Event ID
   * @param ctx - Request context with tenant info
   * @returns Event details or null if unavailable
   */
  async getEvent(eventId: string, ctx?: RequestContext): Promise<any | null> {
    try {
      const context = ctx || { tenantId: 'system' };
      const response = await this.get<{ event: any }>(
        `/internal/events/${eventId}`,
        context
      );
      return response.data.event;
    } catch (error) {
      if (error instanceof ServiceClientError) {
        logger.warn('Event service unavailable - returning null for getEvent', {
          eventId,
          statusCode: error.statusCode,
        });
      } else {
        logger.error('Error fetching event', { error, eventId });
      }
      return null;
    }
  }

  /**
   * Get event status - useful for refund eligibility (cancelled/postponed events)
   *
   * Returns safe default when service is unavailable.
   *
   * @param eventId - Event ID
   * @param ctx - Request context with tenant info
   * @returns Event status with cancellation/postponement info
   */
  async getEventStatus(
    eventId: string,
    ctx?: RequestContext
  ): Promise<{
    status: string;
    isCancelled: boolean;
    isPostponed: boolean;
    isRescheduled: boolean;
    originalDate?: string;
    newDate?: string;
  }> {
    try {
      const context = ctx || { tenantId: 'system' };
      const response = await this.get<{
        status: string;
        isCancelled: boolean;
        isPostponed: boolean;
        isRescheduled: boolean;
        originalDate?: string;
        newDate?: string;
      }>(`/internal/events/${eventId}/status`, context);
      return response.data;
    } catch (error) {
      if (error instanceof ServiceClientError) {
        logger.warn('Event service unavailable - returning default status', {
          eventId,
          statusCode: error.statusCode,
        });
      } else {
        logger.error('Error fetching event status', { error, eventId });
      }
      return DEFAULT_EVENT_STATUS;
    }
  }
}

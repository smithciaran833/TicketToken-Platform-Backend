/**
 * Ticket Lookup Service - marketplace-service
 *
 * PHASE 5c REFACTORED:
 * Uses shared library's ticketServiceClient and eventServiceClient
 * for standardized S2S auth with circuit breaker and retry.
 */

import {
  ticketServiceClient,
  eventServiceClient,
  createRequestContext,
  ServiceClientError,
} from '@tickettoken/shared';
import { config } from '../config';
import { logger } from '../utils/logger';
import { cache } from '../config/redis';

interface TicketInfo {
  ticketId: string;
  eventId: string;
  venueId: string;
  faceValue: number;
  section: string;
  row: string;
  seat: string;
  eventDate: Date;
  eventName: string;
  venueName: string;
}

export class TicketLookupService {
  private log = logger.child({ component: 'TicketLookupService' });
  private readonly CACHE_TTL = 300; // 5 minutes

  /**
   * Get ticket information from ticket service
   *
   * PHASE 5c: Uses shared library ticketServiceClient
   */
  async getTicketInfo(ticketId: string, tenantId?: string): Promise<TicketInfo | null> {
    try {
      // Check cache first
      const cacheKey = `ticket:${ticketId}`;
      const cached = await cache.get<string>(cacheKey);

      if (cached) {
        this.log.debug('Ticket info retrieved from cache', { ticketId });
        return JSON.parse(cached);
      }

      // Fetch from ticket service using shared client
      this.log.info('Fetching ticket info from ticket service', { ticketId });

      const ctx = createRequestContext(tenantId || 'system');
      const ticket = await ticketServiceClient.getTicketFull(ticketId, ctx);

      if (ticket) {
        const ticketInfo: TicketInfo = {
          ticketId: ticket.id,
          eventId: ticket.eventId,
          venueId: ticket.event?.venueId || '',
          faceValue: ticket.priceCents,
          section: ticket.seat?.section || '',
          row: ticket.seat?.row || '',
          seat: ticket.seat?.number || '',
          eventDate: new Date(ticket.event?.startsAt || Date.now()),
          eventName: ticket.event?.name || '',
          venueName: ticket.event?.venueName || '',
        };

        // Cache the result
        await cache.set(cacheKey, JSON.stringify(ticketInfo), this.CACHE_TTL);

        return ticketInfo;
      }

      return null;
    } catch (error: any) {
      if (error instanceof ServiceClientError && error.statusCode === 404) {
        this.log.warn('Ticket not found', { ticketId });
        return null;
      }

      this.log.error('Failed to fetch ticket info', {
        error: error.message,
        ticketId,
        statusCode: error instanceof ServiceClientError ? error.statusCode : undefined,
      });

      // Return null instead of throwing to allow graceful degradation
      return null;
    }
  }

  /**
   * Get event information
   *
   * PHASE 5c: Uses shared library eventServiceClient
   */
  async getEventInfo(
    eventId: string,
    tenantId?: string
  ): Promise<{
    eventId: string;
    name: string;
    date: Date;
    venueId: string;
    venueName: string;
  } | null> {
    try {
      const cacheKey = `event:${eventId}`;
      const cached = await cache.get<string>(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      const ctx = createRequestContext(tenantId || 'system');
      const event = await eventServiceClient.getEventInternal(eventId, ctx);

      if (event) {
        const eventInfo = {
          eventId: event.id,
          name: event.name,
          date: new Date(event.startsAt || Date.now()),
          venueId: event.venueId,
          venueName: '', // EventWithBlockchain doesn't include venueName, need separate lookup if required
        };

        await cache.set(cacheKey, JSON.stringify(eventInfo), this.CACHE_TTL);
        return eventInfo;
      }

      return null;
    } catch (error: any) {
      this.log.error('Failed to fetch event info', {
        error: error.message,
        eventId,
      });
      return null;
    }
  }

  /**
   * Validate ticket is eligible for marketplace listing
   */
  async validateTicketEligibility(
    ticketId: string,
    tenantId?: string
  ): Promise<{
    eligible: boolean;
    reason?: string;
  }> {
    const ticket = await this.getTicketInfo(ticketId, tenantId);

    if (!ticket) {
      return {
        eligible: false,
        reason: 'Ticket not found',
      };
    }

    // Check if event has already occurred
    if (ticket.eventDate < new Date()) {
      return {
        eligible: false,
        reason: 'Event has already occurred',
      };
    }

    // Check if event is too close (e.g., less than 1 hour away)
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
    if (ticket.eventDate < oneHourFromNow) {
      return {
        eligible: false,
        reason: 'Event is too close to start time',
      };
    }

    return { eligible: true };
  }

  /**
   * Calculate suggested price range based on historical data
   */
  async getSuggestedPriceRange(
    ticketId: string,
    tenantId?: string
  ): Promise<{
    min: number;
    max: number;
    average: number;
  } | null> {
    try {
      const ticket = await this.getTicketInfo(ticketId, tenantId);
      if (!ticket) return null;

      // For now, use simple calculation based on face value
      // In production, this would query historical sales data
      const faceValue = ticket.faceValue;

      return {
        min: Math.round(faceValue * 0.8), // 80% of face value
        max: Math.round(faceValue * 3.0), // 300% cap
        average: Math.round(faceValue * 1.2), // 120% average markup
      };
    } catch (error) {
      this.log.error('Failed to calculate suggested price range', {
        error,
        ticketId,
      });
      return null;
    }
  }

  /**
   * Clear cache for a specific ticket
   */
  async clearTicketCache(ticketId: string): Promise<void> {
    await cache.del(`ticket:${ticketId}`);
  }

  /**
   * Clear cache for a specific event
   */
  async clearEventCache(eventId: string): Promise<void> {
    await cache.del(`event:${eventId}`);
  }
}

export const ticketLookupService = new TicketLookupService();

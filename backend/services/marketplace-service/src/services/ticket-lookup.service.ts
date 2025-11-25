import axios from 'axios';
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
   * Get ticket information from event service
   */
  async getTicketInfo(ticketId: string): Promise<TicketInfo | null> {
    try {
      // Check cache first
      const cacheKey = `ticket:${ticketId}`;
      const cached = await cache.get<string>(cacheKey);
      
      if (cached) {
        this.log.debug('Ticket info retrieved from cache', { ticketId });
        return JSON.parse(cached);
      }

      // Fetch from event service
      this.log.info('Fetching ticket info from event service', { ticketId });
      
      const response = await axios.get(
        `${config.ticketServiceUrl}/api/v1/tickets/${ticketId}`,
        {
          headers: {
            'X-Service-Name': 'marketplace-service',
            'X-Internal-Request': 'true'
          },
          timeout: 5000
        }
      );

      if (response.status === 200 && response.data) {
        const ticketInfo: TicketInfo = {
          ticketId: response.data.id,
          eventId: response.data.event_id,
          venueId: response.data.venue_id,
          faceValue: response.data.face_value || response.data.price,
          section: response.data.section,
          row: response.data.row,
          seat: response.data.seat,
          eventDate: new Date(response.data.event_date),
          eventName: response.data.event_name,
          venueName: response.data.venue_name
        };

        // Cache the result
        await cache.set(cacheKey, JSON.stringify(ticketInfo), this.CACHE_TTL);

        return ticketInfo;
      }

      return null;
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.log.warn('Ticket not found', { ticketId });
        return null;
      }

      this.log.error('Failed to fetch ticket info', {
        error: error.message,
        ticketId,
        status: error.response?.status
      });

      // Return null instead of throwing to allow graceful degradation
      return null;
    }
  }

  /**
   * Get event information
   */
  async getEventInfo(eventId: string): Promise<{
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

      const response = await axios.get(
        `${config.ticketServiceUrl}/api/v1/events/${eventId}`,
        {
          headers: {
            'X-Service-Name': 'marketplace-service',
            'X-Internal-Request': 'true'
          },
          timeout: 5000
        }
      );

      if (response.status === 200 && response.data) {
        const eventInfo = {
          eventId: response.data.id,
          name: response.data.name,
          date: new Date(response.data.date),
          venueId: response.data.venue_id,
          venueName: response.data.venue_name
        };

        await cache.set(cacheKey, JSON.stringify(eventInfo), this.CACHE_TTL);
        return eventInfo;
      }

      return null;
    } catch (error: any) {
      this.log.error('Failed to fetch event info', {
        error: error.message,
        eventId
      });
      return null;
    }
  }

  /**
   * Validate ticket is eligible for marketplace listing
   */
  async validateTicketEligibility(ticketId: string): Promise<{
    eligible: boolean;
    reason?: string;
  }> {
    const ticket = await this.getTicketInfo(ticketId);

    if (!ticket) {
      return {
        eligible: false,
        reason: 'Ticket not found'
      };
    }

    // Check if event has already occurred
    if (ticket.eventDate < new Date()) {
      return {
        eligible: false,
        reason: 'Event has already occurred'
      };
    }

    // Check if event is too close (e.g., less than 1 hour away)
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
    if (ticket.eventDate < oneHourFromNow) {
      return {
        eligible: false,
        reason: 'Event is too close to start time'
      };
    }

    return { eligible: true };
  }

  /**
   * Calculate suggested price range based on historical data
   */
  async getSuggestedPriceRange(ticketId: string): Promise<{
    min: number;
    max: number;
    average: number;
  } | null> {
    try {
      const ticket = await this.getTicketInfo(ticketId);
      if (!ticket) return null;

      // For now, use simple calculation based on face value
      // In production, this would query historical sales data
      const faceValue = ticket.faceValue;
      
      return {
        min: Math.round(faceValue * 0.8), // 80% of face value
        max: Math.round(faceValue * 3.0), // 300% cap
        average: Math.round(faceValue * 1.2) // 120% average markup
      };
    } catch (error) {
      this.log.error('Failed to calculate suggested price range', {
        error,
        ticketId
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

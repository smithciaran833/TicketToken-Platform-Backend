/**
 * Event Service Client
 *
 * HMAC-authenticated client for communication with event-service.
 */

import {
  BaseServiceClient,
  ServiceClientConfig,
  RequestContext,
} from '@tickettoken/shared';

interface EventDetails {
  id: string;
  name: string;
  description?: string;
  date: string;
  venue_id: string;
  venue_name?: string;
  organizer_id?: string;
}

interface EventResponse {
  event: EventDetails;
}

export class EventServiceClient extends BaseServiceClient {
  constructor(config?: Partial<ServiceClientConfig>) {
    super({
      baseURL: process.env.EVENT_SERVICE_URL || 'http://event-service:3003',
      serviceName: 'event-service',
      timeout: 5000,
      ...config,
    });
  }

  /**
   * Get event details by ID
   */
  async getEventById(eventId: string, ctx: RequestContext): Promise<EventDetails | null> {
    try {
      const response = await this.get<EventResponse>(`/api/v1/events/${eventId}`, ctx);
      return response.data.event;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get multiple events by IDs
   */
  async getEventsByIds(eventIds: string[], ctx: RequestContext): Promise<EventDetails[]> {
    try {
      const response = await this.post<{ events: EventDetails[] }>(
        '/api/v1/events/batch',
        { eventIds },
        ctx
      );
      return response.data.events;
    } catch {
      return [];
    }
  }
}

// Singleton instance
let eventServiceClient: EventServiceClient | null = null;

export function getEventServiceClient(): EventServiceClient {
  if (!eventServiceClient) {
    eventServiceClient = new EventServiceClient();
  }
  return eventServiceClient;
}

export default EventServiceClient;

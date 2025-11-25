import { HTTPClient } from '../client/http-client';
import {
  Event,
  CreateEventParams,
  UpdateEventParams,
  SearchParams,
  PaginatedResponse,
} from '../types/api';

/**
 * Events resource for managing event operations
 */
export class Events {
  private client: HTTPClient;

  constructor(client: HTTPClient) {
    this.client = client;
  }

  /**
   * List all events
   */
  async list(params?: SearchParams): Promise<PaginatedResponse<Event>> {
    return this.client.get<PaginatedResponse<Event>>('/events', { params });
  }

  /**
   * Get event by ID
   */
  async get(eventId: string): Promise<Event> {
    return this.client.get<Event>(`/events/${eventId}`);
  }

  /**
   * Create a new event
   */
  async create(params: CreateEventParams): Promise<Event> {
    return this.client.post<Event>('/events', params);
  }

  /**
   * Update an existing event
   */
  async update(eventId: string, params: UpdateEventParams): Promise<Event> {
    return this.client.patch<Event>(`/events/${eventId}`, params);
  }

  /**
   * Delete an event
   */
  async delete(eventId: string): Promise<void> {
    return this.client.delete<void>(`/events/${eventId}`);
  }

  /**
   * Publish an event
   */
  async publish(eventId: string): Promise<Event> {
    return this.client.post<Event>(`/events/${eventId}/publish`);
  }

  /**
   * Cancel an event
   */
  async cancel(eventId: string, reason?: string): Promise<Event> {
    return this.client.post<Event>(`/events/${eventId}/cancel`, { reason });
  }

  /**
   * Search events
   */
  async search(params: SearchParams): Promise<PaginatedResponse<Event>> {
    return this.client.post<PaginatedResponse<Event>>('/events/search', params);
  }
}

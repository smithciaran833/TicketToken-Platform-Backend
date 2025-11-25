import { HTTPClient } from '../client/http-client';
import {
  Ticket,
  PurchaseTicketParams,
  TransferTicketParams,
  PaginationParams,
  PaginatedResponse,
} from '../types/api';

/**
 * Tickets resource for managing ticket operations
 */
export class Tickets {
  private client: HTTPClient;

  constructor(client: HTTPClient) {
    this.client = client;
  }

  /**
   * List all tickets
   */
  async list(params?: PaginationParams): Promise<PaginatedResponse<Ticket>> {
    return this.client.get<PaginatedResponse<Ticket>>('/tickets', { params });
  }

  /**
   * Get ticket by ID
   */
  async get(ticketId: string): Promise<Ticket> {
    return this.client.get<Ticket>(`/tickets/${ticketId}`);
  }

  /**
   * Purchase tickets
   */
  async purchase(params: PurchaseTicketParams): Promise<Ticket[]> {
    return this.client.post<Ticket[]>('/tickets/purchase', params);
  }

  /**
   * Transfer ticket to another user
   */
  async transfer(params: TransferTicketParams): Promise<Ticket> {
    return this.client.post<Ticket>('/tickets/transfer', params);
  }

  /**
   * Validate a ticket
   */
  async validate(ticketId: string): Promise<{ valid: boolean; ticket?: Ticket; reason?: string }> {
    return this.client.post(`/tickets/${ticketId}/validate`);
  }

  /**
   * Use/redeem a ticket
   */
  async use(ticketId: string): Promise<Ticket> {
    return this.client.post<Ticket>(`/tickets/${ticketId}/use`);
  }

  /**
   * Cancel a ticket
   */
  async cancel(ticketId: string, reason?: string): Promise<Ticket> {
    return this.client.post<Ticket>(`/tickets/${ticketId}/cancel`, { reason });
  }

  /**
   * Get tickets for a specific event
   */
  async getByEvent(eventId: string, params?: PaginationParams): Promise<PaginatedResponse<Ticket>> {
    return this.client.get<PaginatedResponse<Ticket>>(`/events/${eventId}/tickets`, { params });
  }

  /**
   * Get user's tickets
   */
  async getMyTickets(params?: PaginationParams): Promise<PaginatedResponse<Ticket>> {
    return this.client.get<PaginatedResponse<Ticket>>('/tickets/me', { params });
  }
}

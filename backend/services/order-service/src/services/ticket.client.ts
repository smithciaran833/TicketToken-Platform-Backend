import { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import { createCircuitBreaker } from '../utils/circuit-breaker';
import { createSecureServiceClient, executeWithRetry, getServiceUrl } from '../utils/http-client.util';

/**
 * SC1, SC2, OR1-OR4: Secure Ticket Service Client
 * Uses HTTPS, authentication headers, and correlation ID propagation
 * Includes transfer check for refund eligibility validation
 * HIGH: Includes fallbacks for read operations (fail-closed for security-critical checks)
 */

const TICKET_SERVICE_URL = getServiceUrl('ticket-service', 'http://tickettoken-ticket:3004');

interface RequestContext {
  requestId?: string;
  tenantId?: string;
  userId?: string;
  traceId?: string;
  spanId?: string;
}

interface TicketInfo {
  ticketId: string;
  ownerId: string;
  originalBuyerId: string;
  hasBeenTransferred: boolean;
  status: string;
  eventId: string;
  ticketTypeId: string;
}

// HIGH: Default fallbacks - fail closed for security, empty for non-critical
const DEFAULT_AVAILABILITY: Record<string, number> = {};
const DEFAULT_PRICES: Record<string, number> = {};

export class TicketClient {
  private client: AxiosInstance;
  private checkAvailabilityBreaker;
  private reserveTicketsBreaker;
  private confirmAllocationBreaker;
  private releaseTicketsBreaker;
  private getPricesBreaker;
  private getTicketBreaker;

  constructor() {
    // Create secure client with S2S authentication
    this.client = createSecureServiceClient({
      baseUrl: TICKET_SERVICE_URL,
      serviceName: 'ticket-service',
      timeout: 10000,
    });

    // HIGH: Fallback for availability check - return empty (no tickets available)
    this.checkAvailabilityBreaker = createCircuitBreaker(
      this._checkAvailability.bind(this),
      { 
        name: 'ticket-service-check-availability', 
        timeout: 3000,
        fallback: () => {
          logger.warn('Ticket service unavailable - returning empty availability');
          return DEFAULT_AVAILABILITY;
        },
      }
    );

    // No fallback for write operations - must fail explicitly
    this.reserveTicketsBreaker = createCircuitBreaker(
      this._reserveTickets.bind(this),
      { name: 'ticket-service-reserve', timeout: 5000 }
    );

    this.confirmAllocationBreaker = createCircuitBreaker(
      this._confirmAllocation.bind(this),
      { name: 'ticket-service-confirm', timeout: 5000 }
    );

    this.releaseTicketsBreaker = createCircuitBreaker(
      this._releaseTickets.bind(this),
      { name: 'ticket-service-release', timeout: 3000 }
    );

    // HIGH: Fallback for prices - return empty
    this.getPricesBreaker = createCircuitBreaker(
      this._getPrices.bind(this),
      { 
        name: 'ticket-service-get-prices', 
        timeout: 3000,
        fallback: () => {
          logger.warn('Ticket service unavailable - returning empty prices');
          return DEFAULT_PRICES;
        },
      }
    );

    // No fallback for getTicket - security critical, must fail closed
    this.getTicketBreaker = createCircuitBreaker(
      this._getTicket.bind(this),
      { name: 'ticket-service-get-ticket', timeout: 3000 }
    );
  }

  private async _checkAvailability(
    ticketTypeIds: string[],
    context?: RequestContext
  ): Promise<Record<string, number>> {
    const response = await executeWithRetry(
      () => this.client.post('/internal/tickets/availability', { ticketTypeIds }, { context } as any),
      2,
      'ticket-service'
    );
    return response.data;
  }

  async checkAvailability(
    ticketTypeIds: string[],
    context?: RequestContext
  ): Promise<Record<string, number>> {
    try {
      return await this.checkAvailabilityBreaker.fire(ticketTypeIds, context);
    } catch (error) {
      logger.error('Error checking ticket availability', { error, ticketTypeIds });
      // HIGH: Return empty availability as fallback
      return DEFAULT_AVAILABILITY;
    }
  }

  private async _reserveTickets(
    orderId: string,
    items: Array<{ ticketTypeId: string; quantity: number }>,
    context?: RequestContext
  ): Promise<void> {
    await executeWithRetry(
      () => this.client.post('/internal/tickets/reserve', { orderId, items }, { context } as any),
      3,
      'ticket-service'
    );
  }

  async reserveTickets(
    orderId: string,
    items: Array<{ ticketTypeId: string; quantity: number }>,
    context?: RequestContext
  ): Promise<void> {
    try {
      await this.reserveTicketsBreaker.fire(orderId, items, context);
    } catch (error) {
      logger.error('Error reserving tickets', { error, orderId, items });
      throw error;
    }
  }

  private async _confirmAllocation(orderId: string, context?: RequestContext): Promise<void> {
    await executeWithRetry(
      () => this.client.post('/internal/tickets/confirm', { orderId }, { context } as any),
      3,
      'ticket-service'
    );
  }

  async confirmAllocation(orderId: string, context?: RequestContext): Promise<void> {
    try {
      await this.confirmAllocationBreaker.fire(orderId, context);
    } catch (error) {
      logger.error('Error confirming ticket allocation', { error, orderId });
      throw error;
    }
  }

  private async _releaseTickets(orderId: string, context?: RequestContext): Promise<void> {
    await executeWithRetry(
      () => this.client.post('/internal/tickets/release', { orderId }, { context } as any),
      2,
      'ticket-service'
    );
  }

  async releaseTickets(orderId: string, context?: RequestContext): Promise<void> {
    try {
      await this.releaseTicketsBreaker.fire(orderId, context);
    } catch (error) {
      logger.error('Error releasing tickets', { error, orderId });
      throw error;
    }
  }

  private async _getPrices(
    ticketTypeIds: string[],
    context?: RequestContext
  ): Promise<Record<string, number>> {
    const response = await executeWithRetry(
      () => this.client.post('/internal/tickets/prices', { ticketTypeIds }, { context } as any),
      2,
      'ticket-service'
    );
    return response.data.prices;
  }

  async getPrices(
    ticketTypeIds: string[],
    context?: RequestContext
  ): Promise<Record<string, number>> {
    try {
      return await this.getPricesBreaker.fire(ticketTypeIds, context);
    } catch (error) {
      logger.error('Error getting ticket prices', { error, ticketTypeIds });
      // HIGH: Return empty prices as fallback
      return DEFAULT_PRICES;
    }
  }

  /**
   * CRITICAL: Get ticket info for transfer check before refund
   * This is required to prevent double-spend vulnerability
   * NO FALLBACK - must fail explicitly for security
   */
  private async _getTicket(ticketId: string, context?: RequestContext): Promise<TicketInfo> {
    const response = await executeWithRetry(
      () => this.client.get(`/internal/tickets/${ticketId}`, { context } as any),
      2,
      'ticket-service'
    );
    return response.data;
  }

  async getTicket(ticketId: string, context?: RequestContext): Promise<TicketInfo> {
    try {
      return await this.getTicketBreaker.fire(ticketId, context);
    } catch (error) {
      logger.error('Error getting ticket', { error, ticketId });
      throw error; // CRITICAL: Must throw - no fallback for security
    }
  }

  /**
   * CRITICAL: Check if ticket has been transferred
   * Used to validate refund eligibility - prevents double spend
   *
   * @returns true if ticket is still owned by original buyer (refund allowed)
   * @returns false if ticket has been transferred (refund NOT allowed)
   */
  async checkTicketNotTransferred(ticketId: string, originalBuyerId: string, context?: RequestContext): Promise<boolean> {
    try {
      const ticket = await this.getTicket(ticketId, context);

      // Check if current owner matches original buyer
      if (ticket.ownerId !== originalBuyerId) {
        logger.warn('Ticket has been transferred - refund not allowed', {
          ticketId,
          originalBuyerId,
          currentOwnerId: ticket.ownerId,
        });
        return false;
      }

      // Also check the explicit transfer flag
      if (ticket.hasBeenTransferred) {
        logger.warn('Ticket transfer flag set - refund not allowed', {
          ticketId,
          originalBuyerId,
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error checking ticket transfer status', { error, ticketId, originalBuyerId });
      // CRITICAL: Fail closed - if we can't verify, don't allow refund
      throw error;
    }
  }

  /**
   * Get tickets for order - used for batch transfer check
   * NO FALLBACK - security critical operation
   */
  async getTicketsForOrder(orderId: string, context?: RequestContext): Promise<TicketInfo[]> {
    try {
      const response = await executeWithRetry(
        () => this.client.get(`/internal/tickets/order/${orderId}`, { context } as any),
        2,
        'ticket-service'
      );
      return response.data.tickets || [];
    } catch (error) {
      logger.error('Error getting tickets for order', { error, orderId });
      throw error; // CRITICAL: Must throw - no fallback for security
    }
  }

  /**
   * CRITICAL: Check all tickets in order for transfers
   * Returns true only if ALL tickets are still owned by original buyer
   * NO FALLBACK - fails closed for security
   */
  async checkOrderTicketsNotTransferred(
    orderId: string,
    originalBuyerId: string,
    context?: RequestContext
  ): Promise<{ allValid: boolean; transferredTickets: string[] }> {
    try {
      const tickets = await this.getTicketsForOrder(orderId, context);
      const transferredTickets: string[] = [];

      for (const ticket of tickets) {
        if (ticket.ownerId !== originalBuyerId || ticket.hasBeenTransferred) {
          transferredTickets.push(ticket.ticketId);
        }
      }

      if (transferredTickets.length > 0) {
        logger.warn('Some tickets have been transferred - partial or no refund allowed', {
          orderId,
          originalBuyerId,
          transferredCount: transferredTickets.length,
          totalCount: tickets.length,
        });
      }

      return {
        allValid: transferredTickets.length === 0,
        transferredTickets,
      };
    } catch (error) {
      logger.error('Error checking order tickets transfer status', { error, orderId, originalBuyerId });
      // CRITICAL: Fail closed - return as if all tickets transferred
      throw error;
    }
  }
}

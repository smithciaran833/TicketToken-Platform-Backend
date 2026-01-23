/**
 * Ticket Service Client - order-service
 *
 * PHASE 5c REFACTORED:
 * Extends BaseServiceClient from @tickettoken/shared for standardized
 * HMAC auth, circuit breaker, retry, and tracing.
 *
 * Includes transfer check for refund eligibility validation.
 * Fallbacks for read operations; fail-closed for security-critical checks.
 */

import {
  BaseServiceClient,
  RequestContext,
  ServiceClientError,
} from '@tickettoken/shared';
import { logger } from '../utils/logger';

interface TicketInfo {
  ticketId: string;
  ownerId: string;
  originalBuyerId: string;
  hasBeenTransferred: boolean;
  status: string;
  eventId: string;
  ticketTypeId: string;
}

// Default fallbacks - fail closed for security, empty for non-critical
const DEFAULT_AVAILABILITY: Record<string, number> = {};
const DEFAULT_PRICES: Record<string, number> = {};

/**
 * Ticket client for order-service
 *
 * Provides ticket availability, pricing, and transfer validation.
 */
export class TicketClient extends BaseServiceClient {
  constructor() {
    super({
      baseURL: process.env.TICKET_SERVICE_URL || 'http://ticket-service:3002',
      serviceName: 'ticket-service',
      timeout: 10000,
    });
  }

  /**
   * Check ticket availability
   *
   * Returns empty availability as fallback (conservative - no tickets available)
   */
  async checkAvailability(
    ticketTypeIds: string[],
    ctx?: RequestContext
  ): Promise<Record<string, number>> {
    try {
      const context = ctx || { tenantId: 'system' };
      const response = await this.post<Record<string, number>>(
        '/internal/tickets/availability',
        context,
        { ticketTypeIds }
      );
      return response.data;
    } catch (error) {
      logger.error('Error checking ticket availability', { error, ticketTypeIds });
      return DEFAULT_AVAILABILITY;
    }
  }

  /**
   * Reserve tickets for an order
   *
   * No fallback - must fail explicitly for write operations
   */
  async reserveTickets(
    orderId: string,
    items: Array<{ ticketTypeId: string; quantity: number }>,
    ctx?: RequestContext
  ): Promise<void> {
    const context = ctx || { tenantId: 'system' };
    await this.post<void>(
      '/internal/tickets/reserve',
      context,
      { orderId, items }
    );
  }

  /**
   * Confirm ticket allocation after payment
   *
   * No fallback - must fail explicitly
   */
  async confirmAllocation(orderId: string, ctx?: RequestContext): Promise<void> {
    const context = ctx || { tenantId: 'system' };
    await this.post<void>(
      '/internal/tickets/confirm',
      context,
      { orderId }
    );
  }

  /**
   * Release reserved tickets (order cancelled/expired)
   *
   * No fallback - must fail explicitly
   */
  async releaseTickets(orderId: string, ctx?: RequestContext): Promise<void> {
    const context = ctx || { tenantId: 'system' };
    await this.post<void>(
      '/internal/tickets/release',
      context,
      { orderId }
    );
  }

  /**
   * Get ticket prices
   *
   * Returns empty prices as fallback
   */
  async getPrices(
    ticketTypeIds: string[],
    ctx?: RequestContext
  ): Promise<Record<string, number>> {
    try {
      const context = ctx || { tenantId: 'system' };
      const response = await this.post<{ prices: Record<string, number> }>(
        '/internal/tickets/prices',
        context,
        { ticketTypeIds }
      );
      return response.data.prices;
    } catch (error) {
      logger.error('Error getting ticket prices', { error, ticketTypeIds });
      return DEFAULT_PRICES;
    }
  }

  /**
   * CRITICAL: Get ticket info for transfer check before refund
   *
   * No fallback - must fail explicitly for security
   */
  async getTicket(ticketId: string, ctx?: RequestContext): Promise<TicketInfo> {
    const context = ctx || { tenantId: 'system' };
    const response = await this.get<TicketInfo>(
      `/internal/tickets/${ticketId}`,
      context
    );
    return response.data;
  }

  /**
   * CRITICAL: Check if ticket has been transferred
   *
   * Used to validate refund eligibility - prevents double spend.
   *
   * @returns true if ticket is still owned by original buyer (refund allowed)
   * @returns false if ticket has been transferred (refund NOT allowed)
   */
  async checkTicketNotTransferred(
    ticketId: string,
    originalBuyerId: string,
    ctx?: RequestContext
  ): Promise<boolean> {
    try {
      const ticket = await this.getTicket(ticketId, ctx);

      if (ticket.ownerId !== originalBuyerId) {
        logger.warn('Ticket has been transferred - refund not allowed', {
          ticketId,
          originalBuyerId,
          currentOwnerId: ticket.ownerId,
        });
        return false;
      }

      if (ticket.hasBeenTransferred) {
        logger.warn('Ticket transfer flag set - refund not allowed', {
          ticketId,
          originalBuyerId,
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error checking ticket transfer status', {
        error,
        ticketId,
        originalBuyerId,
      });
      // CRITICAL: Fail closed - if we can't verify, don't allow refund
      throw error;
    }
  }

  /**
   * Get tickets for order - used for batch transfer check
   *
   * No fallback - security critical operation
   */
  async getTicketsForOrder(
    orderId: string,
    ctx?: RequestContext
  ): Promise<TicketInfo[]> {
    const context = ctx || { tenantId: 'system' };
    const response = await this.get<{ tickets: TicketInfo[] }>(
      `/internal/tickets/order/${orderId}`,
      context
    );
    return response.data.tickets || [];
  }

  /**
   * CRITICAL: Check all tickets in order for transfers
   *
   * Returns true only if ALL tickets are still owned by original buyer.
   * No fallback - fails closed for security.
   */
  async checkOrderTicketsNotTransferred(
    orderId: string,
    originalBuyerId: string,
    ctx?: RequestContext
  ): Promise<{ allValid: boolean; transferredTickets: string[] }> {
    const tickets = await this.getTicketsForOrder(orderId, ctx);
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
  }
}

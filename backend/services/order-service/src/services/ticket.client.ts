import axios from 'axios';
import { logger } from '../utils/logger';
import { createCircuitBreaker } from '../utils/circuit-breaker';

const TICKET_SERVICE_URL = process.env.TICKET_SERVICE_URL || 'http://tickettoken-ticket:3004';

export class TicketClient {
  private checkAvailabilityBreaker;
  private reserveTicketsBreaker;
  private confirmAllocationBreaker;
  private releaseTicketsBreaker;
  private getPricesBreaker;

  constructor() {
    this.checkAvailabilityBreaker = createCircuitBreaker(
      this._checkAvailability.bind(this),
      { name: 'ticket-service-check-availability', timeout: 3000 }
    );

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

    this.getPricesBreaker = createCircuitBreaker(
      this._getPrices.bind(this),
      { name: 'ticket-service-get-prices', timeout: 3000 }
    );
  }

  private async _checkAvailability(ticketTypeIds: string[]): Promise<Record<string, number>> {
    const response = await axios.post(`${TICKET_SERVICE_URL}/internal/tickets/availability`, {
      ticketTypeIds,
    });
    return response.data;
  }

  async checkAvailability(ticketTypeIds: string[]): Promise<Record<string, number>> {
    try {
      return await this.checkAvailabilityBreaker.fire(ticketTypeIds);
    } catch (error) {
      logger.error('Error checking ticket availability', { error, ticketTypeIds });
      throw error;
    }
  }

  private async _reserveTickets(orderId: string, items: Array<{ ticketTypeId: string; quantity: number }>): Promise<void> {
    await axios.post(`${TICKET_SERVICE_URL}/internal/tickets/reserve`, {
      orderId,
      items,
    });
  }

  async reserveTickets(orderId: string, items: Array<{ ticketTypeId: string; quantity: number }>): Promise<void> {
    try {
      await this.reserveTicketsBreaker.fire(orderId, items);
    } catch (error) {
      logger.error('Error reserving tickets', { error, orderId, items });
      throw error;
    }
  }

  private async _confirmAllocation(orderId: string): Promise<void> {
    await axios.post(`${TICKET_SERVICE_URL}/internal/tickets/confirm`, {
      orderId,
    });
  }

  async confirmAllocation(orderId: string): Promise<void> {
    try {
      await this.confirmAllocationBreaker.fire(orderId);
    } catch (error) {
      logger.error('Error confirming ticket allocation', { error, orderId });
      throw error;
    }
  }

  private async _releaseTickets(orderId: string): Promise<void> {
    await axios.post(`${TICKET_SERVICE_URL}/internal/tickets/release`, {
      orderId,
    });
  }

  async releaseTickets(orderId: string): Promise<void> {
    try {
      await this.releaseTicketsBreaker.fire(orderId);
    } catch (error) {
      logger.error('Error releasing tickets', { error, orderId });
      throw error;
    }
  }

  private async _getPrices(ticketTypeIds: string[]): Promise<Record<string, number>> {
    const response = await axios.post(`${TICKET_SERVICE_URL}/internal/tickets/prices`, {
      ticketTypeIds,
    });
    return response.data.prices;
  }

  async getPrices(ticketTypeIds: string[]): Promise<Record<string, number>> {
    try {
      return await this.getPricesBreaker.fire(ticketTypeIds);
    } catch (error) {
      logger.error('Error getting ticket prices', { error, ticketTypeIds });
      throw error;
    }
  }
}

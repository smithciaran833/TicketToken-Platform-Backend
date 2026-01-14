/**
 * Unit Tests: Ticket Client
 * Tests ticket service client including transfer checks, circuit breaker, and fail-closed security
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/utils/http-client.util', () => ({
  createSecureServiceClient: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
  })),
  executeWithRetry: jest.fn(),
  getServiceUrl: jest.fn(() => 'http://localhost:3004'),
}));

jest.mock('../../../src/utils/circuit-breaker', () => ({
  createCircuitBreaker: jest.fn((fn, options) => ({
    fire: jest.fn((...args) => fn(...args)),
    getState: jest.fn(() => 'CLOSED'),
    isOpen: jest.fn(() => false),
    reset: jest.fn(),
  })),
}));

import { TicketClient } from '../../../src/services/ticket.client';
import { executeWithRetry } from '../../../src/utils/http-client.util';
import { logger } from '../../../src/utils/logger';

describe('TicketClient', () => {
  let client: TicketClient;
  let mockExecuteWithRetry: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteWithRetry = executeWithRetry as jest.Mock;
    client = new TicketClient();
  });

  // ============================================
  // Constructor
  // ============================================
  describe('constructor', () => {
    it('should create secure service client', () => {
      const { createSecureServiceClient } = require('../../../src/utils/http-client.util');
      expect(createSecureServiceClient).toHaveBeenCalledWith({
        baseUrl: expect.any(String),
        serviceName: 'ticket-service',
        timeout: 10000,
      });
    });

    it('should create circuit breakers for all operations', () => {
      const { createCircuitBreaker } = require('../../../src/utils/circuit-breaker');
      const breakerNames = createCircuitBreaker.mock.calls.map((call: any) => call[1].name);
      
      expect(breakerNames).toContain('ticket-service-check-availability');
      expect(breakerNames).toContain('ticket-service-reserve');
      expect(breakerNames).toContain('ticket-service-confirm');
      expect(breakerNames).toContain('ticket-service-release');
      expect(breakerNames).toContain('ticket-service-get-prices');
      expect(breakerNames).toContain('ticket-service-get-ticket');
    });

    it('should configure fallbacks for read operations only', () => {
      const { createCircuitBreaker } = require('../../../src/utils/circuit-breaker');
      
      const availabilityCall = createCircuitBreaker.mock.calls.find(
        (call: any) => call[1].name === 'ticket-service-check-availability'
      );
      expect(availabilityCall[1].fallback).toBeDefined();

      const pricesCall = createCircuitBreaker.mock.calls.find(
        (call: any) => call[1].name === 'ticket-service-get-prices'
      );
      expect(pricesCall[1].fallback).toBeDefined();

      // Write operations should NOT have fallbacks
      const reserveCall = createCircuitBreaker.mock.calls.find(
        (call: any) => call[1].name === 'ticket-service-reserve'
      );
      expect(reserveCall[1].fallback).toBeUndefined();
    });
  });

  // ============================================
  // checkAvailability
  // ============================================
  describe('checkAvailability', () => {
    it('should return availability map on success', async () => {
      const availability = { 'type-1': 100, 'type-2': 50 };
      mockExecuteWithRetry.mockResolvedValue({ data: availability });

      const result = await client.checkAvailability(['type-1', 'type-2']);

      expect(result).toEqual(availability);
    });

    it('should return empty map on error (fallback)', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Service unavailable'));

      const result = await client.checkAvailability(['type-1']);

      expect(result).toEqual({});
    });

    it('should log error when service fails', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Timeout'));

      await client.checkAvailability(['type-1']);

      expect(logger.error).toHaveBeenCalledWith(
        'Error checking ticket availability',
        expect.objectContaining({ ticketTypeIds: ['type-1'] })
      );
    });
  });

  // ============================================
  // reserveTickets
  // ============================================
  describe('reserveTickets', () => {
    const items = [{ ticketTypeId: 'type-1', quantity: 2 }];

    it('should reserve tickets successfully', async () => {
      mockExecuteWithRetry.mockResolvedValue({});

      await expect(client.reserveTickets('order-123', items)).resolves.toBeUndefined();
    });

    it('should throw error on failure (no fallback)', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Reservation failed'));

      await expect(client.reserveTickets('order-123', items)).rejects.toThrow('Reservation failed');
    });

    it('should use 3 retries', async () => {
      mockExecuteWithRetry.mockResolvedValue({});

      await client.reserveTickets('order-123', items);

      expect(mockExecuteWithRetry).toHaveBeenCalledWith(
        expect.any(Function),
        3,
        'ticket-service'
      );
    });
  });

  // ============================================
  // confirmAllocation
  // ============================================
  describe('confirmAllocation', () => {
    it('should confirm allocation successfully', async () => {
      mockExecuteWithRetry.mockResolvedValue({});

      await expect(client.confirmAllocation('order-123')).resolves.toBeUndefined();
    });

    it('should throw error on failure (no fallback)', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Confirm failed'));

      await expect(client.confirmAllocation('order-123')).rejects.toThrow('Confirm failed');
    });
  });

  // ============================================
  // releaseTickets
  // ============================================
  describe('releaseTickets', () => {
    it('should release tickets successfully', async () => {
      mockExecuteWithRetry.mockResolvedValue({});

      await expect(client.releaseTickets('order-123')).resolves.toBeUndefined();
    });

    it('should throw error on failure (no fallback)', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Release failed'));

      await expect(client.releaseTickets('order-123')).rejects.toThrow('Release failed');
    });

    it('should use 2 retries', async () => {
      mockExecuteWithRetry.mockResolvedValue({});

      await client.releaseTickets('order-123');

      expect(mockExecuteWithRetry).toHaveBeenCalledWith(
        expect.any(Function),
        2,
        'ticket-service'
      );
    });
  });

  // ============================================
  // getPrices
  // ============================================
  describe('getPrices', () => {
    it('should return prices on success', async () => {
      const prices = { 'type-1': 5000, 'type-2': 7500 };
      mockExecuteWithRetry.mockResolvedValue({ data: { prices } });

      const result = await client.getPrices(['type-1', 'type-2']);

      expect(result).toEqual(prices);
    });

    it('should return empty map on error (fallback)', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Service unavailable'));

      const result = await client.getPrices(['type-1']);

      expect(result).toEqual({});
    });
  });

  // ============================================
  // getTicket
  // ============================================
  describe('getTicket', () => {
    const ticketInfo = {
      ticketId: 'ticket-123',
      ownerId: 'user-456',
      originalBuyerId: 'user-456',
      hasBeenTransferred: false,
      status: 'valid',
      eventId: 'event-789',
      ticketTypeId: 'type-1',
    };

    it('should return ticket info on success', async () => {
      mockExecuteWithRetry.mockResolvedValue({ data: ticketInfo });

      const result = await client.getTicket('ticket-123');

      expect(result).toEqual(ticketInfo);
    });

    it('should throw error on failure (no fallback - security critical)', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Service unavailable'));

      await expect(client.getTicket('ticket-123')).rejects.toThrow('Service unavailable');
    });

    it('should log error on failure', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Failed'));

      await expect(client.getTicket('ticket-123')).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        'Error getting ticket',
        expect.objectContaining({ ticketId: 'ticket-123' })
      );
    });
  });

  // ============================================
  // checkTicketNotTransferred
  // ============================================
  describe('checkTicketNotTransferred', () => {
    it('should return true when ticket not transferred', async () => {
      const ticketInfo = {
        ticketId: 'ticket-123',
        ownerId: 'user-456',
        originalBuyerId: 'user-456',
        hasBeenTransferred: false,
        status: 'valid',
        eventId: 'event-789',
        ticketTypeId: 'type-1',
      };
      mockExecuteWithRetry.mockResolvedValue({ data: ticketInfo });

      const result = await client.checkTicketNotTransferred('ticket-123', 'user-456');

      expect(result).toBe(true);
    });

    it('should return false when owner changed', async () => {
      const ticketInfo = {
        ticketId: 'ticket-123',
        ownerId: 'user-789', // Different owner
        originalBuyerId: 'user-456',
        hasBeenTransferred: true,
        status: 'valid',
        eventId: 'event-789',
        ticketTypeId: 'type-1',
      };
      mockExecuteWithRetry.mockResolvedValue({ data: ticketInfo });

      const result = await client.checkTicketNotTransferred('ticket-123', 'user-456');

      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        'Ticket has been transferred - refund not allowed',
        expect.any(Object)
      );
    });

    it('should return false when transfer flag is set', async () => {
      const ticketInfo = {
        ticketId: 'ticket-123',
        ownerId: 'user-456',
        originalBuyerId: 'user-456',
        hasBeenTransferred: true, // Flag set even though owner matches
        status: 'valid',
        eventId: 'event-789',
        ticketTypeId: 'type-1',
      };
      mockExecuteWithRetry.mockResolvedValue({ data: ticketInfo });

      const result = await client.checkTicketNotTransferred('ticket-123', 'user-456');

      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        'Ticket transfer flag set - refund not allowed',
        expect.any(Object)
      );
    });

    it('should throw error when service unavailable (fail closed)', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Service unavailable'));

      await expect(
        client.checkTicketNotTransferred('ticket-123', 'user-456')
      ).rejects.toThrow('Service unavailable');
    });
  });

  // ============================================
  // getTicketsForOrder
  // ============================================
  describe('getTicketsForOrder', () => {
    it('should return tickets for order', async () => {
      const tickets = [
        { ticketId: 'ticket-1', ownerId: 'user-456', hasBeenTransferred: false },
        { ticketId: 'ticket-2', ownerId: 'user-456', hasBeenTransferred: false },
      ];
      mockExecuteWithRetry.mockResolvedValue({ data: { tickets } });

      const result = await client.getTicketsForOrder('order-123');

      expect(result).toEqual(tickets);
    });

    it('should return empty array when no tickets field', async () => {
      mockExecuteWithRetry.mockResolvedValue({ data: {} });

      const result = await client.getTicketsForOrder('order-123');

      expect(result).toEqual([]);
    });

    it('should throw error on failure (security critical)', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Service unavailable'));

      await expect(client.getTicketsForOrder('order-123')).rejects.toThrow('Service unavailable');
    });
  });

  // ============================================
  // checkOrderTicketsNotTransferred
  // ============================================
  describe('checkOrderTicketsNotTransferred', () => {
    it('should return allValid=true when no transfers', async () => {
      const tickets = [
        { ticketId: 'ticket-1', ownerId: 'user-456', originalBuyerId: 'user-456', hasBeenTransferred: false },
        { ticketId: 'ticket-2', ownerId: 'user-456', originalBuyerId: 'user-456', hasBeenTransferred: false },
      ];
      mockExecuteWithRetry.mockResolvedValue({ data: { tickets } });

      const result = await client.checkOrderTicketsNotTransferred('order-123', 'user-456');

      expect(result.allValid).toBe(true);
      expect(result.transferredTickets).toEqual([]);
    });

    it('should return transferred tickets list', async () => {
      const tickets = [
        { ticketId: 'ticket-1', ownerId: 'user-456', originalBuyerId: 'user-456', hasBeenTransferred: false },
        { ticketId: 'ticket-2', ownerId: 'user-789', originalBuyerId: 'user-456', hasBeenTransferred: true },
        { ticketId: 'ticket-3', ownerId: 'user-456', originalBuyerId: 'user-456', hasBeenTransferred: true },
      ];
      mockExecuteWithRetry.mockResolvedValue({ data: { tickets } });

      const result = await client.checkOrderTicketsNotTransferred('order-123', 'user-456');

      expect(result.allValid).toBe(false);
      expect(result.transferredTickets).toContain('ticket-2');
      expect(result.transferredTickets).toContain('ticket-3');
      expect(result.transferredTickets).not.toContain('ticket-1');
    });

    it('should log warning when transfers found', async () => {
      const tickets = [
        { ticketId: 'ticket-1', ownerId: 'user-789', originalBuyerId: 'user-456', hasBeenTransferred: true },
      ];
      mockExecuteWithRetry.mockResolvedValue({ data: { tickets } });

      await client.checkOrderTicketsNotTransferred('order-123', 'user-456');

      expect(logger.warn).toHaveBeenCalledWith(
        'Some tickets have been transferred - partial or no refund allowed',
        expect.objectContaining({
          orderId: 'order-123',
          transferredCount: 1,
          totalCount: 1,
        })
      );
    });

    it('should throw error when service unavailable (fail closed)', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Service unavailable'));

      await expect(
        client.checkOrderTicketsNotTransferred('order-123', 'user-456')
      ).rejects.toThrow('Service unavailable');
    });
  });
});

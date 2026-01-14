/**
 * Unit Tests for ticket-lookup.service.ts
 * Tests ticket validation and lookup from ticket-service
 */

import { ticketLookupService } from '../../../src/services/ticket-lookup.service';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/utils/circuit-breaker', () => ({
  withCircuitBreakerAndRetry: jest.fn((_, fn) => fn()),
}));

jest.mock('../../../src/middleware/internal-auth', () => ({
  buildInternalHeaders: jest.fn(() => ({
    'x-internal-auth': 'mock-signature',
    'x-request-id': 'mock-request-id',
  })),
}));

jest.mock('../../../src/config/redis', () => ({
  getRedis: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  })),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { getRedis } from '../../../src/config/redis';

describe('TicketLookupService', () => {
  const mockRedis = getRedis() as jest.Mocked<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('getTicketDetails', () => {
    it('should return ticket details from ticket service', async () => {
      const mockTicket = {
        id: 'ticket-123',
        event_id: 'event-456',
        owner_id: 'user-789',
        face_value: 10000,
        seat_info: { section: 'A', row: '1', seat: '5' },
        status: 'valid',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTicket),
      });

      const ticket = await ticketLookupService.getTicketDetails('ticket-123');

      expect(ticket).toBeDefined();
      expect(ticket!.id).toBe('ticket-123');
      expect(ticket!.face_value).toBe(10000);
    });

    it('should return null for non-existent ticket', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Not found' }),
      });

      const ticket = await ticketLookupService.getTicketDetails('non-existent');

      expect(ticket).toBeNull();
    });

    it('should use cache when available', async () => {
      const cachedTicket = {
        id: 'ticket-123',
        event_id: 'event-456',
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedTicket));

      const ticket = await ticketLookupService.getTicketDetails('ticket-123');

      expect(ticket).toBeDefined();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should cache ticket after fetching', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'ticket-123' }),
      });

      await ticketLookupService.getTicketDetails('ticket-123');

      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should handle service errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const ticket = await ticketLookupService.getTicketDetails('ticket-123');

      expect(ticket).toBeNull();
    });
  });

  describe('validateTicketOwnership', () => {
    it('should return true if user owns the ticket', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'ticket-123',
          owner_id: 'user-123',
        }),
      });

      const isOwner = await ticketLookupService.validateTicketOwnership(
        'ticket-123',
        'user-123'
      );

      expect(isOwner).toBe(true);
    });

    it('should return false if user does not own the ticket', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'ticket-123',
          owner_id: 'other-user',
        }),
      });

      const isOwner = await ticketLookupService.validateTicketOwnership(
        'ticket-123',
        'user-123'
      );

      expect(isOwner).toBe(false);
    });

    it('should return false if ticket not found', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const isOwner = await ticketLookupService.validateTicketOwnership(
        'non-existent',
        'user-123'
      );

      expect(isOwner).toBe(false);
    });
  });

  describe('getTicketsByEvent', () => {
    it('should return tickets for an event', async () => {
      const mockTickets = [
        { id: 'ticket-1', event_id: 'event-123' },
        { id: 'ticket-2', event_id: 'event-123' },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tickets: mockTickets, total: 2 }),
      });

      const result = await ticketLookupService.getTicketsByEvent('event-123');

      expect(result.tickets).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should return empty array for event with no tickets', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tickets: [], total: 0 }),
      });

      const result = await ticketLookupService.getTicketsByEvent('event-123');

      expect(result.tickets).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('getTicketsByUser', () => {
    it('should return tickets owned by user', async () => {
      const mockTickets = [
        { id: 'ticket-1', owner_id: 'user-123' },
        { id: 'ticket-2', owner_id: 'user-123' },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tickets: mockTickets, total: 2 }),
      });

      const result = await ticketLookupService.getTicketsByUser('user-123');

      expect(result.tickets).toHaveLength(2);
    });

    it('should apply pagination', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tickets: [], total: 0 }),
      });

      await ticketLookupService.getTicketsByUser('user-123', { page: 2, limit: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('page=2'),
        expect.any(Object)
      );
    });
  });

  describe('getTicketFaceValue', () => {
    it('should return face value from ticket', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'ticket-123',
          face_value: 5000,
        }),
      });

      const faceValue = await ticketLookupService.getTicketFaceValue('ticket-123');

      expect(faceValue).toBe(5000);
    });

    it('should return 0 if ticket not found', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const faceValue = await ticketLookupService.getTicketFaceValue('non-existent');

      expect(faceValue).toBe(0);
    });
  });

  describe('invalidateTicketCache', () => {
    it('should delete ticket from cache', async () => {
      await ticketLookupService.invalidateTicketCache('ticket-123');

      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining('ticket-123')
      );
    });
  });

  describe('Service export', () => {
    it('should export ticketLookupService object', () => {
      expect(ticketLookupService).toBeDefined();
      expect(ticketLookupService.getTicketDetails).toBeDefined();
      expect(ticketLookupService.validateTicketOwnership).toBeDefined();
      expect(ticketLookupService.getTicketsByEvent).toBeDefined();
    });
  });
});

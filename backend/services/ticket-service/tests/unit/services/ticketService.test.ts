/**
 * Unit Tests for src/services/ticketService.ts
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    query: jest.fn(),
    transaction: jest.fn(),
  },
}));

jest.mock('../../../src/services/redisService', () => ({
  RedisService: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../../../src/services/queueService', () => ({
  QueueService: {
    publish: jest.fn(),
  },
}));

jest.mock('../../../src/utils/tenant-db', () => ({
  withTenantContext: jest.fn((tenantId, fn) => fn()),
  setTenantContext: jest.fn(),
  isValidTenantId: jest.fn().mockReturnValue(true),
}));

jest.mock('@tickettoken/shared', () => ({
  withLock: jest.fn((key, timeout, fn) => fn()),
  LockKeys: {
    inventory: jest.fn((eventId, typeId) => `lock:inventory:${eventId}:${typeId}`),
    reservation: jest.fn((id) => `lock:reservation:${id}`),
  },
  LockTimeoutError: class extends Error { constructor(msg: string) { super(msg); } },
  LockContentionError: class extends Error { constructor(msg: string) { super(msg); } },
  LockSystemError: class extends Error { constructor(msg: string) { super(msg); } },
  QUEUES: { TICKET_MINT: 'ticket.mint' },
}));

jest.mock('../../../src/config', () => ({
  config: {
    limits: { reservationTimeout: 600 },
    redis: { ttl: { reservation: 600, cache: 3600 } },
  },
}));

import {
  TicketService,
  ticketService,
  validateStateTransition,
  VALID_TRANSITIONS,
} from '../../../src/services/ticketService';
import { DatabaseService } from '../../../src/services/databaseService';
import { RedisService } from '../../../src/services/redisService';

describe('services/ticketService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('VALID_TRANSITIONS', () => {
    it('defines transitions for all statuses', () => {
      expect(VALID_TRANSITIONS).toHaveProperty('available');
      expect(VALID_TRANSITIONS).toHaveProperty('reserved');
      expect(VALID_TRANSITIONS).toHaveProperty('sold');
      expect(VALID_TRANSITIONS).toHaveProperty('active');
    });

    it('terminal states have empty transitions', () => {
      expect(VALID_TRANSITIONS['checked_in']).toEqual([]);
      expect(VALID_TRANSITIONS['used']).toEqual([]);
      expect(VALID_TRANSITIONS['refunded']).toEqual([]);
    });
  });

  describe('validateStateTransition()', () => {
    it('allows valid transition', () => {
      expect(() => validateStateTransition('active', 'checked_in')).not.toThrow();
    });

    it('throws for invalid transition', () => {
      expect(() => validateStateTransition('sold', 'checked_in')).toThrow();
    });

    it('throws for unknown from status', () => {
      expect(() => validateStateTransition('unknown', 'active')).toThrow('Unknown ticket status');
    });

    it('throws for unknown to status', () => {
      expect(() => validateStateTransition('active', 'unknown')).toThrow('Unknown target status');
    });

    it('throws for terminal status transition', () => {
      expect(() => validateStateTransition('checked_in', 'active')).toThrow('terminal');
    });

    it('normalizes uppercase statuses', () => {
      expect(() => validateStateTransition('ACTIVE', 'CHECKED_IN')).not.toThrow();
    });
  });

  describe('getTicket()', () => {
    it('returns cached ticket if available', async () => {
      const cachedTicket = { id: 'ticket-123', status: 'active' };
      (RedisService.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(cachedTicket));

      const result = await ticketService.getTicket('ticket-123');

      expect(result).toEqual(cachedTicket);
      expect(DatabaseService.query).not.toHaveBeenCalled();
    });

    it('queries database on cache miss', async () => {
      (RedisService.get as jest.Mock).mockResolvedValueOnce(null);
      const dbTicket = { id: 'ticket-123', status: 'active' };
      (DatabaseService.query as jest.Mock).mockResolvedValueOnce({ rows: [dbTicket] });

      const result = await ticketService.getTicket('ticket-123');

      expect(result).toEqual(dbTicket);
      expect(DatabaseService.query).toHaveBeenCalled();
    });

    it('throws NotFoundError when ticket not found', async () => {
      (RedisService.get as jest.Mock).mockResolvedValueOnce(null);
      (DatabaseService.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await expect(ticketService.getTicket('nonexistent')).rejects.toThrow('not found');
    });

    it('caches ticket after database fetch', async () => {
      (RedisService.get as jest.Mock).mockResolvedValueOnce(null);
      const dbTicket = { id: 'ticket-123', status: 'active' };
      (DatabaseService.query as jest.Mock).mockResolvedValueOnce({ rows: [dbTicket] });

      await ticketService.getTicket('ticket-123');

      expect(RedisService.set).toHaveBeenCalledWith(
        'ticket:ticket-123',
        JSON.stringify(dbTicket),
        expect.any(Number)
      );
    });

    it('filters by tenantId when provided', async () => {
      (RedisService.get as jest.Mock).mockResolvedValueOnce(null);
      (DatabaseService.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'ticket-123' }] });

      await ticketService.getTicket('ticket-123', 'tenant-456');

      expect(DatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id'),
        ['ticket-123', 'tenant-456']
      );
    });
  });

  describe('checkAvailability()', () => {
    it('returns true when enough tickets available', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ available_quantity: 10 }],
      });

      const result = await ticketService.checkAvailability('event-1', 'type-1', 5);

      expect(result).toBe(true);
    });

    it('returns false when not enough tickets', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ available_quantity: 3 }],
      });

      const result = await ticketService.checkAvailability('event-1', 'type-1', 5);

      expect(result).toBe(false);
    });

    it('throws NotFoundError when ticket type not found', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await expect(
        ticketService.checkAvailability('event-1', 'nonexistent', 1)
      ).rejects.toThrow('not found');
    });
  });

  describe('updateTicketStatus()', () => {
    it('validates state transition before update', async () => {
      (DatabaseService.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ status: 'active' }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await ticketService.updateTicketStatus('ticket-123', 'checked_in' as any);

      expect(DatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tickets'),
        ['checked_in', 'ticket-123']
      );
    });

    it('throws NotFoundError when ticket not found', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await expect(
        ticketService.updateTicketStatus('nonexistent', 'active' as any)
      ).rejects.toThrow('not found');
    });

    it('clears cache after update', async () => {
      (DatabaseService.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ status: 'active' }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await ticketService.updateTicketStatus('ticket-123', 'checked_in' as any);

      expect(RedisService.del).toHaveBeenCalledWith('ticket:ticket-123');
    });

    it('allows skipping validation with skipValidation option', async () => {
      (DatabaseService.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ status: 'checked_in' }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      // Normally this would throw, but skipValidation allows it
      await ticketService.updateTicketStatus('ticket-123', 'active' as any, {
        skipValidation: true,
        reason: 'Admin override',
      });

      expect(DatabaseService.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('getTicketTypes()', () => {
    it('returns ticket types for event', async () => {
      const mockTypes = [
        { id: 'type-1', name: 'VIP', price: 100 },
        { id: 'type-2', name: 'General', price: 50 },
      ];
      (DatabaseService.query as jest.Mock).mockResolvedValueOnce({ rows: mockTypes });

      const result = await ticketService.getTicketTypes('event-123', 'tenant-456');

      expect(result).toEqual(mockTypes);
      expect(DatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('ticket_types'),
        ['event-123', 'tenant-456']
      );
    });
  });

  describe('getUserTickets()', () => {
    it('returns user tickets within tenant context', async () => {
      const mockTickets = [{ id: 'ticket-1' }, { id: 'ticket-2' }];
      (DatabaseService.query as jest.Mock).mockResolvedValueOnce({ rows: mockTickets });

      const result = await ticketService.getUserTickets('user-123', 'tenant-456');

      expect(result).toEqual(mockTickets);
    });

    it('filters by eventId when provided', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await ticketService.getUserTickets('user-123', 'tenant-456', 'event-789');

      expect(DatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('event_id'),
        ['user-123', 'tenant-456', 'event-789']
      );
    });
  });
});

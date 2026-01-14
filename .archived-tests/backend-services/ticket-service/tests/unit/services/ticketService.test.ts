import { TicketService, ticketService } from '../../../src/services/ticketService';
import { QueueService } from '../../../src/services/queueService';
import { DatabaseService } from '../../../src/services/databaseService';
import { RedisService } from '../../../src/services/redisService';
import { withLock, LockKeys, LockTimeoutError, LockContentionError, LockSystemError } from '@tickettoken/shared';
import { QUEUES } from '@tickettoken/shared';
import { NotFoundError, ConflictError } from '../../../src/utils/errors';
import { logger } from '../../../src/utils/logger';
import { config } from '../../../src/config';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { TicketStatus } from '../../../src/types';

// =============================================================================
// MOCKS
// =============================================================================

jest.mock('../../../src/services/queueService');
jest.mock('../../../src/services/databaseService');
jest.mock('../../../src/services/redisService');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/config');
jest.mock('qrcode');
jest.mock('@tickettoken/shared', () => ({
  ...jest.requireActual('@tickettoken/shared'),
  withLock: jest.fn(),
  LockKeys: {
    inventory: jest.fn(),
    reservation: jest.fn(),
  },
  LockTimeoutError: class LockTimeoutError extends Error {
    timeoutMs: number;
    constructor(message: string, timeoutMs: number) {
      super(message);
      this.timeoutMs = timeoutMs;
    }
  },
  LockContentionError: class LockContentionError extends Error {},
  LockSystemError: class LockSystemError extends Error {
    originalError?: Error;
    constructor(message: string, originalError?: Error) {
      super(message);
      this.originalError = originalError;
    }
  },
}));

// =============================================================================
// TEST SUITE
// =============================================================================

describe('TicketService', () => {
  let service: TicketService;
  let mockLogger: any;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      child: jest.fn().mockReturnThis(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    (logger.child as jest.Mock).mockReturnValue(mockLogger);

    (config as any).limits = { reservationTimeout: 300 };
    (config as any).redis = { ttl: { reservation: 300, cache: 600 } };

    mockClient = {
      query: jest.fn(),
    };

    service = new TicketService();
  });

  // =============================================================================
  // createTicketType() - 8 test cases
  // =============================================================================

  describe('createTicketType()', () => {
    const mockTicketTypeData = {
      tenant_id: 'tenant-123',
      eventId: 'event-456',
      name: 'VIP Ticket',
      description: 'VIP access',
      priceCents: 10000,
      quantity: 100,
      maxPerPurchase: 4,
      saleStartDate: new Date(),
      saleEndDate: new Date(),
      metadata: { section: 'A' },
    };

    it('should create ticket type successfully', async () => {
      const mockResult = {
        rows: [{ id: 'ticket-type-123', ...mockTicketTypeData }],
        rowCount: 1,
      };

      (DatabaseService.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.createTicketType(mockTicketTypeData);

      expect(result).toEqual(mockResult.rows[0]);
      expect(DatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ticket_types'),
        expect.arrayContaining([
          expect.any(String),
          mockTicketTypeData.tenant_id,
          mockTicketTypeData.eventId,
          mockTicketTypeData.name,
        ])
      );
    });

    it('should generate UUID for ticket type id', async () => {
      const mockResult = {
        rows: [{ id: 'generated-uuid', ...mockTicketTypeData }],
        rowCount: 1,
      };

      (DatabaseService.query as jest.Mock).mockResolvedValue(mockResult);

      await service.createTicketType(mockTicketTypeData);

      const queryCall = (DatabaseService.query as jest.Mock).mock.calls[0];
      const idParam = queryCall[1][0];
      expect(typeof idParam).toBe('string');
      expect(idParam.length).toBeGreaterThan(0);
    });

    it('should set available_quantity equal to quantity', async () => {
      const mockResult = {
        rows: [{ id: 'ticket-type-123', quantity: 100, available_quantity: 100 }],
        rowCount: 1,
      };

      (DatabaseService.query as jest.Mock).mockResolvedValue(mockResult);

      await service.createTicketType(mockTicketTypeData);

      const queryCall = (DatabaseService.query as jest.Mock).mock.calls[0];
      const quantityParam = queryCall[1][6];
      const availableParam = queryCall[1][7];
      expect(quantityParam).toEqual(availableParam);
    });

    it('should handle null description', async () => {
      const dataWithoutDesc = { ...mockTicketTypeData, description: undefined };
      const mockResult = {
        rows: [{ id: 'ticket-type-123', ...dataWithoutDesc, description: null }],
        rowCount: 1,
      };

      (DatabaseService.query as jest.Mock).mockResolvedValue(mockResult);

      await service.createTicketType(dataWithoutDesc);

      const queryCall = (DatabaseService.query as jest.Mock).mock.calls[0];
      const descParam = queryCall[1][4];
      expect(descParam).toBeNull();
    });

    it('should stringify metadata as JSON', async () => {
      const mockResult = {
        rows: [{ id: 'ticket-type-123', ...mockTicketTypeData }],
        rowCount: 1,
      };

      (DatabaseService.query as jest.Mock).mockResolvedValue(mockResult);

      await service.createTicketType(mockTicketTypeData);

      const queryCall = (DatabaseService.query as jest.Mock).mock.calls[0];
      const metadataParam = queryCall[1][11];
      expect(typeof metadataParam).toBe('string');
      expect(JSON.parse(metadataParam)).toEqual(mockTicketTypeData.metadata);
    });

    it('should use empty object for missing metadata', async () => {
      const dataWithoutMeta = { ...mockTicketTypeData, metadata: undefined };
      const mockResult = {
        rows: [{ id: 'ticket-type-123', ...dataWithoutMeta }],
        rowCount: 1,
      };

      (DatabaseService.query as jest.Mock).mockResolvedValue(mockResult);

      await service.createTicketType(dataWithoutMeta);

      const queryCall = (DatabaseService.query as jest.Mock).mock.calls[0];
      const metadataParam = queryCall[1][11];
      expect(JSON.parse(metadataParam)).toEqual({});
    });

    it('should include all required fields in insert', async () => {
      const mockResult = {
        rows: [{ id: 'ticket-type-123', ...mockTicketTypeData }],
        rowCount: 1,
      };

      (DatabaseService.query as jest.Mock).mockResolvedValue(mockResult);

      await service.createTicketType(mockTicketTypeData);

      const query = (DatabaseService.query as jest.Mock).mock.calls[0][0];
      expect(query).toContain('tenant_id');
      expect(query).toContain('event_id');
      expect(query).toContain('name');
      expect(query).toContain('price_cents');
      expect(query).toContain('quantity');
      expect(query).toContain('available_quantity');
      expect(query).toContain('max_per_purchase');
    });

    it('should throw error if database insert fails', async () => {
      const dbError = new Error('Database error');
      (DatabaseService.query as jest.Mock).mockRejectedValue(dbError);

      await expect(service.createTicketType(mockTicketTypeData)).rejects.toThrow('Database error');
    });
  });

  // =============================================================================
  // getTicketTypes() - 6 test cases
  // =============================================================================

  describe('getTicketTypes()', () => {
    const eventId = 'event-123';
    const tenantId = 'tenant-456';

    it('should return ticket types for event', async () => {
      const mockTypes = [
        { id: 'type-1', name: 'General', price_cents: 5000 },
        { id: 'type-2', name: 'VIP', price_cents: 10000 },
      ];

      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: mockTypes,
        rowCount: 2,
      });

      const result = await service.getTicketTypes(eventId, tenantId);

      expect(result).toEqual(mockTypes);
      expect(DatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM ticket_types'),
        [eventId, tenantId]
      );
    });

    it('should filter by event_id and tenant_id', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 });

      await service.getTicketTypes(eventId, tenantId);

      const query = (DatabaseService.query as jest.Mock).mock.calls[0][0];
      expect(query).toContain('WHERE event_id = $1 AND tenant_id = $2');
    });

    it('should order by price ascending', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 });

      await service.getTicketTypes(eventId, tenantId);

      const query = (DatabaseService.query as jest.Mock).mock.calls[0][0];
      expect(query).toContain('ORDER BY price_cents ASC');
    });

    it('should return empty array if no types found', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await service.getTicketTypes(eventId, tenantId);

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Query failed');
      (DatabaseService.query as jest.Mock).mockRejectedValue(dbError);

      await expect(service.getTicketTypes(eventId, tenantId)).rejects.toThrow('Query failed');
    });

    it('should return multiple ticket types', async () => {
      const mockTypes = Array.from({ length: 5 }, (_, i) => ({
        id: `type-${i}`,
        name: `Type ${i}`,
        price_cents: 1000 * (i + 1),
      }));

      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: mockTypes,
        rowCount: 5,
      });

      const result = await service.getTicketTypes(eventId, tenantId);

      expect(result).toHaveLength(5);
      expect(result).toEqual(mockTypes);
    });
  });

  // =============================================================================
  // checkAvailability() - 8 test cases
  // =============================================================================

  describe('checkAvailability()', () => {
    const eventId = 'event-123';
    const ticketTypeId = 'type-456';

    it('should return true if enough tickets available', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ available_quantity: 50 }],
        rowCount: 1,
      });

      const result = await service.checkAvailability(eventId, ticketTypeId, 10);

      expect(result).toBe(true);
    });

    it('should return false if not enough tickets available', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ available_quantity: 5 }],
        rowCount: 1,
      });

      const result = await service.checkAvailability(eventId, ticketTypeId, 10);

      expect(result).toBe(false);
    });

    it('should return true if exact quantity available', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ available_quantity: 10 }],
        rowCount: 1,
      });

      const result = await service.checkAvailability(eventId, ticketTypeId, 10);

      expect(result).toBe(true);
    });

    it('should throw NotFoundError if ticket type does not exist', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await expect(
        service.checkAvailability(eventId, ticketTypeId, 10)
      ).rejects.toThrow(NotFoundError);
    });

    it('should query with correct parameters', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ available_quantity: 50 }],
        rowCount: 1,
      });

      await service.checkAvailability(eventId, ticketTypeId, 10);

      expect(DatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT available_quantity'),
        [ticketTypeId, eventId]
      );
    });

    it('should handle quantity of 0', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ available_quantity: 50 }],
        rowCount: 1,
      });

      const result = await service.checkAvailability(eventId, ticketTypeId, 0);

      expect(result).toBe(true);
    });

    it('should handle large quantities', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ available_quantity: 100 }],
        rowCount: 1,
      });

      const result = await service.checkAvailability(eventId, ticketTypeId, 1000);

      expect(result).toBe(false);
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database error');
      (DatabaseService.query as jest.Mock).mockRejectedValue(dbError);

      await expect(
        service.checkAvailability(eventId, ticketTypeId, 10)
      ).rejects.toThrow('Database error');
    });
  });

  // =============================================================================
  // createReservation() - 12 test cases
  // =============================================================================

  describe('createReservation()', () => {
    const mockPurchaseRequest = {
      userId: 'user-123',
      eventId: 'event-456',
      tickets: [
        { ticketTypeId: 'type-1', quantity: 2 },
        { ticketTypeId: 'type-2', quantity: 1 },
      ],
    };

    beforeEach(() => {
      (LockKeys.inventory as jest.Mock).mockReturnValue('lock:inventory:event-456:type-1');
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'type-1', name: 'General', available_quantity: 50 }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'type-2', name: 'VIP', available_quantity: 30 }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ name: 'General' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{
            id: 'reservation-123',
            user_id: 'user-123',
            event_id: 'event-456',
            total_quantity: 3,
            status: 'ACTIVE',
          }],
          rowCount: 1,
        });

      (DatabaseService.transaction as jest.Mock).mockImplementation((callback) => callback(mockClient));
      (withLock as jest.Mock).mockImplementation((key, timeout, callback) => callback());
      (RedisService.set as jest.Mock).mockResolvedValue('OK');
    });

    it('should create reservation successfully', async () => {
      const result = await service.createReservation(mockPurchaseRequest);

      expect(result).toEqual(expect.objectContaining({
        id: 'reservation-123',
        user_id: 'user-123',
        event_id: 'event-456',
        total_quantity: 3,
        status: 'ACTIVE',
      }));
    });

    it('should acquire lock on inventory', async () => {
      await service.createReservation(mockPurchaseRequest);

      expect(withLock).toHaveBeenCalledWith(
        'lock:inventory:event-456:type-1',
        10000,
        expect.any(Function),
        { service: 'ticket-service', lockType: 'inventory' }
      );
    });

    it('should use database transaction', async () => {
      await service.createReservation(mockPurchaseRequest);

      expect(DatabaseService.transaction).toHaveBeenCalled();
    });

    it('should lock ticket types FOR UPDATE', async () => {
      await service.createReservation(mockPurchaseRequest);

      const lockQuery = mockClient.query.mock.calls[0][0];
      expect(lockQuery).toContain('FOR UPDATE');
    });

    it('should throw NotFoundError if ticket type not found', async () => {
      mockClient.query.mockReset().mockResolvedValueOnce({ rows: [], rowCount: 0 });
      (DatabaseService.transaction as jest.Mock).mockImplementation((callback) => callback(mockClient));

      await expect(service.createReservation(mockPurchaseRequest)).rejects.toThrow(NotFoundError);
    });

    it('should throw ConflictError if not enough tickets', async () => {
      mockClient.query.mockReset().mockResolvedValueOnce({ rows: [{ id: 'type-1', name: 'General', available_quantity: 1 }], rowCount: 1 });
      (DatabaseService.transaction as jest.Mock).mockImplementation((callback) => callback(mockClient));

      await expect(service.createReservation(mockPurchaseRequest)).rejects.toThrow(ConflictError);
    });

    it('should decrement available_quantity for each ticket type', async () => {
      await service.createReservation(mockPurchaseRequest);

      const updateCalls = mockClient.query.mock.calls.filter((call: any[]) => 
        call[0].includes('UPDATE ticket_types SET available_quantity')
      );
      expect(updateCalls.length).toBe(2);
    });

    it('should calculate total quantity correctly', async () => {
      await service.createReservation(mockPurchaseRequest);

      const insertCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO reservations')
      );
      const totalQuantityParam = insertCall[1][4];
      expect(totalQuantityParam).toBe(3);
    });

    it('should set expiration time based on config', async () => {
      await service.createReservation(mockPurchaseRequest);

      const insertCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO reservations')
      );
      const expiresAtParam = insertCall[1][6];
      expect(expiresAtParam).toBeInstanceOf(Date);
    });

    it('should cache reservation in Redis', async () => {
      await service.createReservation(mockPurchaseRequest);

      expect(RedisService.set).toHaveBeenCalledWith(
        'reservation:reservation-123',
        expect.any(String),
        config.redis.ttl.reservation
      );
    });

    it('should continue if Redis caching fails', async () => {
      (RedisService.set as jest.Mock).mockRejectedValue(new Error('Redis error'));

      const result = await service.createReservation(mockPurchaseRequest);

      expect(result).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis cache failed for reservation, continuing anyway',
        expect.any(Object)
      );
    });

    it('should throw ConflictError on LockTimeoutError', async () => {
      (withLock as jest.Mock).mockRejectedValue(new LockTimeoutError('Timeout', 'lock:test', 10000));

      await expect(service.createReservation(mockPurchaseRequest)).rejects.toThrow(ConflictError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Lock timeout - createReservation',
        expect.any(Object)
      );
    });
  });

  // =============================================================================
  // confirmPurchase() - 14 test cases
  // =============================================================================

  describe('confirmPurchase()', () => {
    const reservationId = 'reservation-123';
    const paymentId = 'payment-456';

    beforeEach(() => {
      (LockKeys.reservation as jest.Mock).mockReturnValue('lock:reservation:reservation-123');

      mockClient.query
        .mockResolvedValueOnce({
          rows: [{
            id: reservationId,
            user_id: 'user-123',
            event_id: 'event-456',
            ticket_type_id: 'type-1',
            total_quantity: 2,
            status: 'ACTIVE',
            tickets: [{ ticketTypeId: 'type-1', quantity: 2 }],
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [{ id: 'type-1', price_cents: 5000 }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'ticket-1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'ticket-2' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      (DatabaseService.transaction as jest.Mock).mockImplementation((callback) => callback(mockClient));
      (withLock as jest.Mock).mockImplementation((key, timeout, callback) => callback());
      (RedisService.del as jest.Mock).mockResolvedValue(1);
    });

    it('should confirm purchase successfully', async () => {
      const result = await service.confirmPurchase(reservationId, paymentId);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('id');
    });

    it('should acquire lock on reservation', async () => {
      await service.confirmPurchase(reservationId, paymentId);

      expect(withLock).toHaveBeenCalledWith(
        'lock:reservation:reservation-123',
        5000,
        expect.any(Function),
        { service: 'ticket-service', lockType: 'reservation' }
      );
    });

    it('should lock reservation FOR UPDATE', async () => {
      await service.confirmPurchase(reservationId, paymentId);

      const lockQuery = mockClient.query.mock.calls[0][0];
      expect(lockQuery).toContain('FOR UPDATE');
    });

    it('should throw NotFoundError if reservation not found', async () => {
      mockClient.query.mockReset().mockResolvedValueOnce({ rows: [], rowCount: 0 });
      (DatabaseService.transaction as jest.Mock).mockImplementation((callback) => callback(mockClient));

      await expect(service.confirmPurchase(reservationId, paymentId)).rejects.toThrow(NotFoundError);
    });

    it('should throw ConflictError if reservation not active', async () => {
      mockClient.query.mockReset().mockResolvedValueOnce({
        rows: [{
          id: reservationId,
          status: 'EXPIRED',
        }],
        rowCount: 1,
      });
      (DatabaseService.transaction as jest.Mock).mockImplementation((callback) => callback(mockClient));

      await expect(service.confirmPurchase(reservationId, paymentId)).rejects.toThrow(ConflictError);
    });

    it('should create correct number of tickets', async () => {
      const result = await service.confirmPurchase(reservationId, paymentId);

      expect(result).toHaveLength(2);
    });

    it('should set ticket status to SOLD', async () => {
      await service.confirmPurchase(reservationId, paymentId);

      const insertCalls = mockClient.query.mock.calls.filter((call: any[]) =>
        call[0].includes('INSERT INTO tickets')
      );
      
      insertCalls.forEach((call: any[]) => {
        const statusParam = call[1][4];
        expect(statusParam).toBe('SOLD');
      });
    });

    it('should associate payment_id with tickets', async () => {
      await service.confirmPurchase(reservationId, paymentId);

      const insertCalls = mockClient.query.mock.calls.filter((call: any[]) =>
        call[0].includes('INSERT INTO tickets')
      );
      
      insertCalls.forEach((call: any[]) => {
        const paymentIdParam = call[1][7];
        expect(paymentIdParam).toBe(paymentId);
      });
    });

    it('should update ticket type sold and reserved quantities', async () => {
      await service.confirmPurchase(reservationId, paymentId);

      const updateCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('UPDATE ticket_types SET sold_quantity')
      );
      
      expect(updateCall).toBeDefined();
      expect(updateCall[1]).toEqual([2, 'type-1']);
    });

    it('should mark reservation as COMPLETED', async () => {
      await service.confirmPurchase(reservationId, paymentId);

      const updateCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes("UPDATE reservations SET status = 'COMPLETED'")
      );
      
      expect(updateCall).toBeDefined();
    });

    it('should delete reservation from Redis cache', async () => {
      await service.confirmPurchase(reservationId, paymentId);

      expect(RedisService.del).toHaveBeenCalledWith(`reservation:${reservationId}`);
    });

    it('should continue if Redis delete fails', async () => {
      (RedisService.del as jest.Mock).mockRejectedValue(new Error('Redis error'));

      const result = await service.confirmPurchase(reservationId, paymentId);

      expect(result).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis delete failed, continuing anyway',
        expect.any(Object)
      );
    });

    it('should throw ConflictError on LockTimeoutError', async () => {
      (withLock as jest.Mock).mockRejectedValue(new LockTimeoutError('Timeout', 'lock:test', 5000));

      await expect(service.confirmPurchase(reservationId, paymentId)).rejects.toThrow(ConflictError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Lock timeout - confirmPurchase',
        expect.any(Object)
      );
    });

    it('should throw ConflictError on LockContentionError', async () => {
      (withLock as jest.Mock).mockRejectedValue(new LockContentionError('Contention', 'lock:test'));

      await expect(service.confirmPurchase(reservationId, paymentId)).rejects.toThrow(ConflictError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Lock contention - confirmPurchase',
        expect.any(Object)
      );
    });
  });

  // =============================================================================
  // getTicket() - 10 test cases
  // =============================================================================

  describe('getTicket()', () => {
    const ticketId = 'ticket-123';
    const tenantId = 'tenant-456';
    const mockTicket = {
      id: ticketId,
      event_id: 'event-789',
      ticket_type_name: 'VIP',
      ticket_type_description: 'VIP access',
      status: 'SOLD',
    };

    it('should return cached ticket if available', async () => {
      (RedisService.get as jest.Mock).mockResolvedValue(JSON.stringify(mockTicket));

      const result = await service.getTicket(ticketId);

      expect(result).toEqual(mockTicket);
      expect(RedisService.get).toHaveBeenCalledWith(`ticket:${ticketId}`);
      expect(DatabaseService.query).not.toHaveBeenCalled();
    });

    it('should query database if cache miss', async () => {
      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [mockTicket],
        rowCount: 1,
      });
      (RedisService.set as jest.Mock).mockResolvedValue('OK');

      const result = await service.getTicket(ticketId);

      expect(result).toEqual(mockTicket);
      expect(DatabaseService.query).toHaveBeenCalled();
    });

    it('should join with ticket_types table', async () => {
      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [mockTicket],
        rowCount: 1,
      });
      (RedisService.set as jest.Mock).mockResolvedValue('OK');

      await service.getTicket(ticketId);

      const query = (DatabaseService.query as jest.Mock).mock.calls[0][0];
      expect(query).toContain('JOIN ticket_types');
    });

    it('should throw NotFoundError if ticket not found', async () => {
      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await expect(service.getTicket(ticketId)).rejects.toThrow(NotFoundError);
    });

    it('should filter by tenantId if provided', async () => {
      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [mockTicket],
        rowCount: 1,
      });
      (RedisService.set as jest.Mock).mockResolvedValue('OK');

      await service.getTicket(ticketId, tenantId);

      const query = (DatabaseService.query as jest.Mock).mock.calls[0][0];
      const params = (DatabaseService.query as jest.Mock).mock.calls[0][1];
      
      expect(query).toContain('AND t.tenant_id = $2');
      expect(params).toContain(tenantId);
    });

    it('should cache ticket after database fetch', async () => {
      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [mockTicket],
        rowCount: 1,
      });
      (RedisService.set as jest.Mock).mockResolvedValue('OK');

      await service.getTicket(ticketId);

      expect(RedisService.set).toHaveBeenCalledWith(
        `ticket:${ticketId}`,
        JSON.stringify(mockTicket),
        config.redis.ttl.cache
      );
    });

    it('should continue if Redis cache read fails', async () => {
      (RedisService.get as jest.Mock).mockRejectedValue(new Error('Redis error'));
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [mockTicket],
        rowCount: 1,
      });
      (RedisService.set as jest.Mock).mockResolvedValue('OK');

      const result = await service.getTicket(ticketId);

      expect(result).toEqual(mockTicket);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis cache read failed, continuing with DB query',
        expect.any(Object)
      );
    });

    it('should continue if Redis cache write fails', async () => {
      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [mockTicket],
        rowCount: 1,
      });
      (RedisService.set as jest.Mock).mockRejectedValue(new Error('Redis error'));

      const result = await service.getTicket(ticketId);

      expect(result).toEqual(mockTicket);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis cache write failed, returning ticket anyway',
        expect.any(Object)
      );
    });

    it('should parse cached JSON correctly', async () => {
      const cachedData = JSON.stringify(mockTicket);
      (RedisService.get as jest.Mock).mockResolvedValue(cachedData);

      const result = await service.getTicket(ticketId);

      expect(result).toEqual(mockTicket);
    });

    it('should include ticket type information', async () => {
      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [mockTicket],
        rowCount: 1,
      });
      (RedisService.set as jest.Mock).mockResolvedValue('OK');

      const result = await service.getTicket(ticketId);

      expect(result).toHaveProperty('ticket_type_name');
      expect(result).toHaveProperty('ticket_type_description');
    });
  });

  // =============================================================================
  // getUserTickets() - 8 test cases
  // =============================================================================

  describe('getUserTickets()', () => {
    const userId = 'user-123';
    const tenantId = 'tenant-456';
    const eventId = 'event-789';

    const mockTickets = [
      {
        id: 'ticket-1',
        user_id: userId,
        tenant_id: tenantId,
        ticket_type_name: 'VIP',
        event_name: 'Concert',
      },
      {
        id: 'ticket-2',
        user_id: userId,
        tenant_id: tenantId,
        ticket_type_name: 'General',
        event_name: 'Concert',
      },
    ];

    it('should return all user tickets', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: mockTickets,
        rowCount: 2,
      });

      const result = await service.getUserTickets(userId, tenantId);

      expect(result).toEqual(mockTickets);
      expect(result).toHaveLength(2);
    });

    it('should filter by userId and tenantId', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await service.getUserTickets(userId, tenantId);

      const query = (DatabaseService.query as jest.Mock).mock.calls[0][0];
      const params = (DatabaseService.query as jest.Mock).mock.calls[0][1];

      expect(query).toContain('WHERE t.user_id = $1 AND t.tenant_id = $2');
      expect(params).toEqual([userId, tenantId]);
    });

    it('should filter by eventId if provided', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: mockTickets,
        rowCount: 2,
      });

      await service.getUserTickets(userId, tenantId, eventId);

      const query = (DatabaseService.query as jest.Mock).mock.calls[0][0];
      const params = (DatabaseService.query as jest.Mock).mock.calls[0][1];

      expect(query).toContain('AND t.event_id = $3');
      expect(params).toContain(eventId);
    });

    it('should join with ticket_types and events tables', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: mockTickets,
        rowCount: 2,
      });

      await service.getUserTickets(userId, tenantId);

      const query = (DatabaseService.query as jest.Mock).mock.calls[0][0];
      expect(query).toContain('JOIN ticket_types');
      expect(query).toContain('JOIN events');
    });

    it('should order by created_at DESC', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: mockTickets,
        rowCount: 2,
      });

      await service.getUserTickets(userId, tenantId);

      const query = (DatabaseService.query as jest.Mock).mock.calls[0][0];
      expect(query).toContain('ORDER BY t.created_at DESC');
    });

    it('should return empty array if no tickets found', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await service.getUserTickets(userId, tenantId);

      expect(result).toEqual([]);
    });

    it('should include event name in results', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: mockTickets,
        rowCount: 2,
      });

      const result = await service.getUserTickets(userId, tenantId);

      expect(result[0]).toHaveProperty('event_name');
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Query failed');
      (DatabaseService.query as jest.Mock).mockRejectedValue(dbError);

      await expect(service.getUserTickets(userId, tenantId)).rejects.toThrow('Query failed');
    });
  });

  // =============================================================================
  // updateTicketStatus() - 6 test cases
  // =============================================================================

  describe('updateTicketStatus()', () => {
    const ticketId = 'ticket-123';
    const status = 'USED' as TicketStatus;

    it('should update ticket status', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 1,
      });
      (RedisService.del as jest.Mock).mockResolvedValue(1);

      await service.updateTicketStatus(ticketId, status);

      expect(DatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tickets SET status'),
        [status, ticketId]
      );
    });

    it('should set updated_at timestamp', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 1,
      });
      (RedisService.del as jest.Mock).mockResolvedValue(1);

      await service.updateTicketStatus(ticketId, status);

      const query = (DatabaseService.query as jest.Mock).mock.calls[0][0];
      expect(query).toContain('updated_at = NOW()');
    });

    it('should clear ticket cache', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 1,
      });
      (RedisService.del as jest.Mock).mockResolvedValue(1);

      await service.updateTicketStatus(ticketId, status);

      expect(RedisService.del).toHaveBeenCalledWith(`ticket:${ticketId}`);
    });

    it('should continue if Redis delete fails', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 1,
      });
      (RedisService.del as jest.Mock).mockRejectedValue(new Error('Redis error'));

      await service.updateTicketStatus(ticketId, status);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis delete failed',
        expect.any(Object)
      );
    });

    it('should handle different status values', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 1,
      });
      (RedisService.del as jest.Mock).mockResolvedValue(1);

      await service.updateTicketStatus(ticketId, 'CANCELLED' as TicketStatus);

      const params = (DatabaseService.query as jest.Mock).mock.calls[0][1];
      expect(params[0]).toBe('CANCELLED');
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Update failed');
      (DatabaseService.query as jest.Mock).mockRejectedValue(dbError);

      await expect(service.updateTicketStatus(ticketId, status)).rejects.toThrow('Update failed');
    });
  });

  // =============================================================================
  // expireReservations() - 4 test cases
  // =============================================================================

  describe('expireReservations()', () => {
    it('should call release_expired_reservations function', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ count: 5 }],
        rowCount: 1,
      });

      await service.expireReservations();

      expect(DatabaseService.query).toHaveBeenCalledWith(
        'SELECT release_expired_reservations() as count',
        []
      );
    });

    it('should log number of expired reservations', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ count: 5 }],
        rowCount: 5,
      });

      await service.expireReservations();

      expect(mockLogger.info).toHaveBeenCalledWith('Expired 5 reservations');
    });

    it('should handle no expired reservations', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ count: null }],
        rowCount: 0,
      });

      await service.expireReservations();

      expect(mockLogger.info).toHaveBeenCalledWith('No expired reservations to release');
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Function call failed');
      (DatabaseService.query as jest.Mock).mockRejectedValue(dbError);

      await expect(service.expireReservations()).rejects.toThrow('Function call failed');
    });
  });

  // =============================================================================
  // releaseReservation() - 10 test cases
  // =============================================================================

  describe('releaseReservation()', () => {
    const reservationId = 'reservation-123';
    const userId = 'user-456';

    beforeEach(() => {
      (LockKeys.reservation as jest.Mock).mockReturnValue('lock:reservation:reservation-123');

      mockClient.query
        .mockResolvedValueOnce({
          rows: [{
            id: reservationId,
            user_id: userId,
            status: 'ACTIVE',
            tickets: [
              { ticketTypeId: 'type-1', quantity: 2 },
              { ticketTypeId: 'type-2', quantity: 1 },
            ],
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      (DatabaseService.transaction as jest.Mock).mockImplementation((callback) => callback(mockClient));
      (withLock as jest.Mock).mockImplementation((key, timeout, callback) => callback());
      (RedisService.del as jest.Mock).mockResolvedValue(1);
    });

    it('should release reservation successfully', async () => {
      const result = await service.releaseReservation(reservationId, userId);

      expect(result).toEqual({
        success: true,
        reservation: expect.objectContaining({
          id: reservationId,
          user_id: userId,
        }),
      });
    });

    it('should acquire lock on reservation', async () => {
      await service.releaseReservation(reservationId, userId);

      expect(withLock).toHaveBeenCalledWith(
        'lock:reservation:reservation-123',
        5000,
        expect.any(Function),
        { service: 'ticket-service', lockType: 'reservation' }
      );
    });

    it('should lock reservation FOR UPDATE', async () => {
      await service.releaseReservation(reservationId, userId);

      const lockQuery = mockClient.query.mock.calls[0][0];
      expect(lockQuery).toContain('FOR UPDATE');
    });

    it('should throw NotFoundError if reservation not found', async () => {
      mockClient.query.mockReset().mockResolvedValueOnce({ rows: [], rowCount: 0 });
      (DatabaseService.transaction as jest.Mock).mockImplementation((callback) => callback(mockClient));

      await expect(
        service.releaseReservation(reservationId, userId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should verify userId matches reservation', async () => {
      await service.releaseReservation(reservationId, userId);

      const query = mockClient.query.mock.calls[0][0];
      const params = mockClient.query.mock.calls[0][1];

      expect(query).toContain('user_id = $2');
      expect(params).toEqual([reservationId, userId]);
    });

    it('should mark reservation as CANCELLED', async () => {
      await service.releaseReservation(reservationId, userId);

      const updateCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes("UPDATE reservations SET status = 'CANCELLED'")
      );

      expect(updateCall).toBeDefined();
    });

    it('should restore available_quantity for each ticket type', async () => {
      await service.releaseReservation(reservationId, userId);

      const updateCalls = mockClient.query.mock.calls.filter((call: any[]) =>
        call[0].includes('UPDATE ticket_types SET available_quantity')
      );

      expect(updateCalls.length).toBe(2);
      expect(updateCalls[0][1]).toEqual([2, 'type-1']);
      expect(updateCalls[1][1]).toEqual([1, 'type-2']);
    });

    it('should delete reservation from Redis cache', async () => {
      await service.releaseReservation(reservationId, userId);

      expect(RedisService.del).toHaveBeenCalledWith(`reservation:${reservationId}`);
    });

    it('should continue if Redis delete fails', async () => {
      (RedisService.del as jest.Mock).mockRejectedValue(new Error('Redis error'));

      const result = await service.releaseReservation(reservationId, userId);

      expect(result).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis delete failed, continuing anyway',
        expect.any(Object)
      );
    });

    it('should throw ConflictError on LockTimeoutError', async () => {
      (withLock as jest.Mock).mockRejectedValue(new LockTimeoutError('Timeout', 'lock:test', 5000));

      await expect(
        service.releaseReservation(reservationId, userId)
      ).rejects.toThrow(ConflictError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Lock timeout - releaseReservation',
        expect.any(Object)
      );
    });
  });

  // =============================================================================
  // generateQR() - 6 test cases
  // =============================================================================

  describe('generateQR()', () => {
    const ticketId = 'ticket-123';
    const mockTicket = {
      id: ticketId,
      event_id: 'event-456',
      user_id: 'user-789',
      status: 'SOLD',
    };

    beforeEach(() => {
      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [mockTicket],
        rowCount: 1,
      });
      (RedisService.set as jest.Mock).mockResolvedValue('OK');
      (QRCode.toDataURL as jest.Mock).mockResolvedValue('data:image/png;base64,iVBORw0KG');
    });

    it('should generate QR code successfully', async () => {
      const result = await service.generateQR(ticketId);

      expect(result).toHaveProperty('qrCode');
      expect(result).toHaveProperty('qrImage');
      expect(result).toHaveProperty('ticketId', ticketId);
    });

    it('should fetch ticket data', async () => {
      await service.generateQR(ticketId);

      expect(DatabaseService.query).toHaveBeenCalled();
    });

    it('should create QR payload with ticket information', async () => {
      const result = await service.generateQR(ticketId);

      expect(result.qrCode).toBeDefined();
      expect(typeof result.qrCode).toBe('string');
    });

    it('should encrypt QR data', async () => {
      const result = await service.generateQR(ticketId);

      expect(result.qrCode).toContain(':');
    });

    it('should generate QR image as data URL', async () => {
      const result = await service.generateQR(ticketId);

      expect(result.qrImage).toContain('data:image/png;base64');
      expect(QRCode.toDataURL).toHaveBeenCalled();
    });

    it('should throw error if ticket not found', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await expect(service.generateQR(ticketId)).rejects.toThrow(NotFoundError);
    });
  });

  // =============================================================================
  // validateQR() - 8 test cases
  // =============================================================================

  describe('validateQR()', () => {
    const ticketId = 'ticket-123';
    const mockTicket = {
      id: ticketId,
      event_id: 'event-456',
      user_id: 'user-789',
      status: 'SOLD',
      used_at: null,
      validated_at: null,
    };

    beforeEach(() => {
      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [mockTicket],
        rowCount: 1,
      });
      (RedisService.set as jest.Mock).mockResolvedValue('OK');
    });

    it('should validate encrypted QR code successfully', async () => {
      const qrPayload = {
        ticketId: ticketId,
        eventId: 'event-456',
        userId: 'user-789',
        timestamp: Date.now(),
      };

      const encrypted = (service as any).encryptData(JSON.stringify(qrPayload));

      const result = await service.validateQR(encrypted);

      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        ticketId: ticketId,
        eventId: 'event-456',
        userId: 'user-789',
      });
    });

    it('should validate base64 encoded QR code', async () => {
      const qrData = {
        ticket_id: ticketId,
        event_id: 'event-456',
        user_id: 'user-789',
      };

      const encoded = Buffer.from(JSON.stringify(qrData)).toString('base64');

      const result = await service.validateQR(encoded);

      expect(result.valid).toBe(true);
    });

    it('should return false for invalid ticket status', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ ...mockTicket, status: 'USED' }],
        rowCount: 1,
      });

      const qrPayload = {
        ticketId: ticketId,
        eventId: 'event-456',
        userId: 'user-789',
      };

      const encrypted = (service as any).encryptData(JSON.stringify(qrPayload));

      const result = await service.validateQR(encrypted);

      expect(result.valid).toBe(false);
    });

    it('should return false if ticket already used', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ ...mockTicket, used_at: new Date() }],
        rowCount: 1,
      });

      const qrPayload = {
        ticketId: ticketId,
        eventId: 'event-456',
        userId: 'user-789',
      };

      const encrypted = (service as any).encryptData(JSON.stringify(qrPayload));

      const result = await service.validateQR(encrypted);

      expect(result.valid).toBe(false);
    });

    it('should return false if ticket already validated', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ ...mockTicket, validated_at: new Date() }],
        rowCount: 1,
      });

      const qrPayload = {
        ticketId: ticketId,
        eventId: 'event-456',
        userId: 'user-789',
      };

      const encrypted = (service as any).encryptData(JSON.stringify(qrPayload));

      const result = await service.validateQR(encrypted);

      expect(result.valid).toBe(false);
    });

    it('should return false for malformed QR data', async () => {
      const result = await service.validateQR('invalid-qr-data');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid QR code');
    });

    it('should fetch ticket for validation', async () => {
      const qrPayload = {
        ticketId: ticketId,
        eventId: 'event-456',
        userId: 'user-789',
      };

      const encrypted = (service as any).encryptData(JSON.stringify(qrPayload));

      await service.validateQR(encrypted);

      expect(DatabaseService.query).toHaveBeenCalled();
    });

    it('should handle decryption errors', async () => {
      const result = await service.validateQR('malformed:encrypted:data');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid QR code');
    });
  });

  // =============================================================================
  // getTicketType() - 4 test cases
  // =============================================================================

  describe('getTicketType()', () => {
    const ticketTypeId = 'type-123';
    const tenantId = 'tenant-456';

    it('should return ticket type if found', async () => {
      const mockTicketType = {
        id: ticketTypeId,
        name: 'VIP',
        price_cents: 10000,
        tenant_id: tenantId,
      };

      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [mockTicketType],
        rowCount: 1,
      });

      const result = await service.getTicketType(ticketTypeId, tenantId);

      expect(result).toEqual(mockTicketType);
      expect(DatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM ticket_types'),
        [ticketTypeId, tenantId]
      );
    });

    it('should return null if ticket type not found', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await service.getTicketType(ticketTypeId, tenantId);

      expect(result).toBeNull();
    });

    it('should filter by id and tenant_id', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await service.getTicketType(ticketTypeId, tenantId);

      const query = (DatabaseService.query as jest.Mock).mock.calls[0][0];
      expect(query).toContain('WHERE id = $1 AND tenant_id = $2');
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Query failed');
      (DatabaseService.query as jest.Mock).mockRejectedValue(dbError);

      await expect(service.getTicketType(ticketTypeId, tenantId)).rejects.toThrow('Query failed');
    });
  });

  // =============================================================================
  // updateTicketType() - 10 test cases
  // =============================================================================

  describe('updateTicketType()', () => {
    const ticketTypeId = 'type-123';
    const tenantId = 'tenant-456';

    it('should update ticket type successfully', async () => {
      const updates = {
        name: 'Updated VIP',
        priceCents: 12000,
      };

      const mockUpdated = {
        id: ticketTypeId,
        ...updates,
        tenant_id: tenantId,
      };

      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [mockUpdated],
        rowCount: 1,
      });

      const result = await service.updateTicketType(ticketTypeId, updates, tenantId);

      expect(result).toEqual(mockUpdated);
    });

    it('should build dynamic UPDATE query', async () => {
      const updates = {
        name: 'Updated VIP',
        priceCents: 12000,
      };

      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ id: ticketTypeId }],
        rowCount: 1,
      });

      await service.updateTicketType(ticketTypeId, updates, tenantId);

      const query = (DatabaseService.query as jest.Mock).mock.calls[0][0];
      expect(query).toContain('UPDATE ticket_types');
      expect(query).toContain('name =');
      expect(query).toContain('price_cents =');
    });

    it('should include updated_at in update', async () => {
      const updates = { name: 'Updated' };

      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ id: ticketTypeId }],
        rowCount: 1,
      });

      await service.updateTicketType(ticketTypeId, updates, tenantId);

      const query = (DatabaseService.query as jest.Mock).mock.calls[0][0];
      expect(query).toContain('updated_at = NOW()');
    });

    it('should filter by id and tenant_id', async () => {
      const updates = { name: 'Updated' };

      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ id: ticketTypeId }],
        rowCount: 1,
      });

      await service.updateTicketType(ticketTypeId, updates, tenantId);

      const query = (DatabaseService.query as jest.Mock).mock.calls[0][0];
      expect(query).toContain('WHERE id =');
      expect(query).toContain('AND tenant_id =');
    });

    it('should throw NotFoundError if ticket type not found', async () => {
      const updates = { name: 'Updated' };

      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await expect(
        service.updateTicketType(ticketTypeId, updates, tenantId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should handle name update', async () => {
      const updates = { name: 'Premium VIP' };

      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ id: ticketTypeId, name: 'Premium VIP' }],
        rowCount: 1,
      });

      await service.updateTicketType(ticketTypeId, updates, tenantId);

      const params = (DatabaseService.query as jest.Mock).mock.calls[0][1];
      expect(params).toContain('Premium VIP');
    });

    it('should handle description update', async () => {
      const updates = { description: 'New description' };

      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ id: ticketTypeId }],
        rowCount: 1,
      });

      await service.updateTicketType(ticketTypeId, updates, tenantId);

      const params = (DatabaseService.query as jest.Mock).mock.calls[0][1];
      expect(params).toContain('New description');
    });

    it('should handle quantity update', async () => {
      const updates = { quantity: 200 };

      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ id: ticketTypeId }],
        rowCount: 1,
      });

      await service.updateTicketType(ticketTypeId, updates, tenantId);

      const params = (DatabaseService.query as jest.Mock).mock.calls[0][1];
      expect(params).toContain(200);
    });

    it('should handle multiple field updates', async () => {
      const updates = {
        name: 'Premium',
        priceCents: 15000,
        maxPerPurchase: 6,
      };

      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ id: ticketTypeId, ...updates }],
        rowCount: 1,
      });

      const result = await service.updateTicketType(ticketTypeId, updates, tenantId);

      expect(result).toMatchObject(updates);
    });

    it('should handle sale date updates', async () => {
      const saleStart = new Date('2025-01-01');
      const saleEnd = new Date('2025-12-31');
      const updates = {
        saleStartDate: saleStart,
        saleEndDate: saleEnd,
      };

      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ id: ticketTypeId }],
        rowCount: 1,
      });

      await service.updateTicketType(ticketTypeId, updates, tenantId);

      const params = (DatabaseService.query as jest.Mock).mock.calls[0][1];
      expect(params).toContain(saleStart);
      expect(params).toContain(saleEnd);
    });
  });

  // =============================================================================
  // encryptData() - 4 test cases (private method)
  // =============================================================================

  describe('encryptData() [private]', () => {
    it('should encrypt data', () => {
      const data = 'test data';
      const encrypted = (service as any).encryptData(data);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
    });

    it('should return different values for same input', () => {
      const data = 'test data';
      const encrypted1 = (service as any).encryptData(data);
      const encrypted2 = (service as any).encryptData(data);

      expect(encrypted1).not.toEqual(encrypted2);
    });

    it('should include IV in encrypted string', () => {
      const data = 'test data';
      const encrypted = (service as any).encryptData(data);

      expect(encrypted).toContain(':');
      const parts = encrypted.split(':');
      expect(parts.length).toBe(2);
    });

    it('should use base64 encoding', () => {
      const data = 'test data';
      const encrypted = (service as any).encryptData(data);
      const parts = encrypted.split(':');

      const base64Regex = /^[A-Za-z0-9+/]+=*$/;
      expect(base64Regex.test(parts[0])).toBe(true);
      expect(base64Regex.test(parts[1])).toBe(true);
    });
  });

  // =============================================================================
  // decryptData() - 4 test cases (private method)
  // =============================================================================

  describe('decryptData() [private]', () => {
    it('should decrypt encrypted data', () => {
      const originalData = 'test data';
      const encrypted = (service as any).encryptData(originalData);
      const decrypted = (service as any).decryptData(encrypted);

      expect(decrypted).toEqual(originalData);
    });

    it('should handle JSON data', () => {
      const originalData = JSON.stringify({ ticketId: 'ticket-123', eventId: 'event-456' });
      const encrypted = (service as any).encryptData(originalData);
      const decrypted = (service as any).decryptData(encrypted);

      expect(decrypted).toEqual(originalData);
      expect(JSON.parse(decrypted)).toEqual({ ticketId: 'ticket-123', eventId: 'event-456' });
    });

    it('should throw error for invalid encrypted data', () => {
      expect(() => {
        (service as any).decryptData('invalid:data');
      }).toThrow();
    });

    it('should handle special characters', () => {
      const originalData = 'test@#$%^&*()data';
      const encrypted = (service as any).encryptData(originalData);
      const decrypted = (service as any).decryptData(encrypted);

      expect(decrypted).toEqual(originalData);
    });
  });

  // =============================================================================
  // generateQRCode() - 3 test cases (private method)
  // =============================================================================

  describe('generateQRCode() [private]', () => {
    it('should generate QR code string', () => {
      const ticketId = 'ticket-123';
      const qrCode = (service as any).generateQRCode(ticketId);

      expect(qrCode).toBeDefined();
      expect(typeof qrCode).toBe('string');
    });

    it('should include ticket ID in QR code', () => {
      const ticketId = 'ticket-123';
      const qrCode = (service as any).generateQRCode(ticketId);

      expect(qrCode).toContain(ticketId);
    });

    it('should include timestamp in QR code', () => {
      const ticketId = 'ticket-123';
      const qrCode = (service as any).generateQRCode(ticketId);

      expect(qrCode).toContain('TKT:');
      expect(qrCode.split(':').length).toBe(3);
    });
  });
});

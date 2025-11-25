import { CancellationService } from '../../src/services/cancellation.service';
import { Knex } from 'knex';

describe('CancellationService - Critical Path Tests', () => {
  let service: CancellationService;
  let mockDb: jest.Mocked<Knex>;

  beforeEach(() => {
    mockDb = {
      transaction: jest.fn(),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      first: jest.fn(),
      update: jest.fn().mockReturnThis(),
      insert: jest.fn(),
      raw: jest.fn(),
    } as any;

    service = new CancellationService(mockDb);
  });

  describe('cancelEvent', () => {
    it('should successfully cancel an active event', async () => {
      const mockEvent = {
        event_id: 'event-123',
        venue_id: 'venue-456',
        tenant_id: 'tenant-789',
        status: 'active',
        start_date: new Date(Date.now() + 86400000), // Tomorrow
      };

      const mockTransaction = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockEvent),
        update: jest.fn().mockResolvedValue(1),
        insert: jest.fn().mockResolvedValue([1]),
        forUpdate: jest.fn().mockReturnThis(),
        commit: jest.fn(),
        rollback: jest.fn(),
      } as any;

      mockDb.transaction.mockImplementation(async (callback) => {
        return callback(mockTransaction);
      });

      const result = await service.cancelEvent('event-123', 'tenant-789', 'admin-user', 'Weather conditions');

      expect(result.success).toBe(true);
      expect(result.event_id).toBe('event-123');
      expect(mockTransaction.update).toHaveBeenCalledWith({
        status: 'cancelled',
        updated_at: expect.any(Date),
      });
    });

    it('should reject cancellation of already cancelled event', async () => {
      const mockEvent = {
        event_id: 'event-123',
        status: 'cancelled',
        tenant_id: 'tenant-789',
      };

      const mockTransaction = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockEvent),
        forUpdate: jest.fn().mockReturnThis(),
        rollback: jest.fn(),
      } as any;

      mockDb.transaction.mockImplementation(async (callback) => {
        return callback(mockTransaction);
      });

      await expect(
        service.cancelEvent('event-123', 'tenant-789', 'admin-user', 'reason')
      ).rejects.toThrow('Event is already cancelled');
    });

    it('should reject cancellation after event has started', async () => {
      const mockEvent = {
        event_id: 'event-123',
        status: 'active',
        tenant_id: 'tenant-789',
        start_date: new Date(Date.now() - 3600000), // 1 hour ago
      };

      const mockTransaction = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockEvent),
        forUpdate: jest.fn().mockReturnThis(),
        rollback: jest.fn(),
      } as any;

      mockDb.transaction.mockImplementation(async (callback) => {
        return callback(mockTransaction);
      });

      await expect(
        service.cancelEvent('event-123', 'tenant-789', 'admin-user', 'reason')
      ).rejects.toThrow('Cannot cancel event that has already started');
    });

    it('should enforce tenant isolation during cancellation', async () => {
      const mockEvent = {
        event_id: 'event-123',
        tenant_id: 'tenant-789',
        status: 'active',
      };

      const mockTransaction = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockEvent),
        forUpdate: jest.fn().mockReturnThis(),
        rollback: jest.fn(),
      } as any;

      mockDb.transaction.mockImplementation(async (callback) => {
        return callback(mockTransaction);
      });

      // Attempt to cancel with different tenant_id
      await expect(
        service.cancelEvent('event-123', 'wrong-tenant', 'admin-user', 'reason')
      ).rejects.toThrow();

      // Verify tenant_id was included in WHERE clause
      expect(mockTransaction.where).toHaveBeenCalledWith(
        expect.objectContaining({ tenant_id: 'wrong-tenant' })
      );
    });

    it('should rollback transaction on database error', async () => {
      const mockTransaction = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockRejectedValue(new Error('Database connection error')),
        forUpdate: jest.fn().mockReturnThis(),
        rollback: jest.fn(),
      } as any;

      mockDb.transaction.mockImplementation(async (callback) => {
        try {
          return await callback(mockTransaction);
        } catch (error) {
          await mockTransaction.rollback();
          throw error;
        }
      });

      await expect(
        service.cancelEvent('event-123', 'tenant-789', 'admin-user', 'reason')
      ).rejects.toThrow('Database connection error');

      expect(mockTransaction.rollback).toHaveBeenCalled();
    });

    it('should handle partial refund scenario', async () => {
      const mockEvent = {
        event_id: 'event-123',
        venue_id: 'venue-456',
        tenant_id: 'tenant-789',
        status: 'active',
        start_date: new Date(Date.now() + 86400000),
      };

      const mockTickets = [
        { ticket_id: 'ticket-1', status: 'sold', price: 100 },
        { ticket_id: 'ticket-2', status: 'sold', price: 150 },
      ];

      const mockTransaction = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValueOnce(mockEvent),
        update: jest.fn().mockResolvedValue(1),
        insert: jest.fn().mockResolvedValue([1]),
        forUpdate: jest.fn().mockReturnThis(),
        mockResolvedValue: jest.fn().mockResolvedValue(mockTickets),
        commit: jest.fn(),
      } as any;

      // First call returns event, second call returns tickets
      mockTransaction.first
        .mockResolvedValueOnce(mockEvent)
        .mockResolvedValueOnce(mockTickets);

      mockDb.transaction.mockImplementation(async (callback) => {
        return callback(mockTransaction);
      });

      const result = await service.cancelEvent(
        'event-123',
        'tenant-789',
        'admin-user',
        'Venue closure',
        { refund_percentage: 80 }
      );

      expect(result.success).toBe(true);
      expect(result.refund_info).toBeDefined();
      expect(result.refund_info?.refund_percentage).toBe(80);
    });
  });

  describe('getCancellationHistory', () => {
    it('should return cancellation history for an event', async () => {
      const mockHistory = [
        {
          cancellation_id: 'cancel-1',
          event_id: 'event-123',
          cancelled_by: 'admin-user',
          reason: 'Weather',
          cancelled_at: new Date(),
        },
      ];

      mockDb.select.mockReturnThis();
      mockDb.from.mockReturnThis();
      mockDb.where.mockResolvedValue(mockHistory);

      const result = await service.getCancellationHistory('event-123', 'tenant-789');

      expect(result).toEqual(mockHistory);
      expect(mockDb.where).toHaveBeenCalledWith(
        expect.objectContaining({ event_id: 'event-123', tenant_id: 'tenant-789' })
      );
    });

    it('should enforce tenant isolation when fetching history', async () => {
      mockDb.select.mockReturnThis();
      mockDb.from.mockReturnThis();
      mockDb.where.mockResolvedValue([]);

      await service.getCancellationHistory('event-123', 'tenant-789');

      // Verify tenant_id is in WHERE clause
      expect(mockDb.where).toHaveBeenCalledWith(
        expect.objectContaining({ tenant_id: 'tenant-789' })
      );
    });
  });
});

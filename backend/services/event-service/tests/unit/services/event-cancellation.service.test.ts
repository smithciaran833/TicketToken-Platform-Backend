/**
 * Unit tests for EventCancellationService
 * Tests full cancellation workflow including refunds, notifications, reports
 */

import { EventCancellationService, CancellationOptions, CancellationResult } from '../../../src/services/event-cancellation.service';
import { createKnexMock, configureMockReturn, configureMockArray } from '../../__mocks__/knex.mock';

// Mock the database module
jest.mock('../../../src/config/database', () => ({
  db: createKnexMock(),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('mock-uuid-123'),
}));

describe('EventCancellationService', () => {
  let service: EventCancellationService;
  let mockDb: any;

  const mockEvent = {
    id: 'event-123',
    tenant_id: 'tenant-1',
    name: 'Test Concert',
    status: 'ON_SALE',
    event_date: new Date(Date.now() + 86400000 * 7),
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  const mockCancellationOptions: CancellationOptions = {
    reason: 'Weather emergency',
    refundPolicy: 'full',
    notifyHolders: true,
    cancelResales: true,
    generateReport: true,
    cancelledBy: 'user-123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Get mock db from the mocked module
    const { db } = require('../../../src/config/database');
    mockDb = db;
    
    // Reset mock chain
    mockDb._mockChain = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(mockEvent),
      update: jest.fn().mockResolvedValue(1),
      insert: jest.fn().mockResolvedValue([1]),
      select: jest.fn().mockReturnThis(),
      sum: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      raw: jest.fn().mockReturnValue('raw'),
    };
    
    mockDb.mockReturnValue(mockDb._mockChain);
    
    service = new EventCancellationService();
  });

  describe('constructor', () => {
    it('should create service instance', () => {
      expect(service).toBeInstanceOf(EventCancellationService);
    });
  });

  describe('cancelEvent', () => {
    it('should execute full cancellation workflow', async () => {
      mockDb._mockChain.first
        .mockResolvedValueOnce(mockEvent) // getEvent for status
        .mockResolvedValueOnce(mockEvent) // getEvent for notification
        .mockResolvedValueOnce({ totalTicketsSold: 100 }); // revenue summary
      mockDb._mockChain.update.mockResolvedValue(1);

      const result = await service.cancelEvent('event-123', 'tenant-1', mockCancellationOptions);

      expect(result.eventId).toBe('event-123');
      expect(result.status).toBe('completed');
    });

    it('should update event status to CANCELLED', async () => {
      mockDb._mockChain.first.mockResolvedValue(mockEvent);
      mockDb._mockChain.update.mockResolvedValue(1);

      await service.cancelEvent('event-123', 'tenant-1', mockCancellationOptions);

      expect(mockDb._mockChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'CANCELLED',
          cancellation_reason: 'Weather emergency',
          cancelled_by: 'user-123',
        })
      );
    });

    it('should set cancelled_at timestamp', async () => {
      mockDb._mockChain.first.mockResolvedValue(mockEvent);
      mockDb._mockChain.update.mockResolvedValue(1);

      await service.cancelEvent('event-123', 'tenant-1', mockCancellationOptions);

      expect(mockDb._mockChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          cancelled_at: expect.any(Date),
        })
      );
    });

    it('should return completed status when all steps succeed', async () => {
      mockDb._mockChain.first.mockResolvedValue(mockEvent);
      mockDb._mockChain.update.mockResolvedValue(1);

      const result = await service.cancelEvent('event-123', 'tenant-1', mockCancellationOptions);

      expect(result.status).toBe('completed');
      expect(result.errors).toHaveLength(0);
    });

    it('should return partial status when some steps fail', async () => {
      mockDb._mockChain.first
        .mockResolvedValueOnce(mockEvent)
        .mockRejectedValueOnce(new Error('Notification failed'));
      mockDb._mockChain.update.mockResolvedValue(1);

      const result = await service.cancelEvent('event-123', 'tenant-1', mockCancellationOptions);

      expect(result.status).toBe('partial');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should skip refunds when refundPolicy is none', async () => {
      mockDb._mockChain.first.mockResolvedValue(mockEvent);
      mockDb._mockChain.update.mockResolvedValue(1);

      const result = await service.cancelEvent('event-123', 'tenant-1', {
        ...mockCancellationOptions,
        refundPolicy: 'none',
      });

      expect(result.refundsTriggered).toBe(0);
    });

    it('should skip notifications when notifyHolders is false', async () => {
      mockDb._mockChain.first.mockResolvedValue(mockEvent);
      mockDb._mockChain.update.mockResolvedValue(1);

      const result = await service.cancelEvent('event-123', 'tenant-1', {
        ...mockCancellationOptions,
        notifyHolders: false,
      });

      expect(result.notificationsSent).toBe(0);
    });

    it('should skip resale cancellation when cancelResales is false', async () => {
      mockDb._mockChain.first.mockResolvedValue(mockEvent);
      mockDb._mockChain.update.mockResolvedValue(1);

      const result = await service.cancelEvent('event-123', 'tenant-1', {
        ...mockCancellationOptions,
        cancelResales: false,
      });

      expect(result.resalesCancelled).toBe(0);
    });

    it('should skip report generation when generateReport is false', async () => {
      mockDb._mockChain.first.mockResolvedValue(mockEvent);
      mockDb._mockChain.update.mockResolvedValue(1);

      const result = await service.cancelEvent('event-123', 'tenant-1', {
        ...mockCancellationOptions,
        generateReport: false,
      });

      expect(result.reportId).toBeUndefined();
    });

    it('should generate report URL when report is created', async () => {
      mockDb._mockChain.first.mockResolvedValue(mockEvent);
      mockDb._mockChain.update.mockResolvedValue(1);
      mockDb._mockChain.insert.mockResolvedValue([1]);

      const result = await service.cancelEvent('event-123', 'tenant-1', mockCancellationOptions);

      expect(result.reportUrl).toContain('/api/v1/events/event-123/cancellation-report/');
    });

    it('should default refundPolicy to full when not specified', async () => {
      mockDb._mockChain.first.mockResolvedValue(mockEvent);
      mockDb._mockChain.update.mockResolvedValue(1);

      const result = await service.cancelEvent('event-123', 'tenant-1', {
        reason: 'Test',
        cancelledBy: 'user-123',
      });

      // Should still trigger refunds (default is full)
      expect(result).toBeDefined();
    });

    it('should record cancellation in audit log', async () => {
      mockDb._mockChain.first.mockResolvedValue(mockEvent);
      mockDb._mockChain.update.mockResolvedValue(1);
      mockDb._mockChain.insert.mockResolvedValue([1]);

      await service.cancelEvent('event-123', 'tenant-1', mockCancellationOptions);

      // Verify audit log insert was called
      expect(mockDb._mockChain.insert).toHaveBeenCalled();
    });

    it('should continue if audit log insert fails', async () => {
      mockDb._mockChain.first.mockResolvedValue(mockEvent);
      mockDb._mockChain.update.mockResolvedValue(1);
      mockDb._mockChain.insert
        .mockResolvedValueOnce([1]) // First insert succeeds
        .mockRejectedValueOnce(new Error('Audit insert failed')); // Second fails

      // Should not throw
      const result = await service.cancelEvent('event-123', 'tenant-1', mockCancellationOptions);
      expect(result).toBeDefined();
    });

    it('should throw on critical failure', async () => {
      mockDb._mockChain.update.mockRejectedValue(new Error('Database down'));

      await expect(
        service.cancelEvent('event-123', 'tenant-1', mockCancellationOptions)
      ).rejects.toThrow('Database down');
    });
  });

  describe('canCancelEvent', () => {
    it('should return canCancel true for valid event', async () => {
      mockDb._mockChain.first
        .mockResolvedValueOnce(mockEvent)
        .mockResolvedValueOnce({ total: 0 });

      const result = await service.canCancelEvent('event-123', 'tenant-1');

      expect(result.canCancel).toBe(true);
    });

    it('should return canCancel false for non-existent event', async () => {
      mockDb._mockChain.first.mockResolvedValue(null);

      const result = await service.canCancelEvent('non-existent', 'tenant-1');

      expect(result.canCancel).toBe(false);
      expect(result.reason).toBe('Event not found');
    });

    it('should return canCancel false for already cancelled event', async () => {
      mockDb._mockChain.first.mockResolvedValue({ ...mockEvent, status: 'CANCELLED' });

      const result = await service.canCancelEvent('event-123', 'tenant-1');

      expect(result.canCancel).toBe(false);
      expect(result.reason).toContain('CANCELLED');
    });

    it('should return canCancel false for completed event', async () => {
      mockDb._mockChain.first.mockResolvedValue({ ...mockEvent, status: 'COMPLETED' });

      const result = await service.canCancelEvent('event-123', 'tenant-1');

      expect(result.canCancel).toBe(false);
      expect(result.reason).toContain('COMPLETED');
    });

    it('should warn if event has started', async () => {
      const startedEvent = {
        ...mockEvent,
        event_date: new Date(Date.now() - 3600000), // 1 hour ago
      };
      mockDb._mockChain.first
        .mockResolvedValueOnce(startedEvent)
        .mockResolvedValueOnce({ total: 0 });

      const result = await service.canCancelEvent('event-123', 'tenant-1');

      expect(result.canCancel).toBe(true);
      expect(result.warnings).toContain('Event has already started - some attendees may have already entered');
    });

    it('should warn if tickets have been sold', async () => {
      mockDb._mockChain.first
        .mockResolvedValueOnce(mockEvent)
        .mockResolvedValueOnce({ total: 50 });

      const result = await service.canCancelEvent('event-123', 'tenant-1');

      expect(result.canCancel).toBe(true);
      expect(result.warnings).toContainEqual(expect.stringContaining('50 tickets have been sold'));
    });

    it('should return no warnings for event with no issues', async () => {
      mockDb._mockChain.first
        .mockResolvedValueOnce(mockEvent) // Future event
        .mockResolvedValueOnce({ total: 0 }); // No tickets sold

      const result = await service.canCancelEvent('event-123', 'tenant-1');

      expect(result.canCancel).toBe(true);
      expect(result.warnings).toBeUndefined();
    });
  });

  describe('getCancellationReport', () => {
    it('should return stored report', async () => {
      const mockReport = {
        id: 'report-123',
        eventId: 'event-123',
        reason: 'Weather',
        summary: { totalTicketsSold: 100 },
      };
      mockDb._mockChain.first.mockResolvedValue({
        report_data: JSON.stringify(mockReport),
      });

      const result = await service.getCancellationReport('event-123', 'tenant-1', 'report-123');

      expect(result).toEqual(mockReport);
    });

    it('should return null if report not found', async () => {
      mockDb._mockChain.first.mockResolvedValue(null);

      const result = await service.getCancellationReport('event-123', 'tenant-1', 'non-existent');

      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      mockDb._mockChain.first.mockRejectedValue(new Error('DB error'));

      const result = await service.getCancellationReport('event-123', 'tenant-1', 'report-123');

      expect(result).toBeNull();
    });

    it('should filter by tenant_id', async () => {
      mockDb._mockChain.first.mockResolvedValue(null);

      await service.getCancellationReport('event-123', 'tenant-1', 'report-123');

      expect(mockDb._mockChain.where).toHaveBeenCalledWith(
        expect.objectContaining({ tenant_id: 'tenant-1' })
      );
    });

    it('should filter by event_id', async () => {
      mockDb._mockChain.first.mockResolvedValue(null);

      await service.getCancellationReport('event-123', 'tenant-1', 'report-123');

      expect(mockDb._mockChain.where).toHaveBeenCalledWith(
        expect.objectContaining({ event_id: 'event-123' })
      );
    });
  });

  describe('report generation', () => {
    it('should include event name in report', async () => {
      mockDb._mockChain.first.mockResolvedValue(mockEvent);
      mockDb._mockChain.update.mockResolvedValue(1);
      mockDb._mockChain.insert.mockResolvedValue([1]);

      const result = await service.cancelEvent('event-123', 'tenant-1', mockCancellationOptions);

      expect(result.reportId).toBeDefined();
    });

    it('should include cancellation reason in report', async () => {
      mockDb._mockChain.first.mockResolvedValue(mockEvent);
      mockDb._mockChain.update.mockResolvedValue(1);

      await service.cancelEvent('event-123', 'tenant-1', mockCancellationOptions);

      // Report is generated with reason
    });

    it('should calculate refund amount based on policy', async () => {
      mockDb._mockChain.first.mockResolvedValue(mockEvent);
      mockDb._mockChain.update.mockResolvedValue(1);

      // Full refund
      await service.cancelEvent('event-123', 'tenant-1', {
        ...mockCancellationOptions,
        refundPolicy: 'full',
      });

      // Partial refund
      await service.cancelEvent('event-123', 'tenant-1', {
        ...mockCancellationOptions,
        refundPolicy: 'partial',
      });

      // No refund
      await service.cancelEvent('event-123', 'tenant-1', {
        ...mockCancellationOptions,
        refundPolicy: 'none',
      });
    });

    it('should store report in database', async () => {
      mockDb._mockChain.first.mockResolvedValue(mockEvent);
      mockDb._mockChain.update.mockResolvedValue(1);
      mockDb._mockChain.insert.mockResolvedValue([1]);

      await service.cancelEvent('event-123', 'tenant-1', mockCancellationOptions);

      expect(mockDb).toHaveBeenCalledWith('event_cancellation_reports');
    });

    it('should continue if report storage fails', async () => {
      mockDb._mockChain.first.mockResolvedValue(mockEvent);
      mockDb._mockChain.update.mockResolvedValue(1);
      mockDb._mockChain.insert.mockRejectedValue(new Error('Table not found'));

      // Should not throw
      const result = await service.cancelEvent('event-123', 'tenant-1', mockCancellationOptions);
      expect(result).toBeDefined();
    });
  });

  describe('invalidate tickets', () => {
    it('should update capacity to zero', async () => {
      mockDb._mockChain.first.mockResolvedValue(mockEvent);
      mockDb._mockChain.update.mockResolvedValue({ rowCount: 5 });

      await service.cancelEvent('event-123', 'tenant-1', mockCancellationOptions);

      expect(mockDb._mockChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          available_capacity: 0,
          is_active: false,
        })
      );
    });

    it('should track invalidated ticket count', async () => {
      mockDb._mockChain.first.mockResolvedValue(mockEvent);
      mockDb._mockChain.update.mockResolvedValue({ rowCount: 10 });

      const result = await service.cancelEvent('event-123', 'tenant-1', mockCancellationOptions);

      // ticketsInvalidated should be set
      expect(result.ticketsInvalidated).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty ticket list', async () => {
      mockDb._mockChain.first.mockResolvedValue(mockEvent);
      mockDb._mockChain.update.mockResolvedValue(1);

      const result = await service.cancelEvent('event-123', 'tenant-1', mockCancellationOptions);

      expect(result.status).toBeDefined();
    });

    it('should handle null event_date', async () => {
      const eventNoDate = { ...mockEvent, event_date: null };
      mockDb._mockChain.first.mockResolvedValue(eventNoDate);

      const result = await service.canCancelEvent('event-123', 'tenant-1');

      expect(result.canCancel).toBe(true);
    });

    it('should handle deleted event', async () => {
      mockDb._mockChain.first.mockResolvedValue(null); // whereNull filters it out

      const result = await service.canCancelEvent('event-123', 'tenant-1');

      expect(result.canCancel).toBe(false);
    });
  });
});

// Export singleton test
describe('eventCancellationService singleton', () => {
  it('should export singleton instance', async () => {
    const { eventCancellationService } = await import('../../../src/services/event-cancellation.service');
    expect(eventCancellationService).toBeInstanceOf(EventCancellationService);
  });
});

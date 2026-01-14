/**
 * Unit Tests for Refund Policy Service
 * 
 * Tests refund eligibility, policy enforcement, and refund processing.
 */

// Mock dependencies
jest.mock('../../../src/utils/pci-log-scrubber.util', () => ({
  SafeLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock('../../../src/services/cache.service', () => ({
  cacheService: {
    getOrCompute: jest.fn((key, computeFn) => computeFn()),
    delete: jest.fn().mockResolvedValue(true),
  },
}));

import { RefundPolicyService } from '../../../src/services/refund-policy.service';
import { cacheService } from '../../../src/services/cache.service';

describe('RefundPolicyService', () => {
  let service: RefundPolicyService;
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    service = new RefundPolicyService(mockPool);
  });

  describe('checkRefundEligibility', () => {
    it('should return ineligible when ticket not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await service.checkRefundEligibility('ticket-123', 'tenant-1');

      expect(result.isEligible).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should return eligible when within refund window', async () => {
      const futureEvent = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days away
      const purchaseDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

      mockPool.query.mockResolvedValue({
        rows: [{
          ticket_id: 'ticket-123',
          purchase_date: purchaseDate,
          status: 'active',
          event_date: futureEvent,
          event_type: 'concert',
          venue_id: 'venue-1',
          refund_policy_hours: 48,
        }],
      });

      const result = await service.checkRefundEligibility('ticket-123', 'tenant-1');

      expect(result.isEligible).toBe(true);
      expect(result.hoursRemaining).toBeGreaterThan(0);
      expect(result.reason).toBeUndefined();
    });

    it('should return ineligible when past refund window', async () => {
      const soonEvent = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour away
      const purchaseDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      mockPool.query.mockResolvedValue({
        rows: [{
          ticket_id: 'ticket-123',
          purchase_date: purchaseDate,
          status: 'active',
          event_date: soonEvent,
          event_type: 'concert',
          venue_id: 'venue-1',
          refund_policy_hours: 48,
        }],
      });

      const result = await service.checkRefundEligibility('ticket-123', 'tenant-1');

      expect(result.isEligible).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should use venue-specific refund policy hours', async () => {
      const futureEvent = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours away
      
      mockPool.query.mockResolvedValue({
        rows: [{
          ticket_id: 'ticket-123',
          purchase_date: new Date(),
          status: 'active',
          event_date: futureEvent,
          event_type: 'concert',
          venue_id: 'venue-1',
          refund_policy_hours: 72, // Custom 72-hour policy
        }],
      });

      const result = await service.checkRefundEligibility('ticket-123', 'tenant-1');

      // With 72-hour policy and event 48 hours away, should be ineligible
      expect(result.isEligible).toBe(false);
    });

    it('should use default policy when venue has none', async () => {
      const futureEvent = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days away

      mockPool.query.mockResolvedValue({
        rows: [{
          ticket_id: 'ticket-123',
          purchase_date: new Date(),
          status: 'active',
          event_date: futureEvent,
          event_type: 'concert',
          venue_id: 'venue-1',
          refund_policy_hours: null, // No custom policy
        }],
      });

      const result = await service.checkRefundEligibility('ticket-123', 'tenant-1');

      // Default is 48 hours, event is 5 days away, should be eligible
      expect(result.isEligible).toBe(true);
    });

    it('should use cache for repeated checks', async () => {
      await service.checkRefundEligibility('ticket-123', 'tenant-1');

      expect(cacheService.getOrCompute).toHaveBeenCalledWith(
        'refund:eligibility:ticket-123',
        expect.any(Function),
        300
      );
    });

    it('should return refund deadline date', async () => {
      const futureEvent = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      mockPool.query.mockResolvedValue({
        rows: [{
          ticket_id: 'ticket-123',
          purchase_date: new Date(),
          status: 'active',
          event_date: futureEvent,
          event_type: 'concert',
          venue_id: 'venue-1',
          refund_policy_hours: 48,
        }],
      });

      const result = await service.checkRefundEligibility('ticket-123', 'tenant-1');

      expect(result.eventDate).toBeInstanceOf(Date);
      expect(result.purchaseDate).toBeInstanceOf(Date);
      expect(result.refundDeadline).toBeInstanceOf(Date);
      expect(result.refundDeadline.getTime()).toBeLessThan(result.eventDate.getTime());
    });
  });

  describe('processRefundRequest', () => {
    beforeEach(() => {
      // Mock eligibility check to return eligible
      const futureEvent = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      mockPool.query.mockResolvedValue({
        rows: [{
          ticket_id: 'ticket-123',
          purchase_date: new Date(),
          status: 'active',
          event_date: futureEvent,
          event_type: 'concert',
          venue_id: 'venue-1',
          refund_policy_hours: 48,
        }],
      });
    });

    it('should deny refund when not eligible', async () => {
      // Override with ineligible ticket
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await service.processRefundRequest(
        'ticket-123',
        'tenant-1',
        'user-1',
        'Changed my mind'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should create refund request when eligible', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ refund_id: 'refund-456', refund_amount_cents: 5000 }],
        }) // INSERT
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE ticket status
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.processRefundRequest(
        'ticket-123',
        'tenant-1',
        'user-1',
        'Changed my mind'
      );

      expect(result.success).toBe(true);
      expect(result.refundId).toBe('refund-456');
      expect(result.message).toContain('successfully');
    });

    it('should rollback on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')); // INSERT fails

      const result = await service.processRefundRequest(
        'ticket-123',
        'tenant-1',
        'user-1',
        'Reason'
      );

      expect(result.success).toBe(false);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should invalidate cache after refund request', async () => {
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ refund_id: 'refund-123', refund_amount_cents: 1000 }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({});

      await service.processRefundRequest('ticket-123', 'tenant-1', 'user-1', 'Reason');

      expect(cacheService.delete).toHaveBeenCalledWith('refund:eligibility:ticket-123');
    });

    it('should update ticket status to refund_pending', async () => {
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ refund_id: 'refund-123', refund_amount_cents: 1000 }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({});

      await service.processRefundRequest('ticket-123', 'tenant-1', 'user-1', 'Reason');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'refund_pending'"),
        ['ticket-123', 'tenant-1']
      );
    });

    it('should fail if refund record creation returns empty', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // INSERT returns nothing

      const result = await service.processRefundRequest(
        'ticket-123',
        'tenant-1',
        'user-1',
        'Reason'
      );

      expect(result.success).toBe(false);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('updateVenueRefundPolicy', () => {
    it('should update venue refund policy hours', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 1 });

      await service.updateVenueRefundPolicy('venue-123', 'tenant-1', 72);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE venues'),
        [72, 'venue-123', 'tenant-1']
      );
    });

    it('should accept different window hours', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 1 });

      await service.updateVenueRefundPolicy('venue-1', 'tenant-1', 24);
      await service.updateVenueRefundPolicy('venue-2', 'tenant-1', 168); // 1 week

      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('getRefundStatistics', () => {
    it('should return refund statistics for tenant', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      mockPool.query.mockResolvedValue({
        rows: [{
          total_refunds: '100',
          total_refunded_cents: '500000',
          avg_refund_cents: '5000',
          completed_refunds: '80',
          pending_refunds: '15',
          rejected_refunds: '5',
        }],
      });

      const stats = await service.getRefundStatistics('tenant-1', startDate, endDate);

      expect(stats.total_refunds).toBe('100');
      expect(stats.total_refunded_cents).toBe('500000');
      expect(stats.completed_refunds).toBe('80');
      expect(stats.pending_refunds).toBe('15');
      expect(stats.rejected_refunds).toBe('5');
    });

    it('should query with correct date range', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      mockPool.query.mockResolvedValue({
        rows: [{
          total_refunds: '0',
          total_refunded_cents: null,
          avg_refund_cents: null,
          completed_refunds: '0',
          pending_refunds: '0',
          rejected_refunds: '0',
        }],
      });

      await service.getRefundStatistics('tenant-1', startDate, endDate);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('requested_at BETWEEN'),
        ['tenant-1', startDate, endDate]
      );
    });

    it('should handle null totals when no refunds', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          total_refunds: '0',
          total_refunded_cents: null,
          avg_refund_cents: null,
          completed_refunds: '0',
          pending_refunds: '0',
          rejected_refunds: '0',
        }],
      });

      const stats = await service.getRefundStatistics(
        'tenant-1',
        new Date(),
        new Date()
      );

      expect(stats.total_refunded_cents).toBeNull();
      expect(stats.avg_refund_cents).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle event happening right now', async () => {
      const now = new Date();
      
      mockPool.query.mockResolvedValue({
        rows: [{
          ticket_id: 'ticket-123',
          purchase_date: new Date(Date.now() - 24 * 60 * 60 * 1000),
          status: 'active',
          event_date: now,
          event_type: 'concert',
          venue_id: 'venue-1',
          refund_policy_hours: 48,
        }],
      });

      const result = await service.checkRefundEligibility('ticket-123', 'tenant-1');

      expect(result.isEligible).toBe(false);
    });

    it('should handle event in the past', async () => {
      const pastEvent = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      mockPool.query.mockResolvedValue({
        rows: [{
          ticket_id: 'ticket-123',
          purchase_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          status: 'active',
          event_date: pastEvent,
          event_type: 'concert',
          venue_id: 'venue-1',
          refund_policy_hours: 48,
        }],
      });

      const result = await service.checkRefundEligibility('ticket-123', 'tenant-1');

      expect(result.isEligible).toBe(false);
    });

    it('should handle zero refund policy hours', async () => {
      const futureEvent = new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      mockPool.query.mockResolvedValue({
        rows: [{
          ticket_id: 'ticket-123',
          purchase_date: new Date(),
          status: 'active',
          event_date: futureEvent,
          event_type: 'concert',
          venue_id: 'venue-1',
          refund_policy_hours: 0,
        }],
      });

      const result = await service.checkRefundEligibility('ticket-123', 'tenant-1');

      // With 0 hour window, deadline is the event itself
      expect(result.isEligible).toBe(true);
    });
  });

  describe('Minimum Window Enforcement', () => {
    it('should deny refund within minimum window (2 hours before event)', async () => {
      const soonEvent = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour away
      
      mockPool.query.mockResolvedValue({
        rows: [{
          ticket_id: 'ticket-123',
          purchase_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          status: 'active',
          event_date: soonEvent,
          event_type: 'concert',
          venue_id: 'venue-1',
          refund_policy_hours: 0, // No advance window required
        }],
      });

      const result = await service.checkRefundEligibility('ticket-123', 'tenant-1');

      // Even with 0-hour policy, minimum 2-hour rule should apply
      expect(result.isEligible).toBe(false);
      expect(result.reason).toContain('2 hours');
    });
  });
});

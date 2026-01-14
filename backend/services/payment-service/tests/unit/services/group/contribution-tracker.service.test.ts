/**
 * Unit Tests for Contribution Tracker Service
 * 
 * Tests group payment contribution tracking, history, and analytics.
 */

// Mock database before imports
jest.mock('../../../../src/config/database', () => ({
  query: jest.fn(),
}));

import { ContributionTrackerService } from '../../../../src/services/group/contribution-tracker.service';
import { query } from '../../../../src/config/database';

describe('ContributionTrackerService', () => {
  let service: ContributionTrackerService;
  const mockQuery = query as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ContributionTrackerService();
  });

  describe('trackContribution', () => {
    it('should track a contribution successfully', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await service.trackContribution(
        'group-123',
        'member-456',
        5000,
        'payment-789'
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE group_payment_members'),
        ['group-123', 'member-456', 5000, 'payment-789']
      );
    });

    it('should set paid status and timestamp', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await service.trackContribution(
        'group-abc',
        'member-def',
        10000,
        'pay-ghi'
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET paid = true'),
        expect.any(Array)
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('paid_at = CURRENT_TIMESTAMP'),
        expect.any(Array)
      );
    });

    it('should update status to completed', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await service.trackContribution(
        'group-1',
        'member-1',
        2500,
        'pay-1'
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'completed'"),
        expect.any(Array)
      );
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(
        service.trackContribution('group-1', 'member-1', 1000, 'pay-1')
      ).rejects.toThrow('Database error');
    });
  });

  describe('getContributionHistory', () => {
    it('should return contributions and timeline', async () => {
      // First query - contributions
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              member_id: 'member-1',
              member_name: 'John Doe',
              amount: 5000,
              contributed_at: new Date('2026-01-10'),
              status: 'completed',
            },
            {
              member_id: 'member-2',
              member_name: 'Jane Smith',
              amount: 5000,
              contributed_at: new Date('2026-01-09'),
              status: 'completed',
            },
          ],
        })
        // Second query - timeline
        .mockResolvedValueOnce({
          rows: [
            {
              timestamp: new Date('2026-01-08'),
              event: 'group_created',
              details: { total_amount: 10000 },
            },
            {
              timestamp: new Date('2026-01-09'),
              event: 'member_paid',
              details: { member_id: 'member-2', amount: 5000 },
            },
            {
              timestamp: new Date('2026-01-10'),
              event: 'member_paid',
              details: { member_id: 'member-1', amount: 5000 },
            },
          ],
        });

      const result = await service.getContributionHistory('group-123');

      expect(result.contributions).toHaveLength(2);
      expect(result.timeline).toHaveLength(3);
    });

    it('should query contributions for specific group', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getContributionHistory('specific-group-id');

      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('WHERE m.group_payment_id = $1'),
        ['specific-group-id']
      );
    });

    it('should only include paid members in contributions', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getContributionHistory('group-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('m.paid = true'),
        expect.any(Array)
      );
    });

    it('should order contributions by paid_at descending', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getContributionHistory('group-123');

      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('ORDER BY m.paid_at DESC'),
        expect.any(Array)
      );
    });

    it('should return empty arrays for group with no contributions', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getContributionHistory('empty-group');

      expect(result.contributions).toEqual([]);
      expect(result.timeline).toEqual([]);
    });
  });

  describe('handleFailedContribution', () => {
    it('should mark member as payment_failed', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await service.handleFailedContribution(
        'group-123',
        'member-456',
        'card_declined'
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'payment_failed'"),
        ['member-456', 'group-123']
      );
    });

    it('should update timestamp', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await service.handleFailedContribution(
        'group-1',
        'member-1',
        'insufficient_funds'
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('updated_at = CURRENT_TIMESTAMP'),
        expect.any(Array)
      );
    });

    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValue(new Error('DB Error'));

      await expect(
        service.handleFailedContribution('g1', 'm1', 'error')
      ).rejects.toThrow('DB Error');
    });
  });

  describe('getGroupAnalytics', () => {
    it('should return analytics for venue', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            total_groups: '100',
            successful_groups: '85',
            avg_group_size: '4.5',
            avg_completion_minutes: '1440',
          }],
        })
        .mockResolvedValueOnce({
          rows: [
            { reason: 'expired', count: 10 },
            { reason: 'cancelled_by_organizer', count: 5 },
          ],
        });

      const result = await service.getGroupAnalytics('venue-123');

      expect(result.totalGroups).toBe(100);
      expect(result.successRate).toBe(85);
      expect(result.averageGroupSize).toBe(4.5);
      expect(result.averageCompletionTime).toBe(1440);
      expect(result.commonFailureReasons).toHaveLength(2);
    });

    it('should calculate success rate correctly', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            total_groups: '50',
            successful_groups: '40',
            avg_group_size: '3',
            avg_completion_minutes: '60',
          }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getGroupAnalytics('venue-abc');

      expect(result.successRate).toBe(80); // 40/50 * 100
    });

    it('should handle zero groups gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            total_groups: null,
            successful_groups: null,
            avg_group_size: null,
            avg_completion_minutes: null,
          }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getGroupAnalytics('empty-venue');

      expect(result.totalGroups).toBe(0);
      expect(result.successRate).toBe(0);
      expect(result.averageGroupSize).toBe(0);
      expect(result.averageCompletionTime).toBe(0);
      expect(result.commonFailureReasons).toEqual([]);
    });

    it('should query stats for specific venue', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getGroupAnalytics('my-venue-id');

      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('WHERE e.venue_id = $1'),
        ['my-venue-id']
      );
    });

    it('should limit failure reasons to top 5', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getGroupAnalytics('venue');

      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('LIMIT 5'),
        expect.any(Array)
      );
    });

    it('should order failure reasons by count descending', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getGroupAnalytics('venue');

      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('ORDER BY count DESC'),
        expect.any(Array)
      );
    });

    it('should filter only cancelled groups for failure reasons', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getGroupAnalytics('venue');

      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("gp.status = 'cancelled'"),
        expect.any(Array)
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large amounts', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await service.trackContribution(
        'group-big',
        'member-big',
        99999999, // $999,999.99
        'pay-big'
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['group-big', 'member-big', 99999999, 'pay-big']
      );
    });

    it('should handle special characters in IDs', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await service.trackContribution(
        'group-123-abc',
        'member-456-def',
        1000,
        'pay_xyz_123'
      );

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should handle concurrent calls', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await Promise.all([
        service.trackContribution('g1', 'm1', 1000, 'p1'),
        service.trackContribution('g2', 'm2', 2000, 'p2'),
        service.trackContribution('g3', 'm3', 3000, 'p3'),
      ]);

      expect(mockQuery).toHaveBeenCalledTimes(3);
    });
  });
});

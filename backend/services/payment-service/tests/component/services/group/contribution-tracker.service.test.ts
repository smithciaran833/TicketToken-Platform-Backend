/**
 * COMPONENT TEST: ContributionTrackerService
 *
 * Tests group payment contribution tracking and analytics
 */

import { v4 as uuidv4 } from 'uuid';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const mockQuery = jest.fn();

jest.mock('../../../../src/config/database', () => ({
  query: mockQuery,
}));

import { ContributionTrackerService } from '../../../../src/services/group/contribution-tracker.service';

describe('ContributionTrackerService Component Tests', () => {
  let service: ContributionTrackerService;
  let groupId: string;
  let memberId: string;
  let venueId: string;

  beforeEach(() => {
    groupId = uuidv4();
    memberId = uuidv4();
    venueId = uuidv4();
    mockQuery.mockReset();
    service = new ContributionTrackerService();
  });

  // ===========================================================================
  // TRACK CONTRIBUTION
  // ===========================================================================
  describe('trackContribution()', () => {
    it('should update member payment status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.trackContribution(groupId, memberId, 5000, 'pay_123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE group_payment_members'),
        expect.arrayContaining([groupId, memberId])
      );
    });

    it('should set paid flag and timestamp', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.trackContribution(groupId, memberId, 5000, 'pay_123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('paid = true'),
        expect.any(Array)
      );
    });

    it('should record payment ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.trackContribution(groupId, memberId, 5000, 'pay_123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('payment_id'),
        expect.arrayContaining(['pay_123'])
      );
    });
  });

  // ===========================================================================
  // GET CONTRIBUTION HISTORY
  // ===========================================================================
  describe('getContributionHistory()', () => {
    it('should return contributions and timeline', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { member_id: memberId, member_name: 'John', amount: 5000, contributed_at: new Date(), status: 'completed' },
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            { timestamp: new Date(), event: 'group_created', details: { total_amount: 10000 } },
            { timestamp: new Date(), event: 'member_paid', details: { member_id: memberId, amount: 5000 } },
          ]
        });

      const result = await service.getContributionHistory(groupId);

      expect(result.contributions).toHaveLength(1);
      expect(result.timeline).toHaveLength(2);
    });

    it('should order contributions by date descending', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getContributionHistory(groupId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY m.paid_at DESC'),
        [groupId]
      );
    });

    it('should build timeline from group and member events', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getContributionHistory(groupId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UNION ALL'),
        [groupId]
      );
    });
  });

  // ===========================================================================
  // HANDLE FAILED CONTRIBUTION
  // ===========================================================================
  describe('handleFailedContribution()', () => {
    it('should mark member as payment_failed', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.handleFailedContribution(groupId, memberId, 'card_declined');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'payment_failed'"),
        [memberId, groupId]
      );
    });
  });

  // ===========================================================================
  // GET GROUP ANALYTICS
  // ===========================================================================
  describe('getGroupAnalytics()', () => {
    it('should return venue group analytics', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            total_groups: '100',
            successful_groups: '85',
            avg_group_size: '4.5',
            avg_completion_minutes: '6.2',
          }]
        })
        .mockResolvedValueOnce({
          rows: [
            { reason: 'expired_no_payment', count: '10' },
            { reason: 'user_cancelled', count: '5' },
          ]
        });

      const result = await service.getGroupAnalytics(venueId);

      expect(result.totalGroups).toBe(100);
      expect(result.successRate).toBe(85);
      expect(result.averageGroupSize).toBe(4.5);
      expect(result.averageCompletionTime).toBe(6.2);
      expect(result.commonFailureReasons).toHaveLength(2);
    });

    it('should handle zero groups', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            total_groups: '0',
            successful_groups: '0',
            avg_group_size: null,
            avg_completion_minutes: null,
          }]
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getGroupAnalytics(venueId);

      expect(result.totalGroups).toBe(0);
      expect(result.successRate).toBe(0);
      expect(result.averageGroupSize).toBe(0);
    });

    it('should query by venue ID', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total_groups: '0', successful_groups: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getGroupAnalytics(venueId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('e.venue_id = $1'),
        [venueId]
      );
    });
  });
});

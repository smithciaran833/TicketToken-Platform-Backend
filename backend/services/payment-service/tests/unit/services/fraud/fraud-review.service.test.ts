/**
 * Unit Tests for Fraud Review Service
 * 
 * Tests fraud review queue, decisions, and analytics.
 */

// Create mock query builder chain
const mockQueryBuilder = {
  leftJoin: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  whereIn: jest.fn().mockReturnThis(),
  whereBetween: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  first: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  increment: jest.fn().mockReturnThis(),
  then: jest.fn(),
};

const mockDb = jest.fn(() => mockQueryBuilder);
mockDb.raw = jest.fn((sql) => sql);

// Mock dependencies before imports
jest.mock('../../../../src/config/database', () => ({
  db: mockDb,
}));

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { FraudReviewService, fraudReviewService } from '../../../../src/services/fraud/fraud-review.service';
import { db } from '../../../../src/config/database';
import { logger } from '../../../../src/utils/logger';

describe('FraudReviewService', () => {
  let service: FraudReviewService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FraudReviewService();
    
    // Reset mock chain
    Object.keys(mockQueryBuilder).forEach(key => {
      if (typeof mockQueryBuilder[key] === 'function' && key !== 'then') {
        mockQueryBuilder[key].mockReturnThis();
      }
    });
  });

  describe('getPendingReviews', () => {
    it('should fetch pending reviews with defaults', async () => {
      mockQueryBuilder.then.mockResolvedValue([
        { id: 'review-1', status: 'pending', score: 75 },
        { id: 'review-2', status: 'in_review', score: 85 },
      ]);

      const results = await service.getPendingReviews();

      expect(mockDb).toHaveBeenCalledWith('fraud_review_queue');
      expect(mockQueryBuilder.leftJoin).toHaveBeenCalled();
      expect(mockQueryBuilder.whereIn).toHaveBeenCalledWith(
        'fraud_review_queue.status',
        ['pending', 'in_review']
      );
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(50);
    });

    it('should filter by priority', async () => {
      mockQueryBuilder.then.mockResolvedValue([]);

      await service.getPendingReviews({ priority: 'high' });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'fraud_review_queue.priority',
        'high'
      );
    });

    it('should filter by status', async () => {
      mockQueryBuilder.then.mockResolvedValue([]);

      await service.getPendingReviews({ status: 'escalated' });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'fraud_review_queue.status',
        'escalated'
      );
    });

    it('should filter by assigned analyst', async () => {
      mockQueryBuilder.then.mockResolvedValue([]);

      await service.getPendingReviews({ assignedTo: 'analyst-123' });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'fraud_review_queue.assigned_to',
        'analyst-123'
      );
    });

    it('should respect custom limit', async () => {
      mockQueryBuilder.then.mockResolvedValue([]);

      await service.getPendingReviews({ limit: 10 });

      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
    });

    it('should order by created_at descending', async () => {
      mockQueryBuilder.then.mockResolvedValue([]);

      await service.getPendingReviews();

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'fraud_review_queue.created_at',
        'desc'
      );
    });
  });

  describe('assignReview', () => {
    it('should assign review to analyst', async () => {
      mockQueryBuilder.update.mockResolvedValue(1);

      await service.assignReview('review-123', 'analyst-456');

      expect(mockDb).toHaveBeenCalledWith('fraud_review_queue');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('id', 'review-123');
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          assigned_to: 'analyst-456',
          status: 'in_review',
        })
      );
    });

    it('should log assignment', async () => {
      mockQueryBuilder.update.mockResolvedValue(1);

      await service.assignReview('review-abc', 'analyst-def');

      expect(logger.info).toHaveBeenCalledWith(
        { reviewId: 'review-abc', analystId: 'analyst-def' },
        'Review assigned'
      );
    });
  });

  describe('completeReview', () => {
    const mockReview = {
      id: 'review-123',
      fraud_check_id: 'check-456',
      ip_address: '192.168.1.1',
      user_id: 'user-789',
      payment_id: 'pay-101',
    };

    it('should throw error if review not found', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      await expect(
        service.completeReview('nonexistent', {
          decision: 'approve',
          reviewerNotes: 'Test',
          reviewerId: 'analyst-1',
        })
      ).rejects.toThrow('Review not found');
    });

    it('should update review with approval decision', async () => {
      mockQueryBuilder.first.mockResolvedValue(mockReview);
      mockQueryBuilder.update.mockResolvedValue(1);

      await service.completeReview('review-123', {
        decision: 'approve',
        reviewerNotes: 'Verified legitimate',
        reviewerId: 'analyst-1',
      });

      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'approved',
          decision: 'approve',
          reviewer_notes: 'Verified legitimate',
        })
      );
    });

    it('should set escalated status for escalate decision', async () => {
      mockQueryBuilder.first.mockResolvedValue(mockReview);
      mockQueryBuilder.update.mockResolvedValue(1);

      await service.completeReview('review-123', {
        decision: 'escalate',
        reviewerNotes: 'Needs senior review',
        reviewerId: 'analyst-1',
      });

      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'escalated',
          decision: 'escalate',
        })
      );
    });

    it('should log completed review', async () => {
      mockQueryBuilder.first.mockResolvedValue(mockReview);
      mockQueryBuilder.update.mockResolvedValue(1);

      await service.completeReview('review-123', {
        decision: 'decline',
        reviewerNotes: 'Confirmed fraud',
        reviewerId: 'analyst-1',
      });

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewId: 'review-123',
          decision: 'decline',
          reviewerId: 'analyst-1',
        }),
        'Review completed'
      );
    });
  });

  describe('getReviewStats', () => {
    it('should return review statistics', async () => {
      mockQueryBuilder.first.mockResolvedValue({
        total: '100',
        pending: '20',
        in_review: '10',
        approved: '50',
        declined: '15',
        escalated: '5',
        avg_review_time_seconds: '3600',
      });

      const stats = await service.getReviewStats();

      expect(stats.total).toBe(100);
      expect(stats.pending).toBe(20);
      expect(stats.inReview).toBe(10);
      expect(stats.approved).toBe(50);
      expect(stats.declined).toBe(15);
      expect(stats.escalated).toBe(5);
      expect(stats.avgReviewTimeSeconds).toBe(3600);
    });

    it('should filter by date range', async () => {
      mockQueryBuilder.first.mockResolvedValue({
        total: '50',
        pending: '10',
        in_review: '5',
        approved: '25',
        declined: '8',
        escalated: '2',
        avg_review_time_seconds: '1800',
      });

      const dateRange = {
        start: new Date('2026-01-01'),
        end: new Date('2026-01-31'),
      };

      await service.getReviewStats(dateRange);

      expect(mockQueryBuilder.whereBetween).toHaveBeenCalledWith(
        'created_at',
        [dateRange.start, dateRange.end]
      );
    });

    it('should handle null avg review time', async () => {
      mockQueryBuilder.first.mockResolvedValue({
        total: '0',
        pending: '0',
        in_review: '0',
        approved: '0',
        declined: '0',
        escalated: '0',
        avg_review_time_seconds: null,
      });

      const stats = await service.getReviewStats();

      expect(stats.avgReviewTimeSeconds).toBe(0);
    });
  });

  describe('getFraudTrends', () => {
    it('should return fraud trends for period', async () => {
      mockQueryBuilder.then.mockResolvedValue([
        {
          date: '2026-01-09',
          total_checks: '100',
          declined: '5',
          flagged: '10',
          approved: '85',
          avg_score: '25.5',
        },
        {
          date: '2026-01-10',
          total_checks: '120',
          declined: '8',
          flagged: '15',
          approved: '97',
          avg_score: '28.3',
        },
      ]);

      const trends = await service.getFraudTrends(30);

      expect(trends).toHaveLength(2);
      expect(trends[0].totalChecks).toBe(100);
      expect(trends[0].declined).toBe(5);
      expect(trends[0].avgScore).toBe(25.5);
    });

    it('should use default 30 days', async () => {
      mockQueryBuilder.then.mockResolvedValue([]);

      await service.getFraudTrends();

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'timestamp',
        '>=',
        expect.any(Date)
      );
    });

    it('should group by date', async () => {
      mockQueryBuilder.then.mockResolvedValue([]);

      await service.getFraudTrends(7);

      expect(mockQueryBuilder.groupBy).toHaveBeenCalled();
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('date', 'asc');
    });
  });

  describe('getTopFraudSignals', () => {
    it('should return top fraud signals', async () => {
      mockQueryBuilder.then.mockResolvedValue([
        { signals: JSON.stringify([{ type: 'high_velocity' }, { type: 'new_device' }]) },
        { signals: JSON.stringify([{ type: 'high_velocity' }, { type: 'vpn_detected' }]) },
        { signals: JSON.stringify([{ type: 'high_velocity' }]) },
      ]);

      const signals = await service.getTopFraudSignals(30);

      expect(signals[0].type).toBe('high_velocity');
      expect(signals[0].count).toBe(3);
    });

    it('should limit to top 10 signals', async () => {
      const manySignals = Array.from({ length: 15 }, (_, i) => ({
        signals: JSON.stringify([{ type: `signal_${i}` }]),
      }));
      mockQueryBuilder.then.mockResolvedValue(manySignals);

      const signals = await service.getTopFraudSignals();

      expect(signals.length).toBeLessThanOrEqual(10);
    });

    it('should handle empty signals', async () => {
      mockQueryBuilder.then.mockResolvedValue([
        { signals: '[]' },
        { signals: null },
      ]);

      const signals = await service.getTopFraudSignals();

      expect(signals).toEqual([]);
    });

    it('should filter only declined and review decisions', async () => {
      mockQueryBuilder.then.mockResolvedValue([]);

      await service.getTopFraudSignals(14);

      expect(mockQueryBuilder.whereIn).toHaveBeenCalledWith(
        'decision',
        ['decline', 'review']
      );
    });
  });

  describe('Singleton Export', () => {
    it('should export fraudReviewService singleton', () => {
      expect(fraudReviewService).toBeDefined();
      expect(fraudReviewService).toBeInstanceOf(FraudReviewService);
    });
  });
});

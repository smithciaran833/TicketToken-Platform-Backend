/**
 * COMPONENT TEST: FraudReviewService
 *
 * Tests FraudReviewService with REAL Database
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Shared pool
let sharedPool: Pool;

function getSharedPool(): Pool {
  if (!sharedPool) {
    sharedPool = new Pool({
      host: 'localhost',
      port: 5432,
      database: 'tickettoken_db',
      user: 'postgres',
      password: 'postgres',
    });
  }
  return sharedPool;
}

// Mock database config
jest.mock('../../../../src/config/database', () => ({
  query: async (text: string, values?: any[]) => {
    return getSharedPool().query(text, values);
  },
}));

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { FraudReviewService } from '../../../../src/services/fraud/fraud-review.service';

describe('FraudReviewService Component Tests', () => {
  let pool: Pool;
  let service: FraudReviewService;
  let tenantId: string;
  let userId: string;
  let analystId: string;

  beforeAll(async () => {
    pool = getSharedPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    tenantId = uuidv4();
    userId = uuidv4();
    analystId = uuidv4();

    // Create test tenant
    await pool.query(`
      INSERT INTO tenants (id, name, slug, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
    `, [tenantId, 'Test Tenant', `test-${tenantId.slice(0, 8)}`]);

    // Create test user
    await pool.query(`
      INSERT INTO users (id, tenant_id, email, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [userId, tenantId, `user-${userId.slice(0, 8)}@test.com`, 'hash']);

    // Create analyst user
    await pool.query(`
      INSERT INTO users (id, tenant_id, email, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [analystId, tenantId, `analyst-${analystId.slice(0, 8)}@test.com`, 'hash']);

    service = new FraudReviewService();
  });

  afterEach(async () => {
    await pool.query('DELETE FROM fraud_review_queue WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM fraud_checks WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  });

  // Helper to create fraud check
  async function createFraudCheck(score: number = 0.75, decision: string = 'review'): Promise<string> {
    const checkId = uuidv4();
    await pool.query(`
      INSERT INTO fraud_checks (
        id, tenant_id, user_id, score, decision, signals, device_fingerprint, ip_address, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::inet, NOW())
    `, [
      checkId,
      tenantId,
      userId,
      score,
      decision,
      JSON.stringify([{ type: 'rapid_purchases', severity: 'high' }]),
      'device_fp_123',
      '192.168.1.100',
    ]);
    return checkId;
  }

  // ===========================================================================
  // CREATE REVIEW ITEM
  // ===========================================================================
  describe('createReviewItem()', () => {
    it('should create a review item', async () => {
      const reviewId = await service.createReviewItem({
        tenantId,
        userId,
        reason: 'Suspicious activity detected',
        priority: 'high',
      });

      expect(reviewId).toBeDefined();

      // Verify in DB
      const result = await pool.query(
        'SELECT * FROM fraud_review_queue WHERE id = $1',
        [reviewId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('pending');
      expect(result.rows[0].priority).toBe('high');
    });

    it('should create review with fraud check reference', async () => {
      const fraudCheckId = await createFraudCheck();

      const reviewId = await service.createReviewItem({
        tenantId,
        userId,
        fraudCheckId,
        reason: 'High risk score',
      });

      const result = await pool.query(
        'SELECT * FROM fraud_review_queue WHERE id = $1',
        [reviewId]
      );
      expect(result.rows[0].fraud_check_id).toBe(fraudCheckId);
    });

    it('should default to medium priority', async () => {
      const reviewId = await service.createReviewItem({
        tenantId,
        userId,
        reason: 'Test reason',
      });

      const result = await pool.query(
        'SELECT priority FROM fraud_review_queue WHERE id = $1',
        [reviewId]
      );
      expect(result.rows[0].priority).toBe('medium');
    });
  });

  // ===========================================================================
  // GET PENDING REVIEWS
  // ===========================================================================
  describe('getPendingReviews()', () => {
    it('should return empty array when no reviews', async () => {
      const reviews = await service.getPendingReviews({ tenantId });

      expect(reviews).toEqual([]);
    });

    it('should return pending and in_review items', async () => {
      await service.createReviewItem({ tenantId, userId, reason: 'Reason 1' });
      await service.createReviewItem({ tenantId, userId, reason: 'Reason 2' });

      const reviews = await service.getPendingReviews({ tenantId });

      expect(reviews).toHaveLength(2);
      expect(reviews[0]).toHaveProperty('id');
      expect(reviews[0]).toHaveProperty('reason');
      expect(reviews[0]).toHaveProperty('status');
    });

    it('should filter by priority', async () => {
      await service.createReviewItem({ tenantId, userId, reason: 'High', priority: 'high' });
      await service.createReviewItem({ tenantId, userId, reason: 'Low', priority: 'low' });

      const reviews = await service.getPendingReviews({ tenantId, priority: 'high' });

      expect(reviews).toHaveLength(1);
      expect(reviews[0].priority).toBe('high');
    });

    it('should filter by status', async () => {
      const reviewId = await service.createReviewItem({ tenantId, userId, reason: 'Test' });
      await service.assignReview(reviewId, analystId, tenantId);

      const pendingOnly = await service.getPendingReviews({ tenantId, status: 'pending' });
      const inReviewOnly = await service.getPendingReviews({ tenantId, status: 'in_review' });

      expect(pendingOnly).toHaveLength(0);
      expect(inReviewOnly).toHaveLength(1);
    });

    it('should filter by assigned analyst', async () => {
      const reviewId = await service.createReviewItem({ tenantId, userId, reason: 'Test' });
      await service.assignReview(reviewId, analystId, tenantId);

      const reviews = await service.getPendingReviews({ tenantId, assignedTo: analystId });

      expect(reviews).toHaveLength(1);
      expect(reviews[0].assignedTo).toBe(analystId);
    });

    it('should include fraud check data', async () => {
      const fraudCheckId = await createFraudCheck(0.85);
      await service.createReviewItem({
        tenantId,
        userId,
        fraudCheckId,
        reason: 'High score',
      });

      const reviews = await service.getPendingReviews({ tenantId });

      expect(reviews[0].score).toBeCloseTo(0.85, 2);
      expect(reviews[0].signals).toBeDefined();
      expect(reviews[0].deviceFingerprint).toBe('device_fp_123');
    });

    it('should respect limit', async () => {
      for (let i = 0; i < 5; i++) {
        await service.createReviewItem({ tenantId, userId, reason: `Reason ${i}` });
      }

      const reviews = await service.getPendingReviews({ tenantId, limit: 3 });

      expect(reviews).toHaveLength(3);
    });
  });

  // ===========================================================================
  // GET REVIEW BY ID
  // ===========================================================================
  describe('getReviewById()', () => {
    it('should return review details', async () => {
      const reviewId = await service.createReviewItem({
        tenantId,
        userId,
        reason: 'Test reason',
        priority: 'high',
      });

      const review = await service.getReviewById(reviewId, tenantId);

      expect(review).not.toBeNull();
      expect(review.id).toBe(reviewId);
      expect(review.reason).toBe('Test reason');
      expect(review.priority).toBe('high');
    });

    it('should return null for non-existent review', async () => {
      const review = await service.getReviewById(uuidv4(), tenantId);

      expect(review).toBeNull();
    });
  });

  // ===========================================================================
  // ASSIGN REVIEW
  // ===========================================================================
  describe('assignReview()', () => {
    it('should assign review to analyst', async () => {
      const reviewId = await service.createReviewItem({
        tenantId,
        userId,
        reason: 'Test',
      });

      await service.assignReview(reviewId, analystId, tenantId);

      const review = await service.getReviewById(reviewId, tenantId);
      expect(review.assignedTo).toBe(analystId);
      expect(review.status).toBe('in_review');
    });
  });

  // ===========================================================================
  // COMPLETE REVIEW
  // ===========================================================================
  describe('completeReview()', () => {
    it('should approve a review', async () => {
      const reviewId = await service.createReviewItem({
        tenantId,
        userId,
        reason: 'Test',
      });

      await service.completeReview(reviewId, tenantId, {
        decision: 'approve',
        reviewerNotes: 'Looks legitimate',
        reviewerId: analystId,
      });

      const review = await service.getReviewById(reviewId, tenantId);
      expect(review.status).toBe('approved');
      expect(review.decision).toBe('approve');
      expect(review.reviewerNotes).toBe('Looks legitimate');
      expect(review.reviewedAt).toBeDefined();
    });

    it('should decline a review', async () => {
      const reviewId = await service.createReviewItem({
        tenantId,
        userId,
        reason: 'Test',
      });

      await service.completeReview(reviewId, tenantId, {
        decision: 'decline',
        reviewerNotes: 'Confirmed fraud',
        reviewerId: analystId,
      });

      const review = await service.getReviewById(reviewId, tenantId);
      expect(review.status).toBe('declined');
      expect(review.decision).toBe('decline');
    });

    it('should escalate a review', async () => {
      const reviewId = await service.createReviewItem({
        tenantId,
        userId,
        reason: 'Test',
      });

      await service.completeReview(reviewId, tenantId, {
        decision: 'escalate',
        reviewerNotes: 'Needs senior review',
        reviewerId: analystId,
      });

      const review = await service.getReviewById(reviewId, tenantId);
      expect(review.status).toBe('escalated');
      expect(review.decision).toBe('escalate');
    });

    it('should throw error for non-existent review', async () => {
      await expect(
        service.completeReview(uuidv4(), tenantId, {
          decision: 'approve',
          reviewerNotes: 'Test',
          reviewerId: analystId,
        })
      ).rejects.toThrow('Review not found');
    });
  });

  // ===========================================================================
  // GET REVIEW STATS
  // ===========================================================================
  describe('getReviewStats()', () => {
    it('should return zero stats when empty', async () => {
      const stats = await service.getReviewStats(tenantId);

      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.inReview).toBe(0);
      expect(stats.approved).toBe(0);
      expect(stats.declined).toBe(0);
    });

    it('should return correct counts', async () => {
      // Create and complete reviews
      const review1 = await service.createReviewItem({ tenantId, userId, reason: 'R1' });
      const review2 = await service.createReviewItem({ tenantId, userId, reason: 'R2' });
      const review3 = await service.createReviewItem({ tenantId, userId, reason: 'R3' });

      await service.completeReview(review1, tenantId, {
        decision: 'approve',
        reviewerNotes: '',
        reviewerId: analystId,
      });

      await service.completeReview(review2, tenantId, {
        decision: 'decline',
        reviewerNotes: '',
        reviewerId: analystId,
      });

      const stats = await service.getReviewStats(tenantId);

      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(1);
      expect(stats.approved).toBe(1);
      expect(stats.declined).toBe(1);
    });

    it('should filter by date range', async () => {
      await service.createReviewItem({ tenantId, userId, reason: 'Test' });

      const futureRange = {
        start: new Date(Date.now() + 86400000),
        end: new Date(Date.now() + 172800000),
      };

      const stats = await service.getReviewStats(tenantId, futureRange);

      expect(stats.total).toBe(0);
    });
  });

  // ===========================================================================
  // GET FRAUD TRENDS
  // ===========================================================================
  describe('getFraudTrends()', () => {
    it('should return empty array when no fraud checks', async () => {
      const trends = await service.getFraudTrends(tenantId);

      expect(trends).toEqual([]);
    });

    it('should return trends grouped by date', async () => {
      // Create fraud checks
      await createFraudCheck(0.3, 'approve');
      await createFraudCheck(0.6, 'review');
      await createFraudCheck(0.9, 'decline');

      const trends = await service.getFraudTrends(tenantId, 7);

      expect(trends.length).toBeGreaterThan(0);
      const today = trends[trends.length - 1];
      expect(today.totalChecks).toBe(3);
      expect(today.approved).toBe(1);
      expect(today.flagged).toBe(1);
      expect(today.declined).toBe(1);
    });
  });

  // ===========================================================================
  // GET TOP FRAUD SIGNALS
  // ===========================================================================
  describe('getTopFraudSignals()', () => {
    it('should return empty array when no flagged checks', async () => {
      const signals = await service.getTopFraudSignals(tenantId);

      expect(signals).toEqual([]);
    });

    it('should aggregate signal types', async () => {
      await createFraudCheck(0.8, 'decline');
      await createFraudCheck(0.7, 'review');

      const signals = await service.getTopFraudSignals(tenantId);

      expect(signals.length).toBeGreaterThan(0);
      expect(signals[0]).toHaveProperty('type');
      expect(signals[0]).toHaveProperty('count');
      expect(signals[0].type).toBe('rapid_purchases');
      expect(signals[0].count).toBe(2);
    });
  });
});

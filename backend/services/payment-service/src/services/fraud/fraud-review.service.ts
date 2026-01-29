import { query } from '../../config/database';
import { logger } from '../../utils/logger';

const log = logger.child({ component: 'FraudReviewService' });

export interface ReviewFilters {
  tenantId: string;
  priority?: string;
  status?: string;
  assignedTo?: string;
  limit?: number;
  offset?: number;
}

export interface ReviewDecision {
  decision: 'approve' | 'decline' | 'escalate';
  reviewerNotes: string;
  reviewerId: string;
}

export interface ReviewStats {
  total: number;
  pending: number;
  inReview: number;
  approved: number;
  declined: number;
  escalated: number;
  avgReviewTimeSeconds: number;
}

export interface FraudTrend {
  date: string;
  totalChecks: number;
  declined: number;
  flagged: number;
  approved: number;
  avgScore: number;
}

export interface FraudSignalCount {
  type: string;
  count: number;
}

export class FraudReviewService {
  /**
   * Get pending reviews with filters
   */
  async getPendingReviews(filters: ReviewFilters): Promise<any[]> {
    const conditions: string[] = ['frq.tenant_id = $1'];
    const values: any[] = [filters.tenantId];
    let paramIndex = 2;

    if (filters.priority) {
      conditions.push(`frq.priority = $${paramIndex}`);
      values.push(filters.priority);
      paramIndex++;
    }

    if (filters.status) {
      conditions.push(`frq.status = $${paramIndex}`);
      values.push(filters.status);
      paramIndex++;
    } else {
      conditions.push(`frq.status IN ('pending', 'in_review')`);
    }

    if (filters.assignedTo) {
      conditions.push(`frq.assigned_to = $${paramIndex}`);
      values.push(filters.assignedTo);
      paramIndex++;
    }

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const sql = `
      SELECT
        frq.*,
        fc.score,
        fc.signals,
        fc.device_fingerprint,
        fc.ip_address
      FROM fraud_review_queue frq
      LEFT JOIN fraud_checks fc ON frq.fraud_check_id = fc.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY frq.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const result = await query(sql, values);

    return result.rows.map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      paymentId: row.payment_id,
      fraudCheckId: row.fraud_check_id,
      reason: row.reason,
      priority: row.priority,
      status: row.status,
      assignedTo: row.assigned_to,
      reviewerNotes: row.reviewer_notes,
      reviewMetadata: row.review_metadata,
      reviewedAt: row.reviewed_at,
      decision: row.decision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      score: row.score ? parseFloat(row.score) : null,
      signals: row.signals,
      deviceFingerprint: row.device_fingerprint,
      ipAddress: row.ip_address,
    }));
  }

  /**
   * Assign a review to an analyst
   */
  async assignReview(reviewId: string, analystId: string, tenantId: string): Promise<void> {
    await query(
      `UPDATE fraud_review_queue
       SET assigned_to = $1, status = 'in_review', updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [analystId, reviewId, tenantId]
    );

    log.info({ reviewId, analystId }, 'Review assigned');
  }

  /**
   * Complete a review with decision
   */
  async completeReview(
    reviewId: string,
    tenantId: string,
    decision: ReviewDecision
  ): Promise<void> {
    // Get review details
    const reviewResult = await query(
      `SELECT * FROM fraud_review_queue WHERE id = $1 AND tenant_id = $2`,
      [reviewId, tenantId]
    );

    if (reviewResult.rows.length === 0) {
      throw new Error('Review not found');
    }

    const review = reviewResult.rows[0];

    // Update review status
    const newStatus = decision.decision === 'escalate' ? 'escalated' 
      : decision.decision === 'decline' ? 'declined' 
      : 'approved';

    await query(
      `UPDATE fraud_review_queue
       SET status = $1, decision = $2, reviewer_notes = $3, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5`,
      [newStatus, decision.decision, decision.reviewerNotes, reviewId, tenantId]
    );

    // Update related reputations
    if (decision.decision === 'decline') {
      await this.updateReputationsAfterReview(review, 'fraud');
    } else if (decision.decision === 'approve') {
      await this.recordFalsePositive(review);
    }

    log.info({
      reviewId,
      decision: decision.decision,
      reviewerId: decision.reviewerId,
    }, 'Review completed');
  }

  /**
   * Get review statistics
   */
  async getReviewStats(tenantId: string, dateRange?: { start: Date; end: Date }): Promise<ReviewStats> {
    let sql = `
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'pending')::int as pending,
        COUNT(*) FILTER (WHERE status = 'in_review')::int as in_review,
        COUNT(*) FILTER (WHERE status = 'approved')::int as approved,
        COUNT(*) FILTER (WHERE status = 'declined')::int as declined,
        COUNT(*) FILTER (WHERE status = 'escalated')::int as escalated,
        AVG(EXTRACT(EPOCH FROM (reviewed_at - created_at))) as avg_review_time_seconds
      FROM fraud_review_queue
      WHERE tenant_id = $1
    `;

    const values: any[] = [tenantId];

    if (dateRange) {
      sql += ` AND created_at BETWEEN $2 AND $3`;
      values.push(dateRange.start, dateRange.end);
    }

    const result = await query(sql, values);
    const row = result.rows[0];

    return {
      total: row.total || 0,
      pending: row.pending || 0,
      inReview: row.in_review || 0,
      approved: row.approved || 0,
      declined: row.declined || 0,
      escalated: row.escalated || 0,
      avgReviewTimeSeconds: parseFloat(row.avg_review_time_seconds || '0'),
    };
  }

  /**
   * Get fraud trends over time
   */
  async getFraudTrends(tenantId: string, days: number = 30): Promise<FraudTrend[]> {
    const result = await query(
      `SELECT
        DATE(timestamp) as date,
        COUNT(*)::int as total_checks,
        COUNT(*) FILTER (WHERE decision = 'decline')::int as declined,
        COUNT(*) FILTER (WHERE decision = 'review')::int as flagged,
        COUNT(*) FILTER (WHERE decision = 'approve')::int as approved,
        COALESCE(AVG(score), 0) as avg_score
      FROM fraud_checks
      WHERE tenant_id = $1 AND timestamp >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(timestamp)
      ORDER BY date ASC`,
      [tenantId]
    );

    return result.rows.map(row => ({
      date: row.date,
      totalChecks: row.total_checks,
      declined: row.declined,
      flagged: row.flagged,
      approved: row.approved,
      avgScore: parseFloat(row.avg_score) || 0,
    }));
  }

  /**
   * Get top fraud signals
   */
  async getTopFraudSignals(tenantId: string, days: number = 30): Promise<FraudSignalCount[]> {
    const result = await query(
      `SELECT signals
       FROM fraud_checks
       WHERE tenant_id = $1
         AND timestamp >= NOW() - INTERVAL '${days} days'
         AND decision IN ('decline', 'review')
         AND signals IS NOT NULL`,
      [tenantId]
    );

    const signalCounts: Record<string, number> = {};

    for (const row of result.rows) {
      const signals = row.signals || [];
      for (const signal of signals) {
        const key = signal.type || 'unknown';
        signalCounts[key] = (signalCounts[key] || 0) + 1;
      }
    }

    return Object.entries(signalCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * Create a review queue item
   */
  async createReviewItem(data: {
    tenantId: string;
    userId: string;
    paymentId?: string;
    fraudCheckId?: string;
    reason: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    metadata?: Record<string, any>;
  }): Promise<string> {
    const result = await query(
      `INSERT INTO fraud_review_queue (
        tenant_id, user_id, payment_id, fraud_check_id, reason, priority, status, review_metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
      RETURNING id`,
      [
        data.tenantId,
        data.userId,
        data.paymentId || null,
        data.fraudCheckId || null,
        data.reason,
        data.priority || 'medium',
        JSON.stringify(data.metadata || {}),
      ]
    );

    log.info({ reviewId: result.rows[0].id, userId: data.userId }, 'Review item created');

    return result.rows[0].id;
  }

  /**
   * Get a single review by ID
   */
  async getReviewById(reviewId: string, tenantId: string): Promise<any | null> {
    const result = await query(
      `SELECT frq.*, fc.score, fc.signals, fc.device_fingerprint, fc.ip_address
       FROM fraud_review_queue frq
       LEFT JOIN fraud_checks fc ON frq.fraud_check_id = fc.id
       WHERE frq.id = $1 AND frq.tenant_id = $2`,
      [reviewId, tenantId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      paymentId: row.payment_id,
      fraudCheckId: row.fraud_check_id,
      reason: row.reason,
      priority: row.priority,
      status: row.status,
      assignedTo: row.assigned_to,
      reviewerNotes: row.reviewer_notes,
      reviewMetadata: row.review_metadata,
      reviewedAt: row.reviewed_at,
      decision: row.decision,
      createdAt: row.created_at,
      score: row.score ? parseFloat(row.score) : null,
      signals: row.signals,
      deviceFingerprint: row.device_fingerprint,
      ipAddress: row.ip_address,
    };
  }

  private async updateReputationsAfterReview(review: any, classification: 'fraud' | 'legitimate'): Promise<void> {
    try {
      if (classification === 'fraud' && review.fraud_check_id) {
        // Get IP from fraud check
        const checkResult = await query(
          `SELECT ip_address FROM fraud_checks WHERE id = $1`,
          [review.fraud_check_id]
        );

        if (checkResult.rows.length > 0 && checkResult.rows[0].ip_address) {
          await query(
            `UPDATE ip_reputation
             SET fraud_count = fraud_count + 1, reputation_status = 'suspicious', updated_at = NOW()
             WHERE ip_address = $1`,
            [checkResult.rows[0].ip_address]
          );
        }

        // Update ML prediction feedback
        if (review.payment_id) {
          await query(
            `UPDATE ml_fraud_predictions
             SET actual_fraud = true, feedback_at = NOW()
             WHERE transaction_id = $1`,
            [review.payment_id]
          );
        }
      }
    } catch (error) {
      log.error({ error }, 'Error updating reputations after review');
    }
  }

  private async recordFalsePositive(review: any): Promise<void> {
    try {
      log.info({
        reviewId: review.id,
        userId: review.user_id,
      }, 'False positive recorded for ML model improvement');

      // Update ML prediction feedback
      if (review.payment_id) {
        await query(
          `UPDATE ml_fraud_predictions
           SET actual_fraud = false, feedback_at = NOW()
           WHERE transaction_id = $1`,
          [review.payment_id]
        );
      }
    } catch (error) {
      log.error({ error }, 'Error recording false positive');
    }
  }
}

export const fraudReviewService = new FraudReviewService();

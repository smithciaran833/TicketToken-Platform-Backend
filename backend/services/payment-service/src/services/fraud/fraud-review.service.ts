import { db } from '../../config/database';
import { logger } from '../../utils/logger';

export class FraudReviewService {
  /**
   * Get pending reviews for dashboard
   */
  async getPendingReviews(filters?: {
    priority?: string;
    status?: string;
    assignedTo?: string;
    limit?: number;
  }) {
    let query = db('fraud_review_queue')
      .leftJoin('fraud_checks', 'fraud_review_queue.fraud_check_id', 'fraud_checks.id')
      .select(
        'fraud_review_queue.*',
        'fraud_checks.score',
        'fraud_checks.signals',
        'fraud_checks.device_fingerprint',
        'fraud_checks.ip_address'
      )
      .orderBy('fraud_review_queue.created_at', 'desc');

    if (filters?.priority) {
      query = query.where('fraud_review_queue.priority', filters.priority);
    }

    if (filters?.status) {
      query = query.where('fraud_review_queue.status', filters.status);
    } else {
      query = query.whereIn('fraud_review_queue.status', ['pending', 'in_review']);
    }

    if (filters?.assignedTo) {
      query = query.where('fraud_review_queue.assigned_to', filters.assignedTo);
    }

    const limit = filters?.limit || 50;
    query = query.limit(limit);

    return await query;
  }

  /**
   * Assign review to analyst
   */
  async assignReview(reviewId: string, analystId: string) {
    await db('fraud_review_queue')
      .where('id', reviewId)
      .update({
        assigned_to: analystId,
        status: 'in_review',
        updated_at: new Date()
      });

    logger.info('Review assigned', { reviewId, analystId });
  }

  /**
   * Complete review with decision
   */
  async completeReview(reviewId: string, decision: {
    decision: 'approve' | 'decline' | 'escalate';
    reviewerNotes: string;
    reviewerId: string;
  }) {
    const review = await db('fraud_review_queue')
      .where('id', reviewId)
      .first();

    if (!review) {
      throw new Error('Review not found');
    }

    // Update review
    await db('fraud_review_queue')
      .where('id', reviewId)
      .update({
        status: decision.decision === 'escalate' ? 'escalated' : 'approved',
        decision: decision.decision,
        reviewer_notes: decision.reviewerNotes,
        reviewed_at: new Date(),
        updated_at: new Date()
      });

    // Update user/IP reputation based on decision
    if (decision.decision === 'decline') {
      await this.updateReputationsAfterReview(review, 'fraud');
    } else if (decision.decision === 'approve') {
      await this.updateReputationsAfterReview(review, 'legitimate');
    }

    // If it was a false positive, adjust ML model
    if (decision.decision === 'approve') {
      await this.recordFalsePositive(review);
    }

    logger.info('Review completed', {
      reviewId,
      decision: decision.decision,
      reviewerId: decision.reviewerId
    });
  }

  /**
   * Get review statistics
   */
  async getReviewStats(dateRange?: { start: Date; end: Date }) {
    const query = db('fraud_review_queue');

    if (dateRange) {
      query.whereBetween('created_at', [dateRange.start, dateRange.end]);
    }

    const stats = await query
      .select(
        db.raw('COUNT(*) as total'),
        db.raw("COUNT(*) FILTER (WHERE status = 'pending') as pending"),
        db.raw("COUNT(*) FILTER (WHERE status = 'in_review') as in_review"),
        db.raw("COUNT(*) FILTER (WHERE status = 'approved') as approved"),
        db.raw("COUNT(*) FILTER (WHERE status = 'declined') as declined"),
        db.raw("COUNT(*) FILTER (WHERE status = 'escalated') as escalated"),
        db.raw("AVG(EXTRACT(EPOCH FROM (reviewed_at - created_at))) as avg_review_time_seconds")
      )
      .first();

    return {
      total: parseInt(stats.total),
      pending: parseInt(stats.pending),
      inReview: parseInt(stats.in_review),
      approved: parseInt(stats.approved),
      declined: parseInt(stats.declined),
      escalated: parseInt(stats.escalated),
      avgReviewTimeSeconds: parseFloat(stats.avg_review_time_seconds || '0')
    };
  }

  /**
   * Get fraud trends
   */
  async getFraudTrends(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const trends = await db('fraud_checks')
      .select(
        db.raw("DATE(timestamp) as date"),
        db.raw('COUNT(*) as total_checks'),
        db.raw("COUNT(*) FILTER (WHERE decision = 'decline') as declined"),
        db.raw("COUNT(*) FILTER (WHERE decision = 'review') as flagged"),
        db.raw("COUNT(*) FILTER (WHERE decision = 'approve') as approved"),
        db.raw('AVG(score) as avg_score')
      )
      .where('timestamp', '>=', startDate)
      .groupBy(db.raw("DATE(timestamp)"))
      .orderBy('date', 'asc');

    return trends.map((t: any) => ({
      date: t.date,
      totalChecks: parseInt(t.total_checks),
      declined: parseInt(t.declined),
      flagged: parseInt(t.flagged),
      approved: parseInt(t.approved),
      avgScore: parseFloat(t.avg_score)
    }));
  }

  /**
   * Get top fraud signals
   */
  async getTopFraudSignals(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const checks = await db('fraud_checks')
      .where('timestamp', '>=', startDate)
      .whereIn('decision', ['decline', 'review'])
      .select('signals');

    const signalCounts: { [key: string]: number } = {};

    for (const check of checks) {
      const signals = JSON.parse(check.signals || '[]');
      for (const signal of signals) {
        const key = signal.type;
        signalCounts[key] = (signalCounts[key] || 0) + 1;
      }
    }

    return Object.entries(signalCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * Private helper methods
   */

  private async updateReputationsAfterReview(review: any, classification: 'fraud' | 'legitimate') {
    try {
      // Update IP reputation
      if (classification === 'fraud') {
        await db('ip_reputation')
          .where('ip_address', review.ip_address)
          .increment('fraud_count', 1)
          .update({ reputation_status: 'suspicious' });
      }

      // Update ML predictions with actual feedback
      if (review.fraud_check_id) {
        await db('ml_fraud_predictions')
          .where('transaction_id', review.payment_id)
          .update({
            actual_fraud: classification === 'fraud',
            feedback_at: new Date()
          });
      }

    } catch (error) {
      logger.error('Error updating reputations after review:', error);
    }
  }

  private async recordFalsePositive(review: any) {
    try {
      // Record for model retraining
      logger.info('False positive recorded for ML model improvement', {
        reviewId: review.id,
        userId: review.user_id
      });
    } catch (error) {
      logger.error('Error recording false positive:', error);
    }
  }
}

export const fraudReviewService = new FraudReviewService();

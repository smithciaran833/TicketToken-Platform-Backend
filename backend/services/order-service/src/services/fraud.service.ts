import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { publishEvent } from '../config/rabbitmq';

/**
 * HIGH: Fraud detection and handling service
 * Detects suspicious patterns and flags orders for review
 */

export interface FraudSignal {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  details: string;
}

export interface FraudAssessment {
  orderId: string;
  userId: string;
  riskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  signals: FraudSignal[];
  requiresReview: boolean;
  blockRefund: boolean;
  blockOrder: boolean;
}

// Thresholds for fraud detection
const FRAUD_THRESHOLDS = {
  VELOCITY_ORDERS_PER_HOUR: 5,
  VELOCITY_ORDERS_PER_DAY: 20,
  HIGH_VALUE_ORDER_CENTS: 100000, // $1000
  CHARGEBACK_COUNT_THRESHOLD: 2,
  RISK_SCORE_REVIEW_THRESHOLD: 50,
  RISK_SCORE_BLOCK_THRESHOLD: 80,
};

export class FraudService {
  private db = getDatabase();

  /**
   * Assess fraud risk for an order
   */
  async assessOrder(
    orderId: string,
    userId: string,
    tenantId: string,
    orderDetails: {
      totalCents: number;
      itemCount: number;
      paymentMethod?: string;
      billingAddress?: any;
      ipAddress?: string;
    }
  ): Promise<FraudAssessment> {
    const signals: FraudSignal[] = [];
    let totalScore = 0;

    // Check velocity
    const velocitySignals = await this.checkVelocity(userId, tenantId);
    signals.push(...velocitySignals);
    totalScore += velocitySignals.reduce((sum, s) => sum + s.score, 0);

    // Check chargeback history
    const chargebackSignals = await this.checkChargebackHistory(userId);
    signals.push(...chargebackSignals);
    totalScore += chargebackSignals.reduce((sum, s) => sum + s.score, 0);

    // Check order value
    const valueSignals = this.checkOrderValue(orderDetails.totalCents);
    signals.push(...valueSignals);
    totalScore += valueSignals.reduce((sum, s) => sum + s.score, 0);

    // Check for dispute patterns
    const disputeSignals = await this.checkDisputePatterns(userId);
    signals.push(...disputeSignals);
    totalScore += disputeSignals.reduce((sum, s) => sum + s.score, 0);

    // Normalize score to 0-100
    const riskScore = Math.min(100, totalScore);
    const riskLevel = this.getRiskLevel(riskScore);

    const assessment: FraudAssessment = {
      orderId,
      userId,
      riskScore,
      riskLevel,
      signals,
      requiresReview: riskScore >= FRAUD_THRESHOLDS.RISK_SCORE_REVIEW_THRESHOLD,
      blockRefund: riskScore >= FRAUD_THRESHOLDS.RISK_SCORE_BLOCK_THRESHOLD,
      blockOrder: riskScore >= 90, // Only block orders at very high risk
    };

    // Log and store assessment
    await this.recordAssessment(assessment, tenantId);

    // Alert on high risk
    if (riskLevel === 'high' || riskLevel === 'critical') {
      await this.alertFraudTeam(assessment);
    }

    return assessment;
  }

  /**
   * Check order velocity (too many orders too fast)
   */
  private async checkVelocity(userId: string, tenantId: string): Promise<FraudSignal[]> {
    const signals: FraudSignal[] = [];

    // Orders in last hour
    const hourResult = await this.db.query(
      `SELECT COUNT(*) as count FROM orders 
       WHERE user_id = $1 AND tenant_id = $2 
       AND created_at > NOW() - INTERVAL '1 hour'`,
      [userId, tenantId]
    );
    const ordersLastHour = parseInt(hourResult.rows[0].count);

    if (ordersLastHour >= FRAUD_THRESHOLDS.VELOCITY_ORDERS_PER_HOUR) {
      signals.push({
        type: 'HIGH_VELOCITY_HOURLY',
        severity: 'high',
        score: 30,
        details: `${ordersLastHour} orders in last hour (threshold: ${FRAUD_THRESHOLDS.VELOCITY_ORDERS_PER_HOUR})`,
      });
    }

    // Orders in last 24 hours
    const dayResult = await this.db.query(
      `SELECT COUNT(*) as count FROM orders 
       WHERE user_id = $1 AND tenant_id = $2 
       AND created_at > NOW() - INTERVAL '24 hours'`,
      [userId, tenantId]
    );
    const ordersLastDay = parseInt(dayResult.rows[0].count);

    if (ordersLastDay >= FRAUD_THRESHOLDS.VELOCITY_ORDERS_PER_DAY) {
      signals.push({
        type: 'HIGH_VELOCITY_DAILY',
        severity: 'medium',
        score: 20,
        details: `${ordersLastDay} orders in last 24 hours (threshold: ${FRAUD_THRESHOLDS.VELOCITY_ORDERS_PER_DAY})`,
      });
    }

    return signals;
  }

  /**
   * Check user's chargeback/dispute history
   */
  private async checkChargebackHistory(userId: string): Promise<FraudSignal[]> {
    const signals: FraudSignal[] = [];

    // Count chargebacks (lost disputes)
    const result = await this.db.query(
      `SELECT COUNT(*) as count FROM orders 
       WHERE user_id = $1 
       AND has_dispute = true 
       AND dispute_outcome = 'lost'`,
      [userId]
    );
    const chargebackCount = parseInt(result.rows[0].count);

    if (chargebackCount >= FRAUD_THRESHOLDS.CHARGEBACK_COUNT_THRESHOLD) {
      signals.push({
        type: 'CHARGEBACK_HISTORY',
        severity: 'critical',
        score: 40,
        details: `User has ${chargebackCount} previous chargebacks`,
      });
    } else if (chargebackCount > 0) {
      signals.push({
        type: 'CHARGEBACK_HISTORY',
        severity: 'medium',
        score: 15,
        details: `User has ${chargebackCount} previous chargeback(s)`,
      });
    }

    return signals;
  }

  /**
   * Check for suspicious order value
   */
  private checkOrderValue(totalCents: number): FraudSignal[] {
    const signals: FraudSignal[] = [];

    if (totalCents >= FRAUD_THRESHOLDS.HIGH_VALUE_ORDER_CENTS) {
      signals.push({
        type: 'HIGH_VALUE_ORDER',
        severity: 'medium',
        score: 15,
        details: `Order value $${(totalCents / 100).toFixed(2)} exceeds threshold $${(FRAUD_THRESHOLDS.HIGH_VALUE_ORDER_CENTS / 100).toFixed(2)}`,
      });
    }

    return signals;
  }

  /**
   * Check dispute patterns (frequent disputes even if not lost)
   */
  private async checkDisputePatterns(userId: string): Promise<FraudSignal[]> {
    const signals: FraudSignal[] = [];

    // Count all disputes in last 6 months
    const result = await this.db.query(
      `SELECT COUNT(*) as count FROM orders 
       WHERE user_id = $1 
       AND has_dispute = true 
       AND dispute_created_at > NOW() - INTERVAL '6 months'`,
      [userId]
    );
    const disputeCount = parseInt(result.rows[0].count);

    if (disputeCount >= 3) {
      signals.push({
        type: 'FREQUENT_DISPUTES',
        severity: 'high',
        score: 25,
        details: `User has ${disputeCount} disputes in last 6 months`,
      });
    }

    return signals;
  }

  /**
   * Get risk level from score
   */
  private getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 80) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
  }

  /**
   * Record fraud assessment for audit trail
   */
  private async recordAssessment(assessment: FraudAssessment, tenantId: string): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO fraud_assessments 
         (order_id, user_id, tenant_id, risk_score, risk_level, signals, 
          requires_review, block_refund, block_order, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (order_id) DO UPDATE SET
           risk_score = EXCLUDED.risk_score,
           risk_level = EXCLUDED.risk_level,
           signals = EXCLUDED.signals,
           requires_review = EXCLUDED.requires_review,
           block_refund = EXCLUDED.block_refund,
           block_order = EXCLUDED.block_order,
           updated_at = NOW()`,
        [
          assessment.orderId,
          assessment.userId,
          tenantId,
          assessment.riskScore,
          assessment.riskLevel,
          JSON.stringify(assessment.signals),
          assessment.requiresReview,
          assessment.blockRefund,
          assessment.blockOrder,
        ]
      );
    } catch (error) {
      // Table might not exist yet - log but don't fail
      logger.warn('Failed to record fraud assessment (table may not exist)', { 
        orderId: assessment.orderId, 
        error 
      });
    }
  }

  /**
   * Alert fraud team on high risk orders
   */
  private async alertFraudTeam(assessment: FraudAssessment): Promise<void> {
    logger.warn('HIGH FRAUD RISK DETECTED', {
      orderId: assessment.orderId,
      userId: assessment.userId,
      riskScore: assessment.riskScore,
      riskLevel: assessment.riskLevel,
      signals: assessment.signals,
    });

    // Publish alert event for notification service
    await publishEvent('alert.fraud', {
      type: 'FRAUD_ALERT',
      severity: assessment.riskLevel,
      title: `High Fraud Risk Order: ${assessment.orderId}`,
      message: `Order ${assessment.orderId} has risk score ${assessment.riskScore}`,
      data: assessment,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Check if refund should be blocked due to fraud risk
   */
  async shouldBlockRefund(orderId: string, userId: string): Promise<{
    blocked: boolean;
    reason?: string;
    assessment?: FraudAssessment;
  }> {
    // Check existing assessment
    const result = await this.db.query(
      `SELECT * FROM fraud_assessments WHERE order_id = $1`,
      [orderId]
    );

    if (result.rows.length > 0) {
      const assessment = result.rows[0];
      if (assessment.block_refund) {
        return {
          blocked: true,
          reason: `Order flagged for fraud review (risk score: ${assessment.risk_score})`,
          assessment: {
            orderId: assessment.order_id,
            userId: assessment.user_id,
            riskScore: assessment.risk_score,
            riskLevel: assessment.risk_level,
            signals: assessment.signals,
            requiresReview: assessment.requires_review,
            blockRefund: assessment.block_refund,
            blockOrder: assessment.block_order,
          },
        };
      }
    }

    return { blocked: false };
  }

  /**
   * Mark order as reviewed (clears fraud block after manual review)
   */
  async markAsReviewed(
    orderId: string,
    reviewedBy: string,
    decision: 'approved' | 'rejected',
    notes?: string
  ): Promise<void> {
    await this.db.query(
      `UPDATE fraud_assessments SET
        reviewed_at = NOW(),
        reviewed_by = $2,
        review_decision = $3,
        review_notes = $4,
        block_refund = CASE WHEN $3 = 'approved' THEN false ELSE block_refund END,
        block_order = CASE WHEN $3 = 'approved' THEN false ELSE block_order END
       WHERE order_id = $1`,
      [orderId, reviewedBy, decision, notes]
    );

    logger.info('Fraud assessment reviewed', {
      orderId,
      reviewedBy,
      decision,
    });
  }
}

export const fraudService = new FraudService();

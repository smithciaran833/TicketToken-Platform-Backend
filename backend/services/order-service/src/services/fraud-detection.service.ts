import { Pool } from 'pg';
import { 
  FraudScore, 
  FraudRiskLevel, 
  FraudDetectionMethod,
  FraudFactor,
  FraudRule,
  BlockedEntity,
  FraudAlert,
  VelocityTracking
} from '../types/admin.types';

export class FraudDetectionService {
  constructor(private pool: Pool) {}

  async calculateFraudScore(
    tenantId: string,
    orderId: string,
    userId: string,
    orderData: {
      totalAmount: number;
      email: string;
      ipAddress?: string;
      deviceId?: string;
      paymentMethod?: string;
    }
  ): Promise<FraudScore> {
    const factors: FraudFactor[] = [];
    const methods: FraudDetectionMethod[] = [];
    let totalScore = 0;

    // Check blocked entities
    const isBlocked = await this.checkBlockedEntity(tenantId, {
      email: orderData.email,
      ipAddress: orderData.ipAddress,
      deviceId: orderData.deviceId
    });

    if (isBlocked) {
      factors.push({
        type: 'BLOCKED_ENTITY',
        description: 'User or device is blocked',
        scoreImpact: 100,
        severity: 'HIGH',
        details: { blocked: true }
      });
      totalScore = 100;
      methods.push(FraudDetectionMethod.MANUAL_REVIEW);
    }

    // Velocity check
    const velocityResult = await this.checkVelocity(tenantId, userId, orderData.totalAmount);
    if (velocityResult.isSuspicious) {
      factors.push({
        type: 'VELOCITY',
        description: velocityResult.reason,
        scoreImpact: 30,
        severity: 'MEDIUM',
        details: velocityResult.details
      });
      totalScore += 30;
      methods.push(FraudDetectionMethod.VELOCITY_CHECK);
    }

    // Duplicate order check
    const duplicateResult = await this.checkDuplicateOrder(tenantId, userId, orderId);
    if (duplicateResult.isDuplicate) {
      factors.push({
        type: 'DUPLICATE_ORDER',
        description: 'Similar order detected recently',
        scoreImpact: 25,
        severity: 'MEDIUM',
        details: duplicateResult.details
      });
      totalScore += 25;
      methods.push(FraudDetectionMethod.DUPLICATE_ORDER);
    }

    // Apply custom fraud rules
    const ruleResults = await this.applyFraudRules(tenantId, { userId, ...orderData });
    ruleResults.forEach(result => {
      factors.push(result);
      totalScore += result.scoreImpact;
    });

    // Cap score at 100
    totalScore = Math.min(100, totalScore);

    // Determine risk level
    const riskLevel = this.calculateRiskLevel(totalScore);

    // Save fraud score
    const fraudScore = await this.saveFraudScore(
      tenantId,
      orderId,
      userId,
      totalScore,
      riskLevel,
      factors,
      methods
    );

    // Create alert if high risk
    if (riskLevel === FraudRiskLevel.HIGH || riskLevel === FraudRiskLevel.CRITICAL) {
      await this.createFraudAlert(fraudScore);
    }

    return fraudScore;
  }

  private async checkBlockedEntity(
    tenantId: string,
    data: { email?: string; ipAddress?: string; deviceId?: string }
  ): Promise<boolean> {
    const conditions: string[] = [];
    const values: any[] = [tenantId];
    let paramCount = 1;

    if (data.email) {
      conditions.push(`(entity_type = 'EMAIL' AND entity_value = $${++paramCount})`);
      values.push(data.email);
    }

    if (data.ipAddress) {
      conditions.push(`(entity_type = 'IP' AND entity_value = $${++paramCount})`);
      values.push(data.ipAddress);
    }

    if (data.deviceId) {
      conditions.push(`(entity_type = 'DEVICE' AND entity_value = $${++paramCount})`);
      values.push(data.deviceId);
    }

    if (conditions.length === 0) return false;

    const query = `
      SELECT COUNT(*) as count 
      FROM blocked_entities 
      WHERE tenant_id = $1 
      AND (${conditions.join(' OR ')})
      AND unblocked_at IS NULL
      AND (is_permanent = true OR blocked_until > NOW())
    `;

    const result = await this.pool.query(query, values);
    return parseInt(result.rows[0].count) > 0;
  }

  private async checkVelocity(
    tenantId: string,
    userId: string,
    amount: number
  ): Promise<{ isSuspicious: boolean; reason?: string; details?: any }> {
    const windows = [
      { minutes: 5, maxOrders: 3, maxAmount: 5000 },
      { minutes: 60, maxOrders: 10, maxAmount: 20000 },
      { minutes: 1440, maxOrders: 20, maxAmount: 50000 }
    ];

    for (const window of windows) {
      const result = await this.pool.query(
        `SELECT COUNT(*) as order_count, COALESCE(SUM(total_amount_cents), 0) as total_amount
         FROM orders
         WHERE tenant_id = $1 AND user_id = $2
         AND created_at > NOW() - INTERVAL '${window.minutes} minutes'`,
        [tenantId, userId]
      );

      const orderCount = parseInt(result.rows[0].order_count);
      const totalAmount = parseInt(result.rows[0].total_amount) / 100;

      if (orderCount >= window.maxOrders) {
        return {
          isSuspicious: true,
          reason: `Too many orders in ${window.minutes} minutes`,
          details: { window: window.minutes, count: orderCount, limit: window.maxOrders }
        };
      }

      if (totalAmount + amount > window.maxAmount) {
        return {
          isSuspicious: true,
          reason: `Order amount exceeds limit for ${window.minutes} minutes`,
          details: { window: window.minutes, amount: totalAmount + amount, limit: window.maxAmount }
        };
      }
    }

    return { isSuspicious: false };
  }

  private async checkDuplicateOrder(
    tenantId: string,
    userId: string,
    currentOrderId: string
  ): Promise<{ isDuplicate: boolean; details?: any }> {
    const result = await this.pool.query(
      `SELECT id, created_at 
       FROM orders
       WHERE tenant_id = $1 AND user_id = $2 AND id != $3
       AND created_at > NOW() - INTERVAL '5 minutes'
       LIMIT 1`,
      [tenantId, userId, currentOrderId]
    );

    if (result.rows.length > 0) {
      return {
        isDuplicate: true,
        details: { duplicateOrderId: result.rows[0].id, createdAt: result.rows[0].created_at }
      };
    }

    return { isDuplicate: false };
  }

  private async applyFraudRules(
    tenantId: string,
    orderData: any
  ): Promise<FraudFactor[]> {
    const rules = await this.pool.query(
      `SELECT * FROM fraud_rules 
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY priority DESC`,
      [tenantId]
    );

    const factors: FraudFactor[] = [];

    for (const rule of rules.rows) {
      const conditions = rule.conditions;
      let matches = true;

      // Simple rule evaluation (can be extended)
      if (conditions.minAmount && orderData.totalAmount < conditions.minAmount) {
        matches = false;
      }
      if (conditions.maxAmount && orderData.totalAmount > conditions.maxAmount) {
        matches = false;
      }

      if (matches) {
        factors.push({
          type: rule.rule_type,
          description: rule.name,
          scoreImpact: rule.score_impact,
          severity: rule.score_impact > 30 ? 'HIGH' : rule.score_impact > 15 ? 'MEDIUM' : 'LOW',
          details: { ruleId: rule.id, conditions }
        });
      }
    }

    return factors;
  }

  private calculateRiskLevel(score: number): FraudRiskLevel {
    if (score >= 75) return FraudRiskLevel.CRITICAL;
    if (score >= 50) return FraudRiskLevel.HIGH;
    if (score >= 25) return FraudRiskLevel.MEDIUM;
    return FraudRiskLevel.LOW;
  }

  private async saveFraudScore(
    tenantId: string,
    orderId: string,
    userId: string,
    score: number,
    riskLevel: FraudRiskLevel,
    factors: FraudFactor[],
    methods: FraudDetectionMethod[]
  ): Promise<FraudScore> {
    const result = await this.pool.query(
      `INSERT INTO fraud_scores 
       (tenant_id, order_id, user_id, score, risk_level, factors, detection_methods)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [tenantId, orderId, userId, score, riskLevel, JSON.stringify(factors), methods]
    );

    return this.mapFraudScore(result.rows[0]);
  }

  private async createFraudAlert(fraudScore: FraudScore): Promise<void> {
    await this.pool.query(
      `INSERT INTO fraud_alerts 
       (tenant_id, fraud_score_id, order_id, alert_type, severity, message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        fraudScore.tenantId,
        fraudScore.id,
        fraudScore.orderId,
        'HIGH_RISK_ORDER',
        fraudScore.riskLevel,
        `High risk order detected with score ${fraudScore.score}`
      ]
    );
  }

  async blockEntity(
    tenantId: string,
    entityType: string,
    entityValue: string,
    blockReason: string,
    blockedBy: string,
    options: { isPermanent?: boolean; blockedUntil?: Date } = {}
  ): Promise<BlockedEntity> {
    const result = await this.pool.query(
      `INSERT INTO blocked_entities 
       (tenant_id, entity_type, entity_value, block_reason, is_permanent, blocked_until, blocked_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tenantId, entityType, entityValue, blockReason,
        options.isPermanent || false, options.blockedUntil, blockedBy
      ]
    );

    return this.mapBlockedEntity(result.rows[0]);
  }

  async getFraudScore(orderId: string, tenantId: string): Promise<FraudScore | null> {
    const result = await this.pool.query(
      'SELECT * FROM fraud_scores WHERE order_id = $1 AND tenant_id = $2',
      [orderId, tenantId]
    );

    return result.rows[0] ? this.mapFraudScore(result.rows[0]) : null;
  }

  async getHighRiskOrders(tenantId: string, limit: number = 50): Promise<FraudScore[]> {
    const result = await this.pool.query(
      `SELECT * FROM fraud_scores 
       WHERE tenant_id = $1 
       AND risk_level IN ('HIGH', 'CRITICAL')
       AND is_reviewed = false
       ORDER BY score DESC, created_at DESC
       LIMIT $2`,
      [tenantId, limit]
    );

    return result.rows.map(row => this.mapFraudScore(row));
  }

  async reviewFraudScore(
    fraudScoreId: string,
    tenantId: string,
    reviewedBy: string,
    resolution: string,
    notes?: string
  ): Promise<FraudScore> {
    const result = await this.pool.query(
      `UPDATE fraud_scores 
       SET is_reviewed = true, reviewed_by = $1, reviewed_at = NOW(),
           resolution = $2, resolution_notes = $3
       WHERE id = $4 AND tenant_id = $5
       RETURNING *`,
      [reviewedBy, resolution, notes, fraudScoreId, tenantId]
    );

    return this.mapFraudScore(result.rows[0]);
  }

  private mapFraudScore(row: any): FraudScore {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      orderId: row.order_id,
      userId: row.user_id,
      score: row.score,
      riskLevel: row.risk_level,
      factors: row.factors,
      detectionMethods: row.detection_methods,
      isReviewed: row.is_reviewed,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      resolution: row.resolution,
      resolutionNotes: row.resolution_notes,
      externalScores: row.external_scores,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapBlockedEntity(row: any): BlockedEntity {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      entityType: row.entity_type,
      entityValue: row.entity_value,
      blockReason: row.block_reason,
      isPermanent: row.is_permanent,
      blockedUntil: row.blocked_until,
      blockedBy: row.blocked_by,
      unblockReason: row.unblock_reason,
      unblockedBy: row.unblocked_by,
      unblockedAt: row.unblocked_at,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

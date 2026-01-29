import { query } from '../../config/database';
import { logger } from '../../utils/logger';

const log = logger.child({ component: 'AdvancedFraudDetection' });

export enum SignalType {
  PROXY_DETECTED = 'proxy_detected',
  RAPID_PURCHASES = 'rapid_purchases',
  BOT_BEHAVIOR = 'bot_behavior',
  SUSPICIOUS_CARD = 'suspicious_card',
  MULTIPLE_ACCOUNTS = 'multiple_accounts',
  ACCOUNT_TAKEOVER = 'account_takeover',
}

export enum FraudDecision {
  APPROVE = 'approve',
  CHALLENGE = 'challenge',
  REVIEW = 'review',
  DECLINE = 'decline',
}

export interface FraudSignal {
  type: SignalType;
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  details: Record<string, any>;
}

export interface FraudCheck {
  userId: string;
  ipAddress: string;
  deviceFingerprint: string;
  score: number;
  signals: FraudSignal[];
  decision: FraudDecision;
  timestamp: Date;
}

export interface FraudCheckRequest {
  tenantId: string;
  userId: string;
  sessionId?: string;
  ipAddress: string;
  deviceFingerprint: string;
  cardFingerprint?: string;
  amount: number;
  eventId?: string;
}

export class AdvancedFraudDetectionService {
  async performFraudCheck(request: FraudCheckRequest): Promise<FraudCheck> {
    const signals: FraudSignal[] = [];
    let totalScore = 0;

    const [
      ipSignal,
      velocitySignal,
      cardSignal,
      accountTakeoverSignal,
      ruleSignals,
    ] = await Promise.all([
      this.checkIPReputation(request.ipAddress, request.tenantId),
      this.checkVelocityLimits(request),
      request.cardFingerprint ? this.checkCardReputation(request.cardFingerprint) : null,
      this.checkAccountTakeover(request.userId, request.tenantId),
      this.evaluateFraudRules(request),
    ]);

    if (ipSignal) {
      signals.push(ipSignal);
      totalScore += this.calculateSignalScore(ipSignal);
    }

    if (velocitySignal) {
      signals.push(velocitySignal);
      totalScore += this.calculateSignalScore(velocitySignal);
    }

    if (cardSignal) {
      signals.push(cardSignal);
      totalScore += this.calculateSignalScore(cardSignal);
    }

    if (accountTakeoverSignal) {
      signals.push(accountTakeoverSignal);
      totalScore += this.calculateSignalScore(accountTakeoverSignal);
    }

    for (const signal of ruleSignals) {
      signals.push(signal);
      totalScore += this.calculateSignalScore(signal);
    }

    totalScore = Math.min(totalScore, 1.0);
    const decision = this.determineDecision(totalScore, signals);

    const fraudCheck: FraudCheck = {
      userId: request.userId,
      ipAddress: request.ipAddress,
      deviceFingerprint: request.deviceFingerprint,
      score: totalScore,
      signals,
      decision,
      timestamp: new Date(),
    };

    await this.storeFraudCheck(fraudCheck, request.tenantId);

    if (decision === FraudDecision.REVIEW) {
      await this.queueForReview(fraudCheck, request.tenantId);
    }

    log.info({
      userId: request.userId,
      score: totalScore,
      decision,
      signalCount: signals.length,
    }, 'Fraud check completed');

    return fraudCheck;
  }

  async checkIPReputation(ipAddress: string, tenantId: string): Promise<FraudSignal | null> {
    try {
      const result = await query(
        `SELECT * FROM ip_reputation WHERE ip_address = $1::inet`,
        [ipAddress]
      );

      if (result.rows.length === 0) {
        await this.createIPReputation(ipAddress);
        return null;
      }

      const reputation = result.rows[0];

      await query(
        `UPDATE ip_reputation SET last_seen = NOW() WHERE ip_address = $1::inet`,
        [ipAddress]
      );

      if (reputation.reputation_status === 'blocked') {
        return {
          type: SignalType.PROXY_DETECTED,
          severity: 'high',
          confidence: 1.0,
          details: {
            ipAddress,
            reason: reputation.blocked_reason,
            status: 'blocked',
          },
        };
      }

      const riskScore = parseInt(reputation.risk_score) || 0;
      if (riskScore > 70) {
        return {
          type: SignalType.PROXY_DETECTED,
          severity: 'high',
          confidence: riskScore / 100,
          details: {
            ipAddress,
            riskScore,
            fraudCount: reputation.fraud_count,
            isProxy: reputation.is_proxy,
            isVPN: reputation.is_vpn,
          },
        };
      }

      if (reputation.is_proxy || reputation.is_vpn || reputation.is_tor) {
        return {
          type: SignalType.PROXY_DETECTED,
          severity: 'medium',
          confidence: 0.7,
          details: {
            ipAddress,
            isProxy: reputation.is_proxy,
            isVPN: reputation.is_vpn,
            isTor: reputation.is_tor,
          },
        };
      }
    } catch (error) {
      log.error({ error, ipAddress }, 'Error checking IP reputation');
    }

    return null;
  }

  async checkVelocityLimits(request: FraudCheckRequest): Promise<FraudSignal | null> {
    try {
      const entities = [
        { type: 'user', id: request.userId },
        { type: 'ip', id: request.ipAddress },
        { type: 'device', id: request.deviceFingerprint },
      ];

      if (request.cardFingerprint) {
        entities.push({ type: 'card', id: request.cardFingerprint });
      }

      for (const entity of entities) {
        const result = await query(
          `SELECT * FROM velocity_limits
           WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3
             AND action_type = 'purchase' AND window_end > NOW()
           ORDER BY window_end DESC LIMIT 1`,
          [request.tenantId, entity.type, entity.id]
        );

        if (result.rows.length > 0) {
          const limit = result.rows[0];
          const currentCount = parseInt(limit.current_count) || 0;
          const limitCount = parseInt(limit.limit_count) || 10;

          await query(
            `UPDATE velocity_limits SET current_count = current_count + 1 WHERE id = $1`,
            [limit.id]
          );

          if (currentCount >= limitCount) {
            return {
              type: SignalType.RAPID_PURCHASES,
              severity: 'high',
              confidence: 0.9,
              details: {
                entityType: entity.type,
                count: currentCount + 1,
                limit: limitCount,
                windowMinutes: limit.window_minutes,
              },
            };
          }
        } else {
          await query(
            `INSERT INTO velocity_limits (
              tenant_id, entity_type, entity_id, action_type,
              limit_count, window_minutes, current_count, window_start, window_end
            ) VALUES ($1, $2, $3, 'purchase', 10, 60, 1, NOW(), NOW() + INTERVAL '60 minutes')`,
            [request.tenantId, entity.type, entity.id]
          );
        }
      }
    } catch (error) {
      log.error({ error }, 'Error checking velocity limits');
    }

    return null;
  }

  async checkCardReputation(cardFingerprint: string): Promise<FraudSignal | null> {
    try {
      const result = await query(
        `SELECT * FROM card_fingerprints WHERE card_fingerprint = $1`,
        [cardFingerprint]
      );

      if (result.rows.length === 0) return null;

      const cardRep = result.rows[0];

      await query(
        `UPDATE card_fingerprints SET last_used = NOW() WHERE id = $1`,
        [cardRep.id]
      );

      if (cardRep.risk_level === 'blocked') {
        return {
          type: SignalType.SUSPICIOUS_CARD,
          severity: 'high',
          confidence: 1.0,
          details: {
            riskLevel: 'blocked',
            chargebackCount: cardRep.chargeback_count,
            fraudCount: cardRep.fraud_count,
          },
        };
      }

      const chargebackCount = parseInt(cardRep.chargeback_count) || 0;
      const fraudCount = parseInt(cardRep.fraud_count) || 0;

      if (chargebackCount > 0 || fraudCount > 0) {
        return {
          type: SignalType.SUSPICIOUS_CARD,
          severity: 'medium',
          confidence: 0.7,
          details: {
            chargebackCount,
            fraudCount,
          },
        };
      }
    } catch (error) {
      log.error({ error }, 'Error checking card reputation');
    }

    return null;
  }

  async checkAccountTakeover(userId: string, tenantId: string): Promise<FraudSignal | null> {
    try {
      const result = await query(
        `SELECT * FROM account_takeover_signals
         WHERE user_id = $1 AND tenant_id = $2
           AND timestamp > NOW() - INTERVAL '24 hours'
           AND is_anomaly = true`,
        [userId, tenantId]
      );

      if (result.rows.length >= 2) {
        return {
          type: SignalType.ACCOUNT_TAKEOVER,
          severity: 'high',
          confidence: 0.8,
          details: {
            signalCount: result.rows.length,
            signals: result.rows.map(s => s.signal_type),
          },
        };
      }
    } catch (error) {
      log.error({ error }, 'Error checking account takeover');
    }

    return null;
  }

  async evaluateFraudRules(request: FraudCheckRequest): Promise<FraudSignal[]> {
    const signals: FraudSignal[] = [];

    try {
      const result = await query(
        `SELECT * FROM fraud_rules WHERE tenant_id = $1 AND is_active = true ORDER BY priority ASC`,
        [request.tenantId]
      );

      for (const rule of result.rows) {
        const conditions = rule.conditions || {};

        if (this.evaluateConditions(conditions, request)) {
          await query(
            `UPDATE fraud_rules SET trigger_count = trigger_count + 1 WHERE id = $1`,
            [rule.id]
          );

          if (rule.action === 'block') {
            await query(
              `UPDATE fraud_rules SET block_count = block_count + 1 WHERE id = $1`,
              [rule.id]
            );
          }

          signals.push({
            type: SignalType.BOT_BEHAVIOR,
            severity: rule.action === 'block' ? 'high' : 'medium',
            confidence: 0.8,
            details: {
              ruleName: rule.rule_name,
              ruleAction: rule.action,
            },
          });
        }
      }
    } catch (error) {
      log.error({ error }, 'Error evaluating fraud rules');
    }

    return signals;
  }

  private calculateSignalScore(signal: FraudSignal): number {
    const severityWeight: Record<string, number> = {
      low: 0.1,
      medium: 0.3,
      high: 0.5,
    };
    return (severityWeight[signal.severity] || 0.2) * signal.confidence;
  }

  private determineDecision(score: number, signals: FraudSignal[]): FraudDecision {
    const hasHighSeverity = signals.some(s => s.severity === 'high' && s.confidence > 0.8);

    if (score >= 0.8 || hasHighSeverity) {
      return FraudDecision.DECLINE;
    } else if (score >= 0.6) {
      return FraudDecision.REVIEW;
    } else if (score >= 0.4) {
      return FraudDecision.CHALLENGE;
    } else {
      return FraudDecision.APPROVE;
    }
  }

  private async storeFraudCheck(fraudCheck: FraudCheck, tenantId: string): Promise<void> {
    try {
      await query(
        `INSERT INTO fraud_checks (
          tenant_id, user_id, device_fingerprint, ip_address,
          score, risk_score, signals, decision, timestamp
        ) VALUES ($1, $2, $3, $4::inet, $5, $6, $7, $8, $9)`,
        [
          tenantId,
          fraudCheck.userId,
          fraudCheck.deviceFingerprint,
          fraudCheck.ipAddress,
          fraudCheck.score,
          fraudCheck.score * 100,
          JSON.stringify(fraudCheck.signals),
          fraudCheck.decision,
          fraudCheck.timestamp,
        ]
      );
    } catch (error) {
      log.error({ error }, 'Error storing fraud check');
    }
  }

  private async queueForReview(fraudCheck: FraudCheck, tenantId: string): Promise<void> {
    try {
      const priority = fraudCheck.score >= 0.7 ? 'high' : 'medium';
      await query(
        `INSERT INTO fraud_review_queue (tenant_id, user_id, reason, priority, status)
         VALUES ($1, $2, $3, $4, 'pending')`,
        [tenantId, fraudCheck.userId, `Fraud score: ${(fraudCheck.score * 100).toFixed(0)}%`, priority]
      );
    } catch (error) {
      log.error({ error }, 'Error queueing for review');
    }
  }

  private async createIPReputation(ipAddress: string): Promise<void> {
    try {
      await query(
        `INSERT INTO ip_reputation (ip_address, risk_score, reputation_status, first_seen, last_seen)
         VALUES ($1::inet, 0, 'unknown', NOW(), NOW())
         ON CONFLICT (ip_address) DO NOTHING`,
        [ipAddress]
      );
    } catch (error) {
      log.error({ error }, 'Error creating IP reputation');
    }
  }

  private evaluateConditions(conditions: any, request: FraudCheckRequest): boolean {
    if (!conditions) return false;
    if (conditions.min_amount && request.amount < conditions.min_amount) return false;
    if (conditions.max_amount && request.amount > conditions.max_amount) return false;
    return Object.keys(conditions).length > 0;
  }

  async getFraudCheckById(checkId: string, tenantId: string): Promise<FraudCheck | null> {
    const result = await query(
      `SELECT * FROM fraud_checks WHERE id = $1 AND tenant_id = $2`,
      [checkId, tenantId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      userId: row.user_id,
      ipAddress: row.ip_address,
      deviceFingerprint: row.device_fingerprint,
      score: parseFloat(row.score) || 0,
      signals: row.signals || [],
      decision: row.decision,
      timestamp: row.timestamp,
    };
  }

  async getUserFraudHistory(userId: string, tenantId: string, limit: number = 10): Promise<FraudCheck[]> {
    const result = await query(
      `SELECT * FROM fraud_checks
       WHERE user_id = $1 AND tenant_id = $2
       ORDER BY timestamp DESC LIMIT $3`,
      [userId, tenantId, limit]
    );

    return result.rows.map(row => ({
      userId: row.user_id,
      ipAddress: row.ip_address,
      deviceFingerprint: row.device_fingerprint,
      score: parseFloat(row.score) || 0,
      signals: row.signals || [],
      decision: row.decision,
      timestamp: row.timestamp,
    }));
  }
}

export const advancedFraudDetectionService = new AdvancedFraudDetectionService();

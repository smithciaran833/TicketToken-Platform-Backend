import { query } from '../../config/database';
import { RedisService } from '../redisService';
import { logger } from '../../utils/logger';

const log = logger.child({ component: 'ScalperDetector' });

export enum SignalType {
  RAPID_PURCHASES = 'rapid_purchases',
  MULTI_EVENT = 'multi_event',
  KNOWN_SCALPER = 'known_scalper',
  BOT_BEHAVIOR = 'bot_behavior',
  MULTIPLE_PAYMENT_METHODS = 'multiple_payment_methods',
}

export enum FraudDecision {
  APPROVE = 'approve',
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

export interface ScalperDetectionConfig {
  rapidPurchaseThreshold: number;
  rapidPurchaseWindowMinutes: number;
  multiEventThreshold: number;
  suspiciousPurchaseCount: number;
  suspiciousPaymentMethodCount: number;
  reviewThreshold: number;
  declineThreshold: number;
}

export class ScalperDetectorService {
  private config: ScalperDetectionConfig = {
    rapidPurchaseThreshold: 3,
    rapidPurchaseWindowMinutes: 10,
    multiEventThreshold: 3,
    suspiciousPurchaseCount: 10,
    suspiciousPaymentMethodCount: 3,
    reviewThreshold: 30,
    declineThreshold: 50,
  };

  constructor(config?: Partial<ScalperDetectionConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  async detectScalper(
    userId: string,
    tenantId: string,
    transaction: { ipAddress?: string },
    deviceFingerprint?: string
  ): Promise<FraudCheck> {
    const signals: FraudSignal[] = [];
    let totalScore = 0;

    // Check rapid purchases
    const rapidCheck = await this.checkRapidPurchases(userId);
    if (rapidCheck.isRapid) {
      const score = 30;
      signals.push({
        type: SignalType.RAPID_PURCHASES,
        severity: 'high',
        confidence: 0.8,
        details: {
          count: rapidCheck.count,
          windowMinutes: rapidCheck.windowMinutes,
          score,
        },
      });
      totalScore += score;
    }

    // Check multiple events
    const multiEventCheck = await this.checkMultipleEvents(userId, tenantId);
    if (multiEventCheck.count > this.config.multiEventThreshold) {
      const score = 20;
      signals.push({
        type: SignalType.MULTI_EVENT,
        severity: 'medium',
        confidence: 0.7,
        details: {
          eventCount: multiEventCheck.count,
          score,
        },
      });
      totalScore += score;
    }

    // Check purchase patterns
    const patternCheck = await this.checkPurchasePatterns(userId, tenantId);
    if (patternCheck.suspicious) {
      const score = 25;
      signals.push({
        type: SignalType.KNOWN_SCALPER,
        severity: 'high',
        confidence: 0.75,
        details: {
          reason: patternCheck.reason,
          purchaseCount: patternCheck.purchaseCount,
          score,
        },
      });
      totalScore += score;
    }

    // Check device fingerprint
    if (deviceFingerprint) {
      const deviceCheck = await this.checkDeviceFingerprint(deviceFingerprint);
      if (deviceCheck.flagged) {
        const score = 35;
        signals.push({
          type: SignalType.BOT_BEHAVIOR,
          severity: 'high',
          confidence: 0.9,
          details: {
            fingerprint: deviceFingerprint.slice(0, 8) + '...', // Don't log full fingerprint
            reason: deviceCheck.reason,
            score,
          },
        });
        totalScore += score;
      }
    }

    // Determine decision
    let decision: FraudDecision;
    if (totalScore >= this.config.declineThreshold) {
      decision = FraudDecision.DECLINE;
    } else if (totalScore >= this.config.reviewThreshold) {
      decision = FraudDecision.REVIEW;
    } else {
      decision = FraudDecision.APPROVE;
    }

    log.info({
      userId,
      score: totalScore,
      decision,
      signalCount: signals.length,
    }, 'Scalper detection completed');

    return {
      userId,
      ipAddress: transaction.ipAddress || '',
      deviceFingerprint: deviceFingerprint || '',
      score: totalScore,
      signals,
      decision,
      timestamp: new Date(),
    };
  }

  private async checkRapidPurchases(userId: string): Promise<{
    isRapid: boolean;
    count: number;
    windowMinutes: number;
  }> {
    const windowMinutes = this.config.rapidPurchaseWindowMinutes;
    const rapidKey = `scalper:rapid:${userId}`;

    try {
      const redis = RedisService.getClient();
      const count = await redis.incr(rapidKey);
      await redis.expire(rapidKey, windowMinutes * 60);

      return {
        isRapid: count > this.config.rapidPurchaseThreshold,
        count,
        windowMinutes,
      };
    } catch (error) {
      log.error({ error }, 'Redis error in checkRapidPurchases');
      return { isRapid: false, count: 0, windowMinutes };
    }
  }

  private async checkMultipleEvents(userId: string, tenantId: string): Promise<{ count: number }> {
    const result = await query(
      `SELECT COUNT(DISTINCT event_id) as event_count
       FROM payment_transactions
       WHERE user_id = $1
         AND tenant_id = $2
         AND created_at > NOW() - INTERVAL '24 hours'
         AND status IN ('completed', 'processing')`,
      [userId, tenantId]
    );

    return { count: parseInt(result.rows[0].event_count) || 0 };
  }

  private async checkPurchasePatterns(userId: string, tenantId: string): Promise<{
    suspicious: boolean;
    reason: string;
    purchaseCount: number;
  }> {
    const result = await query(
      `SELECT
        COUNT(*) as purchase_count,
        COALESCE(SUM(amount), 0) as total_spent,
        COALESCE(AVG(amount), 0) as avg_amount,
        COUNT(DISTINCT stripe_payment_intent_id) as unique_intents
       FROM payment_transactions
       WHERE user_id = $1
         AND tenant_id = $2
         AND created_at > NOW() - INTERVAL '7 days'
         AND status = 'completed'`,
      [userId, tenantId]
    );

    const stats = result.rows[0];
    const purchaseCount = parseInt(stats.purchase_count) || 0;
    const uniqueIntents = parseInt(stats.unique_intents) || 0;

    // Suspicious if many purchases with many different payment intents
    if (purchaseCount > this.config.suspiciousPurchaseCount && 
        uniqueIntents > this.config.suspiciousPaymentMethodCount) {
      return {
        suspicious: true,
        reason: `${purchaseCount} purchases with ${uniqueIntents} different payment methods in 7 days`,
        purchaseCount,
      };
    }

    return { suspicious: false, reason: '', purchaseCount };
  }

  private async checkDeviceFingerprint(fingerprint: string): Promise<{ flagged: boolean; reason?: string }> {
    const flaggedKey = `scalper:device:flagged:${fingerprint}`;

    try {
      const redis = RedisService.getClient();
      const reason = await redis.get(flaggedKey);
      return { flagged: !!reason, reason: reason || undefined };
    } catch (error) {
      log.error({ error }, 'Redis error in checkDeviceFingerprint');
      return { flagged: false };
    }
  }

  /**
   * Flag a device fingerprint as suspicious
   */
  async flagDevice(fingerprint: string, reason: string, durationDays: number = 30): Promise<void> {
    try {
      const redis = RedisService.getClient();
      const flaggedKey = `scalper:device:flagged:${fingerprint}`;
      await redis.setex(flaggedKey, durationDays * 24 * 60 * 60, reason);
      log.info({ fingerprint: fingerprint.slice(0, 8) + '...', reason }, 'Device flagged');
    } catch (error) {
      log.error({ error }, 'Error flagging device');
    }
  }

  /**
   * Unflag a device
   */
  async unflagDevice(fingerprint: string): Promise<void> {
    try {
      const redis = RedisService.getClient();
      const flaggedKey = `scalper:device:flagged:${fingerprint}`;
      await redis.del(flaggedKey);
      log.info({ fingerprint: fingerprint.slice(0, 8) + '...' }, 'Device unflagged');
    } catch (error) {
      log.error({ error }, 'Error unflagging device');
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): ScalperDetectionConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ScalperDetectionConfig>): void {
    this.config = { ...this.config, ...config };
    log.info({ config: this.config }, 'Scalper detection config updated');
  }
}

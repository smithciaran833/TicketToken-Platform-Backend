import { query } from '../../config/database';
import { FraudCheck, FraudSignal, SignalType, FraudDecision } from '../../types';
import { RedisService } from '../redisService';
import { logger } from '../../utils/logger';

const log = logger.child({ component: 'ScalperDetector' });

export class ScalperDetectorService {
  private knownScalperPatterns: Set<string>;

  constructor() {
    this.knownScalperPatterns = new Set([
      'rapid_multi_event_purchases',
      'consistent_high_markup_resales',
      'bot_like_behavior',
      'multiple_payment_methods',
      'suspicious_account_creation'
    ]);
  }

  async detectScalper(
    userId: string,
    transaction: any,
    deviceFingerprint?: string
  ): Promise<FraudCheck> {
    const signals: FraudSignal[] = [];
    let totalScore = 0;

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
          score: score
        }
      });
      totalScore += score;
    }

    const multiEventCheck = await this.checkMultipleEvents(userId);
    if (multiEventCheck.count > 3) {
      const score = 20;
      signals.push({
        type: SignalType.RAPID_PURCHASES,
        severity: 'medium',
        confidence: 0.7,
        details: {
          eventCount: multiEventCheck.count,
          score: score
        }
      });
      totalScore += score;
    }

    const patternCheck = await this.checkPurchasePatterns(userId);
    if (patternCheck.suspicious) {
      const score = 25;
      signals.push({
        type: SignalType.KNOWN_SCALPER,
        severity: 'high',
        confidence: 0.75,
        details: {
          reason: patternCheck.reason,
          score: score
        }
      });
      totalScore += score;
    }

    if (deviceFingerprint) {
      const deviceCheck = await this.checkDeviceFingerprint(deviceFingerprint);
      if (deviceCheck.flagged) {
        const score = 35;
        signals.push({
          type: SignalType.BOT_BEHAVIOR,
          severity: 'high',
          confidence: 0.9,
          details: {
            fingerprint: deviceFingerprint,
            score: score
          }
        });
        totalScore += score;
      }
    }

    let decision: FraudDecision;
    if (totalScore >= 50) {
      decision = FraudDecision.DECLINE;
    } else if (totalScore >= 30) {
      decision = FraudDecision.REVIEW;
    } else {
      decision = FraudDecision.APPROVE;
    }

    return {
      userId,
      ipAddress: transaction.ipAddress || '',
      deviceFingerprint: deviceFingerprint || '',
      score: totalScore,
      signals,
      decision,
      timestamp: new Date()
    };
  }

  private async checkRapidPurchases(userId: string): Promise<{
    isRapid: boolean;
    count: number;
    windowMinutes: number;
  }> {
    const windowMinutes = 10;
    const rapidKey = `rapid:${userId}`;

    try {
      const redis = RedisService.getClient();
      const count = await redis.incr(rapidKey);
      await redis.expire(rapidKey, windowMinutes * 60);

      return {
        isRapid: count > 3,
        count,
        windowMinutes
      };
    } catch (error) {
      log.error({ error }, 'Redis error in checkRapidPurchases');
      return { isRapid: false, count: 0, windowMinutes };
    }
  }

  private async checkMultipleEvents(userId: string): Promise<{ count: number }> {
    const result = await query(
      `SELECT COUNT(DISTINCT event_id) as event_count
       FROM payment_transactions
       WHERE user_id = $1
         AND created_at > NOW() - INTERVAL '24 hours'
         AND status IN ('completed', 'processing')`,
      [userId]
    );

    return { count: parseInt(result.rows[0].event_count) || 0 };
  }

  private async checkPurchasePatterns(userId: string): Promise<{
    suspicious: boolean;
    reason: string;
  }> {
    const result = await query(
      `SELECT
        COUNT(*) as purchase_count,
        SUM(amount_cents) as total_spent,
        AVG(amount_cents) as avg_amount,
        COUNT(DISTINCT payment_method_id) as payment_methods
       FROM payment_transactions
       WHERE user_id = $1
         AND created_at > NOW() - INTERVAL '7 days'
         AND status = 'completed'`,
      [userId]
    );

    const stats = result.rows[0];
    const purchaseCount = parseInt(stats.purchase_count);
    const paymentMethods = parseInt(stats.payment_methods);

    if (purchaseCount > 10 && paymentMethods > 3) {
      return {
        suspicious: true,
        reason: `${purchaseCount} purchases using ${paymentMethods} different payment methods`
      };
    }

    return { suspicious: false, reason: '' };
  }

  private async checkDeviceFingerprint(fingerprint: string): Promise<{ flagged: boolean }> {
    const flaggedKey = `device:flagged:${fingerprint}`;

    try {
      const redis = RedisService.getClient();
      const exists = await redis.exists(flaggedKey);
      return { flagged: exists === 1 };
    } catch (error) {
      log.error({ error }, 'Redis error in checkDeviceFingerprint');
      return { flagged: false };
    }
  }

  async flagDevice(fingerprint: string, reason: string): Promise<void> {
    try {
      const redis = RedisService.getClient();
      const flaggedKey = `device:flagged:${fingerprint}`;
      await redis.setex(flaggedKey, 30 * 24 * 60 * 60, reason);
    } catch (error) {
      log.error({ error }, 'Error flagging device');
    }
  }
}

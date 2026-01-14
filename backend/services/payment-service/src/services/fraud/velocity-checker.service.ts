import { query } from '../../config/database';
import { RedisService } from '../redisService';
import { logger } from '../../utils/logger';

const log = logger.child({ component: 'VelocityChecker' });

export class VelocityCheckerService {
  async checkVelocity(
    userId: string,
    eventId: string,
    ipAddress: string,
    paymentMethodToken: string
  ): Promise<{ allowed: boolean; reason?: string; limits: { perUser: number; perIp: number; perPaymentMethod: number } }> {
    const limits = { perUser: 5, perIp: 10, perPaymentMethod: 5 };

    try {
      const redis = RedisService.getClient();

      const userKey = `velocity:user:${userId}:${eventId}`;
      const userCount = await redis.incr(userKey);
      await redis.expire(userKey, 300);

      if (userCount > limits.perUser) {
        return { allowed: false, reason: `Maximum ${limits.perUser} purchase attempts per 5 minutes`, limits };
      }

      const ipKey = `velocity:ip:${ipAddress}:${eventId}`;
      const ipCount = await redis.incr(ipKey);
      await redis.expire(ipKey, 300);

      if (ipCount > limits.perIp) {
        return { allowed: false, reason: `Maximum ${limits.perIp} purchase attempts from this IP per 5 minutes`, limits };
      }

      const pmKey = `velocity:pm:${paymentMethodToken}:${eventId}`;
      const pmCount = await redis.incr(pmKey);
      await redis.expire(pmKey, 300);

      if (pmCount > limits.perPaymentMethod) {
        return { allowed: false, reason: `Maximum ${limits.perPaymentMethod} purchase attempts with this payment method per 5 minutes`, limits };
      }

      return { allowed: true, limits };
    } catch (error) {
      log.error({ error }, 'Redis error in velocity check');
      return { allowed: true, limits };
    }
  }

  async recordPurchase(userId: string, eventId: string, ipAddress: string, paymentMethodToken: string): Promise<void> {
    try {
      await query(
        `INSERT INTO velocity_records (user_id, event_id, ip_address, payment_method_token, created_at) VALUES ($1, $2, $3, $4, NOW())`,
        [userId, eventId, ipAddress, paymentMethodToken]
      );
    } catch (error) {
      log.error({ error }, 'Error recording purchase velocity');
    }
  }

  async getVelocityStats(userId: string): Promise<{ recentAttempts: number; successfulPurchases: number; failedAttempts: number }> {
    const result = await query(
      `SELECT COUNT(*) as recent_attempts, COUNT(*) FILTER (WHERE status = 'completed') as successful,
              COUNT(*) FILTER (WHERE status = 'failed') as failed
       FROM payment_transactions WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [userId]
    );
    return {
      recentAttempts: parseInt(result.rows[0].recent_attempts) || 0,
      successfulPurchases: parseInt(result.rows[0].successful) || 0,
      failedAttempts: parseInt(result.rows[0].failed) || 0
    };
  }
}

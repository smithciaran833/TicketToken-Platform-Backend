import { query } from '../../config/database';
import { RedisService } from '../redisService';
import { logger } from '../../utils/logger';

const log = logger.child({ component: 'VelocityChecker' });

export interface VelocityLimits {
  perUser: number;
  perIp: number;
  perPaymentMethod: number;
  windowSeconds: number;
}

export interface VelocityCheckResult {
  allowed: boolean;
  reason?: string;
  limits: VelocityLimits;
  counts?: {
    user: number;
    ip: number;
    paymentMethod: number;
  };
}

export interface VelocityStats {
  recentAttempts: number;
  successfulPurchases: number;
  failedAttempts: number;
}

export class VelocityCheckerService {
  private limits: VelocityLimits = {
    perUser: 5,
    perIp: 10,
    perPaymentMethod: 5,
    windowSeconds: 300, // 5 minutes
  };

  constructor(limits?: Partial<VelocityLimits>) {
    if (limits) {
      this.limits = { ...this.limits, ...limits };
    }
  }

  /**
   * Check if a purchase attempt is within velocity limits
   */
  async checkVelocity(
    userId: string,
    eventId: string,
    ipAddress: string,
    paymentMethodToken: string
  ): Promise<VelocityCheckResult> {
    try {
      const redis = RedisService.getClient();

      // Check user velocity
      const userKey = `velocity:user:${userId}:${eventId}`;
      const userCount = await redis.incr(userKey);
      await redis.expire(userKey, this.limits.windowSeconds);

      if (userCount > this.limits.perUser) {
        return {
          allowed: false,
          reason: `Maximum ${this.limits.perUser} purchase attempts per ${this.limits.windowSeconds / 60} minutes`,
          limits: this.limits,
          counts: { user: userCount, ip: 0, paymentMethod: 0 },
        };
      }

      // Check IP velocity
      const ipKey = `velocity:ip:${ipAddress}:${eventId}`;
      const ipCount = await redis.incr(ipKey);
      await redis.expire(ipKey, this.limits.windowSeconds);

      if (ipCount > this.limits.perIp) {
        return {
          allowed: false,
          reason: `Maximum ${this.limits.perIp} purchase attempts from this IP per ${this.limits.windowSeconds / 60} minutes`,
          limits: this.limits,
          counts: { user: userCount, ip: ipCount, paymentMethod: 0 },
        };
      }

      // Check payment method velocity
      const pmKey = `velocity:pm:${paymentMethodToken}:${eventId}`;
      const pmCount = await redis.incr(pmKey);
      await redis.expire(pmKey, this.limits.windowSeconds);

      if (pmCount > this.limits.perPaymentMethod) {
        return {
          allowed: false,
          reason: `Maximum ${this.limits.perPaymentMethod} purchase attempts with this payment method per ${this.limits.windowSeconds / 60} minutes`,
          limits: this.limits,
          counts: { user: userCount, ip: ipCount, paymentMethod: pmCount },
        };
      }

      return {
        allowed: true,
        limits: this.limits,
        counts: { user: userCount, ip: ipCount, paymentMethod: pmCount },
      };
    } catch (error) {
      log.error({ error }, 'Redis error in velocity check, allowing by default');
      return { allowed: true, limits: this.limits };
    }
  }

  /**
   * Record a purchase attempt for velocity tracking in DB
   */
  async recordPurchase(
    tenantId: string,
    userId: string,
    eventId: string,
    ipAddress: string,
    paymentMethodToken: string
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO velocity_records (tenant_id, user_id, event_id, ip_address, payment_method_token, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [tenantId, userId, eventId, ipAddress, paymentMethodToken]
      );
    } catch (error) {
      log.error({ error }, 'Error recording purchase velocity');
    }
  }

  /**
   * Get velocity stats for a user from DB (useful for analytics/review)
   */
  async getVelocityStats(userId: string, tenantId: string): Promise<VelocityStats> {
    const result = await query(
      `SELECT
         COUNT(*) as recent_attempts,
         COUNT(*) FILTER (WHERE status = 'completed') as successful,
         COUNT(*) FILTER (WHERE status = 'failed') as failed
       FROM payment_transactions
       WHERE user_id = $1 AND tenant_id = $2 AND created_at > NOW() - INTERVAL '1 hour'`,
      [userId, tenantId]
    );

    return {
      recentAttempts: parseInt(result.rows[0].recent_attempts) || 0,
      successfulPurchases: parseInt(result.rows[0].successful) || 0,
      failedAttempts: parseInt(result.rows[0].failed) || 0,
    };
  }

  /**
   * Get velocity records for a user
   */
  async getVelocityRecords(
    userId: string,
    tenantId: string,
    hours: number = 1
  ): Promise<{ eventId: string; ipAddress: string; createdAt: Date }[]> {
    const result = await query(
      `SELECT event_id, ip_address, created_at
       FROM velocity_records
       WHERE user_id = $1 AND tenant_id = $2 AND created_at > NOW() - INTERVAL '${hours} hours'
       ORDER BY created_at DESC`,
      [userId, tenantId]
    );

    return result.rows.map(row => ({
      eventId: row.event_id,
      ipAddress: row.ip_address,
      createdAt: row.created_at,
    }));
  }

  /**
   * Clear velocity limits for a user (admin function)
   */
  async clearVelocityLimits(userId: string, eventId: string): Promise<void> {
    try {
      const redis = RedisService.getClient();
      const userKey = `velocity:user:${userId}:${eventId}`;
      await redis.del(userKey);
      log.info({ userId, eventId }, 'Velocity limits cleared');
    } catch (error) {
      log.error({ error }, 'Error clearing velocity limits');
    }
  }

  /**
   * Get current limits
   */
  getLimits(): VelocityLimits {
    return { ...this.limits };
  }

  /**
   * Update limits
   */
  updateLimits(limits: Partial<VelocityLimits>): void {
    this.limits = { ...this.limits, ...limits };
    log.info({ limits: this.limits }, 'Velocity limits updated');
  }
}

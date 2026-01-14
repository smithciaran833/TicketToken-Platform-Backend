import { query } from '../../config/database';
import { RedisService } from '../redisService';
import { logger } from '../../utils/logger';

const log = logger.child({ component: 'PurchaseLimiterService' });

export class PurchaseLimiterService {
  async checkPurchaseLimit(
    userId: string,
    eventId: string,
    requestedQuantity: number,
    paymentMethod: {
      type: string;
      fingerprint?: string;
      last4?: string;
    }
  ): Promise<{
    allowed: boolean;
    reason?: string;
    limits: {
      perUser: number;
      perPaymentMethod: number;
      perAddress: number;
      perEvent: number;
    };
    current: {
      userPurchases: number;
      paymentMethodPurchases: number;
      addressPurchases: number;
    };
  }> {
    const eventLimits = await this.getEventLimits(eventId);

    const userPurchases = await this.getUserPurchaseCount(userId, eventId);
    if (userPurchases + requestedQuantity > eventLimits.perUser) {
      return {
        allowed: false,
        reason: `Maximum ${eventLimits.perUser} tickets per person for this event`,
        limits: eventLimits,
        current: { userPurchases, paymentMethodPurchases: 0, addressPurchases: 0 }
      };
    }

    if (paymentMethod.fingerprint) {
      const paymentMethodPurchases = await this.getPaymentMethodPurchaseCount(
        paymentMethod.fingerprint,
        eventId
      );

      if (paymentMethodPurchases + requestedQuantity > eventLimits.perPaymentMethod) {
        return {
          allowed: false,
          reason: `Maximum ${eventLimits.perPaymentMethod} tickets per payment method`,
          limits: eventLimits,
          current: { userPurchases, paymentMethodPurchases, addressPurchases: 0 }
        };
      }
    }

    const userAddress = await this.getUserAddress(userId);
    if (userAddress) {
      const addressPurchases = await this.getAddressPurchaseCount(userAddress, eventId);

      if (addressPurchases + requestedQuantity > eventLimits.perAddress) {
        return {
          allowed: false,
          reason: `Maximum ${eventLimits.perAddress} tickets per household`,
          limits: eventLimits,
          current: { userPurchases, paymentMethodPurchases: 0, addressPurchases }
        };
      }
    }

    const cooldownCheck = await this.checkCooldownPeriod(userId, eventId);
    if (!cooldownCheck.allowed) {
      return {
        allowed: false,
        reason: cooldownCheck.reason,
        limits: eventLimits,
        current: { userPurchases, paymentMethodPurchases: 0, addressPurchases: 0 }
      };
    }

    return {
      allowed: true,
      limits: eventLimits,
      current: { userPurchases, paymentMethodPurchases: 0, addressPurchases: 0 }
    };
  }

  private async getEventLimits(eventId: string): Promise<any> {
    const result = await query(
      `SELECT purchase_limit_per_user, purchase_limit_per_payment_method,
              purchase_limit_per_address, max_tickets_per_order
       FROM event_purchase_limits WHERE event_id = $1`,
      [eventId]
    );

    if (result.rows.length > 0) {
      return {
        perUser: result.rows[0].purchase_limit_per_user || 4,
        perPaymentMethod: result.rows[0].purchase_limit_per_payment_method || 4,
        perAddress: result.rows[0].purchase_limit_per_address || 8,
        perEvent: result.rows[0].max_tickets_per_order || 4
      };
    }

    return { perUser: 4, perPaymentMethod: 4, perAddress: 8, perEvent: 4 };
  }

  private async getUserPurchaseCount(userId: string, eventId: string): Promise<number> {
    const result = await query(
      `SELECT SUM(ticket_count) as total FROM payment_transactions
       WHERE user_id = $1 AND event_id = $2 AND status IN ('completed', 'processing')`,
      [userId, eventId]
    );
    return parseInt(result.rows[0].total) || 0;
  }

  private async getPaymentMethodPurchaseCount(fingerprint: string, eventId: string): Promise<number> {
    const result = await query(
      `SELECT SUM(ticket_count) as total FROM payment_transactions
       WHERE payment_method_fingerprint = $1 AND event_id = $2 AND status IN ('completed', 'processing')`,
      [fingerprint, eventId]
    );
    return parseInt(result.rows[0].total) || 0;
  }

  private async getAddressPurchaseCount(address: string, eventId: string): Promise<number> {
    const normalizedAddress = this.normalizeAddress(address);
    const result = await query(
      `SELECT SUM(pt.ticket_count) as total FROM payment_transactions pt
       JOIN user_addresses ua ON pt.user_id = ua.user_id
       WHERE ua.normalized_address = $1 AND pt.event_id = $2 AND pt.status IN ('completed', 'processing')`,
      [normalizedAddress, eventId]
    );
    return parseInt(result.rows[0].total) || 0;
  }

  private normalizeAddress(address: string): string {
    return address.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  private async getUserAddress(userId: string): Promise<string | null> {
    const result = await query(`SELECT billing_address FROM users WHERE id = $1`, [userId]);
    return result.rows[0]?.billing_address || null;
  }

  private async checkCooldownPeriod(userId: string, eventId: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const redis = RedisService.getClient();
      const cooldownMinutes = parseInt(process.env.PURCHASE_COOLDOWN_MINUTES || '10');
      const cooldownKey = `cooldown:${userId}:${eventId}`;
      const exists = await redis.exists(cooldownKey);

      if (exists) {
        const ttl = await redis.ttl(cooldownKey);
        const minutesRemaining = Math.ceil(ttl / 60);
        return { allowed: false, reason: `Please wait ${minutesRemaining} minutes before purchasing more tickets` };
      }
      return { allowed: true };
    } catch (error) {
      log.error({ error }, 'Error checking cooldown period');
      return { allowed: true };
    }
  }

  async recordPurchase(userId: string, eventId: string, quantity: number, paymentMethod: any): Promise<void> {
    try {
      const redis = RedisService.getClient();
      const cooldownMinutes = parseInt(process.env.PURCHASE_COOLDOWN_MINUTES || '10');
      const cooldownKey = `cooldown:${userId}:${eventId}`;
      await redis.setex(cooldownKey, cooldownMinutes * 60, '1');
    } catch (error) {
      log.error({ error }, 'Error recording purchase');
    }
  }

  async enforceDynamicLimits(eventId: string, demandLevel: number): Promise<void> {
    let perUserLimit = 4;
    let perPaymentLimit = 4;

    if (demandLevel > 0.9) {
      perUserLimit = 2;
      perPaymentLimit = 2;
    } else if (demandLevel > 0.7) {
      perUserLimit = 3;
      perPaymentLimit = 3;
    }

    await query(
      `UPDATE event_purchase_limits SET purchase_limit_per_user = $2,
       purchase_limit_per_payment_method = $3, updated_at = CURRENT_TIMESTAMP WHERE event_id = $1`,
      [eventId, perUserLimit, perPaymentLimit]
    );
  }

  async getPurchaseLimitStats(eventId: string): Promise<any> {
    const statsQuery = `
      SELECT COUNT(DISTINCT user_id) as unique_purchasers, AVG(tickets_per_user) as avg_tickets,
             MAX(tickets_per_user) as max_tickets, COUNT(*) FILTER (WHERE violation_type IS NOT NULL) as violations
      FROM (
        SELECT user_id, SUM(ticket_count) as tickets_per_user, NULL as violation_type
        FROM payment_transactions WHERE event_id = $1 AND status = 'completed' GROUP BY user_id
        UNION ALL
        SELECT user_id, 0 as tickets_per_user, reason as violation_type
        FROM purchase_limit_violations WHERE event_id = $1
      ) as purchase_stats`;

    const result = await query(statsQuery, [eventId]);
    return {
      uniquePurchasers: parseInt(result.rows[0].unique_purchasers),
      averageTicketsPerPurchaser: parseFloat(result.rows[0].avg_tickets) || 0,
      maxTicketsPurchased: parseInt(result.rows[0].max_tickets) || 0,
      limitViolationsBlocked: parseInt(result.rows[0].violations) || 0
    };
  }
}

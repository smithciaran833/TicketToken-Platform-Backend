/**
 * Chargeback Reserve System
 * Manages financial risk from potential chargebacks
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'ChargebackReserveService' });

export interface ReservePolicy {
  baseReserveRate: number;        // Base % of transaction to reserve (e.g., 0.01 = 1%)
  highRiskRate: number;           // Rate for high-risk transactions
  holdPeriodDays: number;         // Days to hold reserve (default 90)
}

export interface ReserveCalculation {
  transactionAmountCents: number;
  reserveAmountCents: number;
  reserveRate: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ReserveStats {
  totalReservedCents: number;
  totalReleasedCents: number;
  pendingReleaseCents: number;
  chargebacksCents: number;
  reserveUtilization: number;
}

export class ChargebackReserveService {
  private pool: Pool;
  private policy: ReservePolicy = {
    baseReserveRate: 0.01,     // 1%
    highRiskRate: 0.05,        // 5%
    holdPeriodDays: 90,
  };

  constructor(pool: Pool, policy?: Partial<ReservePolicy>) {
    this.pool = pool;
    if (policy) {
      this.policy = { ...this.policy, ...policy };
    }
  }

  /**
   * Calculate reserve for a transaction
   */
  async calculateReserve(
    transactionId: string,
    tenantId: string
  ): Promise<ReserveCalculation> {
    // Get transaction details and user's chargeback history
    const txQuery = `
      SELECT
        pt.amount,
        pt.user_id,
        pt.venue_id,
        (SELECT COUNT(*) FROM payment_chargebacks pc 
         WHERE pc.user_id = pt.user_id 
         AND pc.created_at > NOW() - INTERVAL '1 year') as user_chargebacks,
        (SELECT COUNT(*) FROM payment_chargebacks pc2
         JOIN payment_transactions pt2 ON pc2.transaction_id = pt2.id
         WHERE pt2.venue_id = pt.venue_id
         AND pc2.created_at > NOW() - INTERVAL '1 year') as venue_chargebacks,
        (SELECT COUNT(*) FROM payment_transactions pt3
         WHERE pt3.venue_id = pt.venue_id
         AND pt3.created_at > NOW() - INTERVAL '1 year') as venue_transactions
      FROM payment_transactions pt
      WHERE pt.id = $1
        AND pt.tenant_id = $2
    `;

    const result = await this.pool.query(txQuery, [transactionId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Transaction not found');
    }

    const tx = result.rows[0];
    const amountCents = Math.round(parseFloat(tx.amount) * 100);
    const userChargebacks = parseInt(tx.user_chargebacks) || 0;
    const venueChargebacks = parseInt(tx.venue_chargebacks) || 0;
    const venueTransactions = parseInt(tx.venue_transactions) || 0;

    // Calculate venue chargeback rate
    const venueChargebackRate = venueTransactions > 0 
      ? venueChargebacks / venueTransactions 
      : 0;

    // Assess risk level
    const riskLevel = this.assessRiskLevel(userChargebacks, venueChargebackRate);

    // Calculate reserve rate based on risk
    const reserveRate = riskLevel === 'high'
      ? this.policy.highRiskRate
      : riskLevel === 'medium'
        ? (this.policy.baseReserveRate + this.policy.highRiskRate) / 2
        : this.policy.baseReserveRate;

    const reserveAmountCents = Math.round(amountCents * reserveRate);

    log.info({
      transactionId,
      amountCents,
      reserveAmountCents,
      riskLevel,
    }, 'Reserve calculated');

    return {
      transactionAmountCents: amountCents,
      reserveAmountCents,
      reserveRate,
      riskLevel,
    };
  }

  /**
   * Assess transaction risk level
   */
  private assessRiskLevel(
    userChargebacks: number,
    venueChargebackRate: number
  ): 'low' | 'medium' | 'high' {
    // High risk criteria
    if (userChargebacks >= 3 || venueChargebackRate >= 0.02) {
      return 'high';
    }

    // Medium risk criteria
    if (userChargebacks >= 1 || venueChargebackRate >= 0.01) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Create reserve for transaction
   */
  async createReserve(
    transactionId: string,
    tenantId: string
  ): Promise<{ reserveId: string; reserveAmountCents: number }> {
    const calculation = await this.calculateReserve(transactionId, tenantId);

    // Check if reserve already exists
    const existingQuery = `
      SELECT reserve_id, reserve_amount_cents FROM payment_reserves
      WHERE transaction_id = $1
    `;
    const existing = await this.pool.query(existingQuery, [transactionId]);

    if (existing.rows.length > 0) {
      // Update existing reserve
      await this.pool.query(
        `UPDATE payment_reserves 
         SET reserve_amount_cents = $1, updated_at = NOW()
         WHERE reserve_id = $2`,
        [calculation.reserveAmountCents, existing.rows[0].reserve_id]
      );

      return {
        reserveId: existing.rows[0].reserve_id,
        reserveAmountCents: calculation.reserveAmountCents,
      };
    }

    // Create new reserve
    const query = `
      INSERT INTO payment_reserves (
        tenant_id,
        transaction_id,
        reserve_amount_cents,
        status,
        created_at
      ) VALUES ($1, $2, $3, 'held', NOW())
      RETURNING reserve_id
    `;

    const result = await this.pool.query(query, [
      tenantId,
      transactionId,
      calculation.reserveAmountCents,
    ]);

    log.info({
      transactionId,
      reserveAmountCents: calculation.reserveAmountCents,
    }, 'Reserve created');

    return {
      reserveId: result.rows[0].reserve_id,
      reserveAmountCents: calculation.reserveAmountCents,
    };
  }

  /**
   * Process eligible reserve releases (automated job)
   */
  async processReserveReleases(tenantId?: string): Promise<{ releasedCount: number; releasedAmountCents: number }> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Find reserves eligible for release (held for more than holdPeriodDays)
      // and no pending chargebacks
      const findQuery = `
        SELECT
          pr.reserve_id,
          pr.transaction_id,
          pr.tenant_id,
          pr.reserve_amount_cents
        FROM payment_reserves pr
        WHERE pr.status = 'held'
          AND pr.created_at <= NOW() - INTERVAL '${this.policy.holdPeriodDays} days'
          ${tenantId ? 'AND pr.tenant_id = $1' : ''}
          AND NOT EXISTS (
            SELECT 1 FROM payment_chargebacks pc
            WHERE pc.transaction_id = pr.transaction_id
              AND pc.status IN ('open', 'under_review')
          )
        LIMIT 100
      `;

      const reserves = await client.query(findQuery, tenantId ? [tenantId] : []);

      if (reserves.rows.length === 0) {
        await client.query('COMMIT');
        return { releasedCount: 0, releasedAmountCents: 0 };
      }

      let totalReleasedCents = 0;

      // Release each reserve
      for (const reserve of reserves.rows) {
        await client.query(
          `UPDATE payment_reserves
           SET status = 'released',
               released_at = NOW(),
               updated_at = NOW()
           WHERE reserve_id = $1`,
          [reserve.reserve_id]
        );

        totalReleasedCents += parseInt(reserve.reserve_amount_cents);
      }

      await client.query('COMMIT');

      log.info({
        count: reserves.rows.length,
        totalAmountCents: totalReleasedCents,
      }, 'Reserves released');

      return {
        releasedCount: reserves.rows.length,
        releasedAmountCents: totalReleasedCents,
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error({
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Reserve release failed');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle chargeback against reserved transaction
   */
  async handleChargeback(
    transactionId: string,
    chargebackAmountCents: number
  ): Promise<{ coveredAmountCents: number; remainingAmountCents: number }> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get reserve
      const reserveQuery = `
        SELECT reserve_id, reserve_amount_cents, status
        FROM payment_reserves
        WHERE transaction_id = $1 AND status = 'held'
        FOR UPDATE
      `;

      const result = await client.query(reserveQuery, [transactionId]);

      if (result.rows.length === 0) {
        log.warn({ transactionId }, 'No held reserve found for chargeback');
        await client.query('COMMIT');
        return { coveredAmountCents: 0, remainingAmountCents: chargebackAmountCents };
      }

      const reserve = result.rows[0];
      const reserveAmountCents = parseInt(reserve.reserve_amount_cents);

      // Use reserve to cover chargeback
      const coveredAmountCents = Math.min(chargebackAmountCents, reserveAmountCents);
      const remainingAmountCents = chargebackAmountCents - coveredAmountCents;

      await client.query(
        `UPDATE payment_reserves
         SET status = 'used_for_chargeback',
             used_amount_cents = $1,
             updated_at = NOW()
         WHERE reserve_id = $2`,
        [coveredAmountCents, reserve.reserve_id]
      );

      log.info({
        transactionId,
        chargebackAmountCents,
        coveredAmountCents,
        remainingAmountCents,
      }, 'Reserve used for chargeback');

      await client.query('COMMIT');

      return { coveredAmountCents, remainingAmountCents };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get reserve statistics for a tenant
   */
  async getReserveStats(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ReserveStats> {
    const query = `
      SELECT
        COALESCE(SUM(CASE WHEN status = 'held' THEN reserve_amount_cents ELSE 0 END), 0) as total_reserved,
        COALESCE(SUM(CASE WHEN status = 'released' THEN reserve_amount_cents ELSE 0 END), 0) as total_released,
        COALESCE(SUM(CASE WHEN status = 'held' AND created_at <= NOW() - INTERVAL '${this.policy.holdPeriodDays} days' THEN reserve_amount_cents ELSE 0 END), 0) as pending_release,
        COALESCE(SUM(CASE WHEN status = 'used_for_chargeback' THEN used_amount_cents ELSE 0 END), 0) as chargebacks
      FROM payment_reserves
      WHERE tenant_id = $1
        AND created_at BETWEEN $2 AND $3
    `;

    const result = await this.pool.query(query, [tenantId, startDate, endDate]);
    const row = result.rows[0];

    const totalReserved = parseInt(row.total_reserved) || 0;
    const chargebacks = parseInt(row.chargebacks) || 0;

    return {
      totalReservedCents: totalReserved,
      totalReleasedCents: parseInt(row.total_released) || 0,
      pendingReleaseCents: parseInt(row.pending_release) || 0,
      chargebacksCents: chargebacks,
      reserveUtilization: totalReserved > 0 ? (chargebacks / totalReserved) : 0,
    };
  }

  /**
   * Get reserves for a venue
   */
  async getVenueReserves(
    venueId: string,
    tenantId: string
  ): Promise<any[]> {
    const query = `
      SELECT
        pr.reserve_id,
        pr.transaction_id,
        pr.reserve_amount_cents,
        pr.status,
        pr.created_at,
        pt.amount as transaction_amount,
        pt.created_at as transaction_date
      FROM payment_reserves pr
      JOIN payment_transactions pt ON pr.transaction_id = pt.id
      WHERE pt.venue_id = $1
        AND pr.tenant_id = $2
        AND pr.status = 'held'
      ORDER BY pr.created_at DESC
    `;

    const result = await this.pool.query(query, [venueId, tenantId]);

    return result.rows.map((row) => ({
      reserveId: row.reserve_id,
      transactionId: row.transaction_id,
      reserveAmountCents: parseInt(row.reserve_amount_cents),
      transactionAmountCents: Math.round(parseFloat(row.transaction_amount) * 100),
      status: row.status,
      createdAt: row.created_at,
      transactionDate: row.transaction_date,
    }));
  }

  /**
   * Get reserve for a specific transaction
   */
  async getReserveByTransaction(transactionId: string): Promise<any | null> {
    const query = `
      SELECT reserve_id, transaction_id, tenant_id, reserve_amount_cents, 
             used_amount_cents, status, created_at, released_at
      FROM payment_reserves
      WHERE transaction_id = $1
    `;

    const result = await this.pool.query(query, [transactionId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      reserveId: row.reserve_id,
      transactionId: row.transaction_id,
      tenantId: row.tenant_id,
      reserveAmountCents: parseInt(row.reserve_amount_cents),
      usedAmountCents: parseInt(row.used_amount_cents) || 0,
      status: row.status,
      createdAt: row.created_at,
      releasedAt: row.released_at,
    };
  }

  /**
   * Update reserve policy
   */
  updatePolicy(policy: Partial<ReservePolicy>): void {
    this.policy = { ...this.policy, ...policy };
    log.info({ policy: this.policy }, 'Reserve policy updated');
  }

  /**
   * Get current policy
   */
  getPolicy(): ReservePolicy {
    return { ...this.policy };
  }
}

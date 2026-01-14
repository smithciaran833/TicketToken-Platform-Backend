/**
 * Chargeback Reserve System
 * Manages financial risk from potential chargebacks
 */

import { Pool } from 'pg';
import { SafeLogger } from '../utils/pci-log-scrubber.util';

const logger = new SafeLogger('ChargebackReserveService');

export interface ReservePolicy {
  baseReserveRate: number;        // Base % of transaction to reserve (e.g., 0.01 = 1%)
  highRiskRate: number;            // Rate for high-risk transactions
  holdPeriodDays: number;          // Days to hold reserve (default 90)
  releaseAfterDays: number;        // Days before auto-release (default 180)
}

export interface ReserveCalculation {
  transactionAmountCents: number;
  reserveAmountCents: number;
  reserveRate: number;
  riskLevel: 'low' | 'medium' | 'high';
  holdUntil: Date;
  releaseAfter: Date;
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
    highRiskRate: 0.05,         // 5%
    holdPeriodDays: 90,
    releaseAfterDays: 180,
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
    // Get transaction details
    const txQuery = `
      SELECT
        pt.amount_cents,
        pt.payment_method,
        pt.created_at,
        u.chargeback_count,
        v.chargeback_rate,
        COUNT(DISTINCT pch.chargeback_id) as historical_chargebacks
      FROM payment_transactions pt
      LEFT JOIN users u ON pt.user_id = u.user_id
      LEFT JOIN venues v ON pt.venue_id = v.venue_id
      LEFT JOIN payment_chargebacks pch ON pt.user_id = pch.user_id
        AND pch.created_at > NOW() - INTERVAL '1 year'
      WHERE pt.transaction_id = $1
        AND pt.tenant_id = $2
      GROUP BY pt.transaction_id, pt.amount_cents, pt.payment_method,
               pt.created_at, u.chargeback_count, v.chargeback_rate
    `;

    const result = await this.pool.query(txQuery, [transactionId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Transaction not found');
    }

    const tx = result.rows[0];
    const amountCents = parseInt(tx.amount_cents);

    // Assess risk level
    const riskLevel = this.assessRiskLevel(
      parseInt(tx.historical_chargebacks) || 0,
      parseFloat(tx.chargeback_rate) || 0,
      tx.payment_method
    );

    // Calculate reserve rate based on risk
    const reserveRate = riskLevel === 'high'
      ? this.policy.highRiskRate
      : this.policy.baseReserveRate;

    const reserveAmountCents = Math.round(amountCents * reserveRate);

    // Calculate dates
    const now = new Date();
    const holdUntil = new Date(now.getTime() + (this.policy.holdPeriodDays * 24 * 60 * 60 * 1000));
    const releaseAfter = new Date(now.getTime() + (this.policy.releaseAfterDays * 24 * 60 * 60 * 1000));

    logger.info({
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
      holdUntil,
      releaseAfter,
    };
  }

  /**
   * Assess transaction risk level
   */
  private assessRiskLevel(
    userChargebacks: number,
    venueChargebackRate: number,
    paymentMethod: string
  ): 'low' | 'medium' | 'high' {
    // High risk criteria
    if (userChargebacks >= 3 || venueChargebackRate >= 0.02) {
      return 'high';
    }

    // Medium risk criteria
    if (userChargebacks >= 1 || venueChargebackRate >= 0.01 || paymentMethod === 'card') {
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
  ): Promise<void> {
    const calculation = await this.calculateReserve(transactionId, tenantId);

    const query = `
      INSERT INTO payment_reserves (
        transaction_id,
        tenant_id,
        reserve_amount_cents,
        reserve_rate,
        risk_level,
        status,
        hold_until,
        release_after,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, 'held', $6, $7, NOW())
      ON CONFLICT (transaction_id) DO UPDATE SET
        reserve_amount_cents = $3,
        reserve_rate = $4,
        risk_level = $5,
        hold_until = $6,
        release_after = $7,
        updated_at = NOW()
    `;

    await this.pool.query(query, [
      transactionId,
      tenantId,
      calculation.reserveAmountCents,
      calculation.reserveRate,
      calculation.riskLevel,
      calculation.holdUntil,
      calculation.releaseAfter,
    ]);

    logger.info({
      transactionId,
      reserveAmountCents: calculation.reserveAmountCents,
    }, 'Reserve created');
  }

  /**
   * Process eligible reserve releases (automated job)
   */
  async processReserveReleases(): Promise<{ releasedCount: number; releasedAmountCents: number }> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Find reserves eligible for release
      const findQuery = `
        SELECT
          reserve_id,
          transaction_id,
          tenant_id,
          reserve_amount_cents
        FROM payment_reserves
        WHERE status = 'held'
          AND hold_until <= NOW()
          AND NOT EXISTS (
            SELECT 1 FROM payment_chargebacks pc
            WHERE pc.transaction_id = payment_reserves.transaction_id
              AND pc.status IN ('pending', 'under_review')
          )
        LIMIT 100
      `;

      const reserves = await client.query(findQuery);

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

      logger.info({
        count: reserves.rows.length,
        totalAmountCents: totalReleasedCents,
      }, 'Reserves released');

      return {
        releasedCount: reserves.rows.length,
        releasedAmountCents: totalReleasedCents,
      };

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({
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
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get reserve
      const reserveQuery = `
        SELECT reserve_id, reserve_amount_cents, status
        FROM payment_reserves
        WHERE transaction_id = $1
      `;

      const result = await client.query(reserveQuery, [transactionId]);

      if (result.rows.length === 0) {
        logger.warn({ transactionId }, 'No reserve found for chargeback');
        await client.query('COMMIT');
        return;
      }

      const reserve = result.rows[0];
      const reserveAmountCents = parseInt(reserve.reserve_amount_cents);

      // Use reserve to cover chargeback
      const coveredAmountCents = Math.min(chargebackAmountCents, reserveAmountCents);
      const remainingChargebackCents = chargebackAmountCents - coveredAmountCents;

      await client.query(
        `UPDATE payment_reserves
         SET status = 'used_for_chargeback',
             used_amount_cents = $1,
             used_at = NOW(),
             updated_at = NOW()
         WHERE reserve_id = $2`,
        [coveredAmountCents, reserve.reserve_id]
      );

      logger.info({
        transactionId,
        chargebackAmountCents,
        coveredAmountCents,
        remainingChargebackCents,
      }, 'Reserve used for chargeback');

      await client.query('COMMIT');

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
        SUM(CASE WHEN status = 'held' THEN reserve_amount_cents ELSE 0 END) as total_reserved,
        SUM(CASE WHEN status = 'released' THEN reserve_amount_cents ELSE 0 END) as total_released,
        SUM(CASE WHEN status = 'held' AND hold_until <= NOW() THEN reserve_amount_cents ELSE 0 END) as pending_release,
        SUM(CASE WHEN status = 'used_for_chargeback' THEN used_amount_cents ELSE 0 END) as chargebacks
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
        pr.hold_until,
        pr.release_after,
        pt.amount_cents as transaction_amount,
        pt.created_at as transaction_date
      FROM payment_reserves pr
      JOIN payment_transactions pt ON pr.transaction_id = pt.transaction_id
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
      transactionAmountCents: parseInt(row.transaction_amount),
      status: row.status,
      holdUntil: row.hold_until,
      releaseAfter: row.release_after,
      transactionDate: row.transaction_date,
    }));
  }

  /**
   * Update reserve policy
   */
  updatePolicy(policy: Partial<ReservePolicy>): void {
    this.policy = { ...this.policy, ...policy };
    logger.info({ policy: this.policy }, 'Reserve policy updated');
  }
}

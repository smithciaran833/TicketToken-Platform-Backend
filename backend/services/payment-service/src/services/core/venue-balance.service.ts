import { VenueBalanceModel } from '../../models';
import { VenueBalance } from '../../types';
import { chargebackReserves, payoutThresholds } from '../../config/fees';
import { logger } from '../../utils/logger';
import { query } from '../../config/database';

/**
 * SECURITY: Explicit field list for payout history queries.
 * Excludes: stripe_transfer_id, destination_account, metadata
 */
const SAFE_PAYOUT_HISTORY_FIELDS = 'id, tenant_id, venue_id, order_id, amount, currency, status, recipient_type, description, created_at, updated_at';

const log = logger.child({ component: 'VenueBalanceService' });

export class VenueBalanceService {
  async getBalance(venueId: string, tenantId?: string): Promise<VenueBalance> {
    return VenueBalanceModel.getBalance(venueId, tenantId);
  }

  async calculatePayoutAmount(venueId: string, tenantId: string): Promise<{
    available: number;
    reserved: number;
    payable: number;
  }> {
    const balance = await this.getBalance(venueId, tenantId);

    // Calculate required reserve based on venue risk
    const riskLevel = await this.getVenueRiskLevel(venueId, tenantId);
    const reservePercentage = chargebackReserves[riskLevel];
    const requiredReserve = balance.available * (reservePercentage / 100);

    // Ensure minimum reserve
    const currentReserve = balance.reserved;
    const additionalReserve = Math.max(0, requiredReserve - currentReserve);

    // Calculate payable amount
    const payable = Math.max(
      0,
      balance.available - additionalReserve - payoutThresholds.minimum
    );

    return {
      available: balance.available,
      reserved: requiredReserve,
      payable: payable >= payoutThresholds.minimum ? payable : 0
    };
  }

  async getVenueRiskLevel(venueId: string, tenantId: string): Promise<'low' | 'medium' | 'high'> {
    try {
      // Get venue's transaction stats for the last 90 days
      const stats = await query(
        `SELECT
           COUNT(*) as total_transactions,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
           SUM(CASE WHEN status = 'refunded' OR status = 'partially_refunded' THEN 1 ELSE 0 END) as refunded_count
         FROM payment_transactions
         WHERE venue_id = $1 AND tenant_id = $2
         AND created_at > NOW() - INTERVAL '90 days'`,
        [venueId, tenantId]
      );

      const row = stats.rows[0];
      const totalTransactions = parseInt(row.total_transactions) || 0;
      const failedCount = parseInt(row.failed_count) || 0;
      const refundedCount = parseInt(row.refunded_count) || 0;

      // New venue with no history - treat as medium risk
      if (totalTransactions === 0) {
        return 'medium';
      }

      // Calculate risk metrics
      const failureRate = failedCount / totalTransactions;
      const refundRate = refundedCount / totalTransactions;

      // Check for disputes via payment_disputes table
      const disputeStats = await query(
        `SELECT COUNT(*) as dispute_count
         FROM payment_disputes pd
         JOIN payment_transactions pt ON pd.payment_id = pt.id
         WHERE pt.venue_id = $1 AND pt.tenant_id = $2
         AND pd.created_at > NOW() - INTERVAL '90 days'`,
        [venueId, tenantId]
      );
      const disputeCount = parseInt(disputeStats.rows[0].dispute_count) || 0;
      const disputeRate = totalTransactions > 0 ? disputeCount / totalTransactions : 0;

      // Risk calculation thresholds
      // HIGH: More than 5% disputes OR 20% failures OR 30% refunds
      if (disputeRate > 0.05 || failureRate > 0.20 || refundRate > 0.30) {
        log.warn({ venueId, disputeRate, failureRate, refundRate }, 'Venue flagged as high risk');
        return 'high';
      }

      // MEDIUM: 2-5% disputes OR 10-20% failures OR 15-30% refunds
      if (disputeRate > 0.02 || failureRate > 0.10 || refundRate > 0.15) {
        return 'medium';
      }

      // LOW: Good track record
      return 'low';

    } catch (error) {
      log.error({ error, venueId }, 'Error calculating venue risk level, defaulting to medium');
      return 'medium';
    }
  }

  async processPayout(venueId: string, tenantId: string, amount: number): Promise<void> {
    const { payable } = await this.calculatePayoutAmount(venueId, tenantId);

    if (amount > payable) {
      throw new Error('Insufficient funds for payout');
    }

    if (amount > payoutThresholds.maximumDaily) {
      throw new Error('Exceeds daily payout limit');
    }

    // Record the payout
    await VenueBalanceModel.recordPayout(venueId, tenantId, amount);

    log.info({ amount, venueId, tenantId }, 'Processing payout');
  }

  /**
   * Get payout history for a venue.
   * Returns list of transfers with safe fields only.
   */
  async getPayoutHistory(
    venueId: string,
    tenantId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{
    payouts: any[];
    pagination: { limit: number; offset: number; total: number };
  }> {
    // SECURITY: Use explicit field list - exclude stripe_transfer_id, destination_account
    const result = await query(
      `SELECT ${SAFE_PAYOUT_HISTORY_FIELDS}
       FROM stripe_transfers
       WHERE venue_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [venueId, tenantId, limit, offset]
    );

    // Get total count for pagination
    const countResult = await query(
      `SELECT COUNT(*) as total FROM stripe_transfers WHERE venue_id = $1 AND tenant_id = $2`,
      [venueId, tenantId]
    );

    return {
      payouts: result.rows.map(row => ({
        id: row.id,
        orderId: row.order_id,
        amount: parseInt(row.amount),
        currency: row.currency,
        status: row.status,
        recipientType: row.recipient_type,
        description: row.description,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      pagination: {
        limit,
        offset,
        total: parseInt(countResult.rows[0].total),
      },
    };
  }

  /**
   * Initialize balance for a new venue
   */
  async initializeVenueBalance(venueId: string, tenantId: string): Promise<VenueBalance> {
    return VenueBalanceModel.createInitialBalance(venueId, tenantId);
  }

  /**
   * Add funds to venue balance (e.g., from a completed transaction)
   */
  async addFunds(
    venueId: string,
    tenantId: string,
    amount: number,
    type: 'available' | 'pending' = 'pending'
  ): Promise<VenueBalance> {
    return VenueBalanceModel.updateBalance(venueId, tenantId, amount, type);
  }

  /**
   * Move funds from pending to available (e.g., after clearing period)
   */
  async clearPendingFunds(venueId: string, tenantId: string, amount: number): Promise<VenueBalance> {
    await VenueBalanceModel.updateBalance(venueId, tenantId, -amount, 'pending');
    return VenueBalanceModel.updateBalance(venueId, tenantId, amount, 'available');
  }

  /**
   * Hold funds for a dispute
   */
  async holdForDispute(venueId: string, tenantId: string, amount: number): Promise<VenueBalance> {
    return VenueBalanceModel.holdForDispute(venueId, tenantId, amount);
  }

  /**
   * Release dispute hold
   */
  async releaseDisputeHold(venueId: string, tenantId: string, amount: number): Promise<VenueBalance> {
    return VenueBalanceModel.releaseDisputeHold(venueId, tenantId, amount);
  }
}

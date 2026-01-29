import { query, getClient } from '../config/database';
import { VenueBalance } from '../types';

/**
 * VenueBalanceModel
 * 
 * Database schema has:
 * - UNIQUE (venue_id, tenant_id, balance_type, currency)
 * - Columns: available_balance, pending_balance, held_for_disputes, lost_to_disputes, reversed_amount
 * - tenant_id is NOT NULL
 * 
 * This model maps the DB columns to the VenueBalance interface:
 * - available_balance -> available
 * - pending_balance -> pending
 * - held_for_disputes -> reserved (closest match)
 */

const VENUE_BALANCE_FIELDS = `
  id, venue_id, tenant_id, currency,
  available_balance, pending_balance, held_for_disputes,
  lost_to_disputes, reversed_amount, last_payout_at,
  created_at, updated_at
`;

export class VenueBalanceModel {
  /**
   * Get balance for a venue.
   * Returns aggregated balance across all balance_type records.
   */
  static async getBalance(venueId: string, tenantId?: string): Promise<VenueBalance> {
    const text = `
      SELECT
        venue_id,
        COALESCE(SUM(available_balance), 0) as available,
        COALESCE(SUM(pending_balance), 0) as pending,
        COALESCE(SUM(held_for_disputes), 0) as reserved,
        currency,
        MAX(last_payout_at) as last_payout
      FROM venue_balances
      WHERE venue_id = $1
      ${tenantId ? 'AND tenant_id = $2' : ''}
      GROUP BY venue_id, currency
    `;

    const values = tenantId ? [venueId, tenantId] : [venueId];
    const result = await query(text, values);

    if (result.rows.length === 0) {
      return {
        available: 0,
        pending: 0,
        reserved: 0,
        currency: 'USD',
      };
    }

    const row = result.rows[0];
    return {
      available: parseInt(row.available, 10),
      pending: parseInt(row.pending, 10),
      reserved: parseInt(row.reserved, 10),
      currency: row.currency || 'USD',
      lastPayout: row.last_payout || undefined,
    };
  }

  /**
   * Update balance for a venue.
   * Uses upsert with the correct unique constraint: (venue_id, tenant_id, balance_type, currency)
   */
  static async updateBalance(
    venueId: string,
    tenantId: string,
    amount: number,
    type: 'available' | 'pending' | 'reserved',
    currency: string = 'USD'
  ): Promise<VenueBalance> {
    const { client, release } = await getClient();

    try {
      await client.query('BEGIN');

      // Map type to correct column
      const columnMap: Record<string, string> = {
        available: 'available_balance',
        pending: 'pending_balance',
        reserved: 'held_for_disputes',
      };
      const column = columnMap[type];

      // We need a balance_type value for the unique constraint
      // Using 'primary' as the default balance type
      const balanceType = 'primary';

      const upsertText = `
        INSERT INTO venue_balances (venue_id, tenant_id, balance_type, currency, ${column})
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (venue_id, tenant_id, balance_type, currency)
        DO UPDATE SET
          ${column} = venue_balances.${column} + EXCLUDED.${column},
          updated_at = CURRENT_TIMESTAMP
        RETURNING ${VENUE_BALANCE_FIELDS}
      `;

      await client.query(upsertText, [venueId, tenantId, balanceType, currency, amount]);

      // Get the updated balances
      const balanceText = `
        SELECT
          venue_id,
          COALESCE(SUM(available_balance), 0) as available,
          COALESCE(SUM(pending_balance), 0) as pending,
          COALESCE(SUM(held_for_disputes), 0) as reserved,
          currency,
          MAX(last_payout_at) as last_payout
        FROM venue_balances
        WHERE venue_id = $1 AND tenant_id = $2
        GROUP BY venue_id, currency
      `;

      const balanceResult = await client.query(balanceText, [venueId, tenantId]);

      await client.query('COMMIT');

      if (balanceResult.rows.length === 0) {
        return {
          available: 0,
          pending: 0,
          reserved: 0,
          currency: 'USD',
        };
      }

      const row = balanceResult.rows[0];
      return {
        available: parseInt(row.available, 10),
        pending: parseInt(row.pending, 10),
        reserved: parseInt(row.reserved, 10),
        currency: row.currency || 'USD',
        lastPayout: row.last_payout || undefined,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Create initial zero balance record for a venue.
   */
  static async createInitialBalance(
    venueId: string,
    tenantId: string,
    currency: string = 'USD'
  ): Promise<VenueBalance> {
    const text = `
      INSERT INTO venue_balances (
        venue_id, tenant_id, balance_type, currency,
        available_balance, pending_balance, held_for_disputes,
        lost_to_disputes, reversed_amount
      )
      VALUES ($1, $2, 'primary', $3, 0, 0, 0, 0, 0)
      ON CONFLICT (venue_id, tenant_id, balance_type, currency) DO NOTHING
    `;

    await query(text, [venueId, tenantId, currency]);
    return this.getBalance(venueId, tenantId);
  }

  /**
   * Record a payout and update last_payout_at timestamp.
   */
  static async recordPayout(
    venueId: string,
    tenantId: string,
    amount: number,
    currency: string = 'USD'
  ): Promise<VenueBalance> {
    const { client, release } = await getClient();

    try {
      await client.query('BEGIN');

      // Deduct from available balance and update last_payout_at
      const updateText = `
        UPDATE venue_balances
        SET 
          available_balance = available_balance - $4,
          last_payout_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE venue_id = $1 AND tenant_id = $2 AND currency = $3
      `;

      await client.query(updateText, [venueId, tenantId, currency, amount]);

      await client.query('COMMIT');

      return this.getBalance(venueId, tenantId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Hold funds for a dispute.
   */
  static async holdForDispute(
    venueId: string,
    tenantId: string,
    amount: number,
    currency: string = 'USD'
  ): Promise<VenueBalance> {
    const { client, release } = await getClient();

    try {
      await client.query('BEGIN');

      // Move from available to held_for_disputes
      const updateText = `
        UPDATE venue_balances
        SET 
          available_balance = available_balance - $4,
          held_for_disputes = held_for_disputes + $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE venue_id = $1 AND tenant_id = $2 AND currency = $3
      `;

      await client.query(updateText, [venueId, tenantId, currency, amount]);

      await client.query('COMMIT');

      return this.getBalance(venueId, tenantId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Release dispute hold back to available.
   */
  static async releaseDisputeHold(
    venueId: string,
    tenantId: string,
    amount: number,
    currency: string = 'USD'
  ): Promise<VenueBalance> {
    const { client, release } = await getClient();

    try {
      await client.query('BEGIN');

      const updateText = `
        UPDATE venue_balances
        SET 
          available_balance = available_balance + $4,
          held_for_disputes = held_for_disputes - $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE venue_id = $1 AND tenant_id = $2 AND currency = $3
      `;

      await client.query(updateText, [venueId, tenantId, currency, amount]);

      await client.query('COMMIT');

      return this.getBalance(venueId, tenantId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Record a lost dispute (funds permanently lost).
   */
  static async recordDisputeLoss(
    venueId: string,
    tenantId: string,
    amount: number,
    currency: string = 'USD'
  ): Promise<VenueBalance> {
    const { client, release } = await getClient();

    try {
      await client.query('BEGIN');

      const updateText = `
        UPDATE venue_balances
        SET 
          held_for_disputes = held_for_disputes - $4,
          lost_to_disputes = lost_to_disputes + $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE venue_id = $1 AND tenant_id = $2 AND currency = $3
      `;

      await client.query(updateText, [venueId, tenantId, currency, amount]);

      await client.query('COMMIT');

      return this.getBalance(venueId, tenantId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }
}

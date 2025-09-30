import { query, getClient } from '../config/database';
import { VenueBalance } from '../types';

export class VenueBalanceModel {
  static async getBalance(venueId: string): Promise<VenueBalance> {
    const text = `
      SELECT 
        venue_id,
        COALESCE(SUM(CASE WHEN balance_type = 'available' THEN amount ELSE 0 END), 0) as available,
        COALESCE(SUM(CASE WHEN balance_type = 'pending' THEN amount ELSE 0 END), 0) as pending,
        COALESCE(SUM(CASE WHEN balance_type = 'reserved' THEN amount ELSE 0 END), 0) as reserved,
        'USD' as currency
      FROM venue_balances 
      WHERE venue_id = $1
      GROUP BY venue_id
    `;

    const result = await query(text, [venueId]);

    if (result.rows.length === 0) {
      // Return zero balances if no records exist
      return {
        available: 0,
        pending: 0,
        reserved: 0,
        currency: 'USD'
      };
    }

    return result.rows[0];
  }

  static async updateBalance(
    venueId: string,
    amount: number,
    type: 'available' | 'pending' | 'reserved'
  ): Promise<VenueBalance> {
    const { client, release } = await getClient();

    try {
      await client.query('BEGIN');

      // Insert or update the balance for this type
      const upsertText = `
        INSERT INTO venue_balances (venue_id, amount, balance_type)
        VALUES ($1, $2, $3)
        ON CONFLICT (venue_id, balance_type) 
        DO UPDATE SET 
          amount = venue_balances.amount + $2,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      await client.query(upsertText, [venueId, amount, type]);

      // Get the updated balances
      const balances = await this.getBalance(venueId);

      await client.query('COMMIT');
      return balances;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }

  static async createInitialBalance(venueId: string): Promise<VenueBalance> {
    // Create initial zero balances for all types
    const types = ['available', 'pending', 'reserved'];
    
    for (const type of types) {
      await query(
        `INSERT INTO venue_balances (venue_id, amount, balance_type)
         VALUES ($1, 0, $2)
         ON CONFLICT (venue_id, balance_type) DO NOTHING`,
        [venueId, type]
      );
    }

    return this.getBalance(venueId);
  }
}

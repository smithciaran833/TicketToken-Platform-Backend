/**
 * Venue Balance Model Integration Tests
 * Tests actual database operations
 */

import { VenueBalanceModel } from '../../../src/models/venue-balance.model';
import { query } from '../../../src/config/database';

// Existing test venue from database
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('VenueBalanceModel', () => {
  beforeEach(async () => {
    // Clean up any existing test balances
    await query('DELETE FROM venue_balances WHERE venue_id = $1', [TEST_VENUE_ID]);
  });

  afterAll(async () => {
    // Final cleanup
    await query('DELETE FROM venue_balances WHERE venue_id = $1', [TEST_VENUE_ID]);
  });

  describe('getBalance()', () => {
    it('should return zero balances when no records exist', async () => {
      const balance = await VenueBalanceModel.getBalance(TEST_VENUE_ID);

      expect(balance.available).toBe(0);
      expect(balance.pending).toBe(0);
      expect(balance.reserved).toBe(0);
      expect(balance.currency).toBe('USD');
    });

    it('should return correct balances when records exist', async () => {
      // Insert test balances
      await query(
        'INSERT INTO venue_balances (venue_id, amount, balance_type) VALUES ($1, $2, $3)',
        [TEST_VENUE_ID, 10000, 'available']
      );
      await query(
        'INSERT INTO venue_balances (venue_id, amount, balance_type) VALUES ($1, $2, $3)',
        [TEST_VENUE_ID, 5000, 'pending']
      );
      await query(
        'INSERT INTO venue_balances (venue_id, amount, balance_type) VALUES ($1, $2, $3)',
        [TEST_VENUE_ID, 2000, 'reserved']
      );

      const balance = await VenueBalanceModel.getBalance(TEST_VENUE_ID);

      // DB returns numeric as string, model returns raw row
      expect(Number(balance.available)).toBe(10000);
      expect(Number(balance.pending)).toBe(5000);
      expect(Number(balance.reserved)).toBe(2000);
    });

    it('should return partial balances when only some types exist', async () => {
      await query(
        'INSERT INTO venue_balances (venue_id, amount, balance_type) VALUES ($1, $2, $3)',
        [TEST_VENUE_ID, 7500, 'available']
      );

      const balance = await VenueBalanceModel.getBalance(TEST_VENUE_ID);

      expect(Number(balance.available)).toBe(7500);
      expect(Number(balance.pending)).toBe(0);
      expect(Number(balance.reserved)).toBe(0);
    });
  });

  describe('updateBalance()', () => {
    it('should create new balance record if none exists', async () => {
      const balance = await VenueBalanceModel.updateBalance(TEST_VENUE_ID, 5000, 'available');

      expect(Number(balance.available)).toBe(5000);
    });

    it('should add to existing balance', async () => {
      // First update
      await VenueBalanceModel.updateBalance(TEST_VENUE_ID, 3000, 'available');
      
      // Second update should add
      const balance = await VenueBalanceModel.updateBalance(TEST_VENUE_ID, 2000, 'available');

      expect(Number(balance.available)).toBe(5000);
    });

    it('should update pending balance', async () => {
      const balance = await VenueBalanceModel.updateBalance(TEST_VENUE_ID, 4000, 'pending');

      expect(Number(balance.pending)).toBe(4000);
    });

    it('should update reserved balance', async () => {
      const balance = await VenueBalanceModel.updateBalance(TEST_VENUE_ID, 1500, 'reserved');

      expect(Number(balance.reserved)).toBe(1500);
    });

    it('should handle negative amounts (deductions)', async () => {
      await VenueBalanceModel.updateBalance(TEST_VENUE_ID, 10000, 'available');
      const balance = await VenueBalanceModel.updateBalance(TEST_VENUE_ID, -3000, 'available');

      expect(Number(balance.available)).toBe(7000);
    });

    it('should update multiple balance types independently', async () => {
      await VenueBalanceModel.updateBalance(TEST_VENUE_ID, 10000, 'available');
      await VenueBalanceModel.updateBalance(TEST_VENUE_ID, 5000, 'pending');
      const balance = await VenueBalanceModel.updateBalance(TEST_VENUE_ID, 2000, 'reserved');

      expect(Number(balance.available)).toBe(10000);
      expect(Number(balance.pending)).toBe(5000);
      expect(Number(balance.reserved)).toBe(2000);
    });

    it('should return all balances after update', async () => {
      await VenueBalanceModel.updateBalance(TEST_VENUE_ID, 8000, 'available');
      const balance = await VenueBalanceModel.updateBalance(TEST_VENUE_ID, 3000, 'pending');

      expect(balance.available).toBeDefined();
      expect(balance.pending).toBeDefined();
      expect(balance.reserved).toBeDefined();
      expect(balance.currency).toBe('USD');
    });
  });

  describe('createInitialBalance()', () => {
    it('should create zero balances for all types', async () => {
      const balance = await VenueBalanceModel.createInitialBalance(TEST_VENUE_ID);

      expect(Number(balance.available)).toBe(0);
      expect(Number(balance.pending)).toBe(0);
      expect(Number(balance.reserved)).toBe(0);
      expect(balance.currency).toBe('USD');
    });

    it('should not overwrite existing balances', async () => {
      // Create initial balance with a value
      await VenueBalanceModel.updateBalance(TEST_VENUE_ID, 5000, 'available');

      // Call createInitialBalance - should not overwrite
      const balance = await VenueBalanceModel.createInitialBalance(TEST_VENUE_ID);

      expect(Number(balance.available)).toBe(5000);
    });

    it('should be idempotent', async () => {
      await VenueBalanceModel.createInitialBalance(TEST_VENUE_ID);
      const balance = await VenueBalanceModel.createInitialBalance(TEST_VENUE_ID);

      expect(Number(balance.available)).toBe(0);
      expect(Number(balance.pending)).toBe(0);
      expect(Number(balance.reserved)).toBe(0);
    });
  });
});

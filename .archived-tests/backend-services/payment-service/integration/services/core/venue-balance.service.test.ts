/**
 * Venue Balance Service Integration Tests
 */

import { VenueBalanceService } from '../../../../src/services/core/venue-balance.service';
import { query } from '../../../../src/config/database';
import { v4 as uuidv4 } from 'uuid';

describe('VenueBalanceService Integration Tests', () => {
  let venueBalanceService: VenueBalanceService;
  let testVenueId: string;
  let testSlug: string;

  beforeAll(async () => {
    venueBalanceService = new VenueBalanceService();
  });

  beforeEach(async () => {
    testVenueId = uuidv4();
    testSlug = `test-venue-${testVenueId.slice(0, 8)}`;
    
    // Create test venue first (required by foreign key)
    await query(
      `INSERT INTO venues (id, name, slug, created_at)
       VALUES ($1, 'Test Venue', $2, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [testVenueId, testSlug]
    );
  });

  afterEach(async () => {
    // Clean up test data in correct order (child first)
    await query(`DELETE FROM venue_balances WHERE venue_id = $1`, [testVenueId]);
    await query(`DELETE FROM venues WHERE id = $1`, [testVenueId]);
  });

  describe('getBalance', () => {
    it('should return zero balance for new venue', async () => {
      const balance = await venueBalanceService.getBalance(testVenueId);

      expect(balance.available).toBe(0);
      expect(balance.pending).toBe(0);
      expect(balance.reserved).toBe(0);
    });

    it('should return existing balance', async () => {
      // Create balance records using proper schema
      await query(
        `INSERT INTO venue_balances (venue_id, amount, balance_type) VALUES ($1, 100.00, 'available')`,
        [testVenueId]
      );
      await query(
        `INSERT INTO venue_balances (venue_id, amount, balance_type) VALUES ($1, 20.00, 'pending')`,
        [testVenueId]
      );
      await query(
        `INSERT INTO venue_balances (venue_id, amount, balance_type) VALUES ($1, 5.00, 'reserved')`,
        [testVenueId]
      );

      const balance = await venueBalanceService.getBalance(testVenueId);

      expect(Number(balance.available)).toBe(100);
      expect(Number(balance.pending)).toBe(20);
      expect(Number(balance.reserved)).toBe(5);
    });

    it('should return correct currency', async () => {
      await query(
        `INSERT INTO venue_balances (venue_id, amount, balance_type) VALUES ($1, 50.00, 'available')`,
        [testVenueId]
      );

      const balance = await venueBalanceService.getBalance(testVenueId);

      expect(balance.currency).toBe('USD');
    });
  });

  describe('calculatePayoutAmount', () => {
    it('should return zero payable for new venue', async () => {
      const result = await venueBalanceService.calculatePayoutAmount(testVenueId);

      expect(result.available).toBe(0);
      expect(result.payable).toBe(0);
    });

    it('should calculate payable amount with reserve', async () => {
      // Create balance with $1000 available (1000.00 in decimal)
      await query(
        `INSERT INTO venue_balances (venue_id, amount, balance_type) VALUES ($1, 1000.00, 'available')`,
        [testVenueId]
      );

      const result = await venueBalanceService.calculatePayoutAmount(testVenueId);

      expect(Number(result.available)).toBe(1000);
      expect(result.reserved).toBeGreaterThan(0);
    });

    it('should return zero payable if below minimum threshold', async () => {
      // Create small balance (1.00)
      await query(
        `INSERT INTO venue_balances (venue_id, amount, balance_type) VALUES ($1, 1.00, 'available')`,
        [testVenueId]
      );

      const result = await venueBalanceService.calculatePayoutAmount(testVenueId);

      // Small balance should result in zero payable
      expect(result.payable).toBe(0);
    });

    it('should return all three components', async () => {
      await query(
        `INSERT INTO venue_balances (venue_id, amount, balance_type) VALUES ($1, 500.00, 'available')`,
        [testVenueId]
      );

      const result = await venueBalanceService.calculatePayoutAmount(testVenueId);

      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('reserved');
      expect(result).toHaveProperty('payable');
    });
  });

  describe('processPayout', () => {
    it('should reject payout exceeding available amount', async () => {
      // Create balance with $100 available
      await query(
        `INSERT INTO venue_balances (venue_id, amount, balance_type) VALUES ($1, 100.00, 'available')`,
        [testVenueId]
      );

      await expect(
        venueBalanceService.processPayout(testVenueId, 100000) // Way more than available
      ).rejects.toThrow('Insufficient funds');
    });

    it('should reject payout exceeding daily limit', async () => {
      // Create balance with very large available amount
      await query(
        `INSERT INTO venue_balances (venue_id, amount, balance_type) VALUES ($1, 10000000.00, 'available')`,
        [testVenueId]
      );

      await expect(
        venueBalanceService.processPayout(testVenueId, 9999999900) // $99,999,999
      ).rejects.toThrow('Exceeds daily payout limit');
    });
  });
});

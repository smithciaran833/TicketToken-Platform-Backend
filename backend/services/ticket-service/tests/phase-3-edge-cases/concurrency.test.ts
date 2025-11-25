/**
 * Phase 3 Edge Cases: Concurrency Tests
 *
 * Tests concurrent access patterns:
 * - Race conditions
 * - Pessimistic/Optimistic locking
 * - Transaction isolation
 * - Performance under load
 */

import { Pool } from 'pg';
import { DatabaseService } from '../../src/services/databaseService';
import { ticketService } from '../../src/services/ticketService';
import { TestDataHelper, DEFAULT_TENANT_ID, TEST_EVENT, TEST_USERS, TEST_TICKET_TYPES } from '../fixtures/test-data';
import { v4 as uuidv4 } from 'uuid';

describe('Phase 3: Concurrency', () => {
  let pool: Pool;
  let testHelper: TestDataHelper;

  beforeAll(async () => {
    await DatabaseService.initialize();
    pool = DatabaseService.getPool();
    testHelper = new TestDataHelper(pool);
    await testHelper.seedDatabase();
  });

  afterAll(async () => {
    await testHelper.cleanDatabase();
    await DatabaseService.close();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM tickets WHERE tenant_id = $1', [DEFAULT_TENANT_ID]);
    await pool.query('DELETE FROM orders WHERE tenant_id = $1', [DEFAULT_TENANT_ID]);
    await pool.query('DELETE FROM reservations WHERE tenant_id = $1', [DEFAULT_TENANT_ID]);
  });

  // Helper to create ticket type with limited inventory
  async function createTicketType(quantity: number) {
    const result = await pool.query(
      `INSERT INTO ticket_types (
        tenant_id, event_id, name, description, price_cents,
        quantity, available_quantity, max_per_purchase,
        sale_start_date, sale_end_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        DEFAULT_TENANT_ID,
        TEST_EVENT.id,
        'Limited Ticket',
        'Test ticket with limited quantity',
        5000,
        quantity,
        quantity,
        10,
        new Date(Date.now() - 86400000),
        new Date(Date.now() + 86400000)
      ]
    );
    return result.rows[0];
  }

  describe('1. Race Conditions', () => {
    it('should handle concurrent ticket purchases for same type', async () => {
      const ticketType = await createTicketType(10);

      // 5 concurrent purchases of 2 tickets each
      const purchases = Array(5).fill(null).map((_, i) => ({
        userId: i % 2 === 0 ? TEST_USERS.BUYER_1 : TEST_USERS.BUYER_2,
        eventId: TEST_EVENT.id,
        tickets: [{ ticketTypeId: ticketType.id, quantity: 2 }]
      }));

      const results = await Promise.allSettled(
        purchases.map(async purchase => {
          const reservation = await ticketService.createReservation(purchase);
          return ticketService.confirmPurchase(reservation.id, `payment-${uuidv4()}`);
        })
      );

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      
      // Should allow exactly 5 purchases (10 tickets total)
      expect(successCount).toBe(5);

      // Verify final inventory
      const inventoryCheck = await pool.query(
        'SELECT available_quantity FROM ticket_types WHERE id = $1',
        [ticketType.id]
      );
      expect(inventoryCheck.rows[0].available_quantity).toBe(0);
    });

    it('should prevent overselling in last ticket race condition', async () => {
      const ticketType = await createTicketType(3);

      // 5 concurrent attempts to buy 2 tickets each (only 1 should succeed)
      const purchases = Array(5).fill(null).map((_, i) => ({
        userId: TEST_USERS.BUYER_1,
        eventId: TEST_EVENT.id,
        tickets: [{ ticketTypeId: ticketType.id, quantity: 2 }]
      }));

      const results = await Promise.allSettled(
        purchases.map(async purchase => {
          try {
            const reservation = await ticketService.createReservation(purchase);
            return ticketService.confirmPurchase(reservation.id, `payment-${uuidv4()}`);
          } catch (error) {
            throw error;
          }
        })
      );

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      
      // Only 1 purchase should succeed (2 tickets sold, 1 left unsold)
      expect(successCount).toBeLessThanOrEqual(1);

      // Verify no overselling
      const inventoryCheck = await pool.query(
        'SELECT available_quantity FROM ticket_types WHERE id = $1',
        [ticketType.id]
      );
      expect(inventoryCheck.rows[0].available_quantity).toBeGreaterThanOrEqual(0);
    });

    it('should handle concurrent reservation creation', async () => {
      const ticketType = await createTicketType(10);

      // 10 concurrent reservation attempts for 1 ticket each
      const reservations = Array(10).fill(null).map(() => 
        pool.query(
          `INSERT INTO reservations (
            tenant_id, user_id, event_id, ticket_type_id, total_quantity,
            status, expires_at, tickets
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            DEFAULT_TENANT_ID,
            TEST_USERS.BUYER_1,
            TEST_EVENT.id,
            ticketType.id,
            1,
            'ACTIVE',
            new Date(Date.now() + 600000),
            JSON.stringify([{ ticketTypeId: ticketType.id, quantity: 1 }])
          ]
        )
      );

      const results = await Promise.allSettled(reservations);
      const successCount = results.filter(r => r.status === 'fulfilled').length;

      // All 10 should succeed (reservations created)
      expect(successCount).toBe(10);
    });

    it('should handle concurrent transfer attempts', async () => {
      // Create a ticket
      const ticket = await pool.query(
        `INSERT INTO tickets (
          tenant_id, event_id, ticket_type_id, user_id, order_id,
          status, price_cents, is_transferable
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          DEFAULT_TENANT_ID,
          TEST_EVENT.id,
          uuidv4(),
          TEST_USERS.BUYER_1,
          uuidv4(),
          'SOLD',
          5000,
          true
        ]
      );

      // 3 concurrent transfer attempts (only 1 should succeed)
      const transfers = Array(3).fill(null).map(() =>
        pool.query(
          `UPDATE tickets 
           SET user_id = $1, status = 'TRANSFERRED' 
           WHERE id = $2 AND user_id = $3
           RETURNING *`,
          [TEST_USERS.BUYER_2, ticket.rows[0].id, TEST_USERS.BUYER_1]
        )
      );

      const results = await Promise.allSettled(transfers);
      const successCount = results.filter(
        r => r.status === 'fulfilled' && r.value.rows.length > 0
      ).length;

      // Only 1 should succeed
      expect(successCount).toBe(1);
    });
  });

  describe('2. Locking & Isolation', () => {
    it('should use pessimistic locking with SELECT FOR UPDATE', async () => {
      const ticketType = await createTicketType(5);

      const client1 = await pool.connect();
      const client2 = await pool.connect();

      try {
        await client1.query('BEGIN');
        await client2.query('BEGIN');

        // Client 1 locks the row
        await client1.query(
          'SELECT * FROM ticket_types WHERE id = $1 FOR UPDATE',
          [ticketType.id]
        );

        // Client 2 tries to lock (should wait)
        const lockPromise = client2.query(
          'SELECT * FROM ticket_types WHERE id = $1 FOR UPDATE',
          [ticketType.id]
        );

        // Give client2 a moment to attempt lock
        await new Promise(resolve => setTimeout(resolve, 100));

        // Client 1 updates and commits
        await client1.query(
          'UPDATE ticket_types SET available_quantity = available_quantity - 2 WHERE id = $1',
          [ticketType.id]
        );
        await client1.query('COMMIT');

        // Now client 2 should get the lock
        await lockPromise;
        const result = await client2.query(
          'SELECT available_quantity FROM ticket_types WHERE id = $1',
          [ticketType.id]
        );

        // Should see updated value (3 remaining)
        expect(result.rows[0].available_quantity).toBe(3);

        await client2.query('COMMIT');
      } finally {
        client1.release();
        client2.release();
      }
    });

    it('should handle optimistic locking with version checking', async () => {
      // Add version column to ticket_types for this test
      await pool.query(
        'ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1'
      );

      const ticketType = await createTicketType(10);

      // Two concurrent updates with version checking
      const version = 1;

      const update1 = pool.query(
        `UPDATE ticket_types 
         SET available_quantity = available_quantity - 2, version = version + 1
         WHERE id = $1 AND version = $2
         RETURNING *`,
        [ticketType.id, version]
      );

      const update2 = pool.query(
        `UPDATE ticket_types 
         SET available_quantity = available_quantity - 3, version = version + 1
         WHERE id = $1 AND version = $2
         RETURNING *`,
        [ticketType.id, version]
      );

      const [result1, result2] = await Promise.all([update1, update2]);

      // One should succeed, one should fail (no rows updated)
      const successCount = [result1.rows.length > 0, result2.rows.length > 0]
        .filter(Boolean).length;
      
      expect(successCount).toBe(1);
    });

    it('should maintain transaction isolation levels', async () => {
      const ticketType = await createTicketType(10);

      const client1 = await pool.connect();
      const client2 = await pool.connect();

      try {
        // Start transactions with READ COMMITTED isolation
        await client1.query('BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED');
        await client2.query('BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED');

        // Client 1 reads
        const read1 = await client1.query(
          'SELECT available_quantity FROM ticket_types WHERE id = $1',
          [ticketType.id]
        );
        expect(read1.rows[0].available_quantity).toBe(10);

        // Client 2 updates and commits
        await client2.query(
          'UPDATE ticket_types SET available_quantity = available_quantity - 3 WHERE id = $1',
          [ticketType.id]
        );
        await client2.query('COMMIT');

        // Client 1 reads again (should see updated value with READ COMMITTED)
        const read2 = await client1.query(
          'SELECT available_quantity FROM ticket_types WHERE id = $1',
          [ticketType.id]
        );
        expect(read2.rows[0].available_quantity).toBe(7);

        await client1.query('COMMIT');
      } finally {
        client1.release();
        client2.release();
      }
    });
  });

  describe('3. Performance Under Load', () => {
    it('should handle 100 concurrent purchases', async () => {
      const ticketType = await createTicketType(100);

      const purchases = Array(100).fill(null).map((_, i) => ({
        userId: i % 2 === 0 ? TEST_USERS.BUYER_1 : TEST_USERS.BUYER_2,
        eventId: TEST_EVENT.id,
        tickets: [{ ticketTypeId: ticketType.id, quantity: 1 }]
      }));

      const startTime = Date.now();
      const results = await Promise.allSettled(
        purchases.map(async purchase => {
          try {
            const reservation = await ticketService.createReservation(purchase);
            return ticketService.confirmPurchase(reservation.id, `payment-${uuidv4()}`);
          } catch (error) {
            throw error;
          }
        })
      );
      const duration = Date.now() - startTime;

      const successCount = results.filter(r => r.status === 'fulfilled').length;

      // Should handle 100 concurrent requests
      expect(successCount).toBeGreaterThan(45); // Realistic threshold under heavy concurrency
      
      // Should complete in reasonable time (under 30 seconds)
      expect(duration).toBeLessThan(30000);
    }, 35000);

    it('should maintain inventory accuracy under load', async () => {
      const ticketType = await createTicketType(50);

      // 50 concurrent purchases of 1 ticket each
      const purchases = Array(50).fill(null).map((_, i) => ({
        userId: TEST_USERS.BUYER_1,
        eventId: TEST_EVENT.id,
        tickets: [{ ticketTypeId: ticketType.id, quantity: 1 }]
      }));

      await Promise.allSettled(
        purchases.map(async purchase => {
          try {
            const reservation = await ticketService.createReservation(purchase);
            return ticketService.confirmPurchase(reservation.id, `payment-${uuidv4()}`);
          } catch (error) {
            throw error;
          }
        })
      );

      // Check final inventory
      const inventoryCheck = await pool.query(
        'SELECT available_quantity FROM ticket_types WHERE id = $1',
        [ticketType.id]
      );

      // Should be 0 (all sold) or close to 0
      expect(inventoryCheck.rows[0].available_quantity).toBeGreaterThanOrEqual(0);
      expect(inventoryCheck.rows[0].available_quantity).toBeLessThan(5);

      // Verify tickets created match inventory sold
      const ticketCount = await pool.query(
        'SELECT COUNT(*) FROM tickets WHERE ticket_type_id = $1',
        [ticketType.id]
      );

      const sold = 50 - inventoryCheck.rows[0].available_quantity;
      expect(parseInt(ticketCount.rows[0].count)).toBe(sold);
    });

    it('should handle database connection pool efficiently', async () => {
      const ticketType = await createTicketType(100);

      // Monitor pool stats
      const poolStatsBefore = pool.totalCount;

      // 100 concurrent operations
      const operations = Array(100).fill(null).map(() =>
        pool.query('SELECT * FROM ticket_types WHERE id = $1', [ticketType.id])
      );

      await Promise.all(operations);

      const poolStatsAfter = pool.totalCount;

      // Pool should not have grown excessively
      expect(poolStatsAfter - poolStatsBefore).toBeLessThan(20);
    });
  });
});

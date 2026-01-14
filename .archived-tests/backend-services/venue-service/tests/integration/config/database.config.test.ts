/**
 * Database Configuration Integration Tests
 *
 * Tests database connection, pool behavior, and retry logic.
 */

import {
  setupTestApp,
  teardownTestApp,
  TestContext,
  db,
  pool
} from '../setup';

describe('Database Configuration Integration Tests', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestApp();
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  // ==========================================================================
  // Connection Tests
  // ==========================================================================
  describe('Database Connection', () => {
    it('should connect to the database successfully', async () => {
      const result = await db.raw('SELECT 1 as connected');
      expect(result.rows[0].connected).toBe(1);
    });

    it('should have correct database name', async () => {
      const result = await db.raw('SELECT current_database() as db_name');
      expect(result.rows[0].db_name).toBe('tickettoken_test');
    });

    it('should execute queries with knex query builder', async () => {
      const result = await db('tenants').select('id').limit(1);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle raw SQL queries', async () => {
      const result = await db.raw('SELECT NOW() as current_time');
      expect(result.rows[0].current_time).toBeInstanceOf(Date);
    });
  });

  // ==========================================================================
  // Pool Tests
  // ==========================================================================
  describe('Connection Pool', () => {
    it('should handle multiple concurrent queries', async () => {
      const queries = Array(10).fill(null).map((_, i) =>
        db.raw(`SELECT ${i} as num`)
      );

      const results = await Promise.all(queries);
      results.forEach((result, i) => {
        expect(result.rows[0].num).toBe(i);
      });
    });

    it('should reuse connections from pool', async () => {
      // Execute multiple sequential queries
      for (let i = 0; i < 5; i++) {
        await db.raw('SELECT 1');
      }
      // If pool is working, this should complete without errors
      expect(true).toBe(true);
    });
  });

  // ==========================================================================
  // Transaction Tests
  // ==========================================================================
  describe('Transactions', () => {
    it('should support transactions with commit', async () => {
      const trx = await db.transaction();
      try {
        await trx.raw('SELECT 1');
        await trx.commit();
        expect(true).toBe(true);
      } catch (error) {
        await trx.rollback();
        throw error;
      }
    });

    it('should support transactions with rollback', async () => {
      const trx = await db.transaction();
      try {
        await trx.raw('SELECT 1');
        await trx.rollback();
        expect(true).toBe(true);
      } catch (error) {
        await trx.rollback();
        throw error;
      }
    });
  });

  // ==========================================================================
  // pg Pool Tests (direct pool access)
  // ==========================================================================
  describe('PG Pool Direct Access', () => {
    it('should execute queries via pg pool', async () => {
      const result = await pool.query('SELECT 1 as value');
      expect(result.rows[0].value).toBe(1);
    });

    it('should handle parameterized queries', async () => {
      const result = await pool.query('SELECT $1::int as num', [42]);
      expect(result.rows[0].num).toBe(42);
    });
  });
});

/**
 * Database Config Integration Tests
 *
 * Tests the database configuration including:
 * - Pool connection and queries
 * - Knex db instance
 * - query() function
 * - getClient() function
 * - Concurrent query handling
 * - Transaction support
 */

import { pool, db } from '../setup';
import { query, getClient } from '../../../src/config/database';

describe('config/database', () => {
  // ==========================================================================
  // pool
  // ==========================================================================
  describe('pool', () => {
    it('should execute simple query', async () => {
      const result = await pool.query('SELECT 1 as value');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].value).toBe(1);
    });

    it('should execute parameterized query', async () => {
      const result = await pool.query('SELECT $1::int as value', [42]);
      expect(result.rows[0].value).toBe(42);
    });

    it('should execute string parameterized query', async () => {
      const result = await pool.query('SELECT $1::text as value', ['hello']);
      expect(result.rows[0].value).toBe('hello');
    });

    it('should query tenants table', async () => {
      const result = await pool.query('SELECT COUNT(*) as count FROM tenants');
      expect(result.rows).toHaveLength(1);
      expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(0);
    });

    it('should handle concurrent queries', async () => {
      const queries = Array(10).fill(null).map((_, i) =>
        pool.query('SELECT $1::int as value', [i])
      );

      const results = await Promise.all(queries);

      results.forEach((result, i) => {
        expect(result.rows[0].value).toBe(i);
      });
    });

    it('should handle null parameters', async () => {
      const result = await pool.query('SELECT $1::text as value', [null]);
      expect(result.rows[0].value).toBeNull();
    });

    it('should handle array parameters', async () => {
      const result = await pool.query('SELECT $1::int[] as value', [[1, 2, 3]]);
      expect(result.rows[0].value).toEqual([1, 2, 3]);
    });

    it('should handle JSON parameters', async () => {
      const jsonData = { foo: 'bar', num: 123 };
      const result = await pool.query('SELECT $1::jsonb as value', [JSON.stringify(jsonData)]);
      expect(result.rows[0].value).toEqual(jsonData);
    });

    it('should handle boolean parameters', async () => {
      const result = await pool.query('SELECT $1::boolean as value', [true]);
      expect(result.rows[0].value).toBe(true);
    });

    it('should handle date parameters', async () => {
      const date = new Date('2025-01-01');
      const result = await pool.query('SELECT $1::date as value', [date]);
      expect(new Date(result.rows[0].value).toISOString().slice(0, 10)).toBe('2025-01-01');
    });
  });

  // ==========================================================================
  // db (knex)
  // ==========================================================================
  describe('db (knex)', () => {
    it('should execute raw query', async () => {
      const result = await db.raw('SELECT 1 as value');
      expect(result.rows[0].value).toBe(1);
    });

    it('should query tables using knex builder', async () => {
      const result = await db('tenants').count('* as count').first();
      expect(parseInt(result?.count as string)).toBeGreaterThanOrEqual(0);
    });

    it('should support select with where', async () => {
      const result = await db('tenants').select('id', 'name').limit(1);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should support transactions', async () => {
      await db.transaction(async (trx) => {
        const result = await trx.raw('SELECT 1 as value');
        expect(result.rows[0].value).toBe(1);
      });
    });

    it('should rollback transaction on error', async () => {
      try {
        await db.transaction(async (trx) => {
          await trx.raw('SELECT 1');
          throw new Error('Intentional rollback');
        });
      } catch (error: any) {
        expect(error.message).toBe('Intentional rollback');
      }
    });

    it('should handle multiple queries in transaction', async () => {
      await db.transaction(async (trx) => {
        const r1 = await trx.raw('SELECT 1 as value');
        const r2 = await trx.raw('SELECT 2 as value');
        expect(r1.rows[0].value).toBe(1);
        expect(r2.rows[0].value).toBe(2);
      });
    });
  });

  // ==========================================================================
  // query function
  // ==========================================================================
  describe('query function', () => {
    it('should execute simple query', async () => {
      const result = await query('SELECT 1 as value');
      expect(result.rows[0].value).toBe(1);
    });

    it('should execute parameterized query', async () => {
      const result = await query('SELECT $1::text as value', ['test']);
      expect(result.rows[0].value).toBe('test');
    });

    it('should execute query with multiple parameters', async () => {
      const result = await query('SELECT $1::int + $2::int as value', [5, 3]);
      expect(result.rows[0].value).toBe(8);
    });

    it('should return rowCount', async () => {
      const result = await query('SELECT 1 as value');
      expect(result.rowCount).toBe(1);
    });

    it('should handle empty result', async () => {
      const result = await query('SELECT 1 as value WHERE false');
      expect(result.rows).toHaveLength(0);
      expect(result.rowCount).toBe(0);
    });
  });

  // ==========================================================================
  // getClient function
  // ==========================================================================
  describe('getClient function', () => {
    it('should get a client from pool', async () => {
      const client = await getClient();
      expect(client).toBeDefined();
      expect(typeof client.query).toBe('function');
      expect(typeof client.release).toBe('function');
      client.release();
    });

    it('should execute query with client', async () => {
      const client = await getClient();
      try {
        const result = await client.query('SELECT 1 as value');
        expect(result.rows[0].value).toBe(1);
      } finally {
        client.release();
      }
    });

    it('should execute parameterized query with client', async () => {
      const client = await getClient();
      try {
        const result = await client.query('SELECT $1::int as value', [99]);
        expect(result.rows[0].value).toBe(99);
      } finally {
        client.release();
      }
    });

    it('should handle BEGIN transaction', async () => {
      const client = await getClient();
      try {
        await client.query('BEGIN');
        await client.query('SELECT 1');
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    });

    it('should handle ROLLBACK transaction', async () => {
      const client = await getClient();
      try {
        await client.query('BEGIN');
        await client.query('SELECT 1');
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });

    it('should rollback on error and release', async () => {
      const client = await getClient();
      try {
        await client.query('BEGIN');
        await client.query('SELECT * FROM nonexistent_table_xyz');
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        expect(error).toBeDefined();
      } finally {
        client.release();
      }
    });

    it('should handle multiple clients concurrently', async () => {
      const clients = await Promise.all([
        getClient(),
        getClient(),
        getClient(),
      ]);

      try {
        const results = await Promise.all(
          clients.map((c, i) => c.query('SELECT $1::int as value', [i]))
        );

        results.forEach((result, i) => {
          expect(result.rows[0].value).toBe(i);
        });
      } finally {
        clients.forEach(c => c.release());
      }
    });
  });
});

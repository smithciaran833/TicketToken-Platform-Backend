/**
 * Database Configuration Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  TestContext,
  db,
  pool,
} from './setup';

describe('Database Configuration', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestApp();
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  // ==========================================================================
  // connectDatabase
  // ==========================================================================
  describe('connectDatabase', () => {
    it('should establish database connection', async () => {
      const result = await db.raw('SELECT 1 as value');
      expect(result.rows[0].value).toBe(1);
    });

    it('should have connection pooling configured', async () => {
      const poolObj = (db.client as any).pool;
      expect(poolObj).toBeDefined();
    });

    it('should parse NUMERIC types as numbers', async () => {
      const result = await db.raw('SELECT 123.45::NUMERIC as value');
      expect(typeof result.rows[0].value).toBe('number');
      expect(result.rows[0].value).toBe(123.45);
    });

    it('should handle large DECIMAL values', async () => {
      const result = await db.raw('SELECT 99999.99::DECIMAL(10,2) as price');
      expect(typeof result.rows[0].price).toBe('number');
      expect(result.rows[0].price).toBe(99999.99);
    });

    it('should handle negative NUMERIC values', async () => {
      const result = await db.raw('SELECT -50.25::NUMERIC as value');
      expect(result.rows[0].value).toBe(-50.25);
    });

    it('should handle zero NUMERIC values', async () => {
      const result = await db.raw('SELECT 0::NUMERIC as value');
      expect(result.rows[0].value).toBe(0);
    });

    it('should execute queries with parameters', async () => {
      const result = await db.raw('SELECT ? + ? as sum', [10, 20]);
      expect(result.rows[0].sum).toBe(30);
    });

    it('should support transactions', async () => {
      const trx = await db.transaction();
      try {
        await trx.raw('SELECT 1');
        await trx.commit();
      } catch (e) {
        await trx.rollback();
        throw e;
      }
    });
  });

  // ==========================================================================
  // createDatabaseConnection (legacy)
  // ==========================================================================
  describe('createDatabaseConnection', () => {
    it('should return the db instance', async () => {
      const { createDatabaseConnection, db: dbInstance } = await import('../../src/config/database');
      
      const connection = createDatabaseConnection();
      expect(connection).toBeDefined();
      expect(typeof connection.raw).toBe('function');
    });
  });
});

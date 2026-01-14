import { pool, db } from '../../../src/config/database';

/**
 * INTEGRATION TESTS FOR DATABASE CONFIGURATION
 * 
 * These tests verify real PostgreSQL connection:
 * - Pool configuration and connection parameters
 * - Knex instance setup
 * - Search path configuration
 * - Query execution capability
 */

// Safety check
beforeAll(() => {
  const dbName = process.env.DB_NAME || 'tickettoken_db';
  const isTestDb = dbName.includes('test') || process.env.NODE_ENV === 'test';
  
  if (!isTestDb) {
    throw new Error(
      `⚠️  REFUSING TO RUN INTEGRATION TESTS AGAINST NON-TEST DATABASE!\n` +
      `Current DB_NAME: ${dbName}\n` +
      `Please set DB_NAME to include 'test' or set NODE_ENV=test`
    );
  }
  
  console.log(`✓ Running database config integration tests against test environment`);
});

describe('Database Configuration Integration Tests', () => {
  afterAll(async () => {
    await pool.end();
    await db.destroy();
  });

  describe('pool - PostgreSQL Pool Instance', () => {
    it('should create pool with correct connection parameters', () => {
      expect(pool).toBeDefined();
      expect(pool.options.host).toBeDefined();
      expect(pool.options.database).toBeDefined();
      expect(pool.options.user).toBeDefined();
    });

    it('should use DB_HOST from environment', () => {
      const expectedHost = process.env.DB_HOST || 'localhost';
      expect(pool.options.host).toBe(expectedHost);
    });

    it('should use DB_PORT from environment (default 6432)', () => {
      const expectedPort = parseInt(process.env.DB_PORT || '6432');
      expect(pool.options.port).toBe(expectedPort);
    });

    it('should use DB_NAME from environment', () => {
      const expectedDb = process.env.DB_NAME || 'tickettoken_db';
      expect(pool.options.database).toBe(expectedDb);
    });

    it('should use DB_USER from environment', () => {
      const expectedUser = process.env.DB_USER || 'postgres';
      expect(pool.options.user).toBe(expectedUser);
    });

    it('should use DB_PASSWORD from environment', () => {
      const expectedPassword = process.env.DB_PASSWORD || 'postgres';
      expect(pool.options.password).toBe(expectedPassword);
    });

    it('should have max 5 connections', () => {
      expect(pool.options.max).toBe(5);
    });

    it('should have 30s idle timeout', () => {
      expect(pool.options.idleTimeoutMillis).toBe(30000);
    });

    it('should have 10s connection timeout', () => {
      expect(pool.options.connectionTimeoutMillis).toBe(10000);
    });

    it('should be able to connect and query', async () => {
      const result = await pool.query('SELECT NOW() as now');
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].now).toBeInstanceOf(Date);
    });

    it('should set search_path to public on connection', async () => {
      const client = await pool.connect();
      
      try {
        const result = await client.query('SHOW search_path');
        expect(result.rows[0].search_path).toContain('public');
      } finally {
        client.release();
      }
    });
  });

  describe('db - Knex Instance', () => {
    it('should create Knex instance with pg client', () => {
      expect(db).toBeDefined();
      expect(db.client.config.client).toBe('pg');
    });

    it('should use pool connection parameters', () => {
      const config = db.client.config.connection;
      
      expect(config.host).toBe(process.env.DB_HOST || 'localhost');
      expect(config.port).toBe(parseInt(process.env.DB_PORT || '6432'));
      expect(config.database).toBe(process.env.DB_NAME || 'tickettoken_db');
      expect(config.user).toBe(process.env.DB_USER || 'postgres');
    });

    it('should have min 1 connection', () => {
      expect(db.client.config.pool.min).toBe(1);
    });

    it('should have max 5 connections', () => {
      expect(db.client.config.pool.max).toBe(5);
    });

    it('should have searchPath set to public', () => {
      expect(db.client.config.searchPath).toEqual(['public']);
    });

    it('should be able to execute queries', async () => {
      const result = await db.raw('SELECT 1 + 1 as sum');
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].sum).toBe(2);
    });

    it('should be able to query tables', async () => {
      // Test that we can query a known table
      const result = await db.raw(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'auth' 
        LIMIT 1
      `);
      
      expect(result.rows).toBeDefined();
    });
  });

  describe('Connection pooling', () => {
    it('should handle multiple concurrent queries', async () => {
      const queries = Array.from({ length: 3 }, (_, i) => 
        pool.query(`SELECT ${i} as num`)
      );

      const results = await Promise.all(queries);

      expect(results).toHaveLength(3);
      results.forEach((result, i) => {
        expect(result.rows[0].num).toBe(i);
      });
    });

    it('should reuse connections from pool', async () => {
      const client1 = await pool.connect();
      const result1 = await client1.query('SELECT 1');
      client1.release();

      const client2 = await pool.connect();
      const result2 = await client2.query('SELECT 2');
      client2.release();

      expect(result1.rows[0]['?column?']).toBe(1);
      expect(result2.rows[0]['?column?']).toBe(2);
    });
  });
});

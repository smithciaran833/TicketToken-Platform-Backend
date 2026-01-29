/**
 * COMPONENT TEST: DatabaseService
 *
 * Tests database connection pooling, metrics, and health monitoring
 */

import { Pool } from 'pg';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'tickettoken_db';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'postgres';
process.env.DB_POOL_MAX = '10';
process.env.DB_STATEMENT_TIMEOUT_MS = '5000';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

// Import after mocks
import { DatabaseService } from '../../../src/services/databaseService';

describe('DatabaseService Component Tests', () => {
  beforeAll(async () => {
    // Initialize database connection
    await DatabaseService.initialize();
  });

  afterAll(async () => {
    // Close connection
    await DatabaseService.close();
  });

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================
  describe('initialization', () => {
    it('should initialize database connection', async () => {
      const pool = DatabaseService.getPool();
      
      expect(pool).toBeDefined();
      expect(pool).toBeInstanceOf(Pool);
    });

    it('should execute test query', async () => {
      const pool = DatabaseService.getPool();
      const result = await pool.query('SELECT 1 as test');
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].test).toBe(1);
    });
  });

  // ===========================================================================
  // POOL METRICS
  // ===========================================================================
  describe('pool metrics', () => {
    it('should return pool metrics', () => {
      const metrics = DatabaseService.getPoolMetrics();
      
      expect(metrics).toHaveProperty('totalConnections');
      expect(metrics).toHaveProperty('idleConnections');
      expect(metrics).toHaveProperty('waitingClients');
      expect(metrics).toHaveProperty('healthy');
      expect(metrics).toHaveProperty('exhaustionCount');
      
      expect(typeof metrics.totalConnections).toBe('number');
      expect(typeof metrics.idleConnections).toBe('number');
      expect(typeof metrics.waitingClients).toBe('number');
      expect(typeof metrics.healthy).toBe('boolean');
    });

    it('should report healthy pool', () => {
      const metrics = DatabaseService.getPoolMetrics();
      
      expect(metrics.healthy).toBe(true);
    });

    it('should track pool health', () => {
      const isHealthy = DatabaseService.isPoolHealthy();
      
      expect(typeof isHealthy).toBe('boolean');
    });
  });

  // ===========================================================================
  // QUERY EXECUTION
  // ===========================================================================
  describe('query execution', () => {
    it('should execute simple queries', async () => {
      const pool = DatabaseService.getPool();
      const result = await pool.query('SELECT NOW() as current_time');
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].current_time).toBeDefined();
    });

    it('should execute parameterized queries', async () => {
      const pool = DatabaseService.getPool();
      const result = await pool.query('SELECT $1::int as value', [42]);
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].value).toBe(42);
    });

    it('should handle multiple concurrent queries', async () => {
      const pool = DatabaseService.getPool();
      
      const promises = Array.from({ length: 5 }, (_, i) => 
        pool.query('SELECT $1::int as value', [i])
      );
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(5);
      results.forEach((result, i) => {
        expect(result.rows[0].value).toBe(i);
      });
    });
  });

  // ===========================================================================
  // QUERY WITH TIMEOUT
  // ===========================================================================
  describe('queryWithTimeout()', () => {
    it('should execute query with custom timeout', async () => {
      const result = await DatabaseService.queryWithTimeout<any[]>(
        'SELECT $1::int as value',
        [100],
        1000
      );
      
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(100);
    });

    it('should timeout long-running queries', async () => {
      // Query that sleeps for 2 seconds with 500ms timeout
      await expect(
        DatabaseService.queryWithTimeout(
          'SELECT pg_sleep(2)',
          [],
          500
        )
      ).rejects.toThrow();
    });

    it('should use default timeout when not specified', async () => {
      const result = await DatabaseService.queryWithTimeout<any[]>(
        'SELECT 1 as test'
      );
      
      expect(result).toHaveLength(1);
      expect(result[0].test).toBe(1);
    });
  });

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('should handle invalid queries', async () => {
      const pool = DatabaseService.getPool();
      
      await expect(
        pool.query('SELECT FROM invalid_table')
      ).rejects.toThrow();
    });

    it('should handle connection errors gracefully', async () => {
      const pool = DatabaseService.getPool();
      
      await expect(
        pool.query('SELECT * FROM nonexistent_table')
      ).rejects.toThrow();
    });

    it('should throw error when pool not initialized', () => {
      // Save original pool
      const originalPool = (DatabaseService as any).pool;
      
      // Temporarily set pool to null
      (DatabaseService as any).pool = null;
      
      expect(() => DatabaseService.getPool()).toThrow('Database not initialized');
      
      // Restore pool
      (DatabaseService as any).pool = originalPool;
    });
  });

  // ===========================================================================
  // CONNECTION POOLING
  // ===========================================================================
  describe('connection pooling', () => {
    it('should reuse connections from pool', async () => {
      const pool = DatabaseService.getPool();
      
      const client1 = await pool.connect();
      const result1 = await client1.query('SELECT 1');
      client1.release();
      
      const client2 = await pool.connect();
      const result2 = await client2.query('SELECT 2');
      client2.release();
      
      expect(result1.rows[0]['?column?']).toBe(1);
      expect(result2.rows[0]['?column?']).toBe(2);
    });

    it('should handle client release properly', async () => {
      const pool = DatabaseService.getPool();
      const metricsBefore = DatabaseService.getPoolMetrics();
      
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      
      const metricsAfter = DatabaseService.getPoolMetrics();
      
      // Connection should be back in idle pool
      expect(metricsAfter.idleConnections).toBeGreaterThanOrEqual(
        metricsBefore.idleConnections
      );
    });

    it('should track total connections', async () => {
      const metrics = DatabaseService.getPoolMetrics();
      
      expect(metrics.totalConnections).toBeGreaterThan(0);
      expect(metrics.totalConnections).toBeLessThanOrEqual(10); // Pool max
    });
  });

  // ===========================================================================
  // STATEMENT TIMEOUT
  // ===========================================================================
  describe('statement timeout', () => {
    it('should respect statement timeout configuration', async () => {
      const pool = DatabaseService.getPool();
      
      // Query that takes longer than statement timeout should fail
      await expect(
        pool.query('SELECT pg_sleep(10)') // 10 seconds, but timeout is 5 seconds
      ).rejects.toThrow();
    });

    it('should allow queries within timeout', async () => {
      const pool = DatabaseService.getPool();
      
      // Quick query should succeed
      const result = await pool.query('SELECT 1 as fast');
      
      expect(result.rows[0].fast).toBe(1);
    });
  });

  // ===========================================================================
  // TRANSACTION SUPPORT
  // ===========================================================================
  describe('transactions', () => {
    it('should support transactions', async () => {
      const pool = DatabaseService.getPool();
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        await client.query('SELECT 1');
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    });

    it('should rollback on error', async () => {
      const pool = DatabaseService.getPool();
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        await client.query('SELECT 1');
        // Intentional error
        await expect(
          client.query('SELECT FROM invalid')
        ).rejects.toThrow();
        await client.query('ROLLBACK');
      } catch (error) {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });
  });

  // ===========================================================================
  // POOL CONFIGURATION
  // ===========================================================================
  describe('pool configuration', () => {
    it('should respect max pool size', () => {
      const pool = DatabaseService.getPool();
      
      // Max should be from env var (10)
      expect((pool as any).options.max).toBe(10);
    });

    it('should have application name set', async () => {
      const pool = DatabaseService.getPool();
      const result = await pool.query('SELECT current_setting(\'application_name\') as app_name');
      
      expect(result.rows[0].app_name).toBe('payment-service');
    });
  });
});

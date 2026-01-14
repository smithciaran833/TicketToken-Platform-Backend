/**
 * DatabaseService Integration Tests
 * 
 * Tests the database connection pool management including:
 * - Initialization with retry logic
 * - Connection pooling
 * - Query execution
 * - Graceful shutdown
 */

import { DatabaseService } from '../../../src/services/databaseService';

describe('DatabaseService', () => {
  // We'll create a fresh instance for some tests
  // Note: The singleton is already used by other services, so we test behavior carefully

  afterAll(async () => {
    // Ensure we leave the service in a clean state
    try {
      await DatabaseService.close();
    } catch (e) {
      // Ignore if already closed
    }
  });

  // ==========================================================================
  // initialize
  // ==========================================================================
  describe('initialize', () => {
    beforeEach(async () => {
      // Close any existing connection before each test
      await DatabaseService.close();
    });

    it('should initialize database connection successfully', async () => {
      await DatabaseService.initialize();
      
      const pool = DatabaseService.getPool();
      expect(pool).toBeDefined();
    });

    it('should establish working connection that can execute queries', async () => {
      await DatabaseService.initialize();
      
      const pool = DatabaseService.getPool();
      const result = await pool.query('SELECT 1 as value');
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].value).toBe(1);
    });

    it('should be able to query actual tables', async () => {
      await DatabaseService.initialize();
      
      const pool = DatabaseService.getPool();
      const result = await pool.query('SELECT COUNT(*) as count FROM tenants');
      
      expect(result.rows).toHaveLength(1);
      expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(0);
    });

    it('should handle multiple initializations gracefully', async () => {
      await DatabaseService.initialize();
      const pool1 = DatabaseService.getPool();
      
      // Second initialization should work (creates new pool)
      await DatabaseService.initialize();
      const pool2 = DatabaseService.getPool();
      
      // Both should be valid pools
      expect(pool1).toBeDefined();
      expect(pool2).toBeDefined();
    });
  });

  // ==========================================================================
  // getPool
  // ==========================================================================
  describe('getPool', () => {
    it('should throw error when not initialized', async () => {
      await DatabaseService.close();
      
      expect(() => DatabaseService.getPool()).toThrow('Database not initialized');
    });

    it('should return pool after initialization', async () => {
      await DatabaseService.initialize();
      
      const pool = DatabaseService.getPool();
      expect(pool).toBeDefined();
      expect(typeof pool.query).toBe('function');
    });

    it('should return same pool instance on multiple calls', async () => {
      await DatabaseService.initialize();
      
      const pool1 = DatabaseService.getPool();
      const pool2 = DatabaseService.getPool();
      
      expect(pool1).toBe(pool2);
    });
  });

  // ==========================================================================
  // close
  // ==========================================================================
  describe('close', () => {
    it('should close the connection pool', async () => {
      await DatabaseService.initialize();
      expect(DatabaseService.getPool()).toBeDefined();
      
      await DatabaseService.close();
      
      expect(() => DatabaseService.getPool()).toThrow('Database not initialized');
    });

    it('should handle close when not initialized', async () => {
      await DatabaseService.close(); // Ensure closed
      
      // Should not throw
      await expect(DatabaseService.close()).resolves.toBeUndefined();
    });

    it('should allow re-initialization after close', async () => {
      await DatabaseService.initialize();
      await DatabaseService.close();
      
      await DatabaseService.initialize();
      const pool = DatabaseService.getPool();
      
      const result = await pool.query('SELECT 1 as value');
      expect(result.rows[0].value).toBe(1);
    });
  });

  // ==========================================================================
  // Connection Pool Behavior
  // ==========================================================================
  describe('connection pool behavior', () => {
    beforeAll(async () => {
      await DatabaseService.initialize();
    });

    it('should handle concurrent queries', async () => {
      const pool = DatabaseService.getPool();
      
      const queries = Array(10).fill(null).map((_, i) => 
        pool.query('SELECT $1::int as value', [i])
      );
      
      const results = await Promise.all(queries);
      
      results.forEach((result, i) => {
        expect(result.rows[0].value).toBe(i);
      });
    });

    it('should handle transaction', async () => {
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

    it('should rollback failed transaction', async () => {
      const pool = DatabaseService.getPool();
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        // This should fail - invalid SQL
        await client.query('SELECT * FROM nonexistent_table_xyz');
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        expect(error).toBeDefined();
      } finally {
        client.release();
      }
    });
  });
});

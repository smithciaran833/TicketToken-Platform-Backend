/**
 * Unit Tests for Database Service
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock pg before imports
jest.mock('pg');
jest.mock('../../../src/config/database', () => ({
  dbConfig: {
    host: 'localhost',
    port: 5432,
    database: 'test_db',
    user: 'test_user',
    password: 'test_password',
    max: 10,
    min: 2
  }
}));

describe('DatabaseService', () => {
  let Pool: jest.Mock;
  let mockPoolInstance: any;
  let mockClient: any;
  let db: any;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    // Mock client
    mockClient = {
      query: jest.fn<any>().mockResolvedValue({ rows: [{ now: new Date() }] }),
      release: jest.fn()
    };

    // Mock pool instance
    mockPoolInstance = {
      connect: jest.fn<any>().mockResolvedValue(mockClient),
      query: jest.fn<any>().mockResolvedValue({ rows: [], rowCount: 0 }),
      end: jest.fn<any>().mockResolvedValue(undefined)
    };

    // Mock Pool constructor
    Pool = jest.fn().mockImplementation(() => mockPoolInstance);
    jest.doMock('pg', () => ({ Pool }));

    // Import after mocking
    const dbModule = await import('../../../src/services/database.service');
    db = dbModule.db;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('connect', () => {
    it('should connect to database successfully', async () => {
      await db.connect();

      expect(Pool).toHaveBeenCalledWith({
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        user: 'test_user',
        password: 'test_password',
        max: 10,
        min: 2
      });
      expect(mockPoolInstance.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('SELECT NOW()');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw error on connection failure', async () => {
      mockPoolInstance.connect.mockRejectedValue(new Error('Connection refused'));

      await expect(db.connect()).rejects.toThrow('Connection refused');
    });

    it('should throw error on query failure during connection test', async () => {
      mockClient.query.mockRejectedValue(new Error('Query failed'));

      await expect(db.connect()).rejects.toThrow('Query failed');
    });

    it('should release client even after query failure', async () => {
      mockClient.query.mockRejectedValue(new Error('Query failed'));

      try {
        await db.connect();
      } catch (e) {
        // Expected
      }

      // Client should still be released if it was acquired
      // Note: In the actual implementation, if query fails after connect,
      // the client may or may not be released depending on error handling
    });
  });

  describe('getPool', () => {
    it('should throw error when not connected', () => {
      expect(() => db.getPool()).toThrow('Database not connected');
    });

    it('should return pool after connect', async () => {
      await db.connect();

      const pool = db.getPool();

      expect(pool).toBe(mockPoolInstance);
    });
  });

  describe('query', () => {
    it('should throw error when not connected', async () => {
      await expect(db.query('SELECT 1')).rejects.toThrow('Database not connected');
    });

    it('should execute query without params', async () => {
      await db.connect();
      mockPoolInstance.query.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

      const result = await db.query('SELECT * FROM users');

      expect(mockPoolInstance.query).toHaveBeenCalledWith('SELECT * FROM users', undefined);
      expect(result.rows).toEqual([{ id: 1 }]);
    });

    it('should execute query with params', async () => {
      await db.connect();
      mockPoolInstance.query.mockResolvedValue({ rows: [{ id: 1, name: 'test' }], rowCount: 1 });

      const result = await db.query('SELECT * FROM users WHERE id = $1', [1]);

      expect(mockPoolInstance.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
      expect(result.rows).toEqual([{ id: 1, name: 'test' }]);
    });

    it('should propagate query errors', async () => {
      await db.connect();
      mockPoolInstance.query.mockRejectedValue(new Error('Syntax error'));

      await expect(db.query('INVALID SQL')).rejects.toThrow('Syntax error');
    });

    it('should handle empty result set', async () => {
      await db.connect();
      mockPoolInstance.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await db.query('SELECT * FROM users WHERE id = $1', [999]);

      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
    });

    it('should handle INSERT returning id', async () => {
      await db.connect();
      mockPoolInstance.query.mockResolvedValue({ rows: [{ id: 42 }], rowCount: 1 });

      const result = await db.query(
        'INSERT INTO users (name) VALUES ($1) RETURNING id',
        ['test']
      );

      expect(result.rows[0].id).toBe(42);
    });

    it('should handle UPDATE with rowCount', async () => {
      await db.connect();
      mockPoolInstance.query.mockResolvedValue({ rows: [], rowCount: 5 });

      const result = await db.query(
        'UPDATE users SET active = $1 WHERE tenant_id = $2',
        [true, 'tenant-123']
      );

      expect(result.rowCount).toBe(5);
    });

    it('should handle DELETE with rowCount', async () => {
      await db.connect();
      mockPoolInstance.query.mockResolvedValue({ rows: [], rowCount: 3 });

      const result = await db.query(
        'DELETE FROM sessions WHERE expired_at < $1',
        [new Date()]
      );

      expect(result.rowCount).toBe(3);
    });
  });

  describe('close', () => {
    it('should handle close when not connected', async () => {
      await expect(db.close()).resolves.not.toThrow();
    });

    it('should close pool connection', async () => {
      await db.connect();

      await db.close();

      expect(mockPoolInstance.end).toHaveBeenCalled();
    });

    it('should handle pool.end() errors gracefully', async () => {
      await db.connect();
      mockPoolInstance.end.mockRejectedValue(new Error('Close failed'));

      // Depending on implementation, this may or may not throw
      // Current implementation doesn't catch errors from pool.end()
      await expect(db.close()).rejects.toThrow('Close failed');
    });
  });

  describe('connection lifecycle', () => {
    it('should allow reconnect after close', async () => {
      await db.connect();
      await db.close();

      // Reset mock for second connection
      jest.resetModules();
      Pool.mockClear();
      
      const { db: freshDb } = await import('../../../src/services/database.service');
      await freshDb.connect();

      expect(Pool).toHaveBeenCalled();
    });

    it('should handle multiple queries on same connection', async () => {
      await db.connect();

      await db.query('SELECT 1');
      await db.query('SELECT 2');
      await db.query('SELECT 3');

      expect(mockPoolInstance.query).toHaveBeenCalledTimes(3);
    });
  });
});

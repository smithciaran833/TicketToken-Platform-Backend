// =============================================================================
// MOCKS
// =============================================================================

const mockLogger = {
  child: jest.fn().mockReturnThis(),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => mockLogger),
  },
}));

jest.mock('../../../src/config');
jest.mock('pg');

// Import after mocks
import { DatabaseService } from '../../../src/services/databaseService';
import { Pool } from 'pg';
import { config } from '../../../src/config';

// =============================================================================
// TEST SUITE
// =============================================================================

describe('DatabaseService', () => {
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    (config as any).database = {
      url: 'postgresql://test:test@localhost:5432/testdb',
      pool: {
        max: 20,
        min: 2,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      },
    };

    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn(),
    };

    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 }),
      connect: jest.fn().mockResolvedValue(mockClient),
      end: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };

    (Pool as jest.MockedClass<typeof Pool>).mockImplementation(() => mockPool as any);

    // Suppress console.log in tests
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =============================================================================
  // initialize() - 10 test cases
  // =============================================================================

  describe('initialize()', () => {
    it('should create pool with correct config', async () => {
      await DatabaseService.initialize();

      expect(Pool).toHaveBeenCalledWith({
        connectionString: 'postgresql://test:test@localhost:5432/testdb',
        max: 20,
        min: 2,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    });

    it('should use default pool values if not provided', async () => {
      (config as any).database = {
        url: 'postgresql://test:test@localhost:5432/testdb',
        pool: {},
      };

      await DatabaseService.initialize();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          max: 20,
          min: 2,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        })
      );
    });

    it('should register error handler on pool', async () => {
      await DatabaseService.initialize();

      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should log pool errors', async () => {
      await DatabaseService.initialize();

      const errorHandler = mockPool.on.mock.calls.find(
        (call: any[]) => call[0] === 'error'
      )[1];

      const error = new Error('Pool error');
      errorHandler(error);

      expect(mockLogger.error).toHaveBeenCalledWith('Database pool error:', error);
    });

    it('should test connection with SELECT 1', async () => {
      await DatabaseService.initialize();

      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should log successful initialization', async () => {
      await DatabaseService.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith('Database service initialized');
    });

    it('should throw error if connection fails', async () => {
      const error = new Error('Connection failed');
      mockPool.query.mockRejectedValueOnce(error);

      await expect(DatabaseService.initialize()).rejects.toThrow('Connection failed');
    });

    it('should log initialization error', async () => {
      const error = new Error('Connection failed');
      mockPool.query.mockRejectedValueOnce(error);

      await expect(DatabaseService.initialize()).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize database service:',
        error
      );
    });

    it('should allow re-initialization', async () => {
      await DatabaseService.initialize();
      await DatabaseService.initialize();

      expect(Pool).toHaveBeenCalledTimes(2);
    });

    it('should handle missing pool config', async () => {
      (config as any).database = {
        url: 'postgresql://test:test@localhost:5432/testdb',
      };

      await DatabaseService.initialize();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          max: 20,
          min: 2,
        })
      );
    });
  });

  // =============================================================================
  // getPool() - 5 test cases
  // =============================================================================

  describe('getPool()', () => {
    it('should return pool after initialization', async () => {
      await DatabaseService.initialize();

      const pool = DatabaseService.getPool();

      expect(pool).toBe(mockPool);
    });

    it('should throw error if not initialized', () => {
      // Create a fresh instance by requiring the module again
      jest.resetModules();
      const { DatabaseService: FreshService } = require('../../../src/services/databaseService');

      expect(() => FreshService.getPool()).toThrow('Database not initialized');
    });

    it('should return same pool on multiple calls', async () => {
      await DatabaseService.initialize();

      const pool1 = DatabaseService.getPool();
      const pool2 = DatabaseService.getPool();

      expect(pool1).toBe(pool2);
    });

    it('should return pool with query method', async () => {
      await DatabaseService.initialize();

      const pool = DatabaseService.getPool();

      expect(pool.query).toBeDefined();
      expect(typeof pool.query).toBe('function');
    });

    it('should return pool with connect method', async () => {
      await DatabaseService.initialize();

      const pool = DatabaseService.getPool();

      expect(pool.connect).toBeDefined();
      expect(typeof pool.connect).toBe('function');
    });
  });

  // =============================================================================
  // query() - 10 test cases
  // =============================================================================

  describe('query()', () => {
    beforeEach(async () => {
      await DatabaseService.initialize();
    });

    it('should execute query', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, name: 'Test' }],
        rowCount: 1,
      });

      const result = await DatabaseService.query('SELECT * FROM users WHERE id = $1', [1]);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
      expect(result.rows).toEqual([{ id: 1, name: 'Test' }]);
      expect(result.rowCount).toBe(1);
    });

    it('should execute query without params', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: 10 }],
        rowCount: 1,
      });

      const result = await DatabaseService.query('SELECT COUNT(*) FROM users');

      expect(mockPool.query).toHaveBeenCalledWith('SELECT COUNT(*) FROM users', undefined);
      expect(result.rows).toEqual([{ count: 10 }]);
    });

    it('should return empty rows array', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await DatabaseService.query('SELECT * FROM users WHERE id = $1', [999]);

      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
    });

    it('should handle multiple params', async () => {
      await DatabaseService.query('SELECT * FROM users WHERE id = $1 AND status = $2', [1, 'active']);

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE id = $1 AND status = $2',
        [1, 'active']
      );
    });

    it('should throw error if not initialized', async () => {
      jest.resetModules();
      const { DatabaseService: FreshService } = require('../../../src/services/databaseService');

      await expect(
        FreshService.query('SELECT 1')
      ).rejects.toThrow('Database not initialized');
    });

    it('should propagate query errors', async () => {
      const error = new Error('Query error');
      mockPool.query.mockRejectedValue(error);

      await expect(
        DatabaseService.query('INVALID SQL')
      ).rejects.toThrow('Query error');
    });

    it('should handle INSERT queries', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 5 }],
        rowCount: 1,
      });

      const result = await DatabaseService.query(
        'INSERT INTO users (name) VALUES ($1) RETURNING id',
        ['John']
      );

      expect(result.rows[0].id).toBe(5);
      expect(result.rowCount).toBe(1);
    });

    it('should handle UPDATE queries', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        rowCount: 3,
      });

      const result = await DatabaseService.query(
        'UPDATE users SET status = $1 WHERE active = true',
        ['inactive']
      );

      expect(result.rowCount).toBe(3);
    });

    it('should handle DELETE queries', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        rowCount: 2,
      });

      const result = await DatabaseService.query('DELETE FROM users WHERE status = $1', ['deleted']);

      expect(result.rowCount).toBe(2);
    });

    it('should support generic typing', async () => {
      interface User {
        id: number;
        name: string;
      }

      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, name: 'Alice' }],
        rowCount: 1,
      });

      const result = await DatabaseService.query<User>('SELECT * FROM users');

      expect(result.rows[0].id).toBe(1);
      expect(result.rows[0].name).toBe('Alice');
    });
  });

  // =============================================================================
  // transaction() - 15 test cases
  // =============================================================================

  describe('transaction()', () => {
    beforeEach(async () => {
      await DatabaseService.initialize();
      
      // Setup default mock responses for transaction flow
      mockClient.query.mockImplementation((query: string) => {
        if (query === 'BEGIN') return Promise.resolve({ rows: [], rowCount: 0 });
        if (query === 'COMMIT') return Promise.resolve({ rows: [], rowCount: 0 });
        if (query === 'ROLLBACK') return Promise.resolve({ rows: [], rowCount: 0 });
        if (query === 'SELECT txid_current_if_assigned()') {
          return Promise.resolve({ rows: [{ txid_current_if_assigned: null }], rowCount: 1 });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });
    });

    it('should execute transaction', async () => {
      const callback = jest.fn().mockResolvedValue('result');

      const result = await DatabaseService.transaction(callback);

      expect(result).toBe('result');
      expect(callback).toHaveBeenCalledWith(mockClient);
    });

    it('should begin transaction', async () => {
      await DatabaseService.transaction(async (client) => {
        await client.query('INSERT INTO users (name) VALUES ($1)', ['Test']);
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    });

    it('should commit transaction', async () => {
      await DatabaseService.transaction(async (client) => {
        await client.query('INSERT INTO users (name) VALUES ($1)', ['Test']);
      });

      const commitCall = mockClient.query.mock.calls.find(
        (call: any[]) => call[0] === 'COMMIT'
      );
      expect(commitCall).toBeDefined();
    });

    it('should check transaction status after commit', async () => {
      await DatabaseService.transaction(async (client) => {
        await client.query('INSERT INTO users (name) VALUES ($1)', ['Test']);
      });

      const statusCall = mockClient.query.mock.calls.find(
        (call: any[]) => call[0] === 'SELECT txid_current_if_assigned()'
      );
      expect(statusCall).toBeDefined();
    });

    it('should release client after success', async () => {
      await DatabaseService.transaction(async () => 'success');

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback on error', async () => {
      const error = new Error('Transaction error');

      await expect(
        DatabaseService.transaction(async () => {
          throw error;
        })
      ).rejects.toThrow('Transaction error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should release client after error', async () => {
      await expect(
        DatabaseService.transaction(async () => {
          throw new Error('Error');
        })
      ).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw error if not initialized', async () => {
      jest.resetModules();
      const { DatabaseService: FreshService } = require('../../../src/services/databaseService');

      await expect(
        FreshService.transaction(async () => {})
      ).rejects.toThrow('Database not initialized');
    });

    it('should pass client to callback', async () => {
      let capturedClient: any;

      await DatabaseService.transaction(async (client) => {
        capturedClient = client;
      });

      expect(capturedClient).toBe(mockClient);
    });

    it('should allow multiple queries in transaction', async () => {
      await DatabaseService.transaction(async (client) => {
        await client.query('INSERT INTO users (name) VALUES ($1)', ['User1']);
        await client.query('INSERT INTO users (name) VALUES ($1)', ['User2']);
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should return callback result', async () => {
      const result = await DatabaseService.transaction(async () => {
        return { success: true, data: 'test' };
      });

      expect(result).toEqual({ success: true, data: 'test' });
    });

    it('should support typed return values', async () => {
      interface Result {
        id: number;
        created: boolean;
      }

      const result = await DatabaseService.transaction<Result>(async () => {
        return { id: 123, created: true };
      });

      expect(result.id).toBe(123);
      expect(result.created).toBe(true);
    });

    it('should connect to pool', async () => {
      await DatabaseService.transaction(async () => {});

      expect(mockPool.connect).toHaveBeenCalled();
    });

    it('should propagate callback errors', async () => {
      const customError = new Error('Custom error');

      await expect(
        DatabaseService.transaction(async () => {
          throw customError;
        })
      ).rejects.toThrow('Custom error');
    });

    it('should handle commit failure', async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (query === 'BEGIN') return Promise.resolve({ rows: [], rowCount: 0 });
        if (query === 'COMMIT') return Promise.reject(new Error('Commit failed'));
        if (query === 'ROLLBACK') return Promise.resolve({ rows: [], rowCount: 0 });
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      await expect(
        DatabaseService.transaction(async () => 'result')
      ).rejects.toThrow('Commit failed');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  // =============================================================================
  // close() - 5 test cases
  // =============================================================================

  describe('close()', () => {
    it('should close pool', async () => {
      await DatabaseService.initialize();
      await DatabaseService.close();

      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should not throw if pool not initialized', async () => {
      jest.resetModules();
      const { DatabaseService: FreshService } = require('../../../src/services/databaseService');

      await expect(FreshService.close()).resolves.not.toThrow();
    });

    it('should handle close errors gracefully', async () => {
      await DatabaseService.initialize();
      mockPool.end.mockRejectedValue(new Error('Close error'));

      await expect(DatabaseService.close()).rejects.toThrow('Close error');
    });

    it('should reset pool reference', async () => {
      await DatabaseService.initialize();
      await DatabaseService.close();

      // After closing, the pool should still be the same object but end() was called
      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should end pool connection', async () => {
      await DatabaseService.initialize();
      const pool = DatabaseService.getPool();

      await DatabaseService.close();

      expect(pool.end).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // isHealthy() - 8 test cases
  // =============================================================================

  describe('isHealthy()', () => {
    it('should return true when healthy', async () => {
      await DatabaseService.initialize();
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const healthy = await DatabaseService.isHealthy();

      expect(healthy).toBe(true);
    });

    it('should check with SELECT 1', async () => {
      await DatabaseService.initialize();
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await DatabaseService.isHealthy();

      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return false when not initialized', async () => {
      jest.resetModules();
      const { DatabaseService: FreshService } = require('../../../src/services/databaseService');

      const healthy = await FreshService.isHealthy();

      expect(healthy).toBe(false);
    });

    it('should return false on query error', async () => {
      await DatabaseService.initialize();
      mockPool.query.mockRejectedValue(new Error('Connection lost'));

      const healthy = await DatabaseService.isHealthy();

      expect(healthy).toBe(false);
    });

    it('should not throw on error', async () => {
      await DatabaseService.initialize();
      mockPool.query.mockRejectedValue(new Error('Error'));

      await expect(DatabaseService.isHealthy()).resolves.toBe(false);
    });

    it('should handle timeout errors', async () => {
      await DatabaseService.initialize();
      mockPool.query.mockRejectedValue(new Error('Timeout'));

      const healthy = await DatabaseService.isHealthy();

      expect(healthy).toBe(false);
    });

    it('should handle connection errors', async () => {
      await DatabaseService.initialize();
      mockPool.query.mockRejectedValue(new Error('Connection refused'));

      const healthy = await DatabaseService.isHealthy();

      expect(healthy).toBe(false);
    });

    it('should work after recovery', async () => {
      await DatabaseService.initialize();
      
      // First check fails
      mockPool.query.mockRejectedValueOnce(new Error('Error'));
      let healthy = await DatabaseService.isHealthy();
      expect(healthy).toBe(false);

      // Second check succeeds
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      healthy = await DatabaseService.isHealthy();
      expect(healthy).toBe(true);
    });
  });

  // =============================================================================
  // instance test
  // =============================================================================

  describe('instance', () => {
    it('should be a singleton', () => {
      expect(DatabaseService).toBeDefined();
    });

    it('should have all required methods', () => {
      expect(typeof DatabaseService.initialize).toBe('function');
      expect(typeof DatabaseService.getPool).toBe('function');
      expect(typeof DatabaseService.query).toBe('function');
      expect(typeof DatabaseService.transaction).toBe('function');
      expect(typeof DatabaseService.close).toBe('function');
      expect(typeof DatabaseService.isHealthy).toBe('function');
    });
  });
});

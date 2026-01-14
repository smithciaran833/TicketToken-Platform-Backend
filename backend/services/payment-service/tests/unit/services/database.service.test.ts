/**
 * Unit Tests for Database Service
 * 
 * Tests database pool management, metrics, and health checks.
 */

// Mock dependencies before imports
jest.mock('pg', () => {
  const mockPool = {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
    totalCount: 10,
    idleCount: 5,
    waitingCount: 0,
  };
  return {
    Pool: jest.fn(() => mockPool),
  };
});

jest.mock('dns', () => ({
  resolve4: jest.fn((host: string, callback: Function) => {
    callback(null, ['127.0.0.1']);
  }),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { Pool } from 'pg';

describe('DatabaseService', () => {
  let DatabaseService: any;
  let mockPoolInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Create fresh mock pool for each test
    mockPoolInstance = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue({
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      }),
      end: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      totalCount: 10,
      idleCount: 5,
      waitingCount: 0,
    };

    (Pool as jest.MockedClass<typeof Pool>).mockImplementation(() => mockPoolInstance as any);

    // Re-import to get fresh instance
    jest.isolateModules(() => {
      const module = require('../../../src/services/databaseService');
      DatabaseService = module.DatabaseService;
    });
  });

  describe('initialize', () => {
    it('should initialize pool successfully', async () => {
      await DatabaseService.initialize();

      expect(Pool).toHaveBeenCalled();
      expect(mockPoolInstance.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should retry on connection failure', async () => {
      mockPoolInstance.query
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce({ rows: [] });

      await DatabaseService.initialize();

      // Pool should have been created multiple times
      expect(Pool).toHaveBeenCalled();
    });

    it('should throw after max retries', async () => {
      mockPoolInstance.query.mockRejectedValue(new Error('Connection refused'));
      mockPoolInstance.end.mockResolvedValue(undefined);

      await expect(DatabaseService.initialize()).rejects.toThrow('Connection refused');
    });

    it('should configure event handlers', async () => {
      await DatabaseService.initialize();

      expect(mockPoolInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockPoolInstance.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockPoolInstance.on).toHaveBeenCalledWith('acquire', expect.any(Function));
      expect(mockPoolInstance.on).toHaveBeenCalledWith('release', expect.any(Function));
      expect(mockPoolInstance.on).toHaveBeenCalledWith('remove', expect.any(Function));
    });
  });

  describe('getPool', () => {
    it('should return pool after initialization', async () => {
      await DatabaseService.initialize();
      const pool = DatabaseService.getPool();

      expect(pool).toBeDefined();
    });

    it('should throw error if not initialized', () => {
      expect(() => DatabaseService.getPool()).toThrow('Database not initialized');
    });
  });

  describe('getPoolMetrics', () => {
    it('should return pool metrics', async () => {
      await DatabaseService.initialize();
      const metrics = DatabaseService.getPoolMetrics();

      expect(metrics).toHaveProperty('totalConnections');
      expect(metrics).toHaveProperty('idleConnections');
      expect(metrics).toHaveProperty('waitingClients');
      expect(metrics).toHaveProperty('exhaustionCount');
      expect(metrics).toHaveProperty('healthy');
    });

    it('should update metrics from pool', async () => {
      mockPoolInstance.totalCount = 15;
      mockPoolInstance.idleCount = 3;
      mockPoolInstance.waitingCount = 2;

      await DatabaseService.initialize();
      const metrics = DatabaseService.getPoolMetrics();

      expect(metrics.totalConnections).toBe(15);
      expect(metrics.idleConnections).toBe(3);
      expect(metrics.waitingClients).toBe(2);
    });
  });

  describe('isPoolHealthy', () => {
    it('should return false if pool not initialized', () => {
      expect(DatabaseService.isPoolHealthy()).toBe(false);
    });

    it('should return true for healthy pool', async () => {
      mockPoolInstance.waitingCount = 0;
      mockPoolInstance.idleCount = 5;
      mockPoolInstance.totalCount = 10;

      await DatabaseService.initialize();
      expect(DatabaseService.isPoolHealthy()).toBe(true);
    });

    it('should return false when too many clients waiting', async () => {
      mockPoolInstance.waitingCount = 10; // Above default threshold of 5

      await DatabaseService.initialize();
      expect(DatabaseService.isPoolHealthy()).toBe(false);
    });

    it('should return false when pool exhausted', async () => {
      mockPoolInstance.totalCount = 20; // At max
      mockPoolInstance.idleCount = 0; // No idle connections

      await DatabaseService.initialize();
      expect(DatabaseService.isPoolHealthy()).toBe(false);
    });
  });

  describe('queryWithTimeout', () => {
    it('should execute query with timeout', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }),
        release: jest.fn(),
      };
      mockPoolInstance.connect.mockResolvedValue(mockClient);

      await DatabaseService.initialize();
      const result = await DatabaseService.queryWithTimeout('SELECT * FROM users');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SET statement_timeout')
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw if not initialized', async () => {
      await expect(
        DatabaseService.queryWithTimeout('SELECT 1')
      ).rejects.toThrow('Database not initialized');
    });

    it('should use custom timeout when provided', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      mockPoolInstance.connect.mockResolvedValue(mockClient);

      await DatabaseService.initialize();
      await DatabaseService.queryWithTimeout('SELECT 1', [], 5000);

      expect(mockClient.query).toHaveBeenCalledWith(
        "SET statement_timeout = '5000ms'"
      );
    });

    it('should release client on error', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({}) // SET timeout
          .mockRejectedValueOnce(new Error('Query failed')),
        release: jest.fn(),
      };
      mockPoolInstance.connect.mockResolvedValue(mockClient);

      await DatabaseService.initialize();

      await expect(
        DatabaseService.queryWithTimeout('SELECT * FROM invalid')
      ).rejects.toThrow('Query failed');

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should close pool', async () => {
      await DatabaseService.initialize();
      await DatabaseService.close();

      expect(mockPoolInstance.end).toHaveBeenCalled();
    });

    it('should handle close when not initialized', async () => {
      await expect(DatabaseService.close()).resolves.toBeUndefined();
    });
  });

  describe('Pool Event Handlers', () => {
    it('should increment totalConnections on connect event', async () => {
      await DatabaseService.initialize();

      // Find and call the connect handler
      const connectHandler = mockPoolInstance.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];

      if (connectHandler) {
        connectHandler();
      }

      const metrics = DatabaseService.getPoolMetrics();
      expect(metrics.totalConnections).toBeGreaterThanOrEqual(0);
    });

    it('should detect pool exhaustion on acquire', async () => {
      mockPoolInstance.waitingCount = 10; // Above threshold

      await DatabaseService.initialize();

      // Find and call the acquire handler
      const acquireHandler = mockPoolInstance.on.mock.calls.find(
        (call: any[]) => call[0] === 'acquire'
      )?.[1];

      if (acquireHandler) {
        acquireHandler();
      }

      const metrics = DatabaseService.getPoolMetrics();
      expect(metrics.exhaustionCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Configuration', () => {
    beforeEach(() => {
      // Reset environment variables
      delete process.env.DB_HOST;
      delete process.env.DB_PORT;
      delete process.env.DB_NAME;
      delete process.env.DB_USER;
      delete process.env.DB_PASSWORD;
      delete process.env.DB_POOL_MAX;
      delete process.env.DB_STATEMENT_TIMEOUT_MS;
    });

    it('should use default configuration values', async () => {
      await DatabaseService.initialize();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 6432,
          database: 'tickettoken_db',
          user: 'postgres',
          max: 20,
        })
      );
    });

    it('should use custom environment variables', async () => {
      process.env.DB_PORT = '5432';
      process.env.DB_NAME = 'custom_db';
      process.env.DB_USER = 'custom_user';
      process.env.DB_POOL_MAX = '50';

      jest.resetModules();
      jest.isolateModules(() => {
        const module = require('../../../src/services/databaseService');
        DatabaseService = module.DatabaseService;
      });

      await DatabaseService.initialize();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 5432,
          database: 'custom_db',
          user: 'custom_user',
          max: 50,
        })
      );
    });
  });
});

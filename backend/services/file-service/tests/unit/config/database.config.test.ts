
describe('config/database.config', () => {
  let mockPool: any;
  let mockClient: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Save original env
    originalEnv = { ...process.env };

    // Set required env vars
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
    process.env.DB_POOL_MIN = '2';
    process.env.DB_POOL_MAX = '10';
    process.env.DB_IDLE_TIMEOUT_MS = '30000';
    process.env.DB_CONNECTION_TIMEOUT_MS = '5000';
    process.env.NODE_ENV = 'test';

    // Create mock client
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn(),
    };

    // Create mock pool
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      connect: jest.fn().mockResolvedValue(mockClient),
      end: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      totalCount: 5,
      idleCount: 3,
      waitingCount: 0,
    };

    // Mock pg module
    jest.doMock('pg', () => ({
      Pool: jest.fn(() => mockPool),
      PoolClient: jest.fn(),
    }));

    // Mock logger
    jest.doMock('../../../src/utils/logger', () => ({
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
    }));

    // Mock circuit breaker to pass through
    jest.doMock('../../../src/utils/circuit-breaker', () => ({
      postgresCircuit: {
        execute: jest.fn((fn: () => Promise<any>) => fn()),
      },
    }));
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('initializePool', () => {
    it('should create a new pool with correct configuration', () => {
      const { initializePool } = require('../../../src/config/database.config');
      const { Pool: MockedPool } = require('pg');

      const pool = initializePool();

      expect(MockedPool).toHaveBeenCalledWith(expect.objectContaining({
        connectionString: 'postgresql://test:test@localhost:5432/testdb',
        min: 2,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        application_name: 'file-service',
      }));
      expect(pool).toBe(mockPool);
    });

    it('should return existing pool if already initialized', () => {
      const { initializePool } = require('../../../src/config/database.config');
      const { Pool: MockedPool } = require('pg');

      const pool1 = initializePool();
      const pool2 = initializePool();

      expect(MockedPool).toHaveBeenCalledTimes(1);
      expect(pool1).toBe(pool2);
    });

    it('should throw error when DATABASE_URL is not set', () => {
      delete process.env.DATABASE_URL;
      jest.resetModules();
      
      // Re-mock after resetModules
      jest.doMock('pg', () => ({ Pool: jest.fn(() => mockPool) }));
      jest.doMock('../../../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
      jest.doMock('../../../src/utils/circuit-breaker', () => ({ postgresCircuit: { execute: jest.fn((fn: () => Promise<any>) => fn()) } }));

      const { initializePool } = require('../../../src/config/database.config');

      expect(() => initializePool()).toThrow('DATABASE_URL environment variable is required');
    });

    it('should enable SSL in production', () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      
      jest.doMock('pg', () => ({ Pool: jest.fn(() => mockPool) }));
      jest.doMock('../../../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
      jest.doMock('../../../src/utils/circuit-breaker', () => ({ postgresCircuit: { execute: jest.fn((fn: () => Promise<any>) => fn()) } }));

      const { initializePool } = require('../../../src/config/database.config');
      const { Pool: MockedPool } = require('pg');
      
      initializePool();

      expect(MockedPool).toHaveBeenCalledWith(expect.objectContaining({
        ssl: { rejectUnauthorized: false },
      }));
    });

    it('should not enable SSL in development', () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      
      jest.doMock('pg', () => ({ Pool: jest.fn(() => mockPool) }));
      jest.doMock('../../../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
      jest.doMock('../../../src/utils/circuit-breaker', () => ({ postgresCircuit: { execute: jest.fn((fn: () => Promise<any>) => fn()) } }));

      const { initializePool } = require('../../../src/config/database.config');
      const { Pool: MockedPool } = require('pg');
      
      initializePool();

      expect(MockedPool).toHaveBeenCalledWith(expect.objectContaining({
        ssl: undefined,
      }));
    });

    it('should register error event handler', () => {
      const { initializePool } = require('../../../src/config/database.config');

      initializePool();

      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should register connect event handler', () => {
      const { initializePool } = require('../../../src/config/database.config');

      initializePool();

      expect(mockPool.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });

    it('should register acquire event handler', () => {
      const { initializePool } = require('../../../src/config/database.config');

      initializePool();

      expect(mockPool.on).toHaveBeenCalledWith('acquire', expect.any(Function));
    });

    it('should register remove event handler', () => {
      const { initializePool } = require('../../../src/config/database.config');

      initializePool();

      expect(mockPool.on).toHaveBeenCalledWith('remove', expect.any(Function));
    });

    it('should use default pool configuration values', () => {
      delete process.env.DB_POOL_MIN;
      delete process.env.DB_POOL_MAX;
      delete process.env.DB_IDLE_TIMEOUT_MS;
      delete process.env.DB_CONNECTION_TIMEOUT_MS;
      jest.resetModules();
      
      jest.doMock('pg', () => ({ Pool: jest.fn(() => mockPool) }));
      jest.doMock('../../../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
      jest.doMock('../../../src/utils/circuit-breaker', () => ({ postgresCircuit: { execute: jest.fn((fn: () => Promise<any>) => fn()) } }));

      const { initializePool } = require('../../../src/config/database.config');
      const { Pool: MockedPool } = require('pg');
      
      initializePool();

      expect(MockedPool).toHaveBeenCalledWith(expect.objectContaining({
        min: 2,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      }));
    });
  });

  describe('getPool', () => {
    it('should return existing pool if initialized', () => {
      const { initializePool, getPool } = require('../../../src/config/database.config');
      const { Pool: MockedPool } = require('pg');

      const pool1 = initializePool();
      const pool2 = getPool();

      expect(pool1).toBe(pool2);
      expect(MockedPool).toHaveBeenCalledTimes(1);
    });

    it('should initialize pool if not already initialized', () => {
      const { getPool } = require('../../../src/config/database.config');
      const { Pool: MockedPool } = require('pg');

      const pool = getPool();

      expect(MockedPool).toHaveBeenCalledTimes(1);
      expect(pool).toBe(mockPool);
    });
  });

  describe('query', () => {
    it('should execute query successfully', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

      const { query } = require('../../../src/config/database.config');

      const result = await query('SELECT * FROM users', []);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users', []);
      expect(result).toEqual({ rows: [{ id: 1 }], rowCount: 1 });
    });

    it('should handle query without parameters', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const { query } = require('../../../src/config/database.config');

      await query('SELECT 1');

      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1', undefined);
    });

    it('should handle null rowCount', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ id: 1 }], rowCount: null });

      const { query } = require('../../../src/config/database.config');

      const result = await query('SELECT * FROM users');

      expect(result.rowCount).toBe(0);
    });
  });

  describe('withTransaction', () => {
    it('should execute callback within transaction and commit', async () => {
      const { withTransaction } = require('../../../src/config/database.config');

      const callback = jest.fn().mockResolvedValue('result');
      const result = await withTransaction(callback);

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(callback).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should rollback transaction on error', async () => {
      const { withTransaction } = require('../../../src/config/database.config');

      const error = new Error('Transaction failed');
      const callback = jest.fn().mockRejectedValue(error);

      await expect(withTransaction(callback)).rejects.toThrow('Transaction failed');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client even if rollback fails', async () => {
      const { withTransaction } = require('../../../src/config/database.config');

      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'ROLLBACK') {
          return Promise.reject(new Error('Rollback failed'));
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      const callback = jest.fn().mockRejectedValue(new Error('Transaction failed'));

      await expect(withTransaction(callback)).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('withTenantContext', () => {
    it('should set tenant context and execute callback', async () => {
      const { withTenantContext } = require('../../../src/config/database.config');

      const callback = jest.fn().mockResolvedValue('result');
      const result = await withTenantContext('tenant-123', callback);

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith("SET LOCAL app.current_tenant_id = 'tenant-123'");
      expect(callback).toHaveBeenCalledWith(mockClient);
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should release client even on error', async () => {
      const { withTenantContext } = require('../../../src/config/database.config');

      const callback = jest.fn().mockRejectedValue(new Error('Callback failed'));

      await expect(withTenantContext('tenant-123', callback)).rejects.toThrow('Callback failed');

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle different tenant IDs', async () => {
      const { withTenantContext } = require('../../../src/config/database.config');

      const callback = jest.fn().mockResolvedValue('result');
      await withTenantContext('tenant-456', callback);

      expect(mockClient.query).toHaveBeenCalledWith("SET LOCAL app.current_tenant_id = 'tenant-456'");
    });
  });

  describe('checkDatabaseHealth', () => {
    it('should return healthy status when database is accessible', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 });
      mockPool.totalCount = 5;
      mockPool.idleCount = 3;
      mockPool.waitingCount = 1;

      const { checkDatabaseHealth } = require('../../../src/config/database.config');

      const health = await checkDatabaseHealth();

      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1');
      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.poolStats).toEqual({
        total: 5,
        idle: 3,
        waiting: 1,
      });
    });

    it('should return unhealthy status when database query fails', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection failed'));
      mockPool.totalCount = 0;
      mockPool.idleCount = 0;
      mockPool.waitingCount = 0;

      const { checkDatabaseHealth } = require('../../../src/config/database.config');

      const health = await checkDatabaseHealth();

      expect(health.healthy).toBe(false);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.poolStats).toEqual({
        total: 0,
        idle: 0,
        waiting: 0,
      });
    });

    it('should measure query latency', async () => {
      mockPool.query.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ rows: [], rowCount: 0 }), 15))
      );

      const { checkDatabaseHealth } = require('../../../src/config/database.config');

      const health = await checkDatabaseHealth();

      expect(health.latencyMs).toBeGreaterThanOrEqual(10);
    });
  });

  describe('closePool', () => {
    it('should close existing pool', async () => {
      const { initializePool, closePool } = require('../../../src/config/database.config');

      initializePool();
      await closePool();

      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should not throw if pool is not initialized', async () => {
      const { closePool } = require('../../../src/config/database.config');

      await expect(closePool()).resolves.not.toThrow();
    });

    it('should allow reinitialization after close', async () => {
      const { initializePool, closePool } = require('../../../src/config/database.config');
      const { Pool: MockedPool } = require('pg');

      initializePool();
      await closePool();

      // Clear call count
      MockedPool.mockClear();

      initializePool();

      expect(MockedPool).toHaveBeenCalledTimes(1);
    });
  });

  describe('connectDatabase', () => {
    it('should be an alias for initializePool', () => {
      const { connectDatabase, initializePool } = require('../../../src/config/database.config');

      expect(connectDatabase).toBe(initializePool);
    });
  });

  describe('disconnectDatabase', () => {
    it('should be an alias for closePool', () => {
      const { disconnectDatabase, closePool } = require('../../../src/config/database.config');

      expect(disconnectDatabase).toBe(closePool);
    });
  });

  describe('default export', () => {
    it('should export all functions', () => {
      const dbConfig = require('../../../src/config/database.config').default;

      expect(dbConfig).toHaveProperty('initializePool');
      expect(dbConfig).toHaveProperty('getPool');
      expect(dbConfig).toHaveProperty('query');
      expect(dbConfig).toHaveProperty('withTransaction');
      expect(dbConfig).toHaveProperty('withTenantContext');
      expect(dbConfig).toHaveProperty('checkDatabaseHealth');
      expect(dbConfig).toHaveProperty('closePool');
      expect(dbConfig).toHaveProperty('connectDatabase');
      expect(dbConfig).toHaveProperty('disconnectDatabase');
    });
  });
});

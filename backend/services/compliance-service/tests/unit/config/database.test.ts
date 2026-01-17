/**
 * Unit Tests for Database Configuration
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies before imports
jest.mock('dotenv');
jest.mock('pg');
jest.mock('knex');
jest.mock('../../../src/utils/logger');

describe('Database Configuration', () => {
  let mockEnv: NodeJS.ProcessEnv;
  let Pool: jest.Mock<any>;
  let Knex: jest.Mock<any>;
  let logger: {
    info: jest.Mock<any>;
    warn: jest.Mock<any>;
    error: jest.Mock<any>;
  };

  beforeEach(() => {
    mockEnv = { ...process.env };
    jest.resetModules();

    Pool = jest.fn<any>().mockImplementation(() => ({
      on: jest.fn(),
      end: jest.fn<any>().mockResolvedValue(undefined)
    }));

    Knex = jest.fn<any>().mockImplementation(() => ({}));

    logger = {
      info: jest.fn<any>(),
      warn: jest.fn<any>(),
      error: jest.fn<any>()
    };

    jest.doMock('pg', () => ({ Pool }));
    jest.doMock('knex', () => Knex);
    jest.doMock('../../../src/utils/logger', () => ({ logger }));

    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_NAME = 'test_db';
    process.env.DB_USER = 'test_user';
    process.env.DB_PASSWORD = 'test_password';
  });

  afterEach(() => {
    process.env = mockEnv;
    jest.clearAllMocks();
  });

  describe('dbConfig', () => {
    it('should load configuration from environment variables', async () => {
      const { dbConfig } = await import('../../../src/config/database');

      expect(dbConfig.host).toBe('localhost');
      expect(dbConfig.port).toBe(5432);
      expect(dbConfig.database).toBe('test_db');
      expect(dbConfig.user).toBe('test_user');
      expect(dbConfig.password).toBe('test_password');
    });

    it('should use default pool settings when not provided', async () => {
      const { dbConfig } = await import('../../../src/config/database');

      expect(dbConfig.max).toBe(10);
      expect(dbConfig.min).toBe(2);
      expect(dbConfig.idleTimeoutMillis).toBe(30000);
      expect(dbConfig.connectionTimeoutMillis).toBe(5000);
    });

    it('should use custom pool settings when provided', async () => {
      process.env.DB_POOL_MAX = '20';
      process.env.DB_POOL_MIN = '5';
      process.env.DB_IDLE_TIMEOUT = '60000';
      process.env.DB_CONNECTION_TIMEOUT = '10000';

      jest.resetModules();
      const { dbConfig } = await import('../../../src/config/database');

      expect(dbConfig.max).toBe(20);
      expect(dbConfig.min).toBe(5);
      expect(dbConfig.idleTimeoutMillis).toBe(60000);
      expect(dbConfig.connectionTimeoutMillis).toBe(10000);
    });

    it('should configure SSL when DB_SSL is true', async () => {
      process.env.DB_SSL = 'true';

      jest.resetModules();
      const { dbConfig } = await import('../../../src/config/database');

      expect(dbConfig.ssl).toBeDefined();
      expect(dbConfig.ssl).toHaveProperty('rejectUnauthorized');
    });

    it('should not configure SSL when DB_SSL is false', async () => {
      process.env.DB_SSL = 'false';

      jest.resetModules();
      const { dbConfig } = await import('../../../src/config/database');

      expect(dbConfig.ssl).toBeUndefined();
    });

    it('should throw in production when DB_PASSWORD is missing', async () => {
      delete process.env.DB_PASSWORD;
      process.env.NODE_ENV = 'production';

      jest.resetModules();

      await expect(async () => {
        await import('../../../src/config/database');
      }).rejects.toThrow('FATAL: DB_PASSWORD environment variable is required in production');
    });

    it('should warn in development when DB_PASSWORD is missing', async () => {
      delete process.env.DB_PASSWORD;
      process.env.NODE_ENV = 'development';

      jest.resetModules();
      await import('../../../src/config/database');

      expect(logger.warn).toHaveBeenCalledWith(
        'DB_PASSWORD not set - this would fail in production'
      );
    });

    it('should throw in production when DB_HOST is missing', async () => {
      delete process.env.DB_HOST;
      process.env.NODE_ENV = 'production';

      jest.resetModules();

      await expect(async () => {
        await import('../../../src/config/database');
      }).rejects.toThrow('FATAL: Database configuration (DB_HOST, DB_NAME, DB_USER) is required');
    });

    it('should use development defaults when credentials missing in dev', async () => {
      delete process.env.DB_HOST;
      delete process.env.DB_NAME;
      delete process.env.DB_USER;
      process.env.NODE_ENV = 'development';

      jest.resetModules();
      const { dbConfig } = await import('../../../src/config/database');

      expect(dbConfig.host).toBe('postgres');
      expect(dbConfig.database).toBe('tickettoken_db');
      expect(dbConfig.user).toBe('postgres');
    });
  });

  describe('getConnectionString', () => {
    it('should generate valid connection string', async () => {
      const { getConnectionString } = await import('../../../src/config/database');

      const connStr = getConnectionString();

      expect(connStr).toBe('postgresql://test_user:test_password@localhost:5432/test_db');
    });

    it('should URL encode password with special characters', async () => {
      process.env.DB_PASSWORD = 'p@ssw0rd!#$';

      jest.resetModules();
      const { getConnectionString } = await import('../../../src/config/database');

      const connStr = getConnectionString();

      expect(connStr).toContain('p%40ssw0rd!%23%24');
    });

    it('should append SSL mode when SSL is enabled', async () => {
      process.env.DB_SSL = 'true';

      jest.resetModules();
      const { getConnectionString } = await import('../../../src/config/database');

      const connStr = getConnectionString();

      expect(connStr).toContain('?sslmode=require');
    });

    it('should throw when configuration is incomplete', async () => {
      delete process.env.DB_HOST;
      process.env.NODE_ENV = 'production';

      jest.resetModules();

      await expect(async () => {
        const { getConnectionString } = await import('../../../src/config/database');
        getConnectionString();
      }).rejects.toThrow();
    });
  });

  describe('getPool', () => {
    it('should create pool on first call', async () => {
      const { getPool } = await import('../../../src/config/database');

      const pool = getPool();

      expect(Pool).toHaveBeenCalledTimes(1);
      expect(pool).toBeDefined();
    });

    it('should return same pool on subsequent calls', async () => {
      const { getPool } = await import('../../../src/config/database');

      const pool1 = getPool();
      const pool2 = getPool();

      expect(Pool).toHaveBeenCalledTimes(1);
      expect(pool1).toBe(pool2);
    });

    it('should configure pool with correct settings', async () => {
      const { getPool } = await import('../../../src/config/database');

      getPool();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 5432,
          database: 'test_db',
          user: 'test_user',
          password: 'test_password',
          max: 10,
          min: 2
        })
      );
    });

    it('should register error handler on pool', async () => {
      const mockPool = {
        on: jest.fn<any>()
      };
      Pool.mockReturnValue(mockPool);

      const { getPool } = await import('../../../src/config/database');
      getPool();

      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should log errors from pool', async () => {
      const mockPool = {
        on: jest.fn<any>()
      };
      Pool.mockReturnValue(mockPool);

      const { getPool } = await import('../../../src/config/database');
      getPool();

      const errorHandler = mockPool.on.mock.calls[0][1] as (err: Error) => void;
      const testError = new Error('Connection lost');
      errorHandler(testError);

      expect(logger.error).toHaveBeenCalledWith(
        { error: 'Connection lost' },
        'Database pool error'
      );
    });
  });

  describe('closePool', () => {
    it('should close existing pool', async () => {
      const mockEnd = jest.fn<any>().mockResolvedValue(undefined);
      const mockPool = {
        on: jest.fn<any>(),
        end: mockEnd
      };
      Pool.mockReturnValue(mockPool);

      const { getPool, closePool } = await import('../../../src/config/database');
      getPool();

      await closePool();

      expect(mockEnd).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Database pool closed');
    });

    it('should handle null pool gracefully', async () => {
      const { closePool } = await import('../../../src/config/database');

      await expect(closePool()).resolves.not.toThrow();
    });

    it('should allow creating new pool after close', async () => {
      const mockEnd = jest.fn<any>().mockResolvedValue(undefined);
      const mockPool = {
        on: jest.fn<any>(),
        end: mockEnd
      };
      Pool.mockReturnValue(mockPool);

      const { getPool, closePool } = await import('../../../src/config/database');

      getPool();
      await closePool();
      getPool();

      expect(Pool).toHaveBeenCalledTimes(2);
    });
  });

  describe('db (Knex instance)', () => {
    it('should initialize Knex with correct configuration', async () => {
      await import('../../../src/config/database');

      expect(Knex).toHaveBeenCalledWith(
        expect.objectContaining({
          client: 'pg',
          connection: expect.objectContaining({
            host: 'localhost',
            port: 5432,
            database: 'test_db',
            user: 'test_user',
            password: 'test_password'
          }),
          pool: expect.objectContaining({
            min: 2,
            max: 10
          })
        })
      );
    });

    it('should pass SSL configuration to Knex', async () => {
      process.env.DB_SSL = 'true';

      jest.resetModules();
      await import('../../../src/config/database');

      expect(Knex).toHaveBeenCalledWith(
        expect.objectContaining({
          connection: expect.objectContaining({
            ssl: expect.objectContaining({
              rejectUnauthorized: true
            })
          })
        })
      );
    });
  });
});

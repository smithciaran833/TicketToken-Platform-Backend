// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/config/database.ts
 */

jest.mock('knex');
jest.mock('../../../src/utils/logger');

describe('src/config/database.ts - Comprehensive Unit Tests', () => {
  let knex: any;
  let logger: any;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };

    // Mock knex
    knex = require('knex');
    const mockDb = {
      raw: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] })
    };
    knex.mockReturnValue(mockDb);

    // Mock logger
    logger = require('../../../src/utils/logger').logger;
    logger.info = jest.fn();
    logger.error = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =============================================================================
  // dbConfig - Default Values
  // =============================================================================

  describe('dbConfig - Default Values', () => {
    it('should use postgresql client', () => {
      const { dbConfig } = require('../../../src/config/database');

      expect(dbConfig.client).toBe('postgresql');
    });

    it('should use default host when not set', () => {
      delete process.env.DB_HOST;
      jest.resetModules();

      const { dbConfig } = require('../../../src/config/database');

      expect(dbConfig.connection.host).toBe('postgres');
    });

    it('should use default port when not set', () => {
      delete process.env.DB_PORT;
      jest.resetModules();

      const { dbConfig } = require('../../../src/config/database');

      expect(dbConfig.connection.port).toBe(6432);
    });

    it('should use default database when not set', () => {
      delete process.env.DB_NAME;
      jest.resetModules();

      const { dbConfig } = require('../../../src/config/database');

      expect(dbConfig.connection.database).toBe('tickettoken_db');
    });

    it('should use default user when not set', () => {
      delete process.env.DB_USER;
      jest.resetModules();

      const { dbConfig } = require('../../../src/config/database');

      expect(dbConfig.connection.user).toBe('postgres');
    });

    it('should use default password when not set', () => {
      delete process.env.DB_PASSWORD;
      jest.resetModules();

      const { dbConfig } = require('../../../src/config/database');

      expect(dbConfig.connection.password).toBe('postgres');
    });

    it('should have pool min of 5', () => {
      const { dbConfig } = require('../../../src/config/database');

      expect(dbConfig.pool.min).toBe(5);
    });

    it('should have pool max of 20', () => {
      const { dbConfig } = require('../../../src/config/database');

      expect(dbConfig.pool.max).toBe(20);
    });
  });

  // =============================================================================
  // dbConfig - Environment Variable Override
  // =============================================================================

  describe('dbConfig - Environment Variable Override', () => {
    it('should use DB_HOST from environment', () => {
      process.env.DB_HOST = 'custom-host';
      jest.resetModules();

      const { dbConfig } = require('../../../src/config/database');

      expect(dbConfig.connection.host).toBe('custom-host');
    });

    it('should use DB_PORT from environment', () => {
      process.env.DB_PORT = '5433';
      jest.resetModules();

      const { dbConfig } = require('../../../src/config/database');

      expect(dbConfig.connection.port).toBe(5433);
    });

    it('should parse DB_PORT as integer', () => {
      process.env.DB_PORT = '9999';
      jest.resetModules();

      const { dbConfig } = require('../../../src/config/database');

      expect(typeof dbConfig.connection.port).toBe('number');
      expect(dbConfig.connection.port).toBe(9999);
    });

    it('should use DB_NAME from environment', () => {
      process.env.DB_NAME = 'custom_db';
      jest.resetModules();

      const { dbConfig } = require('../../../src/config/database');

      expect(dbConfig.connection.database).toBe('custom_db');
    });

    it('should use DB_USER from environment', () => {
      process.env.DB_USER = 'custom_user';
      jest.resetModules();

      const { dbConfig } = require('../../../src/config/database');

      expect(dbConfig.connection.user).toBe('custom_user');
    });

    it('should use DB_PASSWORD from environment', () => {
      process.env.DB_PASSWORD = 'secure_password';
      jest.resetModules();

      const { dbConfig } = require('../../../src/config/database');

      expect(dbConfig.connection.password).toBe('secure_password');
    });
  });

  // =============================================================================
  // db - Knex Instance
  // =============================================================================

  describe('db - Knex Instance', () => {
    it('should create knex instance with config', () => {
      const { db, dbConfig } = require('../../../src/config/database');

      expect(knex).toHaveBeenCalledWith(dbConfig);
    });

    it('should export db instance', () => {
      const { db } = require('../../../src/config/database');

      expect(db).toBeDefined();
    });

    it('should have raw method', () => {
      const { db } = require('../../../src/config/database');

      expect(db.raw).toBeDefined();
      expect(typeof db.raw).toBe('function');
    });
  });

  // =============================================================================
  // connectDatabase() - Success Cases
  // =============================================================================

  describe('connectDatabase() - Success Cases', () => {
    it('should execute SELECT 1 query', async () => {
      const { connectDatabase, db } = require('../../../src/config/database');

      await connectDatabase();

      expect(db.raw).toHaveBeenCalledWith('SELECT 1');
    });

    it('should log success message', async () => {
      const { connectDatabase } = require('../../../src/config/database');

      await connectDatabase();

      expect(logger.info).toHaveBeenCalledWith('Database connection established');
    });

    it('should not throw error on success', async () => {
      const { connectDatabase } = require('../../../src/config/database');

      await expect(connectDatabase()).resolves.not.toThrow();
    });

    it('should return void on success', async () => {
      const { connectDatabase } = require('../../../src/config/database');

      const result = await connectDatabase();

      expect(result).toBeUndefined();
    });
  });

  // =============================================================================
  // connectDatabase() - Error Cases
  // =============================================================================

  describe('connectDatabase() - Error Cases', () => {
    it('should log error on connection failure', async () => {
      const error = new Error('Connection failed');
      const { connectDatabase, db } = require('../../../src/config/database');
      db.raw.mockRejectedValueOnce(error);

      try {
        await connectDatabase();
      } catch (e) {}

      expect(logger.error).toHaveBeenCalledWith('Failed to connect to database:', error);
    });

    it('should throw error on connection failure', async () => {
      const error = new Error('Connection failed');
      const { connectDatabase, db } = require('../../../src/config/database');
      db.raw.mockRejectedValueOnce(error);

      await expect(connectDatabase()).rejects.toThrow('Connection failed');
    });

    it('should propagate original error', async () => {
      const error = new Error('Database unreachable');
      const { connectDatabase, db } = require('../../../src/config/database');
      db.raw.mockRejectedValueOnce(error);

      await expect(connectDatabase()).rejects.toThrow(error);
    });

    it('should handle timeout errors', async () => {
      const error = new Error('Connection timeout');
      const { connectDatabase, db } = require('../../../src/config/database');
      db.raw.mockRejectedValueOnce(error);

      await expect(connectDatabase()).rejects.toThrow('Connection timeout');
    });
  });

  // =============================================================================
  // Module Exports
  // =============================================================================

  describe('Module Exports', () => {
    it('should export dbConfig', () => {
      const module = require('../../../src/config/database');

      expect(module.dbConfig).toBeDefined();
      expect(typeof module.dbConfig).toBe('object');
    });

    it('should export db', () => {
      const module = require('../../../src/config/database');

      expect(module.db).toBeDefined();
    });

    it('should export connectDatabase', () => {
      const module = require('../../../src/config/database');

      expect(module.connectDatabase).toBeDefined();
      expect(typeof module.connectDatabase).toBe('function');
    });
  });
});

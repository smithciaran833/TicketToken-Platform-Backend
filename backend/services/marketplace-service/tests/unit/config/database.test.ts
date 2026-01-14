/**
 * Unit Tests for Database Configuration
 * Tests database connection, SSL configuration, and pool settings
 */

import { Knex } from 'knex';

// Mock knex before importing
const mockKnex = {
  raw: jest.fn(),
  destroy: jest.fn()
};

jest.mock('knex', () => {
  const knexFn = jest.fn().mockReturnValue(mockKnex);
  return knexFn;
});

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

describe('Database Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };
    mockKnex.raw.mockReset();
    mockKnex.destroy.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('database export', () => {
    it('should export db instance', () => {
      const { db } = require('../../../src/config/database');
      expect(db).toBeDefined();
    });

    it('should export default db instance', () => {
      const defaultDb = require('../../../src/config/database').default;
      const { db } = require('../../../src/config/database');
      expect(defaultDb).toBe(db);
    });
  });

  describe('connection configuration', () => {
    it('should use environment variables for connection', () => {
      process.env.DB_HOST = 'test-host';
      process.env.DB_PORT = '5433';
      process.env.DB_NAME = 'test_db';
      process.env.DB_USER = 'test_user';
      process.env.DB_PASSWORD = 'test_pass';
      
      jest.resetModules();
      const knex = require('knex');
      require('../../../src/config/database');
      
      expect(knex).toHaveBeenCalled();
      const config = knex.mock.calls[0][0];
      expect(config.client).toBe('postgresql');
      expect(config.connection.host).toBe('test-host');
      expect(config.connection.port).toBe(5433);
      expect(config.connection.database).toBe('test_db');
      expect(config.connection.user).toBe('test_user');
      expect(config.connection.password).toBe('test_pass');
    });

    it('should use default values when env vars not set', () => {
      delete process.env.DB_HOST;
      delete process.env.DB_PORT;
      delete process.env.DB_NAME;
      delete process.env.DB_USER;
      delete process.env.DB_PASSWORD;
      
      jest.resetModules();
      const knex = require('knex');
      require('../../../src/config/database');
      
      const config = knex.mock.calls[0][0];
      expect(config.connection.host).toBe('postgres');
      expect(config.connection.port).toBe(6432);
      expect(config.connection.database).toBe('tickettoken_db');
      expect(config.connection.user).toBe('postgres');
      expect(config.connection.password).toBe('');
    });
  });

  describe('SSL configuration', () => {
    it('should enable SSL when DB_SSL is true', () => {
      process.env.DB_SSL = 'true';
      process.env.NODE_ENV = 'development';
      
      jest.resetModules();
      const knex = require('knex');
      require('../../../src/config/database');
      
      const config = knex.mock.calls[0][0];
      expect(config.connection.ssl).toBeDefined();
    });

    it('should enable SSL in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DB_SSL;
      
      jest.resetModules();
      const knex = require('knex');
      require('../../../src/config/database');
      
      const config = knex.mock.calls[0][0];
      expect(config.connection.ssl).toBeDefined();
    });

    it('should not enable SSL in development when not explicitly set', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.DB_SSL;
      
      jest.resetModules();
      const knex = require('knex');
      require('../../../src/config/database');
      
      const config = knex.mock.calls[0][0];
      expect(config.connection.ssl).toBeUndefined();
    });

    it('should set rejectUnauthorized to true by default', () => {
      process.env.DB_SSL = 'true';
      delete process.env.DB_SSL_REJECT_UNAUTHORIZED;
      
      jest.resetModules();
      const knex = require('knex');
      require('../../../src/config/database');
      
      const config = knex.mock.calls[0][0];
      expect(config.connection.ssl.rejectUnauthorized).toBe(true);
    });

    it('should allow disabling rejectUnauthorized', () => {
      process.env.DB_SSL = 'true';
      process.env.DB_SSL_REJECT_UNAUTHORIZED = 'false';
      
      jest.resetModules();
      const knex = require('knex');
      require('../../../src/config/database');
      
      const config = knex.mock.calls[0][0];
      expect(config.connection.ssl.rejectUnauthorized).toBe(false);
    });

    it('should include CA certificate when provided', () => {
      process.env.DB_SSL = 'true';
      process.env.DB_SSL_CA = 'test-ca-cert';
      
      jest.resetModules();
      const knex = require('knex');
      require('../../../src/config/database');
      
      const config = knex.mock.calls[0][0];
      expect(config.connection.ssl.ca).toBe('test-ca-cert');
    });
  });

  describe('pool configuration', () => {
    it('should configure pool settings', () => {
      jest.resetModules();
      const knex = require('knex');
      require('../../../src/config/database');
      
      const config = knex.mock.calls[0][0];
      expect(config.pool).toBeDefined();
      expect(config.pool.min).toBe(2);
      expect(config.pool.max).toBe(10);
    });

    it('should set pool timeouts', () => {
      jest.resetModules();
      const knex = require('knex');
      require('../../../src/config/database');
      
      const config = knex.mock.calls[0][0];
      expect(config.pool.createTimeoutMillis).toBe(3000);
      expect(config.pool.acquireTimeoutMillis).toBe(30000);
      expect(config.pool.idleTimeoutMillis).toBe(30000);
    });
  });

  describe('migrations configuration', () => {
    it('should configure migrations directory', () => {
      jest.resetModules();
      const knex = require('knex');
      require('../../../src/config/database');
      
      const config = knex.mock.calls[0][0];
      expect(config.migrations.directory).toBe('./migrations');
      expect(config.migrations.extension).toBe('ts');
    });

    it('should configure seeds directory', () => {
      jest.resetModules();
      const knex = require('knex');
      require('../../../src/config/database');
      
      const config = knex.mock.calls[0][0];
      expect(config.seeds.directory).toBe('./seeds');
      expect(config.seeds.extension).toBe('ts');
    });
  });

  describe('testConnection', () => {
    it('should return true on successful connection', async () => {
      mockKnex.raw.mockResolvedValue(true);
      
      jest.resetModules();
      const { testConnection } = require('../../../src/config/database');
      
      const result = await testConnection();
      
      expect(result).toBe(true);
      expect(mockKnex.raw).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return false on connection failure', async () => {
      mockKnex.raw.mockRejectedValue(new Error('Connection failed'));
      
      jest.resetModules();
      const { testConnection } = require('../../../src/config/database');
      
      const result = await testConnection();
      
      expect(result).toBe(false);
    });

    it('should log success message on successful connection', async () => {
      mockKnex.raw.mockResolvedValue(true);
      
      jest.resetModules();
      const { testConnection } = require('../../../src/config/database');
      const { logger } = require('../../../src/utils/logger');
      
      await testConnection();
      
      expect(logger.info).toHaveBeenCalledWith('Database connection successful');
    });

    it('should log error on connection failure', async () => {
      const error = new Error('Connection failed');
      mockKnex.raw.mockRejectedValue(error);
      
      jest.resetModules();
      const { testConnection } = require('../../../src/config/database');
      const { logger } = require('../../../src/utils/logger');
      
      await testConnection();
      
      expect(logger.error).toHaveBeenCalledWith('Database connection failed:', error);
    });
  });

  describe('closeConnection', () => {
    it('should destroy the connection', async () => {
      mockKnex.destroy.mockResolvedValue(undefined);
      
      jest.resetModules();
      const { closeConnection } = require('../../../src/config/database');
      
      await closeConnection();
      
      expect(mockKnex.destroy).toHaveBeenCalled();
    });

    it('should log closure message', async () => {
      mockKnex.destroy.mockResolvedValue(undefined);
      
      jest.resetModules();
      const { closeConnection } = require('../../../src/config/database');
      const { logger } = require('../../../src/utils/logger');
      
      await closeConnection();
      
      expect(logger.info).toHaveBeenCalledWith('Database connection closed');
    });
  });

  describe('security logging', () => {
    it('should not log password in connection info', () => {
      process.env.DB_PASSWORD = 'super-secret-password';
      
      jest.resetModules();
      const { logger } = require('../../../src/utils/logger');
      require('../../../src/config/database');
      
      // Check that password is not in any log call
      const logCalls = (logger.info as jest.Mock).mock.calls;
      const loggedStrings = logCalls.map(call => JSON.stringify(call));
      
      loggedStrings.forEach(str => {
        expect(str).not.toContain('super-secret-password');
      });
    });

    it('should log SSL status', () => {
      process.env.DB_SSL = 'true';
      
      jest.resetModules();
      const { logger } = require('../../../src/utils/logger');
      require('../../../src/config/database');
      
      expect(logger.info).toHaveBeenCalledWith('DB Connection attempt:', expect.objectContaining({
        ssl: 'enabled'
      }));
    });
  });
});

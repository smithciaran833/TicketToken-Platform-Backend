// =============================================================================
// TEST SUITE: knexfile.js Configuration
// =============================================================================

describe('knexfile.js', () => {
  const configPath = '../../../src/config/knexfile.js';

  beforeEach(() => {
    // Clear require cache before each test
    jest.resetModules();
  });

  // ===========================================================================
  // Configuration Structure - 3 test cases
  // ===========================================================================

  describe('Configuration Structure', () => {
    it('should export correct client type', () => {
      const config = require(configPath);
      
      expect(config.client).toBe('postgresql');
    });

    it('should have pool configuration', () => {
      const config = require(configPath);
      
      expect(config.pool).toEqual({
        min: 2,
        max: 10,
      });
    });

    it('should have connection configuration', () => {
      const config = require(configPath);
      
      expect(config).toHaveProperty('connection');
    });
  });

  // ===========================================================================
  // DATABASE_URL Priority - 2 test cases
  // ===========================================================================

  describe('DATABASE_URL Priority', () => {
    it('should use DATABASE_URL when provided', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/testdb';
      jest.resetModules();
      
      const config = require(configPath);
      
      expect(config.connection).toBe('postgresql://user:pass@localhost:5432/testdb');
      
      delete process.env.DATABASE_URL;
    });

    it('should use individual env vars when DATABASE_URL not provided', () => {
      delete process.env.DATABASE_URL;
      process.env.DB_HOST = 'testhost';
      process.env.DB_PORT = '5433';
      process.env.DB_USER = 'testuser';
      process.env.DB_PASSWORD = 'testpass';
      process.env.DB_NAME = 'testdb';
      jest.resetModules();
      
      const config = require(configPath);
      
      expect(config.connection).toEqual({
        host: 'testhost',
        port: '5433',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb',
      });
      
      delete process.env.DB_HOST;
      delete process.env.DB_PORT;
      delete process.env.DB_USER;
      delete process.env.DB_PASSWORD;
      delete process.env.DB_NAME;
    });
  });

  // ===========================================================================
  // Default Values - 5 test cases
  // ===========================================================================

  describe('Default Values', () => {
    beforeEach(() => {
      delete process.env.DATABASE_URL;
      delete process.env.DB_HOST;
      delete process.env.DB_PORT;
      delete process.env.DB_USER;
      delete process.env.DB_PASSWORD;
      delete process.env.DB_NAME;
    });

    it('should use default host when DB_HOST not set', () => {
      jest.resetModules();
      const config = require(configPath);
      
      expect(config.connection.host).toBe('postgres');
    });

    it('should use default port when DB_PORT not set', () => {
      jest.resetModules();
      const config = require(configPath);
      
      expect(config.connection.port).toBe(5432);
    });

    it('should use default user when DB_USER not set', () => {
      jest.resetModules();
      const config = require(configPath);
      
      expect(config.connection.user).toBe('postgres');
    });

    it('should use default password when DB_PASSWORD not set', () => {
      jest.resetModules();
      const config = require(configPath);
      
      expect(config.connection.password).toBe('postgres');
    });

    it('should use default database when DB_NAME not set', () => {
      jest.resetModules();
      const config = require(configPath);
      
      expect(config.connection.database).toBe('tickettoken_db');
    });
  });

  // ===========================================================================
  // Environment Variable Override - 5 test cases
  // ===========================================================================

  describe('Environment Variable Override', () => {
    beforeEach(() => {
      delete process.env.DATABASE_URL;
    });

    it('should override host with DB_HOST', () => {
      process.env.DB_HOST = 'custom-host';
      jest.resetModules();
      
      const config = require(configPath);
      
      expect(config.connection.host).toBe('custom-host');
      
      delete process.env.DB_HOST;
    });

    it('should override port with DB_PORT', () => {
      process.env.DB_PORT = '9999';
      jest.resetModules();
      
      const config = require(configPath);
      
      expect(config.connection.port).toBe('9999');
      
      delete process.env.DB_PORT;
    });

    it('should override user with DB_USER', () => {
      process.env.DB_USER = 'custom-user';
      jest.resetModules();
      
      const config = require(configPath);
      
      expect(config.connection.user).toBe('custom-user');
      
      delete process.env.DB_USER;
    });

    it('should override password with DB_PASSWORD', () => {
      process.env.DB_PASSWORD = 'custom-pass';
      jest.resetModules();
      
      const config = require(configPath);
      
      expect(config.connection.password).toBe('custom-pass');
      
      delete process.env.DB_PASSWORD;
    });

    it('should override database with DB_NAME', () => {
      process.env.DB_NAME = 'custom-db';
      jest.resetModules();
      
      const config = require(configPath);
      
      expect(config.connection.database).toBe('custom-db');
      
      delete process.env.DB_NAME;
    });
  });

  // ===========================================================================
  // Pool Configuration - 2 test cases
  // ===========================================================================

  describe('Pool Configuration', () => {
    it('should set minimum pool connections to 2', () => {
      const config = require(configPath);
      
      expect(config.pool.min).toBe(2);
    });

    it('should set maximum pool connections to 10', () => {
      const config = require(configPath);
      
      expect(config.pool.max).toBe(10);
    });
  });
});

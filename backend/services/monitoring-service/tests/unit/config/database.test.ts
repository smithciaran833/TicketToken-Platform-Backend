describe('Database Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    delete require.cache[require.resolve('../../../src/config/database')];
  });

  describe('Database Connection Configuration', () => {
    it('should create database instance with default configuration', () => {
      delete process.env.DB_HOST;
      delete process.env.DB_PORT;
      delete process.env.DB_NAME;
      delete process.env.DB_USER;
      delete process.env.DB_PASSWORD;

      const { db } = require('../../../src/config/database');

      expect(db).toBeDefined();
      expect(db.client.config.client).toBe('postgresql');
    });

    it('should use environment variables for database configuration', () => {
      process.env.DB_HOST = 'custom-db-host';
      process.env.DB_PORT = '5433';
      process.env.DB_NAME = 'custom_database';
      process.env.DB_USER = 'custom_user';
      process.env.DB_PASSWORD = 'custom_password';

      const { db } = require('../../../src/config/database');

      const config = db.client.config.connection;
      expect(config.host).toBe('custom-db-host');
      expect(config.port).toBe(5433);
      expect(config.database).toBe('custom_database');
      expect(config.user).toBe('custom_user');
      expect(config.password).toBe('custom_password');
    });

    it('should configure connection pool with min 2 and max 10', () => {
      const { db } = require('../../../src/config/database');

      const poolConfig = db.client.config.pool;
      expect(poolConfig.min).toBe(2);
      expect(poolConfig.max).toBe(10);
    });

    it('should configure migrations with correct table name', () => {
      const { db } = require('../../../src/config/database');

      const migrations = db.client.config.migrations;
      expect(migrations.tableName).toBe('knex_migrations_monitoring');
      expect(migrations.extension).toBe('js');
    });

    it('should set migrations directory', () => {
      const { db } = require('../../../src/config/database');

      const migrations = db.client.config.migrations;
      expect(migrations.directory).toContain('migrations');
      expect(migrations.directory).not.toContain('node_modules');
    });
  });

  describe('Environment Variable Parsing', () => {
    it('should parse DB_PORT as integer', () => {
      process.env.DB_PORT = '5433';

      const { db } = require('../../../src/config/database');

      const config = db.client.config.connection;
      expect(typeof config.port).toBe('number');
      expect(config.port).toBe(5433);
    });

    it('should handle non-numeric DB_PORT with default', () => {
      process.env.DB_PORT = 'invalid';

      const { db } = require('../../../src/config/database');

      const config = db.client.config.connection;
      // parseInt('invalid') returns NaN, which becomes 6432 (default)
      expect(config.port).toBe(6432);
    });

    it('should handle empty DB_PORT with default', () => {
      process.env.DB_PORT = '';

      const { db } = require('../../../src/config/database');

      const config = db.client.config.connection;
      expect(config.port).toBe(6432);
    });

    it('should handle undefined DB_PORT with default', () => {
      delete process.env.DB_PORT;

      const { db } = require('../../../src/config/database');

      const config = db.client.config.connection;
      expect(config.port).toBe(6432);
    });
  });

  describe('Default Values', () => {
    beforeEach(() => {
      delete process.env.DB_HOST;
      delete process.env.DB_PORT;
      delete process.env.DB_NAME;
      delete process.env.DB_USER;
      delete process.env.DB_PASSWORD;
    });

    it('should use localhost as default host', () => {
      const { db } = require('../../../src/config/database');

      const config = db.client.config.connection;
      expect(config.host).toBe('localhost');
    });

    it('should use 6432 as default port', () => {
      const { db } = require('../../../src/config/database');

      const config = db.client.config.connection;
      expect(config.port).toBe(6432);
    });

    it('should use tickettoken_db as default database name', () => {
      const { db } = require('../../../src/config/database');

      const config = db.client.config.connection;
      expect(config.database).toBe('tickettoken_db');
    });

    it('should use postgres as default user', () => {
      const { db } = require('../../../src/config/database');

      const config = db.client.config.connection;
      expect(config.user).toBe('postgres');
    });

    it('should use postgres as default password', () => {
      const { db } = require('../../../src/config/database');

      const config = db.client.config.connection;
      expect(config.password).toBe('postgres');
    });
  });

  describe('Module Exports', () => {
    it('should export db as named export', () => {
      const { db } = require('../../../src/config/database');

      expect(db).toBeDefined();
      expect(db.client).toBeDefined();
    });

    it('should export db as default export', () => {
      const dbDefault = require('../../../src/config/database').default;

      expect(dbDefault).toBeDefined();
      expect(dbDefault.client).toBeDefined();
    });

    it('should have same instance for named and default export', () => {
      const module = require('../../../src/config/database');

      expect(module.db).toBe(module.default);
    });
  });

  describe('Port Edge Cases', () => {
    it('should handle port 0', () => {
      process.env.DB_PORT = '0';

      const { db } = require('../../../src/config/database');

      const config = db.client.config.connection;
      expect(config.port).toBe(0);
    });

    it('should handle negative port', () => {
      process.env.DB_PORT = '-1';

      const { db } = require('../../../src/config/database');

      const config = db.client.config.connection;
      expect(config.port).toBe(-1);
    });

    it('should handle very large port numbers', () => {
      process.env.DB_PORT = '65535';

      const { db } = require('../../../src/config/database');

      const config = db.client.config.connection;
      expect(config.port).toBe(65535);
    });

    it('should handle decimal port by truncating', () => {
      process.env.DB_PORT = '5432.7';

      const { db } = require('../../../src/config/database');

      const config = db.client.config.connection;
      expect(config.port).toBe(5432);
    });
  });

  describe('String Handling', () => {
    it('should handle empty string for host', () => {
      process.env.DB_HOST = '';

      const { db } = require('../../../src/config/database');

      const config = db.client.config.connection;
      expect(config.host).toBe('localhost');
    });

    it('should handle whitespace-only string for host', () => {
      process.env.DB_HOST = '   ';

      const { db } = require('../../../src/config/database');

      const config = db.client.config.connection;
      expect(config.host).toBe('   ');
    });

    it('should preserve special characters in password', () => {
      process.env.DB_PASSWORD = 'P@ssw0rd!#$%^&*()';

      const { db } = require('../../../src/config/database');

      const config = db.client.config.connection;
      expect(config.password).toBe('P@ssw0rd!#$%^&*()');
    });

    it('should handle unicode characters in credentials', () => {
      process.env.DB_USER = 'user_αβγ';
      process.env.DB_PASSWORD = 'pass_你好';

      const { db } = require('../../../src/config/database');

      const config = db.client.config.connection;
      expect(config.user).toBe('user_αβγ');
      expect(config.password).toBe('pass_你好');
    });
  });

  describe('PostgreSQL Client', () => {
    it('should use postgresql as client', () => {
      const { db } = require('../../../src/config/database');

      expect(db.client.config.client).toBe('postgresql');
    });

    it('should have knex methods available', () => {
      const { db } = require('../../../src/config/database');

      expect(typeof db.select).toBe('function');
      expect(typeof db.insert).toBe('function');
      expect(typeof db.update).toBe('function');
      expect(typeof db.delete).toBe('function');
      expect(typeof db.raw).toBe('function');
    });
  });
});

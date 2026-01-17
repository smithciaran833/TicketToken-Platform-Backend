// Mock dependencies
jest.mock('pg');
jest.mock('knex');

describe('config/database', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };

    // Clear module cache
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('pool', () => {
    it('should create Pool with default configuration', () => {
      const { Pool } = require('pg');
      
      delete process.env.DB_HOST;
      delete process.env.DB_PORT;
      delete process.env.DB_NAME;
      delete process.env.DB_USER;
      delete process.env.DB_PASSWORD;

      require('../../../src/config/database');

      expect(Pool).toHaveBeenCalledWith({
        host: 'postgres',
        port: 6432,
        database: 'tickettoken_db',
        user: 'postgres',
        password: 'postgres',
      });
    });

    it('should create Pool with environment variables', () => {
      const { Pool } = require('pg');
      
      process.env.DB_HOST = 'custom-host';
      process.env.DB_PORT = '5555';
      process.env.DB_NAME = 'custom_db';
      process.env.DB_USER = 'custom_user';
      process.env.DB_PASSWORD = 'custom_password';

      require('../../../src/config/database');

      expect(Pool).toHaveBeenCalledWith({
        host: 'custom-host',
        port: 5555,
        database: 'custom_db',
        user: 'custom_user',
        password: 'custom_password',
      });
    });

    it('should parse DB_PORT as integer', () => {
      const { Pool } = require('pg');
      
      process.env.DB_PORT = '9999';

      require('../../../src/config/database');

      expect(Pool).toHaveBeenCalledWith(expect.objectContaining({
        port: 9999,
      }));
    });

    it('should handle invalid DB_PORT gracefully', () => {
      const { Pool } = require('pg');
      
      process.env.DB_PORT = 'invalid';

      require('../../../src/config/database');

      expect(Pool).toHaveBeenCalledWith(expect.objectContaining({
        port: NaN,
      }));
    });

    it('should export pool instance', () => {
      const { pool } = require('../../../src/config/database');

      expect(pool).toBeDefined();
    });
  });

  describe('db (knex instance)', () => {
    it('should create knex instance with pg client', () => {
      const knex = require('knex');

      require('../../../src/config/database');

      expect(knex).toHaveBeenCalledWith(expect.objectContaining({
        client: 'pg',
      }));
    });

    it('should create knex with default connection config', () => {
      delete process.env.DB_HOST;
      delete process.env.DB_PORT;
      delete process.env.DB_NAME;
      delete process.env.DB_USER;
      delete process.env.DB_PASSWORD;

      const knex = require('knex');

      require('../../../src/config/database');

      expect(knex).toHaveBeenCalledWith(expect.objectContaining({
        connection: {
          host: 'postgres',
          port: 6432,
          database: 'tickettoken_db',
          user: 'postgres',
          password: 'postgres',
        },
      }));
    });

    it('should create knex with environment variables', () => {
      process.env.DB_HOST = 'knex-host';
      process.env.DB_PORT = '7777';
      process.env.DB_NAME = 'knex_db';
      process.env.DB_USER = 'knex_user';
      process.env.DB_PASSWORD = 'knex_password';

      const knex = require('knex');

      require('../../../src/config/database');

      expect(knex).toHaveBeenCalledWith(expect.objectContaining({
        connection: {
          host: 'knex-host',
          port: 7777,
          database: 'knex_db',
          user: 'knex_user',
          password: 'knex_password',
        },
      }));
    });

    it('should parse connection port as integer', () => {
      process.env.DB_PORT = '8888';

      const knex = require('knex');

      require('../../../src/config/database');

      expect(knex).toHaveBeenCalledWith(expect.objectContaining({
        connection: expect.objectContaining({
          port: 8888,
        }),
      }));
    });

    it('should export db instance', () => {
      const knex = require('knex');
      knex.mockReturnValue({ client: 'mock-knex' });
      
      const { db } = require('../../../src/config/database');

      expect(db).toBeDefined();
    });
  });

  describe('configuration consistency', () => {
    it('should use same values for pool and knex', () => {
      const { Pool } = require('pg');
      const knex = require('knex');
      
      process.env.DB_HOST = 'shared-host';
      process.env.DB_PORT = '3333';
      process.env.DB_NAME = 'shared_db';
      process.env.DB_USER = 'shared_user';
      process.env.DB_PASSWORD = 'shared_password';

      require('../../../src/config/database');

      const poolCall = Pool.mock.calls[0]?.[0];
      const knexCall = knex.mock.calls[0][0].connection;

      expect(poolCall?.host).toBe(knexCall.host);
      expect(poolCall?.port).toBe(knexCall.port);
      expect(poolCall?.database).toBe(knexCall.database);
      expect(poolCall?.user).toBe(knexCall.user);
      expect(poolCall?.password).toBe(knexCall.password);
    });

    it('should both use default values when no env vars set', () => {
      const { Pool } = require('pg');
      const knex = require('knex');
      
      delete process.env.DB_HOST;
      delete process.env.DB_PORT;
      delete process.env.DB_NAME;
      delete process.env.DB_USER;
      delete process.env.DB_PASSWORD;

      require('../../../src/config/database');

      const poolCall = Pool.mock.calls[0]?.[0];
      const knexCall = knex.mock.calls[0][0].connection;

      expect(poolCall).toEqual(knexCall);
    });
  });
});

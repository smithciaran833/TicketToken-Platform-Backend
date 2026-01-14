/**
 * Comprehensive Unit Tests for src/utils/database.ts
 * 
 * Tests database connection and query utilities
 */

// Mock pg BEFORE imports
const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockEnd = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();

const mockPoolInstance = {
  query: mockQuery,
  connect: mockConnect,
  end: mockEnd,
  on: jest.fn(),
  totalCount: 10,
  idleCount: 5,
  waitingCount: 2,
};

const mockClient = {
  query: mockClientQuery,
  release: mockClientRelease,
};

const mockPool = jest.fn(() => mockPoolInstance);

jest.mock('pg', () => ({
  Pool: mockPool,
}));

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  default: mockLogger,
  __esModule: true,
}));

describe('src/utils/database.ts - Comprehensive Unit Tests', () => {
  
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };
    mockConnect.mockResolvedValue(mockClient);
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // =============================================================================
  // CONFIGURATION VALIDATION
  // =============================================================================

  describe('configuration validation', () => {
    it('should validate required env vars in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DB_HOST;

      expect(() => {
        require('../../../src/utils/database');
      }).toThrow('Missing required database environment variables in production');
    });

    it('should pass validation when all required vars are set in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.DB_HOST = 'localhost';
      process.env.DB_USER = 'user';
      process.env.DB_PASSWORD = 'secure_password';
      process.env.DB_NAME = 'testdb';

      expect(() => {
        require('../../../src/utils/database');
      }).not.toThrow();
    });

    it('should not require all vars in development', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.DB_HOST;

      expect(() => {
        require('../../../src/utils/database');
      }).not.toThrow();
    });

    it('should reject default password "postgres" in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.DB_HOST = 'localhost';
      process.env.DB_USER = 'user';
      process.env.DB_PASSWORD = 'postgres';
      process.env.DB_NAME = 'testdb';

      expect(() => {
        require('../../../src/utils/database');
      }).toThrow('Insecure default database password detected in production');
    });

    it('should reject default password "password" in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.DB_HOST = 'localhost';
      process.env.DB_USER = 'user';
      process.env.DB_PASSWORD = 'password';
      process.env.DB_NAME = 'testdb';

      expect(() => {
        require('../../../src/utils/database');
      }).toThrow('Insecure default database password detected in production');
    });

    it('should warn about default password in development', () => {
      process.env.NODE_ENV = 'development';
      process.env.DB_PASSWORD = 'postgres';

      require('../../../src/utils/database');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('insecure default database password')
      );
    });
  });

  // =============================================================================
  // SSL CONFIGURATION
  // =============================================================================

  describe('SSL configuration', () => {
    it('should enable SSL in production by default', () => {
      process.env.NODE_ENV = 'production';
      process.env.DB_HOST = 'localhost';
      process.env.DB_USER = 'user';
      process.env.DB_PASSWORD = 'secure_pass';
      process.env.DB_NAME = 'testdb';

      require('../../../src/utils/database');

      expect(mockPool).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: expect.objectContaining({
            rejectUnauthorized: true,
          }),
        })
      );
    });

    it('should disable SSL in development by default', () => {
      process.env.NODE_ENV = 'development';

      require('../../../src/utils/database');

      expect(mockPool).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: false,
        })
      );
    });

    it('should enable SSL when DB_SSL=true', () => {
      process.env.NODE_ENV = 'development';
      process.env.DB_SSL = 'true';

      require('../../../src/utils/database');

      expect(mockPool).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: expect.objectContaining({
            rejectUnauthorized: true,
          }),
        })
      );
    });

    it('should allow disabling SSL cert verification', () => {
      process.env.NODE_ENV = 'production';
      process.env.DB_HOST = 'localhost';
      process.env.DB_USER = 'user';
      process.env.DB_PASSWORD = 'secure_pass';
      process.env.DB_NAME = 'testdb';
      process.env.DB_SSL_REJECT_UNAUTHORIZED = 'false';

      require('../../../src/utils/database');

      expect(mockPool).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: expect.objectContaining({
            rejectUnauthorized: false,
          }),
        })
      );
    });

    it('should include CA cert when provided', () => {
      process.env.NODE_ENV = 'production';
      process.env.DB_HOST = 'localhost';
      process.env.DB_USER = 'user';
      process.env.DB_PASSWORD = 'secure_pass';
      process.env.DB_NAME = 'testdb';
      process.env.DB_CA_CERT = 'CA_CERT_CONTENT';

      require('../../../src/utils/database');

      expect(mockPool).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: expect.objectContaining({
            ca: 'CA_CERT_CONTENT',
          }),
        })
      );
    });
  });

  // =============================================================================
  // POOL CONFIGURATION
  // =============================================================================

  describe('pool configuration', () => {
    it('should use environment variables for pool settings', () => {
      process.env.DB_POOL_MIN = '5';
      process.env.DB_POOL_MAX = '30';
      process.env.DB_IDLE_TIMEOUT_MS = '60000';
      process.env.DB_CONNECTION_TIMEOUT_MS = '20000';
      process.env.DB_QUERY_TIMEOUT_MS = '45000';

      require('../../../src/utils/database');

      expect(mockPool).toHaveBeenCalledWith(
        expect.objectContaining({
          min: 5,
          max: 30,
          idleTimeoutMillis: 60000,
          connectionTimeoutMillis: 20000,
          statement_timeout: 45000,
        })
      );
    });

    it('should use default pool settings', () => {
      delete process.env.DB_POOL_MIN;
      delete process.env.DB_POOL_MAX;

      require('../../../src/utils/database');

      expect(mockPool).toHaveBeenCalledWith(
        expect.objectContaining({
          min: 2,
          max: 20,
        })
      );
    });

    it('should use default database connection values', () => {
      delete process.env.DB_HOST;
      delete process.env.DB_PORT;
      delete process.env.DB_NAME;
      delete process.env.DB_USER;

      require('../../../src/utils/database');

      expect(mockPool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'postgres',
          port: 5432,
          database: 'tickettoken_db',
          user: 'svc_blockchain_indexer',
        })
      );
    });
  });

  // =============================================================================
  // QUERY EXECUTION
  // =============================================================================

  describe('query()', () => {
    it('should execute query successfully', async () => {
      const { query } = require('../../../src/utils/database');
      mockQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

      const result = await query('SELECT * FROM users');

      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users', undefined);
      expect(result.rows).toEqual([{ id: 1 }]);
    });

    it('should execute query with parameters', async () => {
      const { query } = require('../../../src/utils/database');
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await query('SELECT * FROM users WHERE id = $1', [123]);

      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [123]);
    });

    it('should log slow queries', async () => {
      // Set env var BEFORE requiring module
      process.env.DB_SLOW_QUERY_THRESHOLD_MS = '100';
      const { query } = require('../../../src/utils/database');
      
      mockQuery.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ rows: [], rowCount: 0 }), 150))
      );

      await query('SELECT * FROM large_table');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          duration: expect.any(Number),
          threshold: 100,
        }),
        'Slow query detected'
      );
    });

    it('should not log fast queries', async () => {
      const { query } = require('../../../src/utils/database');
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await query('SELECT 1');

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should log and throw on query error', async () => {
      const { query } = require('../../../src/utils/database');
      const error = new Error('Query failed');
      mockQuery.mockRejectedValue(error);

      await expect(query('INVALID SQL')).rejects.toThrow('Query failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should sanitize query in error logs', async () => {
      const { query } = require('../../../src/utils/database');
      const error = new Error('Query failed');
      mockQuery.mockRejectedValue(error);

      await expect(query("SELECT * FROM users WHERE password = 'verylongpasswordthatshouldberedacted123456789'")).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining('[REDACTED]'),
        }),
        'Database query failed'
      );
    });
  });

  // =============================================================================
  // QUERY WITH TIMEOUT
  // =============================================================================

  describe('queryWithTimeout()', () => {
    it('should execute query with custom timeout', async () => {
      const { queryWithTimeout } = require('../../../src/utils/database');
      mockClientQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

      const result = await queryWithTimeout('SELECT * FROM users', [], 5000);

      expect(mockClientQuery).toHaveBeenCalledWith('SET statement_timeout = 5000');
      expect(mockClientQuery).toHaveBeenCalledWith('SELECT * FROM users', []);
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should use default timeout', async () => {
      const { queryWithTimeout } = require('../../../src/utils/database');
      mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await queryWithTimeout('SELECT 1');

      expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('statement_timeout'));
    });

    it('should release client even on error', async () => {
      const { queryWithTimeout } = require('../../../src/utils/database');
      mockClientQuery.mockRejectedValueOnce(new Error('Timeout'));

      await expect(queryWithTimeout('SELECT * FROM users')).rejects.toThrow();
      expect(mockClientRelease).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // CLIENT MANAGEMENT
  // =============================================================================

  describe('getClient()', () => {
    it('should return a client from pool', async () => {
      const { getClient } = require('../../../src/utils/database');

      const client = await getClient();

      expect(mockConnect).toHaveBeenCalled();
      expect(client).toBe(mockClient);
    });
  });

  // =============================================================================
  // TRANSACTIONS
  // =============================================================================

  describe('withTransaction()', () => {
    it('should execute function within transaction', async () => {
      const { withTransaction } = require('../../../src/utils/database');
      const fn = jest.fn().mockResolvedValue('result');

      const result = await withTransaction(fn);

      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(fn).toHaveBeenCalledWith(mockClient);
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(mockClientRelease).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should rollback on error', async () => {
      const { withTransaction } = require('../../../src/utils/database');
      const error = new Error('Transaction failed');
      const fn = jest.fn().mockRejectedValue(error);

      await expect(withTransaction(fn)).rejects.toThrow('Transaction failed');

      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should release client even if commit fails', async () => {
      const { withTransaction } = require('../../../src/utils/database');
      const fn = jest.fn().mockResolvedValue('result');
      mockClientQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockRejectedValueOnce(new Error('Commit failed')); // COMMIT fails

      await expect(withTransaction(fn)).rejects.toThrow('Commit failed');
      expect(mockClientRelease).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // TENANT CONTEXT
  // =============================================================================

  describe('withTenantContext()', () => {
    it('should execute function with tenant context', async () => {
      const { withTenantContext } = require('../../../src/utils/database');
      // Use valid UUIDv4 format: version 4 (has '4' in 3rd group) and variant bits (8/9/a/b in 4th group)
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const fn = jest.fn().mockResolvedValue('result');

      const result = await withTenantContext(tenantId, fn);

      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = $1',
        [tenantId]
      );
      expect(fn).toHaveBeenCalledWith(mockClient);
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(result).toBe('result');
    });

    it('should validate tenant ID format', async () => {
      const { withTenantContext } = require('../../../src/utils/database');
      const invalidTenantId = 'invalid-uuid';
      const fn = jest.fn();

      await expect(withTenantContext(invalidTenantId, fn)).rejects.toThrow('Invalid tenant ID format');
      expect(fn).not.toHaveBeenCalled();
    });

    it('should rollback on error', async () => {
      const { withTenantContext } = require('../../../src/utils/database');
      // Use valid UUIDv4
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const error = new Error('Query failed');
      const fn = jest.fn().mockRejectedValue(error);

      await expect(withTenantContext(tenantId, fn)).rejects.toThrow('Query failed');

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should accept UUID v4 format', async () => {
      const { withTenantContext } = require('../../../src/utils/database');
      // Both must be valid UUIDv4 (version 4 and variant bits)
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
      ];
      const fn = jest.fn().mockResolvedValue('result');

      for (const uuid of validUUIDs) {
        await withTenantContext(uuid, fn);
        expect(fn).toHaveBeenCalled();
        jest.clearAllMocks();
      }
    });

    it('should reject non-UUID strings', async () => {
      const { withTenantContext } = require('../../../src/utils/database');
      const invalidIds = [
        'not-a-uuid',
        '12345',
        '',
        '123e4567-e89b-12d3-a456-42661417400', // too short
      ];
      const fn = jest.fn();

      for (const id of invalidIds) {
        await expect(withTenantContext(id, fn)).rejects.toThrow('Invalid tenant ID format');
      }
    });
  });

  // =============================================================================
  // HEALTH CHECK
  // =============================================================================

  describe('getDatabaseHealth()', () => {
    it('should return healthy status', async () => {
      const { getDatabaseHealth } = require('../../../src/utils/database');
      mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 });

      const health = await getDatabaseHealth();

      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.poolInfo).toEqual({
        total: 10,
        idle: 5,
        waiting: 2,
      });
    });

    it('should return unhealthy status on error', async () => {
      const { getDatabaseHealth } = require('../../../src/utils/database');
      mockQuery.mockRejectedValue(new Error('Connection failed'));

      const health = await getDatabaseHealth();

      expect(health.healthy).toBe(false);
      expect(health.poolInfo).toEqual({ total: 0, idle: 0, waiting: 0 });
    });

    it('should include SSL status', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DB_HOST = 'localhost';
      process.env.DB_USER = 'user';
      process.env.DB_PASSWORD = 'secure_pass';
      process.env.DB_NAME = 'testdb';

      const { getDatabaseHealth } = require('../../../src/utils/database');
      mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 });

      const health = await getDatabaseHealth();

      expect(health.ssl).toBe(true);
    });
  });

  // =============================================================================
  // CLOSE DATABASE
  // =============================================================================

  describe('closeDatabase()', () => {
    it('should close database pool', async () => {
      const { closeDatabase } = require('../../../src/utils/database');
      mockEnd.mockResolvedValue(undefined);

      await closeDatabase();

      expect(mockEnd).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Database pool closed');
    });

    it('should handle close errors gracefully', async () => {
      const { closeDatabase } = require('../../../src/utils/database');
      mockEnd.mockRejectedValue(new Error('Close failed'));

      await expect(closeDatabase()).rejects.toThrow('Close failed');
    });
  });

  // =============================================================================
  // POOL EVENT HANDLERS
  // =============================================================================

  describe('pool event handlers', () => {
    it('should register error handler', () => {
      require('../../../src/utils/database');

      expect(mockPoolInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should register connect handler', () => {
      require('../../../src/utils/database');

      expect(mockPoolInstance.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });

    it('should register acquire handler', () => {
      require('../../../src/utils/database');

      expect(mockPoolInstance.on).toHaveBeenCalledWith('acquire', expect.any(Function));
    });

    it('should register remove handler', () => {
      require('../../../src/utils/database');

      expect(mockPoolInstance.on).toHaveBeenCalledWith('remove', expect.any(Function));
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('exports', () => {
    it('should export query function', () => {
      const db = require('../../../src/utils/database');
      expect(db.query).toBeDefined();
      expect(typeof db.query).toBe('function');
    });

    it('should export pool instance', () => {
      const db = require('../../../src/utils/database');
      expect(db.pool).toBeDefined();
    });

    it('should export all utility functions', () => {
      const db = require('../../../src/utils/database');
      expect(db.getClient).toBeDefined();
      expect(db.queryWithTimeout).toBeDefined();
      expect(db.withTransaction).toBeDefined();
      expect(db.withTenantContext).toBeDefined();
      expect(db.getDatabaseHealth).toBeDefined();
      expect(db.closeDatabase).toBeDefined();
    });

    it('should export default object with all functions', () => {
      const db = require('../../../src/utils/database');
      expect(db.default).toBeDefined();
      expect(db.default.query).toBeDefined();
      expect(db.default.pool).toBeDefined();
    });
  });

});

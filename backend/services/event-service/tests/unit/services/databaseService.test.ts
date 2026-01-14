/**
 * Unit tests for DatabaseService
 * Tests pg Pool initialization and management
 */

// Mock pg Pool before imports
const mockQuery = jest.fn();
const mockPool = {
  query: mockQuery,
  end: jest.fn(),
};

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => mockPool),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { Pool } from 'pg';

describe('DatabaseService', () => {
  let DatabaseService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [{ now: new Date() }] });
    
    // Reset module to get fresh instance
    jest.resetModules();
    
    // Re-apply mocks after reset
    jest.doMock('pg', () => ({
      Pool: jest.fn().mockImplementation(() => mockPool),
    }));
    
    jest.doMock('../../../src/utils/logger', () => ({
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
    }));
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.DATABASE_URL;
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_NAME;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
  });

  describe('initialize', () => {
    it('should initialize with DATABASE_URL when provided', async () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
      
      const { DatabaseService: DS } = await import('../../../src/services/databaseService');
      await DS.initialize();

      expect(Pool).toHaveBeenCalledWith({
        connectionString: 'postgresql://user:pass@host:5432/db',
      });
    });

    it('should initialize with individual env vars when DATABASE_URL not set', async () => {
      process.env.DB_HOST = 'custom-host';
      process.env.DB_PORT = '5433';
      process.env.DB_NAME = 'custom_db';
      process.env.DB_USER = 'custom_user';
      process.env.DB_PASSWORD = 'custom_pass';

      const { DatabaseService: DS } = await import('../../../src/services/databaseService');
      await DS.initialize();

      expect(Pool).toHaveBeenCalledWith({
        host: 'custom-host',
        port: 5433,
        database: 'custom_db',
        user: 'custom_user',
        password: 'custom_pass',
      });
    });

    it('should use default values when env vars not set', async () => {
      const { DatabaseService: DS } = await import('../../../src/services/databaseService');
      await DS.initialize();

      expect(Pool).toHaveBeenCalledWith({
        host: 'tickettoken-postgres',
        port: 5432,
        database: 'tickettoken_db',
        user: 'postgres',
        password: 'localdev123',
      });
    });

    it('should verify connection with SELECT NOW() query', async () => {
      const { DatabaseService: DS } = await import('../../../src/services/databaseService');
      await DS.initialize();

      expect(mockQuery).toHaveBeenCalledWith('SELECT NOW()');
    });

    it('should throw error if connection verification fails', async () => {
      mockQuery.mockRejectedValue(new Error('Connection refused'));

      const { DatabaseService: DS } = await import('../../../src/services/databaseService');

      await expect(DS.initialize()).rejects.toThrow('Connection refused');
    });

    it('should parse port as integer', async () => {
      process.env.DB_PORT = '5434';

      const { DatabaseService: DS } = await import('../../../src/services/databaseService');
      await DS.initialize();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 5434,
        })
      );
    });
  });

  describe('getPool', () => {
    it('should return pool after initialization', async () => {
      const { DatabaseService: DS } = await import('../../../src/services/databaseService');
      await DS.initialize();

      const pool = DS.getPool();

      expect(pool).toBe(mockPool);
    });

    it('should throw error if not initialized', async () => {
      jest.resetModules();
      
      jest.doMock('pg', () => ({
        Pool: jest.fn().mockImplementation(() => mockPool),
      }));

      const { DatabaseService: DS } = await import('../../../src/services/databaseService');

      expect(() => DS.getPool()).toThrow('Database not initialized');
    });

    it('should return same pool instance on multiple calls', async () => {
      const { DatabaseService: DS } = await import('../../../src/services/databaseService');
      await DS.initialize();

      const pool1 = DS.getPool();
      const pool2 = DS.getPool();

      expect(pool1).toBe(pool2);
    });
  });

  describe('singleton behavior', () => {
    it('should export singleton instance', async () => {
      const module1 = await import('../../../src/services/databaseService');
      const module2 = await import('../../../src/services/databaseService');

      expect(module1.DatabaseService).toBe(module2.DatabaseService);
    });
  });

  describe('error handling', () => {
    it('should handle invalid DATABASE_URL gracefully', async () => {
      process.env.DATABASE_URL = 'invalid-url';
      
      // Pool constructor might throw or query might fail
      const { Pool: MockPool } = require('pg');
      MockPool.mockImplementationOnce(() => {
        throw new Error('Invalid connection string');
      });

      const { DatabaseService: DS } = await import('../../../src/services/databaseService');

      await expect(DS.initialize()).rejects.toThrow();
    });

    it('should handle pool query timeout', async () => {
      mockQuery.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout')), 100)
        )
      );

      const { DatabaseService: DS } = await import('../../../src/services/databaseService');

      await expect(DS.initialize()).rejects.toThrow('Query timeout');
    });
  });
});

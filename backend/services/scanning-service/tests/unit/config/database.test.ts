// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/config/database.ts
 */

import { Pool } from 'pg';

jest.mock('pg');

// Mock the promisified resolve4 to return a promise
jest.mock('dns', () => ({
  resolve4: jest.fn()
}));

jest.mock('util', () => ({
  promisify: (fn: any) => {
    // Return a function that returns a promise
    return jest.fn().mockResolvedValue(['127.0.0.1']);
  }
}));

// Mock setTimeout to instant
global.setTimeout = ((cb: any) => { cb(); return 0 as any; }) as any;

describe('src/config/database.ts - Comprehensive Unit Tests', () => {
  let mockPool: any;
  let mockClient: any;
  let resolveDnsMock: jest.Mock;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn()
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      end: jest.fn().mockResolvedValue(undefined),
      on: jest.fn()
    };

    (Pool as jest.Mock).mockImplementation(() => mockPool);
    
    // Reset modules to get fresh import
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =============================================================================
  // SUCCESSFUL CONNECTION
  // =============================================================================

  describe('Successful Connection', () => {
    it('should initialize database successfully', async () => {
      const { initializeDatabase } = require('../../../src/config/database');
      
      const pool = await initializeDatabase();
      
      expect(pool).toBeDefined();
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('SELECT 1');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should register error handler', async () => {
      const { initializeDatabase } = require('../../../src/config/database');
      
      await initializeDatabase();
      
      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should return pool instance', async () => {
      const { initializeDatabase } = require('../../../src/config/database');
      
      const result = await initializeDatabase();
      
      expect(result).toBe(mockPool);
    });
  });

  // =============================================================================
  // POOL CONFIGURATION
  // =============================================================================

  describe('Pool Configuration', () => {
    it('should use default configuration', async () => {
      delete process.env.DB_PORT;
      delete process.env.DB_NAME;
      delete process.env.DB_USER;
      delete process.env.DB_PASSWORD;
      
      const { initializeDatabase } = require('../../../src/config/database');
      await initializeDatabase();

      expect(Pool).toHaveBeenCalledWith(expect.objectContaining({
        port: 6432,
        database: 'tickettoken_db',
        user: 'postgres',
        password: 'postgres'
      }));
    });

    it('should use DB_PORT from environment', async () => {
      process.env.DB_PORT = '5432';
      
      const { initializeDatabase } = require('../../../src/config/database');
      await initializeDatabase();
      
      expect(Pool).toHaveBeenCalledWith(expect.objectContaining({ port: 5432 }));
    });

    it('should use DB_NAME from environment', async () => {
      process.env.DB_NAME = 'custom_db';
      
      const { initializeDatabase } = require('../../../src/config/database');
      await initializeDatabase();
      
      expect(Pool).toHaveBeenCalledWith(expect.objectContaining({ database: 'custom_db' }));
    });

    it('should use DB_USER from environment', async () => {
      process.env.DB_USER = 'admin';
      
      const { initializeDatabase } = require('../../../src/config/database');
      await initializeDatabase();
      
      expect(Pool).toHaveBeenCalledWith(expect.objectContaining({ user: 'admin' }));
    });

    it('should use DB_PASSWORD from environment', async () => {
      process.env.DB_PASSWORD = 'secret123';
      
      const { initializeDatabase } = require('../../../src/config/database');
      await initializeDatabase();
      
      expect(Pool).toHaveBeenCalledWith(expect.objectContaining({ password: 'secret123' }));
    });

    it('should set max connections to 20', async () => {
      const { initializeDatabase } = require('../../../src/config/database');
      await initializeDatabase();
      
      expect(Pool).toHaveBeenCalledWith(expect.objectContaining({ max: 20 }));
    });

    it('should set timeouts correctly', async () => {
      const { initializeDatabase } = require('../../../src/config/database');
      await initializeDatabase();
      
      expect(Pool).toHaveBeenCalledWith(expect.objectContaining({
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      }));
    });
  });

  // =============================================================================
  // RETRY LOGIC
  // =============================================================================

  describe('Retry Logic', () => {
    it('should retry on connection failure', async () => {
      mockPool.connect
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(mockClient);
      
      const { initializeDatabase } = require('../../../src/config/database');
      await initializeDatabase();

      expect(mockPool.connect).toHaveBeenCalledTimes(2);
    });

    it('should retry on query failure', async () => {
      mockClient.query
        .mockRejectedValueOnce(new Error('Query failed'))
        .mockResolvedValueOnce({ rows: [] });
      
      const { initializeDatabase } = require('../../../src/config/database');
      await initializeDatabase();

      expect(mockClient.query).toHaveBeenCalledTimes(2);
    });

    it('should fail after 5 attempts', async () => {
      mockPool.connect.mockRejectedValue(new Error('Always fails'));
      
      const { initializeDatabase } = require('../../../src/config/database');
      
      await expect(initializeDatabase()).rejects.toThrow('Always fails');
      expect(mockPool.connect).toHaveBeenCalledTimes(5);
    });

    it('should cleanup pool between retries', async () => {
      mockPool.connect
        .mockRejectedValueOnce(new Error('F1'))
        .mockResolvedValueOnce(mockClient);
      
      const { initializeDatabase } = require('../../../src/config/database');
      await initializeDatabase();

      expect(mockPool.end).toHaveBeenCalledTimes(1);
    });

    it('should handle cleanup errors', async () => {
      mockPool.end.mockRejectedValue(new Error('Cleanup failed'));
      mockPool.connect
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(mockClient);
      
      const { initializeDatabase } = require('../../../src/config/database');
      await expect(initializeDatabase()).resolves.toBeDefined();
    });
  });

  // =============================================================================
  // getPool()
  // =============================================================================

  describe('getPool()', () => {
    it('should throw when not initialized', () => {
      const { getPool } = require('../../../src/config/database');
      
      expect(() => getPool()).toThrow('Database not initialized');
    });

    it('should return pool after init', async () => {
      const { initializeDatabase, getPool } = require('../../../src/config/database');
      
      await initializeDatabase();
      const pool = getPool();

      expect(pool).toBe(mockPool);
    });
  });

  // =============================================================================
  // ERROR HANDLING
  // =============================================================================

  describe('Error Handling', () => {
    it('should throw after max retries', async () => {
      mockPool.connect.mockRejectedValue(new Error('Connection refused'));
      
      const { initializeDatabase } = require('../../../src/config/database');
      
      await expect(initializeDatabase()).rejects.toThrow('Connection refused');
    });

    it('should handle pool creation errors', async () => {
      (Pool as jest.Mock).mockImplementation(() => {
        throw new Error('Pool creation failed');
      });
      
      const { initializeDatabase } = require('../../../src/config/database');
      
      await expect(initializeDatabase()).rejects.toThrow('Pool creation failed');
    });
  });

});

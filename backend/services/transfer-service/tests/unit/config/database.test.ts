/**
 * Real Unit Tests for Database Configuration
 * Tests actual database pool, transactions, and circuit breaker functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Pool, PoolClient, QueryResult } from 'pg';
import {
  createPool,
  getPool,
  query,
  getClient,
  withTransaction,
  checkHealth,
  getPoolStats,
  closePool
} from '../../../src/config/database';
import { CircuitBreaker } from '../../../src/utils/circuit-breaker';
import { DatabaseConnectionError, DatabaseError } from '../../../src/errors';

// Mock dependencies
jest.mock('pg');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/utils/circuit-breaker');

describe('Database Configuration', () => {
  let mockPool: jest.Mocked<Pool>;
  let mockClient: jest.Mocked<PoolClient>;
  let mockCircuitBreaker: jest.Mocked<CircuitBreaker>;
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_NAME = 'test_db';
    process.env.DB_USER = 'test_user';
    process.env.DB_PASSWORD = 'test_password';

    // Create mock client
    mockClient = {
      query: jest.fn<any>().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn<any>(),
    } as any;

    // Create mock pool
    mockPool = {
      query: jest.fn<any>().mockResolvedValue({ rows: [], rowCount: 0 }),
      connect: jest.fn<any>().mockResolvedValue(mockClient),
      end: jest.fn<any>().mockResolvedValue(undefined),
      on: jest.fn<any>(),
      totalCount: 10,
      idleCount: 5,
      waitingCount: 0,
    } as any;

    // Mock Pool constructor
    (Pool as jest.MockedClass<typeof Pool>).mockImplementation(() => mockPool);

    // Create mock circuit breaker
    mockCircuitBreaker = {
      canExecute: jest.fn<any>().mockReturnValue(true),
      recordSuccess: jest.fn<any>(),
      recordFailure: jest.fn<any>(),
      getState: jest.fn<any>().mockReturnValue('CLOSED'),
    } as any;

    (CircuitBreaker as jest.MockedClass<typeof CircuitBreaker>).mockImplementation(() => mockCircuitBreaker);
  });

  afterEach(async () => {
    await closePool();
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('SSL Configuration', () => {
    it('should disable SSL in non-production by default', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.DB_SSL;

      const pool = createPool();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: false
        })
      );
    });

    it('should enable SSL in production', () => {
      process.env.NODE_ENV = 'production';

      const pool = createPool();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: expect.objectContaining({
            rejectUnauthorized: true
          })
        })
      );
    });

    it('should allow SSL rejection override', () => {
      process.env.NODE_ENV = 'production';
      process.env.DB_SSL_REJECT_UNAUTHORIZED = 'false';

      const pool = createPool();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: expect.objectContaining({
            rejectUnauthorized: false
          })
        })
      );
    });
  });

  describe('createPool()', () => {
    it('should create pool with correct configuration', () => {
      process.env.DB_POOL_MIN = '5';
      process.env.DB_POOL_MAX = '25';
      process.env.DB_CONNECTION_TIMEOUT = '5000';

      const pool = createPool();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 5432,
          database: 'test_db',
          user: 'test_user',
          password: 'test_password',
          min: 5,
          max: 25,
          connectionTimeoutMillis: 5000
        })
      );
    });

    it('should register pool event handlers', () => {
      const pool = createPool();

      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockPool.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockPool.on).toHaveBeenCalledWith('acquire', expect.any(Function));
      expect(mockPool.on).toHaveBeenCalledWith('release', expect.any(Function));
      expect(mockPool.on).toHaveBeenCalledWith('remove', expect.any(Function));
    });

    it('should create circuit breaker', () => {
      const pool = createPool();

      expect(CircuitBreaker).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'database',
          failureThreshold: 5,
          resetTimeout: 30000
        })
      );
    });

    it('should return existing pool if already created', () => {
      const pool1 = createPool();
      const pool2 = createPool();

      expect(pool1).toBe(pool2);
      expect(Pool).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPool()', () => {
    it('should return existing pool', () => {
      const created = createPool();
      const retrieved = getPool();

      expect(retrieved).toBe(created);
    });

    it('should create pool if not exists', () => {
      const pool = getPool();

      expect(pool).toBeDefined();
      expect(Pool).toHaveBeenCalled();
    });
  });

  describe('query()', () => {
    beforeEach(() => {
      createPool();
    });

    it('should execute query successfully', async () => {
      const expectedResult = { rows: [{ id: 1 }], rowCount: 1 };
      mockPool.query.mockResolvedValueOnce(expectedResult as any);

      const result = await query('SELECT * FROM users WHERE id = $1', [1]);

      expect(result).toEqual(expectedResult);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
      expect(mockCircuitBreaker.recordSuccess).toHaveBeenCalled();
    });

    it('should check circuit breaker before executing', async () => {
      mockCircuitBreaker.canExecute.mockReturnValue(false);

      await expect(
        query('SELECT 1')
      ).rejects.toThrow(DatabaseConnectionError);
      await expect(
        query('SELECT 1')
      ).rejects.toThrow('Database circuit breaker is open');

      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should record circuit breaker failure on error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(
        query('SELECT 1')
      ).rejects.toThrow(DatabaseError);

      expect(mockCircuitBreaker.recordFailure).toHaveBeenCalled();
    });

    it('should apply custom timeout if provided', async () => {
      await query('SELECT 1', [], { timeout: 5000 });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SET LOCAL statement_timeout'),
        []
      );
    });

    it('should throw DatabaseError on query failure', async () => {
      const error = new Error('Query syntax error');
      mockPool.query.mockRejectedValueOnce(error);

      await expect(
        query('INVALID SQL')
      ).rejects.toThrow(DatabaseError);
    });
  });

  describe('getClient()', () => {
    beforeEach(() => {
      createPool();
    });

    it('should acquire client from pool', async () => {
      const client = await getClient();

      expect(client).toBe(mockClient);
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockCircuitBreaker.recordSuccess).toHaveBeenCalled();
    });

    it('should check circuit breaker before acquiring', async () => {
      mockCircuitBreaker.canExecute.mockReturnValue(false);

      await expect(getClient()).rejects.toThrow(DatabaseConnectionError);
      await expect(getClient()).rejects.toThrow('Database circuit breaker is open');

      expect(mockPool.connect).not.toHaveBeenCalled();
    });

    it('should record failure on connection error', async () => {
      mockPool.connect.mockRejectedValueOnce(new Error('Pool exhausted'));

      await expect(getClient()).rejects.toThrow(DatabaseConnectionError);

      expect(mockCircuitBreaker.recordFailure).toHaveBeenCalled();
    });
  });

  describe('withTransaction()', () => {
    beforeEach(() => {
      createPool();
    });

    it('should execute callback within transaction', async () => {
      const callback = jest.fn<any>().mockResolvedValue('result');

      const result = await withTransaction(callback);

      expect(result).toBe('result');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(callback).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback transaction on error', async () => {
      const error = new Error('Transaction failed');
      const callback = jest.fn<any>().mockRejectedValue(error);

      await expect(withTransaction(callback)).rejects.toThrow('Transaction failed');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client even if commit fails', async () => {
      const callback = jest.fn<any>().mockResolvedValue('result');
      mockClient.query
        .mockResolvedValueOnce({} as any) // BEGIN
        .mockRejectedValueOnce(new Error('Commit failed')); // COMMIT

      await expect(withTransaction(callback)).rejects.toThrow('Commit failed');

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle multiple queries in transaction', async () => {
      const callback = async (client: PoolClient) => {
        await client.query('INSERT INTO users (name) VALUES ($1)', ['John']);
        await client.query('UPDATE accounts SET balance = balance + $1', [100]);
        return 'success';
      };

      mockClient.query.mockResolvedValue({} as any);

      const result = await withTransaction(callback);

      expect(result).toBe('success');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO users (name) VALUES ($1)',
        ['John']
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE accounts SET balance = balance + $1',
        [100]
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('checkHealth()', () => {
    beforeEach(() => {
      createPool();
    });

    it('should return healthy status when database is accessible', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ result: 1 }] } as any);

      const health = await checkHealth();

      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.poolSize).toBe(10);
      expect(health.idleConnections).toBe(5);
      expect(health.waitingClients).toBe(0);
      expect(health.circuitState).toBe('CLOSED');
    });

    it('should return unhealthy status on query failure', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Connection timeout'));

      const health = await checkHealth();

      expect(health.healthy).toBe(false);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should measure query latency', async () => {
      // Simulate slow query
      mockPool.query.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ rows: [] } as any), 100))
      );

      const health = await checkHealth();

      expect(health.latencyMs).toBeGreaterThanOrEqual(100);
    });
  });

  describe('getPoolStats()', () => {
    beforeEach(() => {
      createPool();
    });

    it('should return current pool statistics', () => {
      const stats = getPoolStats();

      expect(stats).toEqual({
        totalCount: 10,
        idleCount: 5,
        waitingCount: 0,
        circuitState: 'CLOSED'
      });
    });

    it('should reflect pool state changes', () => {
      mockPool.totalCount = 20;
      mockPool.idleCount = 10;
      mockPool.waitingCount = 2;

      const stats = getPoolStats();

      expect(stats.totalCount).toBe(20);
      expect(stats.idleCount).toBe(10);
      expect(stats.waitingCount).toBe(2);
    });
  });

  describe('closePool()', () => {
    it('should close pool gracefully', async () => {
      createPool();

      await closePool();

      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should handle closing when pool does not exist', async () => {
      await expect(closePool()).resolves.not.toThrow();
    });

    it('should reset pool reference after closing', async () => {
      createPool();
      await closePool();

      // Creating new pool after close should work
      const newPool = createPool();
      expect(newPool).toBeDefined();
      expect(Pool).toHaveBeenCalledTimes(2);
    });
  });

  describe('Pool Event Handlers', () => {
    it('should handle pool error events', () => {
      createPool();

      const errorHandler = (mockPool.on as jest.Mock).mock.calls.find(
        call => call[0] === 'error'
      )?.[1];

      expect(errorHandler).toBeDefined();

      // Trigger error
      errorHandler(new Error('Test error'), mockClient);

      expect(mockCircuitBreaker.recordFailure).toHaveBeenCalled();
    });

    it('should handle connect events', () => {
      createPool();

      const connectHandler = (mockPool.on as jest.Mock).mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];

      expect(connectHandler).toBeDefined();

      // Trigger connect
      mockClient.query.mockResolvedValue({} as any);
      connectHandler(mockClient);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SET statement_timeout')
      );
    });
  });

  describe('Configuration Parsing', () => {
    it('should use default values when env vars not set', () => {
      delete process.env.DB_POOL_MIN;
      delete process.env.DB_POOL_MAX;
      delete process.env.DB_CONNECTION_TIMEOUT;

      createPool();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          min: 2,
          max: 20,
          connectionTimeoutMillis: 10000
        })
      );
    });

    it('should parse integer environment variables correctly', () => {
      process.env.DB_POOL_MIN = '3';
      process.env.DB_POOL_MAX = '15';
      process.env.DB_PORT = '5433';

      createPool();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          min: 3,
          max: 15,
          port: 5433
        })
      );
    });
  });

  describe('Error Scenarios', () => {
    beforeEach(() => {
      createPool();
    });

    it('should handle transaction rollback failure gracefully', async () => {
      const callback = jest.fn<any>().mockRejectedValue(new Error('Callback error'));
      mockClient.query
        .mockResolvedValueOnce({} as any) // BEGIN
        .mockRejectedValueOnce(new Error('Rollback failed')); // ROLLBACK

      await expect(withTransaction(callback)).rejects.toThrow('Rollback failed');

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should wrap database errors with context', async () => {
      const originalError = new Error('Constraint violation');
      mockPool.query.mockRejectedValueOnce(originalError);

      try {
        await query('INSERT INTO users VALUES (1)');
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseError);
        expect((error as DatabaseError).message).toContain('Constraint violation');
      }
    });
  });
});

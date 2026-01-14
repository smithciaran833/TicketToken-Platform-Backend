/**
 * Unit Tests for Database Operations Utilities
 * Tests deadlock retry, transaction handling, and optimistic locking
 */

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

import {
  withDeadlockRetry,
  transactionWithRetry,
  queryWithRetry,
  batchInsertWithRetry,
  updateWithOptimisticLock,
  selectForUpdateWithRetry
} from '../../../src/utils/db-operations';

describe('Database Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('withDeadlockRetry', () => {
    it('should succeed on first attempt when no error', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const promise = withDeadlockRetry(operation);
      jest.runAllTimers();
      const result = await promise;
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on deadlock error (40P01)', async () => {
      const deadlockError = Object.assign(new Error('deadlock detected'), { code: '40P01' });
      const operation = jest.fn()
        .mockRejectedValueOnce(deadlockError)
        .mockResolvedValue('success');
      
      const promise = withDeadlockRetry(operation, { initialDelayMs: 10 });
      
      // Let timers advance
      await jest.runAllTimersAsync();
      const result = await promise;
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on serialization failure error (40001)', async () => {
      const serializationError = Object.assign(new Error('serialization failure'), { code: '40001' });
      const operation = jest.fn()
        .mockRejectedValueOnce(serializationError)
        .mockResolvedValue('success');
      
      const promise = withDeadlockRetry(operation, { initialDelayMs: 10 });
      await jest.runAllTimersAsync();
      const result = await promise;
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on lock_not_available error (55P03)', async () => {
      const lockError = Object.assign(new Error('lock not available'), { code: '55P03' });
      const operation = jest.fn()
        .mockRejectedValueOnce(lockError)
        .mockResolvedValue('success');
      
      const promise = withDeadlockRetry(operation, { initialDelayMs: 10 });
      await jest.runAllTimersAsync();
      const result = await promise;
      
      expect(result).toBe('success');
    });

    it('should retry based on error message containing deadlock', async () => {
      const error = new Error('could not serialize access due to read/write dependencies');
      const operation = jest.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');
      
      const promise = withDeadlockRetry(operation, { initialDelayMs: 10 });
      await jest.runAllTimersAsync();
      const result = await promise;
      
      expect(result).toBe('success');
    });

    it('should not retry non-retryable errors', async () => {
      const nonRetryableError = new Error('unique constraint violation');
      const operation = jest.fn().mockRejectedValue(nonRetryableError);
      
      await expect(withDeadlockRetry(operation)).rejects.toThrow('unique constraint violation');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries exhausted', async () => {
      const deadlockError = Object.assign(new Error('deadlock detected'), { code: '40P01' });
      const operation = jest.fn().mockRejectedValue(deadlockError);
      
      const promise = withDeadlockRetry(operation, { 
        maxRetries: 2, 
        initialDelayMs: 10 
      });
      
      await jest.runAllTimersAsync();
      await expect(promise).rejects.toThrow('deadlock detected');
      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should call onRetry callback on each retry', async () => {
      const deadlockError = Object.assign(new Error('deadlock'), { code: '40P01' });
      const operation = jest.fn()
        .mockRejectedValueOnce(deadlockError)
        .mockRejectedValueOnce(deadlockError)
        .mockResolvedValue('success');
      
      const onRetry = jest.fn();
      
      const promise = withDeadlockRetry(operation, { 
        initialDelayMs: 10, 
        onRetry 
      });
      await jest.runAllTimersAsync();
      await promise;
      
      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
      expect(onRetry).toHaveBeenCalledWith(2, expect.any(Error));
    });

    it('should use exponential backoff with jitter', async () => {
      const deadlockError = Object.assign(new Error('deadlock'), { code: '40P01' });
      const operation = jest.fn()
        .mockRejectedValueOnce(deadlockError)
        .mockRejectedValueOnce(deadlockError)
        .mockResolvedValue('success');
      
      const promise = withDeadlockRetry(operation, { 
        initialDelayMs: 100, 
        backoffMultiplier: 2 
      });
      await jest.runAllTimersAsync();
      await promise;
      
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should respect maxDelayMs cap', async () => {
      const deadlockError = Object.assign(new Error('deadlock'), { code: '40P01' });
      const operation = jest.fn()
        .mockRejectedValueOnce(deadlockError)
        .mockResolvedValue('success');
      
      const promise = withDeadlockRetry(operation, { 
        initialDelayMs: 10000, 
        maxDelayMs: 100 
      });
      await jest.runAllTimersAsync();
      await promise;
      
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('transactionWithRetry', () => {
    let mockKnex: any;
    let mockTrx: any;

    beforeEach(() => {
      mockTrx = {
        raw: jest.fn().mockResolvedValue(undefined)
      };
      mockKnex = {
        transaction: jest.fn((callback) => callback(mockTrx))
      };
    });

    it('should execute transaction callback', async () => {
      const callback = jest.fn().mockResolvedValue('result');
      
      const result = await transactionWithRetry(mockKnex, callback);
      
      expect(result).toBe('result');
      expect(mockKnex.transaction).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(mockTrx);
    });

    it('should set isolation level when specified', async () => {
      const callback = jest.fn().mockResolvedValue('result');
      
      await transactionWithRetry(mockKnex, callback, { 
        isolationLevel: 'serializable' 
      });
      
      expect(mockTrx.raw).toHaveBeenCalledWith(
        'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE'
      );
    });

    it('should retry on deadlock within transaction', async () => {
      const deadlockError = Object.assign(new Error('deadlock'), { code: '40P01' });
      let callCount = 0;
      
      mockKnex.transaction = jest.fn((callback) => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(deadlockError);
        }
        return callback(mockTrx);
      });
      
      const callback = jest.fn().mockResolvedValue('result');
      
      const promise = transactionWithRetry(mockKnex, callback, { 
        initialDelayMs: 10 
      });
      await jest.runAllTimersAsync();
      const result = await promise;
      
      expect(result).toBe('result');
      expect(mockKnex.transaction).toHaveBeenCalledTimes(2);
    });

    it('should not set isolation level when not specified', async () => {
      const callback = jest.fn().mockResolvedValue('result');
      
      await transactionWithRetry(mockKnex, callback);
      
      expect(mockTrx.raw).not.toHaveBeenCalled();
    });

    it('should support read committed isolation', async () => {
      const callback = jest.fn().mockResolvedValue('result');
      
      await transactionWithRetry(mockKnex, callback, { 
        isolationLevel: 'read committed' 
      });
      
      expect(mockTrx.raw).toHaveBeenCalledWith(
        'SET TRANSACTION ISOLATION LEVEL READ COMMITTED'
      );
    });

    it('should support repeatable read isolation', async () => {
      const callback = jest.fn().mockResolvedValue('result');
      
      await transactionWithRetry(mockKnex, callback, { 
        isolationLevel: 'repeatable read' 
      });
      
      expect(mockTrx.raw).toHaveBeenCalledWith(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'
      );
    });
  });

  describe('queryWithRetry', () => {
    it('should execute query function', async () => {
      const queryFn = jest.fn().mockResolvedValue([{ id: 1 }]);
      
      const result = await queryWithRetry(queryFn);
      
      expect(result).toEqual([{ id: 1 }]);
      expect(queryFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on deadlock', async () => {
      const deadlockError = Object.assign(new Error('deadlock'), { code: '40P01' });
      const queryFn = jest.fn()
        .mockRejectedValueOnce(deadlockError)
        .mockResolvedValue([{ id: 1 }]);
      
      const promise = queryWithRetry(queryFn, { initialDelayMs: 10 });
      await jest.runAllTimersAsync();
      const result = await promise;
      
      expect(result).toEqual([{ id: 1 }]);
      expect(queryFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('batchInsertWithRetry', () => {
    let mockKnex: any;
    let mockQueryBuilder: any;

    beforeEach(() => {
      mockQueryBuilder = {
        insert: jest.fn().mockReturnThis(),
        onConflict: jest.fn().mockReturnThis(),
        merge: jest.fn().mockResolvedValue({ rowCount: 10 }),
        ignore: jest.fn().mockResolvedValue({ rowCount: 10 })
      };
      mockKnex = jest.fn(() => mockQueryBuilder);
    });

    it('should insert records in batches', async () => {
      mockQueryBuilder.insert.mockResolvedValue({ rowCount: 50 });
      const records = Array.from({ length: 150 }, (_, i) => ({ id: i + 1 }));
      
      const count = await batchInsertWithRetry(mockKnex, 'test_table', records, {
        batchSize: 50
      });
      
      expect(mockKnex).toHaveBeenCalledWith('test_table');
      expect(mockQueryBuilder.insert).toHaveBeenCalledTimes(3);
    });

    it('should use default batch size of 100', async () => {
      mockQueryBuilder.insert.mockResolvedValue({ rowCount: 100 });
      const records = Array.from({ length: 250 }, (_, i) => ({ id: i + 1 }));
      
      await batchInsertWithRetry(mockKnex, 'test_table', records);
      
      // 250 records / 100 batch size = 3 batches
      expect(mockQueryBuilder.insert).toHaveBeenCalledTimes(3);
    });

    it('should handle onConflict with merge', async () => {
      const records = [{ id: 1, name: 'test' }];
      
      await batchInsertWithRetry(mockKnex, 'test_table', records, {
        onConflict: 'id',
        merge: true
      });
      
      expect(mockQueryBuilder.onConflict).toHaveBeenCalledWith(['id']);
      expect(mockQueryBuilder.merge).toHaveBeenCalled();
    });

    it('should handle onConflict with ignore', async () => {
      const records = [{ id: 1, name: 'test' }];
      
      await batchInsertWithRetry(mockKnex, 'test_table', records, {
        onConflict: 'id',
        merge: false
      });
      
      expect(mockQueryBuilder.onConflict).toHaveBeenCalledWith(['id']);
      expect(mockQueryBuilder.ignore).toHaveBeenCalled();
    });

    it('should handle array of conflict columns', async () => {
      const records = [{ id: 1, name: 'test' }];
      
      await batchInsertWithRetry(mockKnex, 'test_table', records, {
        onConflict: ['id', 'name'],
        merge: true
      });
      
      expect(mockQueryBuilder.onConflict).toHaveBeenCalledWith(['id', 'name']);
    });

    it('should retry on deadlock during batch insert', async () => {
      const deadlockError = Object.assign(new Error('deadlock'), { code: '40P01' });
      mockQueryBuilder.insert
        .mockRejectedValueOnce(deadlockError)
        .mockResolvedValue({ rowCount: 10 });
      
      const records = [{ id: 1 }];
      
      const promise = batchInsertWithRetry(mockKnex, 'test_table', records, {
        initialDelayMs: 10
      });
      await jest.runAllTimersAsync();
      await promise;
      
      expect(mockQueryBuilder.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateWithOptimisticLock', () => {
    let mockKnex: any;
    let mockQueryBuilder: any;

    beforeEach(() => {
      mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1),
        first: jest.fn()
      };
      mockKnex = jest.fn(() => mockQueryBuilder);
    });

    it('should update record with version increment', async () => {
      const result = await updateWithOptimisticLock(
        mockKnex,
        'test_table',
        'id-123',
        { name: 'updated' },
        1
      );
      
      expect(result).toEqual({ updated: true, newVersion: 2 });
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('id', 'id-123');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('version', 1);
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'updated',
          version: 2,
          updated_at: expect.any(Date)
        })
      );
    });

    it('should return updated false on version mismatch', async () => {
      mockQueryBuilder.update.mockResolvedValue(0);
      mockQueryBuilder.first.mockResolvedValue({ id: 'id-123', version: 5 });
      
      await expect(updateWithOptimisticLock(
        mockKnex,
        'test_table',
        'id-123',
        { name: 'updated' },
        1
      )).rejects.toThrow('Optimistic lock conflict: expected version 1, found 5');
    });

    it('should throw if row not found', async () => {
      mockQueryBuilder.update.mockResolvedValue(0);
      mockQueryBuilder.first.mockResolvedValue(null);
      
      await expect(updateWithOptimisticLock(
        mockKnex,
        'test_table',
        'id-123',
        { name: 'updated' },
        1
      )).rejects.toThrow('Row with id id-123 not found in test_table');
    });

    it('should retry on deadlock during update', async () => {
      const deadlockError = Object.assign(new Error('deadlock'), { code: '40P01' });
      mockQueryBuilder.update
        .mockRejectedValueOnce(deadlockError)
        .mockResolvedValue(1);
      
      const promise = updateWithOptimisticLock(
        mockKnex,
        'test_table',
        'id-123',
        { name: 'updated' },
        1,
        { initialDelayMs: 10 }
      );
      await jest.runAllTimersAsync();
      const result = await promise;
      
      expect(result).toEqual({ updated: true, newVersion: 2 });
    });
  });

  describe('selectForUpdateWithRetry', () => {
    let mockKnex: any;
    let mockTrx: any;
    let mockQueryBuilder: any;

    beforeEach(() => {
      mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        forUpdate: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ id: 1, name: 'test' })
      };
      mockTrx = {
        raw: jest.fn().mockResolvedValue(undefined),
        __proto__: Function.prototype
      };
      // Make mockTrx callable
      Object.setPrototypeOf(mockTrx, () => mockQueryBuilder);
      mockTrx = Object.assign(() => mockQueryBuilder, mockTrx);
      
      mockKnex = {
        transaction: jest.fn((callback) => callback(mockTrx))
      };
    });

    it('should select row with FOR UPDATE lock', async () => {
      const callback = jest.fn().mockResolvedValue(undefined);
      
      await selectForUpdateWithRetry(
        mockKnex,
        'test_table',
        { id: 1 },
        callback
      );
      
      expect(mockTrx.raw).toHaveBeenCalledWith(expect.stringContaining('lock_timeout'));
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 1 });
      expect(mockQueryBuilder.forUpdate).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({ id: 1, name: 'test' }, mockTrx);
    });

    it('should throw if row not found', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);
      const callback = jest.fn();
      
      await expect(selectForUpdateWithRetry(
        mockKnex,
        'test_table',
        { id: 999 },
        callback
      )).rejects.toThrow('Row not found');
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should use custom timeout', async () => {
      const callback = jest.fn().mockResolvedValue(undefined);
      
      await selectForUpdateWithRetry(
        mockKnex,
        'test_table',
        { id: 1 },
        callback,
        { timeout: 10000 }
      );
      
      expect(mockTrx.raw).toHaveBeenCalledWith("SET LOCAL lock_timeout = '10000ms'");
    });

    it('should retry on deadlock during select for update', async () => {
      const deadlockError = Object.assign(new Error('deadlock'), { code: '40P01' });
      let callCount = 0;
      
      mockKnex.transaction = jest.fn((callback) => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(deadlockError);
        }
        return callback(mockTrx);
      });
      
      const callback = jest.fn().mockResolvedValue(undefined);
      
      const promise = selectForUpdateWithRetry(
        mockKnex,
        'test_table',
        { id: 1 },
        callback,
        { initialDelayMs: 10 }
      );
      await jest.runAllTimersAsync();
      await promise;
      
      expect(mockKnex.transaction).toHaveBeenCalledTimes(2);
    });
  });
});

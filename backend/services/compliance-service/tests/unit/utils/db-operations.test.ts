/**
 * Unit Tests for Database Operations
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock metrics
jest.mock('../../../src/utils/metrics', () => ({
  incrementMetric: jest.fn()
}));

// Create mock transaction
const mockTrx = {
  raw: jest.fn<(sql: string, bindings?: any[]) => Promise<any>>(),
  commit: jest.fn<() => Promise<void>>(),
  rollback: jest.fn<(error?: Error) => Promise<void>>(),
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  forUpdate: jest.fn<() => any>().mockReturnThis(),
  noWait: jest.fn().mockReturnThis(),
  skipLocked: jest.fn<() => any>().mockReturnThis(),
  first: jest.fn<() => Promise<any>>(),
  limit: jest.fn<(n: number) => any>().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn<() => Promise<number>>(),
  onConflict: jest.fn().mockReturnThis(),
  merge: jest.fn().mockReturnThis(),
  returning: jest.fn<() => Promise<any[]>>()
};

// Make trx callable (for table selection)
const mockTrxFn = Object.assign(
  jest.fn().mockReturnValue(mockTrx),
  mockTrx
);

// Mock database
const mockDb = {
  transaction: jest.fn<() => Promise<any>>().mockResolvedValue(mockTrxFn),
  raw: jest.fn<(sql: string) => Promise<any>>(),
  destroy: jest.fn<() => Promise<void>>(),
  client: {
    pool: {
      numUsed: jest.fn().mockReturnValue(5),
      numFree: jest.fn().mockReturnValue(10),
      numPendingAcquires: jest.fn().mockReturnValue(0)
    }
  }
};

jest.mock('../../../src/config/database', () => ({
  db: mockDb
}));

describe('Database Operations', () => {
  let withTransaction: any;
  let selectForUpdate: any;
  let selectManyForUpdate: any;
  let selectForUpdateNoWait: any;
  let selectForUpdateSkipLocked: any;
  let batchInsert: any;
  let batchUpdate: any;
  let checkDatabaseHealth: any;
  let handleDatabaseDisconnect: any;
  let setTenantContext: any;
  let setUserContext: any;
  let setRLSContext: any;
  let upsert: any;
  let logger: any;
  let incrementMetric: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Reset mock implementations
    mockDb.transaction.mockResolvedValue(mockTrxFn);
    mockDb.raw.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    mockTrxFn.commit.mockResolvedValue(undefined);
    mockTrxFn.rollback.mockResolvedValue(undefined);
    mockTrxFn.raw.mockResolvedValue({ rows: [] });
    mockTrx.first.mockResolvedValue({ id: 1 });
    mockTrx.update.mockResolvedValue(1);
    mockTrx.returning.mockResolvedValue([{ id: 1 }]);

    // Ensure chainable methods return mockTrx
    mockTrx.select.mockReturnValue(mockTrx);
    mockTrx.where.mockReturnValue(mockTrx);
    mockTrx.forUpdate.mockReturnValue(mockTrx);
    mockTrx.noWait.mockReturnValue(mockTrx);
    mockTrx.skipLocked.mockReturnValue(mockTrx);
    mockTrx.limit.mockReturnValue(mockTrx);
    mockTrx.insert.mockReturnValue(mockTrx);
    mockTrx.onConflict.mockReturnValue(mockTrx);
    mockTrx.merge.mockReturnValue(mockTrx);

    const loggerModule = await import('../../../src/utils/logger');
    logger = loggerModule.logger;

    const metricsModule = await import('../../../src/utils/metrics');
    incrementMetric = metricsModule.incrementMetric;

    const module = await import('../../../src/utils/db-operations');
    withTransaction = module.withTransaction;
    selectForUpdate = module.selectForUpdate;
    selectManyForUpdate = module.selectManyForUpdate;
    selectForUpdateNoWait = module.selectForUpdateNoWait;
    selectForUpdateSkipLocked = module.selectForUpdateSkipLocked;
    batchInsert = module.batchInsert;
    batchUpdate = module.batchUpdate;
    checkDatabaseHealth = module.checkDatabaseHealth;
    handleDatabaseDisconnect = module.handleDatabaseDisconnect;
    setTenantContext = module.setTenantContext;
    setUserContext = module.setUserContext;
    setRLSContext = module.setRLSContext;
    upsert = module.upsert;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('withTransaction', () => {
    it('should execute operation within transaction', async () => {
      const operation = jest.fn<(trx: any) => Promise<string>>().mockResolvedValue('result');

      const result = await withTransaction(operation);

      expect(result).toBe('result');
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockTrxFn.commit).toHaveBeenCalled();
    });

    it('should rollback on error', async () => {
      const operation = jest.fn<(trx: any) => Promise<never>>().mockRejectedValue(new Error('Operation failed'));

      await expect(withTransaction(operation)).rejects.toThrow('Operation failed');

      expect(mockTrxFn.rollback).toHaveBeenCalled();
    });

    it('should increment success metric on commit', async () => {
      const operation = jest.fn<(trx: any) => Promise<string>>().mockResolvedValue('result');

      await withTransaction(operation);

      expect(incrementMetric).toHaveBeenCalledWith('db_transaction_success_total');
    });

    it('should increment failure metric on error', async () => {
      const operation = jest.fn<(trx: any) => Promise<never>>().mockRejectedValue(new Error('fail'));

      await expect(withTransaction(operation)).rejects.toThrow();

      expect(incrementMetric).toHaveBeenCalledWith('db_transaction_failure_total');
    });

    it('should set isolation level when specified', async () => {
      const operation = jest.fn<(trx: any) => Promise<string>>().mockResolvedValue('result');

      await withTransaction(operation, { isolationLevel: 'serializable' });

      expect(mockTrxFn.raw).toHaveBeenCalledWith(
        expect.stringContaining('SERIALIZABLE')
      );
    });

    it('should retry on serialization failure', async () => {
      const error = new Error('Serialization failure') as any;
      error.code = '40001';

      const operation = jest.fn<(trx: any) => Promise<string>>()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const resultPromise = withTransaction(operation, { retries: 2, retryDelay: 100 });

      await jest.advanceTimersByTimeAsync(150);

      const result = await resultPromise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
      expect(incrementMetric).toHaveBeenCalledWith('db_transaction_retry_total');
    });

    it('should retry on deadlock', async () => {
      const error = new Error('Deadlock') as any;
      error.code = '40P01';

      const operation = jest.fn<(trx: any) => Promise<string>>()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const resultPromise = withTransaction(operation, { retries: 2, retryDelay: 100 });

      await jest.advanceTimersByTimeAsync(150);

      const result = await resultPromise;

      expect(result).toBe('success');
    });

    it('should not retry on non-retryable errors', async () => {
      const error = new Error('Constraint violation') as any;
      error.code = '23505';

      const operation = jest.fn<(trx: any) => Promise<never>>().mockRejectedValue(error);

      await expect(withTransaction(operation, { retries: 3 })).rejects.toThrow();

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should log warning on retry', async () => {
      const error = new Error('Serialization failure') as any;
      error.code = '40001';

      const operation = jest.fn<(trx: any) => Promise<string>>()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const resultPromise = withTransaction(operation, { retries: 2, retryDelay: 50 });
      await jest.advanceTimersByTimeAsync(100);
      await resultPromise;

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          attempt: 1,
          errorCode: '40001'
        }),
        'Transaction retry after failure'
      );
    });
  });

  describe('selectForUpdate', () => {
    it('should select row with FOR UPDATE lock', async () => {
      const result = await selectForUpdate(mockTrxFn, 'users', { id: 1 });

      expect(mockTrxFn).toHaveBeenCalledWith('users');
      expect(mockTrx.select).toHaveBeenCalledWith(['*']);
      expect(mockTrx.where).toHaveBeenCalledWith({ id: 1 });
      expect(mockTrx.forUpdate).toHaveBeenCalled();
      expect(mockTrx.first).toHaveBeenCalled();
    });

    it('should select specific columns', async () => {
      await selectForUpdate(mockTrxFn, 'users', { id: 1 }, ['id', 'name']);

      expect(mockTrx.select).toHaveBeenCalledWith(['id', 'name']);
    });

    it('should return undefined when row not found', async () => {
      mockTrx.first.mockResolvedValue(undefined);

      const result = await selectForUpdate(mockTrxFn, 'users', { id: 999 });

      expect(result).toBeUndefined();
    });
  });

  describe('selectManyForUpdate', () => {
    it('should select multiple rows with FOR UPDATE lock', async () => {
      mockTrx.forUpdate.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      const result = await selectManyForUpdate(mockTrxFn, 'users', { status: 'active' });

      expect(mockTrx.forUpdate).toHaveBeenCalled();
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });
  });

  describe('selectForUpdateNoWait', () => {
    it('should use NOWAIT option', async () => {
      await selectForUpdateNoWait(mockTrxFn, 'users', { id: 1 });

      expect(mockTrx.forUpdate).toHaveBeenCalled();
      expect(mockTrx.noWait).toHaveBeenCalled();
    });
  });

  describe('selectForUpdateSkipLocked', () => {
    it('should use SKIP LOCKED option', async () => {
      mockTrx.skipLocked.mockResolvedValue([{ id: 1 }]);

      await selectForUpdateSkipLocked(mockTrxFn, 'jobs', { status: 'pending' });

      expect(mockTrx.forUpdate).toHaveBeenCalled();
      expect(mockTrx.skipLocked).toHaveBeenCalled();
    });

    it('should apply limit when specified', async () => {
      mockTrx.limit.mockResolvedValue([{ id: 1 }]);

      await selectForUpdateSkipLocked(mockTrxFn, 'jobs', { status: 'pending' }, ['*'], 10);

      expect(mockTrx.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('batchInsert', () => {
    it('should insert rows in batches', async () => {
      const rows = Array.from({ length: 250 }, (_, i) => ({ id: i }));

      await batchInsert(mockTrxFn, 'items', rows, 100);

      expect(mockTrx.insert).toHaveBeenCalledTimes(3); // 100 + 100 + 50
    });

    it('should handle small batches', async () => {
      const rows = [{ id: 1 }, { id: 2 }];

      await batchInsert(mockTrxFn, 'items', rows, 100);

      expect(mockTrx.insert).toHaveBeenCalledTimes(1);
    });
  });

  describe('batchUpdate', () => {
    it('should update multiple rows', async () => {
      const updates = [
        { where: { id: 1 }, data: { status: 'active' } },
        { where: { id: 2 }, data: { status: 'inactive' } }
      ];

      const count = await batchUpdate(mockTrxFn, 'users', updates);

      expect(mockTrx.update).toHaveBeenCalledTimes(2);
      expect(count).toBe(2);
    });
  });

  describe('checkDatabaseHealth', () => {
    it('should return healthy status when connected', async () => {
      const health = await checkDatabaseHealth();

      expect(health.connected).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.poolInfo).toEqual({
        used: 5,
        free: 10,
        pending: 0
      });
    });

    it('should return unhealthy status on error', async () => {
      mockDb.raw.mockRejectedValueOnce(new Error('Connection failed'));

      const health = await checkDatabaseHealth();

      expect(health.connected).toBe(false);
    });
  });

  describe('handleDatabaseDisconnect', () => {
    it('should destroy and reconnect', async () => {
      mockDb.destroy.mockResolvedValue(undefined);

      const promise = handleDatabaseDisconnect();
      await jest.advanceTimersByTimeAsync(1100);
      await promise;

      expect(mockDb.destroy).toHaveBeenCalled();
      expect(mockDb.raw).toHaveBeenCalledWith('SELECT 1');
      expect(logger.info).toHaveBeenCalledWith('Database reconnection successful');
    });

    it('should log warning on disconnect', async () => {
      const promise = handleDatabaseDisconnect();
      await jest.advanceTimersByTimeAsync(1100);
      await promise;

      expect(logger.warn).toHaveBeenCalledWith(
        'Database disconnect detected, attempting reconnection'
      );
    });

    it('should log error on reconnection failure', async () => {
      mockDb.destroy.mockResolvedValue(undefined);
      mockDb.raw.mockRejectedValueOnce(new Error('Connection refused'));

      const promise = handleDatabaseDisconnect();
      
      // Set up the expectation BEFORE advancing timers
      const expectation = expect(promise).rejects.toThrow('Connection refused');
      
      // Now advance the timers
      await jest.advanceTimersByTimeAsync(1100);
      
      // Wait for the expectation
      await expectation;

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Connection refused' }),
        'Database reconnection failed'
      );
    });
  });

  describe('setTenantContext', () => {
    it('should set tenant config', async () => {
      await setTenantContext(mockTrxFn, 'tenant-123');

      expect(mockTrxFn.raw).toHaveBeenCalledWith(
        "SELECT set_config('app.current_tenant_id', ?, true)",
        ['tenant-123']
      );
    });
  });

  describe('setUserContext', () => {
    it('should set user config', async () => {
      await setUserContext(mockTrxFn, 'user-456');

      expect(mockTrxFn.raw).toHaveBeenCalledWith(
        "SELECT set_config('app.current_user_id', ?, true)",
        ['user-456']
      );
    });
  });

  describe('setRLSContext', () => {
    it('should set both tenant and user context', async () => {
      await setRLSContext(mockTrxFn, { tenantId: 'tenant-123', userId: 'user-456' });

      expect(mockTrxFn.raw).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id'),
        ['tenant-123']
      );
      expect(mockTrxFn.raw).toHaveBeenCalledWith(
        expect.stringContaining('user_id'),
        ['user-456']
      );
    });

    it('should only set tenant when userId not provided', async () => {
      await setRLSContext(mockTrxFn, { tenantId: 'tenant-123' });

      expect(mockTrxFn.raw).toHaveBeenCalledTimes(1);
    });
  });

  describe('upsert', () => {
    it('should insert or update on conflict', async () => {
      mockTrx.returning.mockResolvedValue([{ id: 1, name: 'updated' }]);

      const result = await upsert(
        mockTrxFn,
        'users',
        { id: 1, name: 'test' },
        ['id'],
        ['name']
      );

      expect(mockTrx.insert).toHaveBeenCalledWith({ id: 1, name: 'test' });
      expect(mockTrx.onConflict).toHaveBeenCalledWith(['id']);
      expect(mockTrx.merge).toHaveBeenCalled();
      expect(result).toEqual({ id: 1, name: 'updated' });
    });
  });

  describe('default export', () => {
    it('should export all functions', async () => {
      const module = await import('../../../src/utils/db-operations');

      expect(module.default).toHaveProperty('withTransaction');
      expect(module.default).toHaveProperty('selectForUpdate');
      expect(module.default).toHaveProperty('selectManyForUpdate');
      expect(module.default).toHaveProperty('selectForUpdateNoWait');
      expect(module.default).toHaveProperty('selectForUpdateSkipLocked');
      expect(module.default).toHaveProperty('batchInsert');
      expect(module.default).toHaveProperty('batchUpdate');
      expect(module.default).toHaveProperty('checkDatabaseHealth');
      expect(module.default).toHaveProperty('handleDatabaseDisconnect');
      expect(module.default).toHaveProperty('setTenantContext');
      expect(module.default).toHaveProperty('setUserContext');
      expect(module.default).toHaveProperty('setRLSContext');
      expect(module.default).toHaveProperty('upsert');
    });
  });
});

// Mock dependencies BEFORE imports
const mockLrange = jest.fn();
const mockLrem = jest.fn();
const mockLset = jest.fn();

const mockGetRedisClient = jest.fn(() => ({
  lrange: mockLrange,
  lrem: mockLrem,
  lset: mockLset,
}));

jest.mock('../../../src/config/redis', () => ({
  getRedisClient: mockGetRedisClient,
}));

// Mock database
const mockDbWhere = jest.fn();
const mockDbWhereIn = jest.fn();
const mockDbSelect = jest.fn();
const mockDbUpdate = jest.fn();
const mockDbInsert = jest.fn();

const mockQueryBuilder: any = {
  where: mockDbWhere,
  whereIn: mockDbWhereIn,
  select: mockDbSelect,
  update: mockDbUpdate,
  insert: mockDbInsert,
};

mockDbWhere.mockReturnValue(mockQueryBuilder);
mockDbWhereIn.mockReturnValue(mockQueryBuilder);
mockDbSelect.mockReturnValue(mockQueryBuilder);

const mockDb = jest.fn(() => mockQueryBuilder);

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

// Mock logger
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerDebug = jest.fn();

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    debug: mockLoggerDebug,
  },
}));

import { recoveryService } from '../../../src/services/recovery.service';

describe('RecoveryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDbWhere.mockReturnValue(mockQueryBuilder);
    mockDbWhereIn.mockReturnValue(mockQueryBuilder);
    mockDbSelect.mockReturnValue(mockQueryBuilder);
  });

  describe('processDeadLetterQueue', () => {
    it('should return early when Redis is not available', async () => {
      mockGetRedisClient.mockReturnValueOnce(null);

      const result = await recoveryService.processDeadLetterQueue();

      expect(result).toEqual({
        processed: 0,
        recovered: 0,
        failed: 0,
        errors: [],
      });
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Redis not available for dead letter queue processing'
      );
    });

    it('should process empty queue', async () => {
      mockLrange.mockResolvedValue([]);

      const result = await recoveryService.processDeadLetterQueue();

      expect(result.processed).toBe(0);
      expect(mockLoggerInfo).toHaveBeenCalledWith('Processing dead letter queue', {
        messageCount: 0,
      });
    });

    it('should process and recover messages', async () => {
      const message = {
        id: 'msg-1',
        queue: 'webhook',
        payload: { data: 'test' },
        error: 'Connection failed',
        failedAt: new Date().toISOString(),
        retryCount: 0,
      };

      mockLrange.mockResolvedValue([JSON.stringify(message)]);
      mockLrem.mockResolvedValue(1);

      const result = await recoveryService.processDeadLetterQueue();

      expect(result.processed).toBe(1);
      expect(result.recovered).toBe(1);
      expect(mockLrem).toHaveBeenCalledWith('integration:dlq', 1, JSON.stringify(message));
    });

    it('should skip messages that exceeded max retries', async () => {
      const message = {
        id: 'msg-1',
        queue: 'webhook',
        payload: {},
        error: 'Failed',
        failedAt: new Date().toISOString(),
        retryCount: 3,
      };

      mockLrange.mockResolvedValue([JSON.stringify(message)]);

      const result = await recoveryService.processDeadLetterQueue();

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.recovered).toBe(0);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Message exceeded max retries, moving to failed',
        { messageId: 'msg-1', retryCount: 3 }
      );
    });

    it('should handle different queue types', async () => {
      const messages = [
        { id: '1', queue: 'webhook', payload: {}, error: '', failedAt: '', retryCount: 0 },
        { id: '2', queue: 'sync', payload: {}, error: '', failedAt: '', retryCount: 0 },
        { id: '3', queue: 'notification', payload: {}, error: '', failedAt: '', retryCount: 0 },
      ];

      mockLrange.mockResolvedValue(messages.map(m => JSON.stringify(m)));
      mockLrem.mockResolvedValue(1);

      const result = await recoveryService.processDeadLetterQueue();

      expect(result.recovered).toBe(3);
      expect(mockLoggerDebug).toHaveBeenCalledWith('Retrying webhook message');
      expect(mockLoggerDebug).toHaveBeenCalledWith('Retrying sync message');
      expect(mockLoggerDebug).toHaveBeenCalledWith('Retrying notification message');
    });

    it('should handle unknown queue type', async () => {
      const message = {
        id: 'msg-1',
        queue: 'unknown-queue',
        payload: {},
        error: '',
        failedAt: '',
        retryCount: 0,
      };

      mockLrange.mockResolvedValue([JSON.stringify(message)]);
      mockLset.mockResolvedValue('OK');

      const result = await recoveryService.processDeadLetterQueue();

      expect(result.failed).toBe(1);
      expect(mockLoggerWarn).toHaveBeenCalledWith('Unknown queue type for message', {
        queue: 'unknown-queue',
      });
    });

    it('should update retry count on failure', async () => {
      const message = {
        id: 'msg-1',
        queue: 'unknown-queue',
        payload: {},
        error: '',
        failedAt: '',
        retryCount: 1,
      };

      mockLrange.mockResolvedValue([JSON.stringify(message)]);
      mockLset.mockResolvedValue('OK');

      await recoveryService.processDeadLetterQueue();

      const updatedMessage = { ...message, retryCount: 2 };
      expect(mockLset).toHaveBeenCalledWith(
        'integration:dlq',
        0,
        JSON.stringify(updatedMessage)
      );
    });

    it('should handle JSON parse errors', async () => {
      mockLrange.mockResolvedValue(['invalid-json']);

      const result = await recoveryService.processDeadLetterQueue();

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to parse dead letter message',
        expect.any(Object)
      );
    });

    it('should handle Redis errors', async () => {
      mockLrange.mockRejectedValue(new Error('Redis connection lost'));

      const result = await recoveryService.processDeadLetterQueue();

      expect(result.errors).toContain('Redis connection lost');
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to process dead letter queue',
        expect.any(Object)
      );
    });

    it('should log completion with results', async () => {
      mockLrange.mockResolvedValue([]);

      await recoveryService.processDeadLetterQueue();

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Dead letter queue processing complete',
        expect.objectContaining({
          processed: 0,
          recovered: 0,
          failed: 0,
        })
      );
    });
  });

  describe('recoverStaleOperations', () => {
    it('should find and recover stale operations', async () => {
      const staleOps = [
        { id: 'op-1', type: 'sync', status: 'pending', venueId: 'v1', createdAt: '', lastUpdatedAt: '' },
        { id: 'op-2', type: 'sync', status: 'in_progress', venueId: 'v2', createdAt: '', lastUpdatedAt: '' },
      ];

      mockDbSelect.mockResolvedValue(staleOps);
      mockDbUpdate.mockResolvedValue(1);
      mockDbInsert.mockResolvedValue([1]);

      const result = await recoveryService.recoverStaleOperations();

      expect(result.processed).toBe(2);
      expect(result.recovered).toBe(2);
      expect(mockDb).toHaveBeenCalledWith('integration_operations');
    });

    it('should mark stale operations as failed', async () => {
      const staleOps = [
        { id: 'op-1', type: 'sync', status: 'pending', venueId: 'v1', createdAt: '', lastUpdatedAt: '' },
      ];

      mockDbSelect.mockResolvedValue(staleOps);
      mockDbUpdate.mockResolvedValue(1);
      mockDbInsert.mockResolvedValue([1]);

      await recoveryService.recoverStaleOperations();

      expect(mockDbUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error_message: 'Operation timed out and was recovered',
        })
      );
    });

    it('should create audit log entry', async () => {
      const staleOps = [
        { id: 'op-1', type: 'sync', status: 'pending', venueId: 'v1', createdAt: '', lastUpdatedAt: '' },
      ];

      mockDbSelect.mockResolvedValue(staleOps);
      mockDbUpdate.mockResolvedValue(1);
      mockDbInsert.mockResolvedValue([1]);

      await recoveryService.recoverStaleOperations();

      expect(mockDb).toHaveBeenCalledWith('integration_audit_log');
      expect(mockDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          operation_id: 'op-1',
          venue_id: 'v1',
          action: 'recovery',
        })
      );
    });

    it('should handle no stale operations', async () => {
      mockDbSelect.mockResolvedValue([]);

      const result = await recoveryService.recoverStaleOperations();

      expect(result.processed).toBe(0);
      expect(mockLoggerInfo).toHaveBeenCalledWith('Found stale operations', { count: 0 });
    });

    it('should handle recovery errors for individual operations', async () => {
      const staleOps = [
        { id: 'op-1', type: 'sync', status: 'pending', venueId: 'v1', createdAt: '', lastUpdatedAt: '' },
      ];

      mockDbSelect.mockResolvedValue(staleOps);
      mockDbUpdate.mockRejectedValue(new Error('Update failed'));

      const result = await recoveryService.recoverStaleOperations();

      // recoverOperation catches the error internally and returns false
      // so it increments failed but doesn't add to errors array
      expect(result.failed).toBe(1);
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to recover operation',
        expect.objectContaining({
          operationId: 'op-1',
        })
      );
    });

    it('should handle database query errors', async () => {
      mockDbSelect.mockRejectedValue(new Error('Database connection lost'));

      const result = await recoveryService.recoverStaleOperations();

      expect(result.errors).toContain('Database connection lost');
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to recover stale operations',
        expect.any(Object)
      );
    });

    it('should log recovery attempt', async () => {
      const staleOps = [
        { id: 'op-1', type: 'sync', status: 'in_progress', venueId: 'v1', createdAt: '', lastUpdatedAt: '' },
      ];

      mockDbSelect.mockResolvedValue(staleOps);
      mockDbUpdate.mockResolvedValue(1);
      mockDbInsert.mockResolvedValue([1]);

      await recoveryService.recoverStaleOperations();

      expect(mockLoggerInfo).toHaveBeenCalledWith('Attempting to recover operation', {
        operationId: 'op-1',
        type: 'sync',
        status: 'in_progress',
      });
    });

    it('should log completion with results', async () => {
      mockDbSelect.mockResolvedValue([]);

      await recoveryService.recoverStaleOperations();

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Stale operation recovery complete',
        expect.objectContaining({
          processed: 0,
          recovered: 0,
          failed: 0,
        })
      );
    });
  });
});

// Mock database config BEFORE imports
const mockReturning = jest.fn();
const mockUpdate = jest.fn(() => ({ returning: mockReturning }));
const mockDel = jest.fn();
const mockFirst = jest.fn();
const mockOrderBy = jest.fn();
const mockLimit = jest.fn();
const mockWhere = jest.fn();
const mockInsert = jest.fn(() => ({ returning: mockReturning }));

// The query builder object that gets returned from db('tableName')
const mockQueryBuilder = {
  insert: mockInsert,
  where: mockWhere,
  first: mockFirst,
  update: mockUpdate,
  del: mockDel,
  orderBy: mockOrderBy,
  limit: mockLimit,
};

// Make where() and orderBy() and limit() return the query builder for chaining
mockWhere.mockReturnValue(mockQueryBuilder);
mockOrderBy.mockReturnValue(mockQueryBuilder);
mockLimit.mockReturnValue(mockQueryBuilder);

const mockDb = jest.fn(() => mockQueryBuilder);

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

import { SyncLogModel, ISyncLog } from '../../../src/models/SyncLog';

describe('SyncLogModel', () => {
  let model: SyncLogModel;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnValue(mockQueryBuilder);
    mockOrderBy.mockReturnValue(mockQueryBuilder);
    mockLimit.mockReturnValue(mockQueryBuilder);
    model = new SyncLogModel();
  });

  describe('constructor', () => {
    it('should use default db when no db provided', () => {
      const instance = new SyncLogModel();
      expect(instance).toBeInstanceOf(SyncLogModel);
    });

    it('should use provided db when passed', () => {
      const customDb = jest.fn() as any;
      const instance = new SyncLogModel(customDb);
      expect(instance).toBeInstanceOf(SyncLogModel);
    });
  });

  describe('create', () => {
    it('should insert sync log and return created record', async () => {
      const logData: ISyncLog = {
        integration_id: 'int-123',
        status: 'success',
        records_synced: 100,
        started_at: new Date('2024-01-01T10:00:00Z'),
      };

      const createdLog = {
        id: 'log-789',
        ...logData,
        created_at: new Date(),
      };

      mockReturning.mockResolvedValue([createdLog]);

      const result = await model.create(logData);

      expect(mockDb).toHaveBeenCalledWith('sync_logs');
      expect(mockInsert).toHaveBeenCalledWith(logData);
      expect(mockReturning).toHaveBeenCalledWith('*');
      expect(result).toEqual(createdLog);
    });

    it('should insert sync log with errors', async () => {
      const logData: ISyncLog = {
        integration_id: 'int-123',
        status: 'failed',
        errors: { message: 'Connection timeout', code: 'TIMEOUT' },
        started_at: new Date(),
      };

      mockReturning.mockResolvedValue([{ id: 'log-1', ...logData }]);

      await model.create(logData);

      expect(mockInsert).toHaveBeenCalledWith(logData);
    });

    it('should handle partial status', async () => {
      const logData: ISyncLog = {
        integration_id: 'int-123',
        status: 'partial',
        records_synced: 50,
        errors: { partialFailures: ['record-1', 'record-2'] },
        started_at: new Date(),
      };

      mockReturning.mockResolvedValue([{ id: 'log-1', ...logData }]);

      const result = await model.create(logData);

      expect(result.status).toBe('partial');
    });

    it('should insert sync log with completion time', async () => {
      const startedAt = new Date('2024-01-01T10:00:00Z');
      const completedAt = new Date('2024-01-01T10:05:00Z');

      const logData: ISyncLog = {
        integration_id: 'int-123',
        status: 'success',
        records_synced: 1000,
        started_at: startedAt,
        completed_at: completedAt,
      };

      mockReturning.mockResolvedValue([{ id: 'log-1', ...logData }]);

      await model.create(logData);

      expect(mockInsert).toHaveBeenCalledWith(logData);
    });
  });

  describe('findById', () => {
    it('should return sync log when found', async () => {
      const log: ISyncLog = {
        id: 'log-123',
        integration_id: 'int-456',
        status: 'success',
        records_synced: 200,
        started_at: new Date(),
      };

      mockFirst.mockResolvedValue(log);

      const result = await model.findById('log-123');

      expect(mockDb).toHaveBeenCalledWith('sync_logs');
      expect(mockWhere).toHaveBeenCalledWith({ id: 'log-123' });
      expect(mockFirst).toHaveBeenCalled();
      expect(result).toEqual(log);
    });

    it('should return null when sync log not found', async () => {
      mockFirst.mockResolvedValue(undefined);

      const result = await model.findById('non-existent');

      expect(mockWhere).toHaveBeenCalledWith({ id: 'non-existent' });
      expect(result).toBeNull();
    });

    it('should return null when first returns null', async () => {
      mockFirst.mockResolvedValue(null);

      const result = await model.findById('log-123');

      expect(result).toBeNull();
    });
  });

  describe('findByIntegrationId', () => {
    it('should return sync logs ordered by created_at desc with default limit', async () => {
      const logs: ISyncLog[] = [
        {
          id: 'log-1',
          integration_id: 'int-123',
          status: 'success',
          started_at: new Date(),
        },
        {
          id: 'log-2',
          integration_id: 'int-123',
          status: 'failed',
          started_at: new Date(),
        },
      ];

      mockLimit.mockResolvedValue(logs);

      const result = await model.findByIntegrationId('int-123');

      expect(mockDb).toHaveBeenCalledWith('sync_logs');
      expect(mockWhere).toHaveBeenCalledWith({ integration_id: 'int-123' });
      expect(mockOrderBy).toHaveBeenCalledWith('created_at', 'desc');
      expect(mockLimit).toHaveBeenCalledWith(10);
      expect(result).toEqual(logs);
    });

    it('should use custom limit when provided', async () => {
      const logs: ISyncLog[] = [
        {
          id: 'log-1',
          integration_id: 'int-123',
          status: 'success',
          started_at: new Date(),
        },
      ];

      mockLimit.mockResolvedValue(logs);

      await model.findByIntegrationId('int-123', 5);

      expect(mockLimit).toHaveBeenCalledWith(5);
    });

    it('should return empty array when no logs found', async () => {
      mockLimit.mockResolvedValue([]);

      const result = await model.findByIntegrationId('int-456');

      expect(result).toEqual([]);
    });

    it('should handle large limit values', async () => {
      mockLimit.mockResolvedValue([]);

      await model.findByIntegrationId('int-123', 100);

      expect(mockLimit).toHaveBeenCalledWith(100);
    });

    it('should order by created_at descending', async () => {
      mockLimit.mockResolvedValue([]);

      await model.findByIntegrationId('int-123');

      expect(mockOrderBy).toHaveBeenCalledWith('created_at', 'desc');
    });
  });

  describe('update', () => {
    beforeEach(() => {
      // Reset where to return query builder for update tests
      mockWhere.mockReturnValue(mockQueryBuilder);
    });

    it('should update sync log and return updated record', async () => {
      const updateData: Partial<ISyncLog> = {
        status: 'success',
        records_synced: 500,
        completed_at: new Date(),
      };

      const updatedLog = {
        id: 'log-123',
        integration_id: 'int-456',
        status: 'success',
        records_synced: 500,
        started_at: new Date(),
        completed_at: updateData.completed_at,
      };

      mockReturning.mockResolvedValue([updatedLog]);

      const result = await model.update('log-123', updateData);

      expect(mockDb).toHaveBeenCalledWith('sync_logs');
      expect(mockWhere).toHaveBeenCalledWith({ id: 'log-123' });
      expect(mockUpdate).toHaveBeenCalledWith(updateData);
      expect(mockReturning).toHaveBeenCalledWith('*');
      expect(result).toEqual(updatedLog);
    });

    it('should return null when sync log not found', async () => {
      mockReturning.mockResolvedValue([]);

      const result = await model.update('non-existent', { status: 'failed' });

      expect(result).toBeNull();
    });

    it('should update status to failed with errors', async () => {
      const errors = { message: 'API rate limit exceeded' };
      mockReturning.mockResolvedValue([{ id: 'log-123', status: 'failed', errors }]);

      await model.update('log-123', { status: 'failed', errors });

      expect(mockUpdate).toHaveBeenCalledWith({ status: 'failed', errors });
    });

    it('should update completed_at timestamp', async () => {
      const completedAt = new Date();
      mockReturning.mockResolvedValue([{ id: 'log-123', completed_at: completedAt }]);

      await model.update('log-123', { completed_at: completedAt });

      expect(mockUpdate).toHaveBeenCalledWith({ completed_at: completedAt });
    });

    it('should handle partial updates', async () => {
      mockReturning.mockResolvedValue([{ id: 'log-123', records_synced: 250 }]);

      await model.update('log-123', { records_synced: 250 });

      expect(mockUpdate).toHaveBeenCalledWith({ records_synced: 250 });
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      // Reset where to return query builder for delete tests
      mockWhere.mockReturnValue(mockQueryBuilder);
    });

    it('should return true when sync log deleted', async () => {
      mockDel.mockResolvedValue(1);

      const result = await model.delete('log-123');

      expect(mockDb).toHaveBeenCalledWith('sync_logs');
      expect(mockWhere).toHaveBeenCalledWith({ id: 'log-123' });
      expect(mockDel).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when sync log not found', async () => {
      mockDel.mockResolvedValue(0);

      const result = await model.delete('non-existent');

      expect(result).toBe(false);
    });

    it('should return true when multiple rows deleted', async () => {
      mockDel.mockResolvedValue(2);

      const result = await model.delete('log-123');

      expect(result).toBe(true);
    });
  });
});

import { QueueModel, IQueue } from '../../../src/models/Queue';
import Knex from 'knex';

describe('QueueModel', () => {
  let mockDb: any;
  let queueModel: QueueModel;

  beforeEach(() => {
    // Create a mock Knex instance with chainable query builder
    mockDb = {
      insert: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      first: jest.fn(),
      returning: jest.fn(),
      update: jest.fn().mockReturnThis(),
      del: jest.fn(),
      orderBy: jest.fn().mockReturnThis(),
      increment: jest.fn(),
    };

    // Mock the table function to return the mock query builder
    const tableMock = jest.fn(() => mockDb);
    mockDb = Object.assign(tableMock, mockDb);

    queueModel = new QueueModel(mockDb as unknown as Knex);
  });

  describe('Constructor', () => {
    it('should initialize with provided db instance', () => {
      const model = new QueueModel(mockDb as unknown as Knex);
      expect(model).toBeInstanceOf(QueueModel);
    });

    it('should use default db if none provided', () => {
      const model = new QueueModel();
      expect(model).toBeInstanceOf(QueueModel);
    });
  });

  describe('create', () => {
    it('should insert queue and return created queue', async () => {
      const queueData: IQueue = {
        name: 'payment-queue',
        type: 'money',
        active: true,
        config: { priority: 5 },
      };

      const expectedQueue: IQueue = {
        ...queueData,
        id: 'queue-123',
        pending_count: 0,
        processing_count: 0,
        completed_count: 0,
        failed_count: 0,
        created_at: new Date(),
      };

      mockDb.returning.mockResolvedValue([expectedQueue]);

      const result = await queueModel.create(queueData);

      expect(mockDb).toHaveBeenCalledWith('queues');
      expect(mockDb.insert).toHaveBeenCalledWith(queueData);
      expect(mockDb.returning).toHaveBeenCalledWith('*');
      expect(result).toEqual(expectedQueue);
    });

    it('should handle queue with config object', async () => {
      const config = { retries: 3, timeout: 5000 };
      const queueData: IQueue = {
        name: 'email-queue',
        type: 'communication',
        active: true,
        config,
      };

      mockDb.returning.mockResolvedValue([{ ...queueData, id: 'queue-456' }]);

      const result = await queueModel.create(queueData);

      expect(mockDb.insert).toHaveBeenCalledWith(queueData);
      expect(result.config).toEqual(config);
    });

    it('should handle inactive queue', async () => {
      const queueData: IQueue = {
        name: 'test-queue',
        type: 'background',
        active: false,
      };

      mockDb.returning.mockResolvedValue([{ ...queueData, id: 'queue-789' }]);

      const result = await queueModel.create(queueData);

      expect(result.active).toBe(false);
    });
  });

  describe('findById', () => {
    it('should return queue when found', async () => {
      const expectedQueue: IQueue = {
        id: 'queue-123',
        name: 'test-queue',
        type: 'background',
        active: true,
      };

      mockDb.first.mockResolvedValue(expectedQueue);

      const result = await queueModel.findById('queue-123');

      expect(mockDb).toHaveBeenCalledWith('queues');
      expect(mockDb.where).toHaveBeenCalledWith({ id: 'queue-123' });
      expect(mockDb.first).toHaveBeenCalled();
      expect(result).toEqual(expectedQueue);
    });

    it('should return null when queue not found', async () => {
      mockDb.first.mockResolvedValue(undefined);

      const result = await queueModel.findById('nonexistent-id');

      expect(result).toBeNull();
    });

    it('should return null when first returns null', async () => {
      mockDb.first.mockResolvedValue(null);

      const result = await queueModel.findById('queue-999');

      expect(result).toBeNull();
    });
  });

  describe('findByName', () => {
    it('should return queue when found by name', async () => {
      const expectedQueue: IQueue = {
        id: 'queue-123',
        name: 'payment-queue',
        type: 'money',
        active: true,
      };

      mockDb.first.mockResolvedValue(expectedQueue);

      const result = await queueModel.findByName('payment-queue');

      expect(mockDb).toHaveBeenCalledWith('queues');
      expect(mockDb.where).toHaveBeenCalledWith({ name: 'payment-queue' });
      expect(mockDb.first).toHaveBeenCalled();
      expect(result).toEqual(expectedQueue);
    });

    // NOTE: This test documents inconsistent behavior with findById
    // findById returns null when not found, but findByName returns undefined
    // This is because findByName is missing the `|| null` coercion
    it('should return undefined when queue name not found (inconsistent with findById)', async () => {
      mockDb.first.mockResolvedValue(undefined);

      const result = await queueModel.findByName('nonexistent-queue');

      // Actual behavior: returns undefined (not null like findById)
      expect(result).toBeUndefined();
    });

    it('should handle special characters in queue name', async () => {
      mockDb.first.mockResolvedValue(null);

      await queueModel.findByName('test-queue_v2.0');

      expect(mockDb.where).toHaveBeenCalledWith({ name: 'test-queue_v2.0' });
    });
  });

  describe('findAll', () => {
    it('should return all queues when no filters provided', async () => {
      const queues: IQueue[] = [
        { id: '1', name: 'email-queue', type: 'communication', active: true },
        { id: '2', name: 'payment-queue', type: 'money', active: true },
        { id: '3', name: 'analytics-queue', type: 'background', active: false },
      ];

      mockDb.orderBy.mockResolvedValue(queues);

      const result = await queueModel.findAll();

      expect(mockDb).toHaveBeenCalledWith('queues');
      expect(mockDb.where).toHaveBeenCalledWith({});
      expect(mockDb.orderBy).toHaveBeenCalledWith('name', 'asc');
      expect(result).toEqual(queues);
    });

    it('should filter by active status', async () => {
      const activeQueues: IQueue[] = [
        { id: '1', name: 'email-queue', type: 'communication', active: true },
        { id: '2', name: 'payment-queue', type: 'money', active: true },
      ];

      mockDb.orderBy.mockResolvedValue(activeQueues);

      const result = await queueModel.findAll({ active: true });

      expect(mockDb.where).toHaveBeenCalledWith({ active: true });
      expect(result).toEqual(activeQueues);
    });

    it('should filter by queue type', async () => {
      const moneyQueues: IQueue[] = [
        { id: '1', name: 'payment-queue', type: 'money', active: true },
        { id: '2', name: 'refund-queue', type: 'money', active: true },
      ];

      mockDb.orderBy.mockResolvedValue(moneyQueues);

      const result = await queueModel.findAll({ type: 'money' });

      expect(mockDb.where).toHaveBeenCalledWith({ type: 'money' });
      expect(result).toEqual(moneyQueues);
    });

    it('should filter by multiple criteria', async () => {
      mockDb.orderBy.mockResolvedValue([]);

      await queueModel.findAll({ type: 'background', active: false });

      expect(mockDb.where).toHaveBeenCalledWith({ type: 'background', active: false });
    });

    it('should return empty array when no queues match', async () => {
      mockDb.orderBy.mockResolvedValue([]);

      const result = await queueModel.findAll({ type: 'nonexistent' });

      expect(result).toEqual([]);
    });

    it('should always order results by name ascending', async () => {
      mockDb.orderBy.mockResolvedValue([]);

      await queueModel.findAll({ active: true });

      expect(mockDb.orderBy).toHaveBeenCalledWith('name', 'asc');
    });
  });

  describe('update', () => {
    it('should update queue and return updated queue', async () => {
      const updates: Partial<IQueue> = {
        active: false,
        config: { maxRetries: 5 },
      };

      const updatedQueue: IQueue = {
        id: 'queue-123',
        name: 'test-queue',
        type: 'background',
        active: false,
        config: { maxRetries: 5 },
        updated_at: expect.any(Date),
      };

      mockDb.returning.mockResolvedValue([updatedQueue]);

      const result = await queueModel.update('queue-123', updates);

      expect(mockDb).toHaveBeenCalledWith('queues');
      expect(mockDb.where).toHaveBeenCalledWith({ id: 'queue-123' });
      expect(mockDb.update).toHaveBeenCalledWith({
        ...updates,
        updated_at: expect.any(Date),
      });
      expect(mockDb.returning).toHaveBeenCalledWith('*');
      expect(result).toEqual(updatedQueue);
    });

    it('should automatically set updated_at timestamp', async () => {
      const beforeUpdate = new Date();
      mockDb.returning.mockResolvedValue([{ id: 'queue-123', active: false }]);

      await queueModel.update('queue-123', { active: false });

      const updateCall = mockDb.update.mock.calls[0][0];
      expect(updateCall.updated_at).toBeInstanceOf(Date);
      expect(updateCall.updated_at.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });

    it('should return null when queue not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      const result = await queueModel.update('nonexistent-id', { active: false });

      expect(result).toBeNull();
    });

    it('should handle partial updates', async () => {
      const partialUpdate = { pending_count: 42 };
      mockDb.returning.mockResolvedValue([{ id: 'queue-123', ...partialUpdate }]);

      await queueModel.update('queue-123', partialUpdate);

      expect(mockDb.update).toHaveBeenCalledWith({
        pending_count: 42,
        updated_at: expect.any(Date),
      });
    });

    it('should update config object', async () => {
      const newConfig = { timeout: 10000, retries: 3 };
      mockDb.returning.mockResolvedValue([{ id: 'queue-123', config: newConfig }]);

      const result = await queueModel.update('queue-123', { config: newConfig });

      expect(mockDb.update).toHaveBeenCalledWith({
        config: newConfig,
        updated_at: expect.any(Date),
      });
    });
  });

  describe('incrementCounter', () => {
    it('should increment pending_count and return true', async () => {
      mockDb.increment.mockResolvedValue(1);

      const result = await queueModel.incrementCounter('queue-123', 'pending');

      expect(mockDb).toHaveBeenCalledWith('queues');
      expect(mockDb.where).toHaveBeenCalledWith({ id: 'queue-123' });
      expect(mockDb.increment).toHaveBeenCalledWith('pending_count', 1);
      expect(result).toBe(true);
    });

    it('should increment processing_count and return true', async () => {
      mockDb.increment.mockResolvedValue(1);

      const result = await queueModel.incrementCounter('queue-123', 'processing');

      expect(mockDb.increment).toHaveBeenCalledWith('processing_count', 1);
      expect(result).toBe(true);
    });

    it('should increment completed_count and return true', async () => {
      mockDb.increment.mockResolvedValue(1);

      const result = await queueModel.incrementCounter('queue-123', 'completed');

      expect(mockDb.increment).toHaveBeenCalledWith('completed_count', 1);
      expect(result).toBe(true);
    });

    it('should increment failed_count and return true', async () => {
      mockDb.increment.mockResolvedValue(1);

      const result = await queueModel.incrementCounter('queue-123', 'failed');

      expect(mockDb.increment).toHaveBeenCalledWith('failed_count', 1);
      expect(result).toBe(true);
    });

    it('should return false when queue does not exist', async () => {
      mockDb.increment.mockResolvedValue(0);

      const result = await queueModel.incrementCounter('nonexistent-id', 'pending');

      expect(result).toBe(false);
    });

    it('should handle any counter name', async () => {
      mockDb.increment.mockResolvedValue(1);

      await queueModel.incrementCounter('queue-123', 'custom');

      expect(mockDb.increment).toHaveBeenCalledWith('custom_count', 1);
    });
  });

  describe('delete', () => {
    it('should delete queue and return true', async () => {
      mockDb.del.mockResolvedValue(1);

      const result = await queueModel.delete('queue-123');

      expect(mockDb).toHaveBeenCalledWith('queues');
      expect(mockDb.where).toHaveBeenCalledWith({ id: 'queue-123' });
      expect(mockDb.del).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when queue does not exist', async () => {
      mockDb.del.mockResolvedValue(0);

      const result = await queueModel.delete('nonexistent-id');

      expect(result).toBe(false);
    });

    it('should return true when multiple rows deleted (edge case)', async () => {
      mockDb.del.mockResolvedValue(2);

      const result = await queueModel.delete('queue-123');

      expect(result).toBe(true);
    });
  });
});

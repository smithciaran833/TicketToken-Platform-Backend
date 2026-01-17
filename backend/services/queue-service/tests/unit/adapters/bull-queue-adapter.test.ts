// Mock QueueFactory BEFORE imports
jest.mock('../../../src/queues/factories/queue.factory', () => ({
  QueueFactory: {
    getBoss: jest.fn(),
  },
}));

import { BullQueueAdapter, getQueueAdapter } from '../../../src/adapters/bull-queue-adapter';
import { QueueFactory } from '../../../src/queues/factories/queue.factory';

describe('BullQueueAdapter', () => {
  let mockBoss: any;

  beforeEach(() => {
    mockBoss = {
      send: jest.fn().mockResolvedValue('job-id-123'),
    };

    (QueueFactory.getBoss as jest.Mock).mockReturnValue(mockBoss);
  });

  describe('constructor', () => {
    it('should create adapter with given name', () => {
      const adapter = new BullQueueAdapter('test-queue');

      expect(adapter.name).toBe('test-queue');
    });

    it('should get boss instance from QueueFactory', () => {
      new BullQueueAdapter('money');

      expect(QueueFactory.getBoss).toHaveBeenCalled();
    });

    it('should handle different queue names', () => {
      const moneyAdapter = new BullQueueAdapter('money');
      const commAdapter = new BullQueueAdapter('communication');
      const bgAdapter = new BullQueueAdapter('background');

      expect(moneyAdapter.name).toBe('money');
      expect(commAdapter.name).toBe('communication');
      expect(bgAdapter.name).toBe('background');
    });
  });

  describe('add', () => {
    it('should send job to pg-boss with job name and data', async () => {
      const adapter = new BullQueueAdapter('money');
      const jobData = { amount: 5000, userId: 'user-123' };

      const result = await adapter.add('payment', jobData);

      expect(mockBoss.send).toHaveBeenCalledWith(
        'payment',
        jobData,
        expect.any(Object)
      );
      expect(result).toBe('job-id-123');
    });

    it('should use default options when none provided', async () => {
      const adapter = new BullQueueAdapter('money');

      await adapter.add('payment', { amount: 100 });

      expect(mockBoss.send).toHaveBeenCalledWith(
        'payment',
        { amount: 100 },
        expect.objectContaining({
          retryLimit: 3,
          retryDelay: 1000,
          retryBackoff: false,
          priority: 0,
        })
      );
    });

    it('should map attempts option to retryLimit', async () => {
      const adapter = new BullQueueAdapter('money');

      await adapter.add('payment', { amount: 100 }, { attempts: 10 });

      expect(mockBoss.send).toHaveBeenCalledWith(
        'payment',
        expect.any(Object),
        expect.objectContaining({
          retryLimit: 10,
        })
      );
    });

    it('should map backoff delay option', async () => {
      const adapter = new BullQueueAdapter('money');

      await adapter.add('payment', { amount: 100 }, {
        backoff: { type: 'fixed', delay: 5000 },
      });

      expect(mockBoss.send).toHaveBeenCalledWith(
        'payment',
        expect.any(Object),
        expect.objectContaining({
          retryDelay: 5000,
          retryBackoff: false,
        })
      );
    });

    it('should enable retryBackoff for exponential backoff', async () => {
      const adapter = new BullQueueAdapter('money');

      await adapter.add('payment', { amount: 100 }, {
        backoff: { type: 'exponential', delay: 2000 },
      });

      expect(mockBoss.send).toHaveBeenCalledWith(
        'payment',
        expect.any(Object),
        expect.objectContaining({
          retryDelay: 2000,
          retryBackoff: true,
        })
      );
    });

    it('should map priority option', async () => {
      const adapter = new BullQueueAdapter('money');

      await adapter.add('payment', { amount: 100 }, { priority: 7 });

      expect(mockBoss.send).toHaveBeenCalledWith(
        'payment',
        expect.any(Object),
        expect.objectContaining({
          priority: 7,
        })
      );
    });

    it('should pass through additional options', async () => {
      const adapter = new BullQueueAdapter('money');

      await adapter.add('payment', { amount: 100 }, {
        attempts: 5,
        customOption: 'custom-value',
        anotherOption: 123,
      });

      expect(mockBoss.send).toHaveBeenCalledWith(
        'payment',
        expect.any(Object),
        expect.objectContaining({
          customOption: 'custom-value',
          anotherOption: 123,
        })
      );
    });

    it('should handle empty data object', async () => {
      const adapter = new BullQueueAdapter('background');

      await adapter.add('cleanup', {});

      expect(mockBoss.send).toHaveBeenCalledWith('cleanup', {}, expect.any(Object));
    });

    it('should handle complex nested data', async () => {
      const adapter = new BullQueueAdapter('communication');
      const complexData = {
        to: 'user@example.com',
        template: 'welcome',
        context: {
          user: { name: 'John', preferences: { theme: 'dark' } },
          items: [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item 2' }],
        },
      };

      await adapter.add('email', complexData);

      expect(mockBoss.send).toHaveBeenCalledWith('email', complexData, expect.any(Object));
    });

    it('should propagate errors from boss.send', async () => {
      mockBoss.send.mockRejectedValue(new Error('Database connection failed'));
      const adapter = new BullQueueAdapter('money');

      await expect(adapter.add('payment', { amount: 100 })).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('getJobs', () => {
    it('should return empty array', async () => {
      const adapter = new BullQueueAdapter('money');

      const jobs = await adapter.getJobs(['waiting', 'active']);

      expect(jobs).toEqual([]);
    });

    it('should accept start and end parameters', async () => {
      const adapter = new BullQueueAdapter('money');

      const jobs = await adapter.getJobs(['completed'], 0, 100);

      expect(jobs).toEqual([]);
    });

    it('should use default start and end when not provided', async () => {
      const adapter = new BullQueueAdapter('money');

      const jobs = await adapter.getJobs(['failed']);

      expect(jobs).toEqual([]);
    });
  });

  describe('getJob', () => {
    it('should return null for string job id', async () => {
      const adapter = new BullQueueAdapter('money');

      const job = await adapter.getJob('job-123');

      expect(job).toBeNull();
    });

    it('should return null for numeric job id', async () => {
      const adapter = new BullQueueAdapter('money');

      const job = await adapter.getJob(12345);

      expect(job).toBeNull();
    });
  });

  describe('getWaiting', () => {
    it('should return empty array', async () => {
      const adapter = new BullQueueAdapter('money');

      const waiting = await adapter.getWaiting();

      expect(waiting).toEqual([]);
    });

    it('should accept start and end parameters', async () => {
      const adapter = new BullQueueAdapter('money');

      const waiting = await adapter.getWaiting(10, 20);

      expect(waiting).toEqual([]);
    });
  });

  describe('getJobCounts', () => {
    it('should return zero counts for all states', async () => {
      const adapter = new BullQueueAdapter('money');

      const counts = await adapter.getJobCounts();

      expect(counts).toEqual({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      });
    });
  });

  describe('removeJobs', () => {
    it('should resolve without error', async () => {
      const adapter = new BullQueueAdapter('money');

      await expect(adapter.removeJobs('payment:*')).resolves.toBeUndefined();
    });

    it('should accept any pattern string', async () => {
      const adapter = new BullQueueAdapter('money');

      await expect(adapter.removeJobs('*')).resolves.toBeUndefined();
      await expect(adapter.removeJobs('failed:*')).resolves.toBeUndefined();
    });
  });

  describe('pause', () => {
    it('should resolve without error', async () => {
      const adapter = new BullQueueAdapter('money');

      await expect(adapter.pause()).resolves.toBeUndefined();
    });
  });

  describe('resume', () => {
    it('should resolve without error', async () => {
      const adapter = new BullQueueAdapter('money');

      await expect(adapter.resume()).resolves.toBeUndefined();
    });
  });

  describe('clean', () => {
    it('should return empty array', async () => {
      const adapter = new BullQueueAdapter('money');

      const cleaned = await adapter.clean(60000);

      expect(cleaned).toEqual([]);
    });

    it('should accept status parameter', async () => {
      const adapter = new BullQueueAdapter('money');

      const cleaned = await adapter.clean(60000, 'completed');

      expect(cleaned).toEqual([]);
    });

    it('should accept limit parameter', async () => {
      const adapter = new BullQueueAdapter('money');

      const cleaned = await adapter.clean(60000, 'failed', 100);

      expect(cleaned).toEqual([]);
    });
  });

  describe('obliterate', () => {
    it('should resolve without error', async () => {
      const adapter = new BullQueueAdapter('money');

      await expect(adapter.obliterate()).resolves.toBeUndefined();
    });

    it('should accept options parameter', async () => {
      const adapter = new BullQueueAdapter('money');

      await expect(adapter.obliterate({ force: true })).resolves.toBeUndefined();
    });
  });

  describe('on', () => {
    it('should accept event and callback without error', () => {
      const adapter = new BullQueueAdapter('money');
      const callback = jest.fn();

      expect(() => adapter.on('completed', callback)).not.toThrow();
    });

    it('should handle various event types', () => {
      const adapter = new BullQueueAdapter('money');
      const callback = jest.fn();

      expect(() => adapter.on('completed', callback)).not.toThrow();
      expect(() => adapter.on('failed', callback)).not.toThrow();
      expect(() => adapter.on('progress', callback)).not.toThrow();
      expect(() => adapter.on('error', callback)).not.toThrow();
    });
  });

  describe('process', () => {
    it('should accept processor function', async () => {
      const adapter = new BullQueueAdapter('money');
      const processor = jest.fn();

      await expect(adapter.process(processor)).resolves.toBeUndefined();
    });

    it('should accept concurrency and processor function', async () => {
      const adapter = new BullQueueAdapter('money');
      const processor = jest.fn();

      await expect(adapter.process(5, processor)).resolves.toBeUndefined();
    });

    it('should handle processor being undefined', async () => {
      const adapter = new BullQueueAdapter('money');

      await expect(adapter.process(5)).resolves.toBeUndefined();
    });
  });
});

describe('getQueueAdapter', () => {
  beforeEach(() => {
    const mockBoss = { send: jest.fn() };
    (QueueFactory.getBoss as jest.Mock).mockReturnValue(mockBoss);
  });

  it('should return BullQueueAdapter instance', () => {
    const adapter = getQueueAdapter('money');

    expect(adapter).toBeInstanceOf(BullQueueAdapter);
  });

  it('should create adapter with correct name', () => {
    const adapter = getQueueAdapter('communication');

    expect(adapter.name).toBe('communication');
  });

  it('should create new instance each time', () => {
    const adapter1 = getQueueAdapter('money');
    const adapter2 = getQueueAdapter('money');

    expect(adapter1).not.toBe(adapter2);
  });

  it('should work with different queue names', () => {
    const moneyAdapter = getQueueAdapter('money');
    const commAdapter = getQueueAdapter('communication');
    const bgAdapter = getQueueAdapter('background');

    expect(moneyAdapter.name).toBe('money');
    expect(commAdapter.name).toBe('communication');
    expect(bgAdapter.name).toBe('background');
  });
});

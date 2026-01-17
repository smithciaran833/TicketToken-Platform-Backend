/**
 * Tests for Queue Configuration
 */

// Mock Bull
const mockBullOn = jest.fn();
const mockBullQueue = jest.fn().mockImplementation(() => ({
  on: mockBullOn,
}));

jest.mock('bull', () => mockBullQueue);

// Mock logger
const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
  },
}));

describe('Queue Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();

    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.REDIS_PASSWORD = 'test-password';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  describe('queues', () => {
    it('should create queues with correct priorities', () => {
      const queueConfig = require('../../../src/config/queue');

      expect(queueConfig.queues).toHaveProperty('critical');
      expect(queueConfig.queues).toHaveProperty('high');
      expect(queueConfig.queues).toHaveProperty('normal');
      expect(queueConfig.queues).toHaveProperty('low');
    });

    it('should create queues with Redis config', () => {
      require('../../../src/config/queue');

      expect(mockBullQueue).toHaveBeenCalledWith('integration-critical', {
        redis: {
          host: 'localhost',
          port: 6379,
          password: 'test-password',
        },
      });
    });

    it('should use default Redis host if not provided', () => {
      delete process.env.REDIS_HOST;
      jest.resetModules();

      require('../../../src/config/queue');

      expect(mockBullQueue).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          redis: expect.objectContaining({
            host: 'redis',
          }),
        })
      );
    });

    it('should use default Redis port if not provided', () => {
      delete process.env.REDIS_PORT;
      jest.resetModules();

      require('../../../src/config/queue');

      expect(mockBullQueue).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          redis: expect.objectContaining({
            port: 6379,
          }),
        })
      );
    });
  });

  describe('initializeQueues', () => {
    it('should set up event listeners for all queues', async () => {
      const queueConfig = require('../../../src/config/queue');

      await queueConfig.initializeQueues();

      // 4 queues * 2 events = 8 calls
      expect(mockBullOn).toHaveBeenCalledTimes(8);
      expect(mockBullOn).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockBullOn).toHaveBeenCalledWith('failed', expect.any(Function));
    });

    it('should log when queues are initialized', async () => {
      const queueConfig = require('../../../src/config/queue');

      await queueConfig.initializeQueues();

      expect(mockLoggerInfo).toHaveBeenCalledWith('Queues initialized');
    });

    it('should log completed jobs', async () => {
      const queueConfig = require('../../../src/config/queue');
      await queueConfig.initializeQueues();

      // Get the 'completed' handler
      const completedHandler = mockBullOn.mock.calls.find(
        call => call[0] === 'completed'
      )?.[1];

      expect(completedHandler).toBeDefined();

      // Simulate job completion
      completedHandler({ id: 'job-123' });

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.stringContaining('Job completed'),
        expect.objectContaining({ jobId: 'job-123' })
      );
    });

    it('should log failed jobs', async () => {
      const queueConfig = require('../../../src/config/queue');
      await queueConfig.initializeQueues();

      // Get the 'failed' handler
      const failedHandler = mockBullOn.mock.calls.find(
        call => call[0] === 'failed'
      )?.[1];

      expect(failedHandler).toBeDefined();

      // Simulate job failure
      const error = new Error('Job processing failed');
      failedHandler({ id: 'job-456' }, error);

      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('Job failed'),
        expect.objectContaining({
          jobId: 'job-456',
          error: 'Job processing failed',
        })
      );
    });
  });
});

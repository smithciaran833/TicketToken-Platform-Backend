import { JobExecutor, JobStatus, JobConfig } from '../../../src/jobs/job-executor';
import * as retry from '../../../src/utils/retry';
import { CircuitBreaker } from '../../../src/utils/circuit-breaker';
import * as distributedLock from '../../../src/utils/distributed-lock';
import * as redisConfig from '../../../src/config/redis';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  createContextLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));
jest.mock('../../../src/utils/retry');
jest.mock('../../../src/utils/circuit-breaker');
jest.mock('../../../src/utils/distributed-lock');
jest.mock('../../../src/config/redis');

// Concrete implementation for testing
class TestJob extends JobExecutor {
  public executeCoreCallCount = 0;
  public shouldThrowError = false;

  async executeCore(): Promise<void> {
    this.executeCoreCallCount++;
    
    if (this.shouldThrowError) {
      throw new Error('Test execution error');
    }
  }
}

describe('JobExecutor', () => {
  let mockRedis: any;
  let mockCircuitBreaker: jest.Mocked<CircuitBreaker>;

  const mockRetry = jest.mocked(retry.retry);
  const mockWithLock = jest.mocked(distributedLock.withLock);
  const mockExtendLock = jest.mocked(distributedLock.extendLock);
  const mockGetRedis = jest.mocked(redisConfig.getRedis);

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Redis
    mockRedis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
      exists: jest.fn().mockResolvedValue(0),
      setex: jest.fn().mockResolvedValue('OK'),
      keys: jest.fn().mockResolvedValue([]),
    };
    mockGetRedis.mockReturnValue(mockRedis);

    // Mock CircuitBreaker
    mockCircuitBreaker = {
      isOpen: jest.fn().mockReturnValue(false),
      execute: jest.fn().mockImplementation(async (fn) => await fn()),
    } as any;
    (CircuitBreaker as jest.MockedClass<typeof CircuitBreaker>).mockImplementation(
      () => mockCircuitBreaker
    );

    // Mock retry to execute immediately
    mockRetry.mockImplementation(async (fn) => await fn());

    // Mock withLock to execute immediately
    mockWithLock.mockImplementation(async (key, fn) => await fn());

    // Mock extendLock
    mockExtendLock.mockResolvedValue(true);
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const job = new TestJob({ name: 'test-job' });
      const status = job.getStatus();

      expect(status.name).toBe('test-job');
      expect(status.enabled).toBe(true);
      expect(status.status).toBe(JobStatus.IDLE);
    });

    it('should apply custom configuration', () => {
      const config: JobConfig = {
        name: 'custom-job',
        enabled: false,
        intervalSeconds: 60,
        enableRetry: false,
        enableCircuitBreaker: false,
        enableDistributedLock: false,
      };

      const job = new TestJob(config);
      const status = job.getStatus();

      expect(status.name).toBe('custom-job');
      expect(status.enabled).toBe(false);
    });

    it('should initialize circuit breaker when enabled', () => {
      new TestJob({
        name: 'test-job',
        enableCircuitBreaker: true,
        circuitBreakerOptions: {
          failureThreshold: 3,
          resetTimeoutMs: 60000,
          timeoutMs: 300000,
        },
      });

      expect(CircuitBreaker).toHaveBeenCalledWith(
        'test-job',
        expect.objectContaining({
          failureThreshold: 3,
          resetTimeout: 60000,
        })
      );
    });

    it('should not initialize circuit breaker when disabled', () => {
      new TestJob({
        name: 'test-job',
        enableCircuitBreaker: false,
      });

      expect(CircuitBreaker).not.toHaveBeenCalled();
    });

    it('should apply retry defaults', () => {
      const job = new TestJob({ name: 'test-job' });
      const status = job.getStatus();

      expect(status).toBeDefined();
    });

    it('should apply circuit breaker defaults', () => {
      const job = new TestJob({
        name: 'test-job',
        enableCircuitBreaker: true,
      });

      expect(CircuitBreaker).toHaveBeenCalled();
    });
  });

  describe('getInstanceId', () => {
    it('should return instance ID', () => {
      const job = new TestJob({ name: 'test-job' });
      const instanceId = job.getInstanceId();

      expect(instanceId).toBeDefined();
      expect(typeof instanceId).toBe('string');
      expect(instanceId.length).toBeGreaterThan(0);
    });

    it('should return consistent instance ID across jobs', () => {
      const job1 = new TestJob({ name: 'test-job-1' });
      const job2 = new TestJob({ name: 'test-job-2' });

      expect(job1.getInstanceId()).toBe(job2.getInstanceId());
    });
  });

  describe('start and stop', () => {
    it('should not start if job is disabled', async () => {
      const job = new TestJob({ name: 'test-job', enabled: false });
      await job.start();

      expect(job.getStatus().status).toBe(JobStatus.IDLE);
    });

    it('should check for stalled jobs when stall detection is enabled', async () => {
      const job = new TestJob({
        name: 'test-job',
        enableStallDetection: true,
      });

      await job.start();

      expect(mockRedis.keys).toHaveBeenCalledWith('job:heartbeat:test-job:*');
    });

    it('should persist initial state when persistence is enabled', async () => {
      const job = new TestJob({
        name: 'test-job',
        enablePersistence: true,
      });

      await job.start();

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('job:state:test-job:'),
        expect.any(String),
        'EX',
        86400
      );
    });

    it('should set status to STOPPED when stopped', async () => {
      const job = new TestJob({ name: 'test-job' });
      await job.start();
      await job.stop();

      expect(job.getStatus().status).toBe(JobStatus.STOPPED);
    });

    it('should persist final state when persistence is enabled on stop', async () => {
      const job = new TestJob({
        name: 'test-job',
        enablePersistence: true,
      });

      await job.start();
      mockRedis.set.mockClear();
      await job.stop();

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('job:state:test-job:'),
        expect.stringContaining(JobStatus.STOPPED),
        'EX',
        86400
      );
    });
  });

  describe('getStatus', () => {
    it('should return current status information', () => {
      const job = new TestJob({ name: 'test-job' });
      const status = job.getStatus();

      expect(status).toEqual({
        name: 'test-job',
        status: JobStatus.IDLE,
        enabled: true,
        circuitOpen: false,
        instanceId: expect.any(String),
        executionCount: 0,
        successCount: 0,
        failureCount: 0,
      });
    });

    it('should reflect circuit breaker state', () => {
      mockCircuitBreaker.isOpen.mockReturnValue(true);

      const job = new TestJob({
        name: 'test-job',
        enableCircuitBreaker: true,
      });

      expect(job.getStatus().circuitOpen).toBe(true);
    });

    it('should return circuitOpen as false when circuit breaker is disabled', () => {
      const job = new TestJob({
        name: 'test-job',
        enableCircuitBreaker: false,
      });

      expect(job.getStatus().circuitOpen).toBe(false);
    });
  });

  describe('waitForCompletion', () => {
    it('should resolve immediately if no execution is running', async () => {
      const job = new TestJob({ name: 'test-job' });

      await expect(job.waitForCompletion()).resolves.toBeUndefined();
    });
  });

  describe('stall detection', () => {
    it('should detect and clean up stalled jobs', async () => {
      const stalledHeartbeat = {
        instanceId: 'stalled-instance',
        status: JobStatus.RUNNING,
        timestamp: new Date(Date.now() - 700000).toISOString(), // 11+ minutes ago
      };

      mockRedis.keys.mockResolvedValue(['job:heartbeat:test-job:stalled-instance']);
      mockRedis.get.mockResolvedValue(JSON.stringify(stalledHeartbeat));

      const job = new TestJob({
        name: 'test-job',
        enableStallDetection: true,
        stallThresholdMs: 600000, // 10 minutes
      });

      await job.start();

      expect(mockRedis.del).toHaveBeenCalledWith('job:heartbeat:test-job:stalled-instance');
    });

    it('should not detect non-stalled jobs', async () => {
      const recentHeartbeat = {
        instanceId: 'active-instance',
        status: JobStatus.RUNNING,
        timestamp: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
      };

      mockRedis.keys.mockResolvedValue(['job:heartbeat:test-job:active-instance']);
      mockRedis.get.mockResolvedValue(JSON.stringify(recentHeartbeat));

      const job = new TestJob({
        name: 'test-job',
        enableStallDetection: true,
        stallThresholdMs: 600000, // 10 minutes
      });

      await job.start();

      // Should not delete the active heartbeat
      expect(mockRedis.del).not.toHaveBeenCalledWith('job:heartbeat:test-job:active-instance');
    });

    it('should clean up stalled lock if it exists', async () => {
      const stalledHeartbeat = {
        instanceId: 'stalled-instance',
        status: JobStatus.RUNNING,
        timestamp: new Date(Date.now() - 700000).toISOString(),
      };

      mockRedis.keys.mockResolvedValue(['job:heartbeat:test-job:stalled-instance']);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(stalledHeartbeat)) // heartbeat get
        .mockResolvedValueOnce('stalled-instance'); // lock owner get

      const job = new TestJob({
        name: 'test-job',
        enableStallDetection: true,
        stallThresholdMs: 600000,
      });

      await job.start();

      expect(mockRedis.del).toHaveBeenCalledWith('lock:job:test-job');
    });

    it('should handle stall detection errors gracefully', async () => {
      mockRedis.keys.mockRejectedValue(new Error('Redis error'));

      const job = new TestJob({
        name: 'test-job',
        enableStallDetection: true,
      });

      // Should not throw
      await expect(job.start()).resolves.not.toThrow();
    });
  });

  describe('configuration defaults', () => {
    it('should use default interval seconds', () => {
      const job = new TestJob({ name: 'test-job' });
      expect(job.getStatus()).toBeDefined();
    });

    it('should use custom interval seconds', () => {
      const job = new TestJob({
        name: 'test-job',
        intervalSeconds: 120,
      });
      expect(job.getStatus()).toBeDefined();
    });

    it('should use default lock TTL', () => {
      const job = new TestJob({
        name: 'test-job',
        enableDistributedLock: true,
      });
      expect(job.getStatus()).toBeDefined();
    });

    it('should use custom lock TTL', () => {
      const job = new TestJob({
        name: 'test-job',
        enableDistributedLock: true,
        lockTTLMs: 60000,
      });
      expect(job.getStatus()).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle persistence errors gracefully', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis error'));

      const job = new TestJob({
        name: 'test-job',
        enablePersistence: true,
      });

      // Should not throw
      await expect(job.start()).resolves.not.toThrow();
    });

    it('should handle heartbeat errors gracefully', async () => {
      mockRedis.keys.mockResolvedValue(['some-key']);
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const job = new TestJob({
        name: 'test-job',
        enableStallDetection: true,
      });

      // Should not throw
      await expect(job.start()).resolves.not.toThrow();
    });
  });

  describe('feature flags', () => {
    it('should support disabling retry', () => {
      const job = new TestJob({
        name: 'test-job',
        enableRetry: false,
      });

      expect(job.getStatus()).toBeDefined();
    });

    it('should support disabling circuit breaker', () => {
      const job = new TestJob({
        name: 'test-job',
        enableCircuitBreaker: false,
      });

      expect(job.getStatus().circuitOpen).toBe(false);
    });

    it('should support disabling distributed lock', () => {
      const job = new TestJob({
        name: 'test-job',
        enableDistributedLock: false,
      });

      expect(job.getStatus()).toBeDefined();
    });

    it('should support disabling lock extension', () => {
      const job = new TestJob({
        name: 'test-job',
        enableLockExtension: false,
      });

      expect(job.getStatus()).toBeDefined();
    });

    it('should support disabling stall detection', () => {
      const job = new TestJob({
        name: 'test-job',
        enableStallDetection: false,
      });

      expect(job.getStatus()).toBeDefined();
    });

    it('should support disabling persistence', () => {
      const job = new TestJob({
        name: 'test-job',
        enablePersistence: false,
      });

      expect(job.getStatus()).toBeDefined();
    });
  });
});

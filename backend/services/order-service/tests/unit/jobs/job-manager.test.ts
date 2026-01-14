import { JobManager, jobManager } from '../../../src/jobs/job-manager';
import { JobExecutor, JobStatus } from '../../../src/jobs/job-executor';
import { logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  createContextLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Mock JobExecutor
class MockJobExecutor {
  private name: string;
  private status: JobStatus = JobStatus.IDLE;
  private enabled: boolean = true;
  public startCalled = false;
  public stopCalled = false;
  public waitForCompletionCalled = false;
  public shouldFailStart = false;
  public shouldFailStop = false;
  public shouldFailWait = false;

  constructor(name: string, enabled: boolean = true) {
    this.name = name;
    this.enabled = enabled;
  }

  start(): void {
    if (this.shouldFailStart) {
      throw new Error(`Failed to start ${this.name}`);
    }
    this.startCalled = true;
    this.status = JobStatus.IDLE;
  }

  stop(): void {
    if (this.shouldFailStop) {
      throw new Error(`Failed to stop ${this.name}`);
    }
    this.stopCalled = true;
    this.status = JobStatus.STOPPED;
  }

  async waitForCompletion(timeoutMs: number): Promise<void> {
    this.waitForCompletionCalled = true;
    if (this.shouldFailWait) {
      throw new Error(`Wait timeout for ${this.name}`);
    }
  }

  getStatus() {
    return {
      name: this.name,
      status: this.status,
      enabled: this.enabled,
      circuitOpen: false,
    };
  }
}

describe('JobManager', () => {
  let manager: JobManager;
  const mockLogger = logger as jest.Mocked<typeof logger>;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new JobManager();
    
    // Clear any existing process listeners to avoid interference
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
  });

  afterEach(() => {
    // Clean up listeners after each test
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
  });

  describe('register', () => {
    it('should register a job', () => {
      const job = new MockJobExecutor('test-job') as any;
      manager.register(job);

      expect(manager.getJobCount()).toBe(1);
      expect(mockLogger.info).toHaveBeenCalledWith('Job registered', { jobName: 'test-job' });
    });

    it('should register multiple jobs', () => {
      const job1 = new MockJobExecutor('job-1') as any;
      const job2 = new MockJobExecutor('job-2') as any;
      const job3 = new MockJobExecutor('job-3') as any;

      manager.register(job1);
      manager.register(job2);
      manager.register(job3);

      expect(manager.getJobCount()).toBe(3);
    });
  });

  describe('startAll', () => {
    it('should start all registered jobs', () => {
      const job1 = new MockJobExecutor('job-1') as any;
      const job2 = new MockJobExecutor('job-2') as any;

      manager.register(job1);
      manager.register(job2);
      manager.startAll();

      expect(job1.startCalled).toBe(true);
      expect(job2.startCalled).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Starting 2 jobs');
    });

    it('should continue starting other jobs if one fails', () => {
      const job1 = new MockJobExecutor('job-1') as any;
      const job2 = new MockJobExecutor('job-2') as any;
      job1.shouldFailStart = true;

      manager.register(job1);
      manager.register(job2);
      manager.startAll();

      expect(job2.startCalled).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start job',
        expect.objectContaining({
          jobName: 'job-1',
          error: 'Failed to start job-1',
        })
      );
    });

    it('should register shutdown handlers', () => {
      const sigtermListeners = process.listenerCount('SIGTERM');
      const sigintListeners = process.listenerCount('SIGINT');

      manager.startAll();

      expect(process.listenerCount('SIGTERM')).toBeGreaterThan(sigtermListeners);
      expect(process.listenerCount('SIGINT')).toBeGreaterThan(sigintListeners);
    });
  });

  describe('stopAll', () => {
    it('should stop all registered jobs', () => {
      const job1 = new MockJobExecutor('job-1') as any;
      const job2 = new MockJobExecutor('job-2') as any;

      manager.register(job1);
      manager.register(job2);
      manager.stopAll();

      expect(job1.stopCalled).toBe(true);
      expect(job2.stopCalled).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Stopping 2 jobs');
    });

    it('should continue stopping other jobs if one fails', () => {
      const job1 = new MockJobExecutor('job-1') as any;
      const job2 = new MockJobExecutor('job-2') as any;
      job1.shouldFailStop = true;

      manager.register(job1);
      manager.register(job2);
      manager.stopAll();

      expect(job2.stopCalled).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to stop job',
        expect.objectContaining({
          jobName: 'job-1',
          error: 'Failed to stop job-1',
        })
      );
    });
  });

  describe('getAllStatus', () => {
    it('should return status of all jobs', () => {
      const job1 = new MockJobExecutor('job-1') as any;
      const job2 = new MockJobExecutor('job-2', false) as any;

      manager.register(job1);
      manager.register(job2);

      const statuses = manager.getAllStatus();

      expect(statuses).toHaveLength(2);
      expect(statuses[0]).toEqual({
        name: 'job-1',
        status: JobStatus.IDLE,
        enabled: true,
        circuitOpen: false,
      });
      expect(statuses[1]).toEqual({
        name: 'job-2',
        status: JobStatus.IDLE,
        enabled: false,
        circuitOpen: false,
      });
    });

    it('should return empty array when no jobs registered', () => {
      const statuses = manager.getAllStatus();
      expect(statuses).toEqual([]);
    });
  });

  describe('getJob', () => {
    it('should return job by name', () => {
      const job1 = new MockJobExecutor('job-1') as any;
      const job2 = new MockJobExecutor('job-2') as any;

      manager.register(job1);
      manager.register(job2);

      const foundJob = manager.getJob('job-1');
      expect(foundJob).toBe(job1);
    });

    it('should return undefined for non-existent job', () => {
      const job = new MockJobExecutor('job-1') as any;
      manager.register(job);

      const foundJob = manager.getJob('non-existent');
      expect(foundJob).toBeUndefined();
    });
  });

  describe('getJobCount', () => {
    it('should return 0 when no jobs registered', () => {
      expect(manager.getJobCount()).toBe(0);
    });

    it('should return correct count of registered jobs', () => {
      const job1 = new MockJobExecutor('job-1') as any;
      const job2 = new MockJobExecutor('job-2') as any;
      const job3 = new MockJobExecutor('job-3') as any;

      manager.register(job1);
      expect(manager.getJobCount()).toBe(1);

      manager.register(job2);
      expect(manager.getJobCount()).toBe(2);

      manager.register(job3);
      expect(manager.getJobCount()).toBe(3);
    });
  });

  describe('gracefulShutdown', () => {
    it('should stop all jobs and wait for completion', async () => {
      const job1 = new MockJobExecutor('job-1') as any;
      const job2 = new MockJobExecutor('job-2') as any;

      manager.register(job1);
      manager.register(job2);

      await manager.gracefulShutdown(5000);

      expect(job1.stopCalled).toBe(true);
      expect(job2.stopCalled).toBe(true);
      expect(job1.waitForCompletionCalled).toBe(true);
      expect(job2.waitForCompletionCalled).toBe(true);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting graceful shutdown of all jobs',
        expect.objectContaining({
          jobCount: 2,
          timeoutMs: 5000,
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith('All jobs shut down gracefully');
    });

    it('should not start shutdown if already in progress', async () => {
      const job = new MockJobExecutor('job-1') as any;
      manager.register(job);

      // Start first shutdown (don't await)
      const shutdown1 = manager.gracefulShutdown(30000);
      
      // Try to start second shutdown immediately
      await manager.gracefulShutdown(30000);

      expect(mockLogger.warn).toHaveBeenCalledWith('Shutdown already in progress');

      // Clean up
      await shutdown1;
    });

    it('should handle job completion failures gracefully', async () => {
      const job1 = new MockJobExecutor('job-1') as any;
      const job2 = new MockJobExecutor('job-2') as any;
      job1.shouldFailWait = true;

      manager.register(job1);
      manager.register(job2);

      await manager.gracefulShutdown(5000);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Job did not complete gracefully',
        expect.objectContaining({
          jobName: 'job-1',
          error: 'Wait timeout for job-1',
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Job completed gracefully',
        { jobName: 'job-2' }
      );
    });

    it('should use default timeout if not provided', async () => {
      const job = new MockJobExecutor('job-1') as any;
      manager.register(job);

      await manager.gracefulShutdown();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting graceful shutdown of all jobs',
        expect.objectContaining({
          timeoutMs: 30000,
        })
      );
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(jobManager).toBeInstanceOf(JobManager);
    });

    it('should allow registering jobs on singleton', () => {
      const job = new MockJobExecutor('singleton-job') as any;
      const initialCount = jobManager.getJobCount();
      
      jobManager.register(job);
      
      expect(jobManager.getJobCount()).toBe(initialCount + 1);
      
      // Clean up
      jobManager.stopAll();
    });
  });

  describe('error handling in graceful shutdown', () => {
    it('should handle errors during shutdown', async () => {
      const job = new MockJobExecutor('job-1') as any;
      job.shouldFailStop = true;
      job.shouldFailWait = true;

      manager.register(job);

      await manager.gracefulShutdown(1000);

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should complete shutdown even if some jobs fail', async () => {
      const job1 = new MockJobExecutor('job-1') as any;
      const job2 = new MockJobExecutor('job-2') as any;
      const job3 = new MockJobExecutor('job-3') as any;
      
      job1.shouldFailWait = true;
      job3.shouldFailWait = true;

      manager.register(job1);
      manager.register(job2);
      manager.register(job3);

      await manager.gracefulShutdown(5000);

      expect(mockLogger.error).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Job completed gracefully',
        { jobName: 'job-2' }
      );
      expect(mockLogger.info).toHaveBeenCalledWith('All jobs shut down gracefully');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete lifecycle', () => {
      const job1 = new MockJobExecutor('lifecycle-job-1') as any;
      const job2 = new MockJobExecutor('lifecycle-job-2') as any;

      // Register
      manager.register(job1);
      manager.register(job2);
      expect(manager.getJobCount()).toBe(2);

      // Start
      manager.startAll();
      expect(job1.startCalled).toBe(true);
      expect(job2.startCalled).toBe(true);

      // Get status
      const statuses = manager.getAllStatus();
      expect(statuses).toHaveLength(2);

      // Get specific job
      const foundJob = manager.getJob('lifecycle-job-1');
      expect(foundJob).toBe(job1);

      // Stop
      manager.stopAll();
      expect(job1.stopCalled).toBe(true);
      expect(job2.stopCalled).toBe(true);
    });

    it('should handle mixed success and failure scenarios', () => {
      const successJob = new MockJobExecutor('success-job') as any;
      const failStartJob = new MockJobExecutor('fail-start-job') as any;
      const failStopJob = new MockJobExecutor('fail-stop-job') as any;

      failStartJob.shouldFailStart = true;
      failStopJob.shouldFailStop = true;

      manager.register(successJob);
      manager.register(failStartJob);
      manager.register(failStopJob);

      manager.startAll();
      expect(successJob.startCalled).toBe(true);
      expect(failStopJob.startCalled).toBe(true);

      manager.stopAll();
      expect(successJob.stopCalled).toBe(true);
      expect(failStartJob.stopCalled).toBe(true);

      expect(mockLogger.error).toHaveBeenCalledTimes(2);
    });
  });
});

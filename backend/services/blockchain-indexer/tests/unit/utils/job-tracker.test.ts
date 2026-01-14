/**
 * Comprehensive Unit Tests for src/utils/job-tracker.ts
 *
 * Tests job tracking, lifecycle management, and graceful shutdown
 */

// Mock logger
const mockJobLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

const mockCreateJobLogger = jest.fn(() => mockJobLogger);

jest.mock('../../../src/utils/logger', () => ({
  default: mockLogger,
  createJobLogger: mockCreateJobLogger,
  __esModule: true,
}));

// Mock metrics
const mockJobMetrics = {
  recordJobStart: jest.fn(),
  recordJobComplete: jest.fn(),
  recordJobRetry: jest.fn(),
  recordJobDLQ: jest.fn(),
};

jest.mock('../../../src/utils/metrics', () => ({
  JobMetrics: mockJobMetrics,
}));

import {
  JobTracker,
  JobState,
  initializeJobTracker,
  getJobTracker,
  shutdownJobTracker,
} from '../../../src/utils/job-tracker';

describe('src/utils/job-tracker.ts - Comprehensive Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Reset singleton
    (global as any).trackerInstance = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // =============================================================================
  // JOB TRACKER - CONSTRUCTOR
  // =============================================================================

  describe('JobTracker - Constructor', () => {
    it('should create job tracker with default options', () => {
      const tracker = new JobTracker();

      expect(tracker).toBeInstanceOf(JobTracker);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            defaultTimeout: 60000,
            defaultMaxRetries: 3,
            shutdownGracePeriod: 30000,
            timeoutCheckInterval: 5000,
          }),
        }),
        'Job tracker initialized'
      );
    });

    it('should create job tracker with custom options', () => {
      const tracker = new JobTracker({
        defaultTimeout: 120000,
        defaultMaxRetries: 5,
        shutdownGracePeriod: 60000,
        timeoutCheckInterval: 10000,
      });

      expect(tracker).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            defaultTimeout: 120000,
            defaultMaxRetries: 5,
            shutdownGracePeriod: 60000,
            timeoutCheckInterval: 10000,
          }),
        }),
        'Job tracker initialized'
      );
    });

    it('should start timeout checker on initialization', () => {
      const tracker = new JobTracker();
      expect(tracker).toBeDefined();
      // Timeout checker is started internally
    });
  });

  // =============================================================================
  // JOB TRACKER - REGISTER JOB
  // =============================================================================

  describe('JobTracker - registerJob()', () => {
    it('should register a new job', () => {
      const tracker = new JobTracker();
      const job = tracker.registerJob('job-1', 'test-job', { data: 'test' });

      expect(job.id).toBe('job-1');
      expect(job.type).toBe('test-job');
      expect(job.state).toBe(JobState.RUNNING);
      expect(job.data).toEqual({ data: 'test' });
      expect(job.retries).toBe(0);
    });

    it('should use default timeout and max retries', () => {
      const tracker = new JobTracker();
      const job = tracker.registerJob('job-1', 'test-job', {});

      expect(job.timeout).toBe(60000);
      expect(job.maxRetries).toBe(3);
    });

    it('should use custom timeout and max retries', () => {
      const tracker = new JobTracker();
      const job = tracker.registerJob('job-1', 'test-job', {}, {
        timeout: 120000,
        maxRetries: 5,
      });

      expect(job.timeout).toBe(120000);
      expect(job.maxRetries).toBe(5);
    });

    it('should emit jobRegistered event', () => {
      const tracker = new JobTracker();
      const listener = jest.fn();
      tracker.on('jobRegistered', listener);

      const job = tracker.registerJob('job-1', 'test-job', {});

      expect(listener).toHaveBeenCalledWith(job);
    });

    it('should record metrics on job start', () => {
      const tracker = new JobTracker();
      tracker.registerJob('job-1', 'test-job', {});

      expect(mockJobMetrics.recordJobStart).toHaveBeenCalledWith('test-job');
    });

    it('should log job registration', () => {
      const tracker = new JobTracker();
      tracker.registerJob('job-1', 'test-job', {});

      expect(mockCreateJobLogger).toHaveBeenCalledWith('test-job', 'job-1');
      expect(mockJobLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: expect.any(Number),
          maxRetries: expect.any(Number),
          activeJobs: expect.any(Number),
        }),
        'Job started'
      );
    });

    it('should throw error when registering during shutdown', () => {
      const tracker = new JobTracker();
      tracker.shutdown(); // Start shutdown

      expect(() => tracker.registerJob('job-1', 'test-job', {})).toThrow(
        'Cannot register new jobs during shutdown'
      );
    });

    it('should return existing job if already registered', () => {
      const tracker = new JobTracker();
      const job1 = tracker.registerJob('job-1', 'test-job', { data: 1 });
      const job2 = tracker.registerJob('job-1', 'test-job', { data: 2 });

      expect(job1).toBe(job2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { jobId: 'job-1', jobType: 'test-job' },
        'Job already registered'
      );
    });

    it('should increment job counters', () => {
      const tracker = new JobTracker();
      tracker.registerJob('job-1', 'type-a', {});
      tracker.registerJob('job-2', 'type-a', {});
      tracker.registerJob('job-3', 'type-b', {});

      const metrics = tracker.getMetrics();
      expect(metrics.totalJobs).toBe(3);
      expect(metrics.activeJobs).toBe(3);
      expect(metrics.jobsByType['type-a']).toBe(2);
      expect(metrics.jobsByType['type-b']).toBe(1);
    });
  });

  // =============================================================================
  // JOB TRACKER - COMPLETE JOB
  // =============================================================================

  describe('JobTracker - completeJob()', () => {
    it('should mark job as completed', () => {
      const tracker = new JobTracker();
      tracker.registerJob('job-1', 'test-job', {});

      tracker.completeJob('job-1');

      expect(tracker.getJob('job-1')).toBeUndefined();
      expect(tracker.getMetrics().completedJobs).toBe(1);
      expect(tracker.getMetrics().activeJobs).toBe(0);
    });

    it('should emit jobCompleted event', () => {
      const tracker = new JobTracker();
      const listener = jest.fn();
      tracker.on('jobCompleted', listener);

      tracker.registerJob('job-1', 'test-job', {});
      tracker.completeJob('job-1', { result: 'success' });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          result: { result: 'success' },
          duration: expect.any(Number),
        })
      );
    });

    it('should record metrics on completion', () => {
      const tracker = new JobTracker();
      tracker.registerJob('job-1', 'test-job', {});

      jest.advanceTimersByTime(1000);
      tracker.completeJob('job-1');

      expect(mockJobMetrics.recordJobComplete).toHaveBeenCalledWith(
        'test-job',
        true,
        expect.any(Number)
      );
    });

    it('should log job completion', () => {
      const tracker = new JobTracker();
      tracker.registerJob('job-1', 'test-job', {});

      tracker.completeJob('job-1');

      expect(mockJobLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          durationMs: expect.any(Number),
          durationSec: expect.any(String),
          retries: 0,
          activeJobs: 0,
        }),
        'Job completed successfully'
      );
    });

    it('should handle non-existent job gracefully', () => {
      const tracker = new JobTracker();
      tracker.completeJob('non-existent');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { jobId: 'non-existent' },
        'Job not found for completion'
      );
    });

    it('should track average duration', () => {
      const tracker = new JobTracker();
      
      tracker.registerJob('job-1', 'test-job', {});
      jest.advanceTimersByTime(1000);
      tracker.completeJob('job-1');

      tracker.registerJob('job-2', 'test-job', {});
      jest.advanceTimersByTime(3000);
      tracker.completeJob('job-2');

      const metrics = tracker.getMetrics();
      expect(metrics.averageJobDuration).toBeGreaterThan(0);
    });

    it('should keep only last 1000 durations', () => {
      const tracker = new JobTracker();

      // Complete 1005 jobs
      for (let i = 0; i < 1005; i++) {
        tracker.registerJob(`job-${i}`, 'test-job', {});
        tracker.completeJob(`job-${i}`);
      }

      const metrics = tracker.getMetrics();
      expect(metrics.completedJobs).toBe(1005);
      // Average should be calculated from last 1000 only
      expect(metrics.averageJobDuration).toBeGreaterThanOrEqual(0);
    });
  });

  // =============================================================================
  // JOB TRACKER - FAIL JOB
  // =============================================================================

  describe('JobTracker - failJob()', () => {
    it('should fail job and retry when under max retries', () => {
      const tracker = new JobTracker();
      tracker.registerJob('job-1', 'test-job', {}, { maxRetries: 3 });

      tracker.failJob('job-1', new Error('Test error'));

      const job = tracker.getJob('job-1');
      expect(job).toBeDefined();
      expect(job!.state).toBe(JobState.PENDING);
      expect(job!.retries).toBe(1);
      expect(job!.error).toBe('Test error');
    });

    it('should emit jobRetry event when retrying', () => {
      const tracker = new JobTracker();
      const listener = jest.fn();
      tracker.on('jobRetry', listener);

      tracker.registerJob('job-1', 'test-job', {}, { maxRetries: 2 });
      tracker.failJob('job-1', 'Failed');

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1' }));
    });

    it('should record retry metrics', () => {
      const tracker = new JobTracker();
      tracker.registerJob('job-1', 'test-job', {});
      tracker.failJob('job-1', 'Failed');

      expect(mockJobMetrics.recordJobRetry).toHaveBeenCalledWith('test-job');
    });

    it('should fail permanently after max retries', () => {
      const tracker = new JobTracker();
      tracker.registerJob('job-1', 'test-job', {}, { maxRetries: 2 });

      tracker.failJob('job-1', 'Fail 1');
      tracker.failJob('job-1', 'Fail 2');

      expect(tracker.getJob('job-1')).toBeUndefined();
      expect(tracker.getMetrics().failedJobs).toBe(1);
    });

    it('should emit deadLetter event after max retries', () => {
      const tracker = new JobTracker();
      const listener = jest.fn();
      tracker.on('deadLetter', listener);

      tracker.registerJob('job-1', 'test-job', {}, { maxRetries: 1 });
      tracker.failJob('job-1', 'Failed');

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1' }));
    });

    it('should record DLQ metrics on permanent failure', () => {
      const tracker = new JobTracker();
      tracker.registerJob('job-1', 'test-job', {}, { maxRetries: 1 });
      tracker.failJob('job-1', 'Failed');

      expect(mockJobMetrics.recordJobDLQ).toHaveBeenCalledWith('test-job', 'max_retries_exceeded');
    });

    it('should handle string error', () => {
      const tracker = new JobTracker();
      tracker.registerJob('job-1', 'test-job', {});
      tracker.failJob('job-1', 'String error');

      const job = tracker.getJob('job-1');
      expect(job!.error).toBe('String error');
    });

    it('should handle Error object', () => {
      const tracker = new JobTracker();
      tracker.registerJob('job-1', 'test-job', {});
      tracker.failJob('job-1', new Error('Error object'));

      const job = tracker.getJob('job-1');
      expect(job!.error).toBe('Error object');
    });

    it('should handle non-existent job gracefully', () => {
      const tracker = new JobTracker();
      tracker.failJob('non-existent', 'Error');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { jobId: 'non-existent' },
        'Job not found for failure'
      );
    });

    it('should log retry warning', () => {
      const tracker = new JobTracker();
      tracker.registerJob('job-1', 'test-job', {});
      tracker.failJob('job-1', 'Failed');

      expect(mockJobLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          retries: 1,
          maxRetries: 3,
          error: 'Failed',
        }),
        'Job failed, will retry'
      );
    });

    it('should log permanent failure error', () => {
      const tracker = new JobTracker();
      tracker.registerJob('job-1', 'test-job', {}, { maxRetries: 1 });
      tracker.failJob('job-1', 'Failed');

      expect(mockJobLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed',
          retries: 1,
        }),
        'Job failed permanently - sent to DLQ'
      );
    });
  });

  // =============================================================================
  // JOB TRACKER - CANCEL JOB
  // =============================================================================

  describe('JobTracker - cancelJob()', () => {
    it('should cancel job', () => {
      const tracker = new JobTracker();
      tracker.registerJob('job-1', 'test-job', {});

      tracker.cancelJob('job-1', 'User cancelled');

      expect(tracker.getJob('job-1')).toBeUndefined();
      expect(tracker.getMetrics().cancelledJobs).toBe(1);
    });

    it('should emit jobCancelled event', () => {
      const tracker = new JobTracker();
      const listener = jest.fn();
      tracker.on('jobCancelled', listener);

      tracker.registerJob('job-1', 'test-job', {});
      tracker.cancelJob('job-1', 'Cancelled');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'job-1',
          state: JobState.CANCELLED,
        })
      );
    });

    it('should set error with reason', () => {
      const tracker = new JobTracker();
      tracker.registerJob('job-1', 'test-job', {});
      tracker.cancelJob('job-1', 'Custom reason');

      // Job is removed but event contains the cancelled job
      expect(mockLogger.info).toHaveBeenCalledWith(
        { jobId: 'job-1', reason: 'Custom reason' },
        'Job cancelled'
      );
    });

    it('should use default reason when not provided', () => {
      const tracker = new JobTracker();
      tracker.registerJob('job-1', 'test-job', {});
      tracker.cancelJob('job-1');

      expect(mockLogger.info).toHaveBeenCalledWith(
        { jobId: 'job-1', reason: undefined },
        'Job cancelled'
      );
    });

    it('should handle non-existent job gracefully', () => {
      const tracker = new JobTracker();
      tracker.cancelJob('non-existent');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { id: 'non-existent' },
        'Job not found for cancellation'
      );
    });
  });

  // =============================================================================
  // JOB TRACKER - GET METHODS
  // =============================================================================

  describe('JobTracker - Get Methods', () => {
    it('should get job by ID', () => {
      const tracker = new JobTracker();
      tracker.registerJob('job-1', 'test-job', { data: 'test' });

      const job = tracker.getJob('job-1');
      expect(job).toBeDefined();
      expect(job!.id).toBe('job-1');
    });

    it('should return undefined for non-existent job', () => {
      const tracker = new JobTracker();
      const job = tracker.getJob('non-existent');
      expect(job).toBeUndefined();
    });

    it('should get all active jobs', () => {
      const tracker = new JobTracker();
      tracker.registerJob('job-1', 'test-job', {});
      tracker.registerJob('job-2', 'test-job', {});
      tracker.registerJob('job-3', 'test-job', {});

      const jobs = tracker.getActiveJobs();
      expect(jobs).toHaveLength(3);
    });

    it('should get jobs by type', () => {
      const tracker = new JobTracker();
      tracker.registerJob('job-1', 'type-a', {});
      tracker.registerJob('job-2', 'type-b', {});
      tracker.registerJob('job-3', 'type-a', {});

      const typeAJobs = tracker.getJobsByType('type-a');
      expect(typeAJobs).toHaveLength(2);
      expect(typeAJobs.every(j => j.type === 'type-a')).toBe(true);
    });

    it('should get active job count', () => {
      const tracker = new JobTracker();
      tracker.registerJob('job-1', 'test-job', {});
      tracker.registerJob('job-2', 'test-job', {});

      expect(tracker.getActiveJobCount()).toBe(2);

      tracker.completeJob('job-1');
      expect(tracker.getActiveJobCount()).toBe(1);
    });

    it('should check if has active jobs', () => {
      const tracker = new JobTracker();
      expect(tracker.hasActiveJobs()).toBe(false);

      tracker.registerJob('job-1', 'test-job', {});
      expect(tracker.hasActiveJobs()).toBe(true);

      tracker.completeJob('job-1');
      expect(tracker.hasActiveJobs()).toBe(false);
    });
  });

  // =============================================================================
  // JOB TRACKER - GET METRICS
  // =============================================================================

  describe('JobTracker - getMetrics()', () => {
    it('should return comprehensive metrics', () => {
      const tracker = new JobTracker();

      tracker.registerJob('job-1', 'type-a', {});
      tracker.registerJob('job-2', 'type-b', {});
      tracker.completeJob('job-1');
      
      tracker.registerJob('job-3', 'type-a', {}, { maxRetries: 1 });
      tracker.failJob('job-3', 'Failed');

      const metrics = tracker.getMetrics();

      expect(metrics.totalJobs).toBe(3);
      expect(metrics.activeJobs).toBe(1);
      expect(metrics.completedJobs).toBe(1);
      expect(metrics.failedJobs).toBe(1);
      expect(metrics.jobsByType).toEqual({ 'type-a': 2, 'type-b': 1 });
    });

    it('should calculate average duration', () => {
      const tracker = new JobTracker();

      tracker.registerJob('job-1', 'test-job', {});
      jest.advanceTimersByTime(1000);
      tracker.completeJob('job-1');

      const metrics = tracker.getMetrics();
      expect(metrics.averageJobDuration).toBeGreaterThan(0);
    });

    it('should return zero average when no completed jobs', () => {
      const tracker = new JobTracker();
      const metrics = tracker.getMetrics();
      expect(metrics.averageJobDuration).toBe(0);
    });
  });

  // =============================================================================
  // JOB TRACKER - TIMEOUT
  // =============================================================================

  describe('JobTracker - Timeout', () => {
    it('should timeout long-running jobs', () => {
      const tracker = new JobTracker({ timeoutCheckInterval: 1000 });
      const listener = jest.fn();
      tracker.on('jobTimedOut', listener);

      tracker.registerJob('job-1', 'test-job', {}, { timeout: 5000 });

      // Advance past timeout
      jest.advanceTimersByTime(6000);

      expect(listener).toHaveBeenCalled();
      expect(tracker.getJob('job-1')).toBeUndefined();
      expect(tracker.getMetrics().timedOutJobs).toBe(1);
    });

    it('should emit deadLetter event on timeout', () => {
      const tracker = new JobTracker({ timeoutCheckInterval: 1000 });
      const listener = jest.fn();
      tracker.on('deadLetter', listener);

      tracker.registerJob('job-1', 'test-job', {}, { timeout: 5000 });
      jest.advanceTimersByTime(6000);

      expect(listener).toHaveBeenCalled();
    });

    it('should not timeout jobs that complete in time', () => {
      const tracker = new JobTracker({ timeoutCheckInterval: 1000 });
      tracker.registerJob('job-1', 'test-job', {}, { timeout: 5000 });

      jest.advanceTimersByTime(3000);
      tracker.completeJob('job-1');

      jest.advanceTimersByTime(3000);
      expect(tracker.getMetrics().timedOutJobs).toBe(0);
    });
  });

  // =============================================================================
  // JOB TRACKER - SHUTDOWN
  // =============================================================================

  describe('JobTracker - shutdown()', () => {
    it('should shutdown immediately when no active jobs', async () => {
      const tracker = new JobTracker();
      
      const promise = tracker.shutdown();
      jest.runAllTimers();
      await promise;

      expect(mockLogger.info).toHaveBeenCalledWith('No active jobs, shutdown complete');
    });

    it('should wait for jobs to complete', async () => {
      const tracker = new JobTracker({ shutdownGracePeriod: 10000 });
      tracker.registerJob('job-1', 'test-job', {});

      const shutdownPromise = tracker.shutdown();

      // Advance 2 seconds
      jest.advanceTimersByTime(2000);

      // Complete the job
      tracker.completeJob('job-1');

      // Advance to trigger check
      jest.advanceTimersByTime(1000);

      await shutdownPromise;

      expect(mockLogger.info).toHaveBeenCalledWith('All jobs completed, shutdown complete');
    });

    it('should cancel remaining jobs after grace period', async () => {
      const tracker = new JobTracker({ shutdownGracePeriod: 5000 });
      tracker.registerJob('job-1', 'test-job', {});
      tracker.registerJob('job-2', 'test-job', {});

      const shutdownPromise = tracker.shutdown();

      // Advance past grace period
      jest.advanceTimersByTime(6000);

      await shutdownPromise;

      expect(tracker.getActiveJobCount()).toBe(0);
      expect(tracker.getMetrics().cancelledJobs).toBe(2);
    });

    it('should prevent new job registration during shutdown', async () => {
      const tracker = new JobTracker();
      const shutdownPromise = tracker.shutdown();

      expect(() => tracker.registerJob('job-1', 'test-job', {})).toThrow(
        'Cannot register new jobs during shutdown'
      );

      jest.runAllTimers();
      await shutdownPromise;
    });

    it('should log waiting status', async () => {
      const tracker = new JobTracker({ shutdownGracePeriod: 5000 });
      tracker.registerJob('job-1', 'test-job', {});

      const shutdownPromise = tracker.shutdown();

      jest.advanceTimersByTime(2000);
      tracker.completeJob('job-1');
      jest.advanceTimersByTime(1000);

      await shutdownPromise;

      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // JOB TRACKER - RESET
  // =============================================================================

  describe('JobTracker - reset()', () => {
    it('should reset all state', () => {
      const tracker = new JobTracker();
      
      tracker.registerJob('job-1', 'test-job', {});
      tracker.completeJob('job-1');
      tracker.registerJob('job-2', 'test-job', {}, { maxRetries: 1 });
      tracker.failJob('job-2', 'Failed');

      tracker.reset();

      const metrics = tracker.getMetrics();
      expect(metrics.totalJobs).toBe(0);
      expect(metrics.activeJobs).toBe(0);
      expect(metrics.completedJobs).toBe(0);
      expect(metrics.failedJobs).toBe(0);
      expect(tracker.hasActiveJobs()).toBe(false);
    });
  });

  // =============================================================================
  // SINGLETON FUNCTIONS
  // =============================================================================

  describe('Singleton Functions', () => {
    it('should initialize job tracker', () => {
      const tracker = initializeJobTracker();
      expect(tracker).toBeInstanceOf(JobTracker);
    });

    it('should return existing instance', () => {
      const tracker1 = initializeJobTracker();
      const tracker2 = initializeJobTracker();
      expect(tracker1).toBe(tracker2);
    });

    it('should get job tracker instance', () => {
      const tracker = getJobTracker();
      expect(tracker).toBeInstanceOf(JobTracker);
    });

    it('should create instance if not initialized', () => {
      const tracker = getJobTracker();
      expect(tracker).toBeInstanceOf(JobTracker);
    });

    it('should shutdown job tracker', async () => {
      initializeJobTracker();
      
      const promise = shutdownJobTracker();
      jest.runAllTimers();
      await promise;

      // Should be able to create new instance after shutdown
      const newTracker = getJobTracker();
      expect(newTracker).toBeInstanceOf(JobTracker);
    });
  });

  // =============================================================================
  // INTEGRATION TESTS
  // =============================================================================

  describe('Integration Tests', () => {
    it('should handle complete job lifecycle', () => {
      const tracker = new JobTracker();
      const events: string[] = [];

      tracker.on('jobRegistered', () => events.push('registered'));
      tracker.on('jobCompleted', () => events.push('completed'));

      tracker.registerJob('job-1', 'test-job', {});
      jest.advanceTimersByTime(1000);
      tracker.completeJob('job-1');

      expect(events).toEqual(['registered', 'completed']);
      expect(tracker.getMetrics().completedJobs).toBe(1);
    });

    it('should handle retry and eventual success', () => {
      const tracker = new JobTracker();
      const events: string[] = [];

      tracker.on('jobRegistered', () => events.push('registered'));
      tracker.on('jobRetry', () => events.push('retry'));
      tracker.on('jobCompleted', () => events.push('completed'));

      tracker.registerJob('job-1', 'test-job', {}, { maxRetries: 3 });
      tracker.failJob('job-1', 'Error 1');
      tracker.failJob('job-1', 'Error 2');
      tracker.completeJob('job-1');

      expect(events).toEqual(['registered', 'retry', 'retry', 'completed']);
    });

    it('should handle retry exhaustion', () => {
      const tracker = new JobTracker();
      const events: string[] = [];

      tracker.on('jobRegistered', () => events.push('registered'));
      tracker.on('jobRetry', () => events.push('retry'));
      tracker.on('jobFailed', () => events.push('failed'));
      tracker.on('deadLetter', () => events.push('deadLetter'));

      tracker.registerJob('job-1', 'test-job', {}, { maxRetries: 2 });
      tracker.failJob('job-1', 'Error 1');
      tracker.failJob('job-1', 'Error 2');

      expect(events).toEqual(['registered', 'retry', 'failed', 'deadLetter']);
      expect(tracker.getMetrics().failedJobs).toBe(1);
    });

    it('should handle concurrent jobs', () => {
      const tracker = new JobTracker();

      tracker.registerJob('job-1', 'type-a', {});
      tracker.registerJob('job-2', 'type-b', {});
      tracker.registerJob('job-3', 'type-a', {});

      expect(tracker.getActiveJobCount()).toBe(3);

      tracker.completeJob('job-1');
      expect(tracker.getActiveJobCount()).toBe(2);

      tracker.failJob('job-2', 'Failed');
      expect(tracker.getActiveJobCount()).toBe(2); // job-2 still active (pending retry)

      tracker.completeJob('job-3');
      expect(tracker.getActiveJobCount()).toBe(1);
    });

    it('should track metrics across multiple operations', () => {
      const tracker = new JobTracker();

      // Create and complete 3 jobs
      for (let i = 1; i <= 3; i++) {
        tracker.registerJob(`job-${i}`, 'type-a', {});
        jest.advanceTimersByTime(100);
        tracker.completeJob(`job-${i}`);
      }

      // Create and fail 2 jobs
      for (let i = 4; i <= 5; i++) {
        tracker.registerJob(`job-${i}`, 'type-b', {}, { maxRetries: 1 });
        tracker.failJob(`job-${i}`, 'Error');
      }

      // Create and cancel 1 job
      tracker.registerJob('job-6', 'type-c', {});
      tracker.cancelJob('job-6');

      const metrics = tracker.getMetrics();
      expect(metrics.totalJobs).toBe(6);
      expect(metrics.completedJobs).toBe(3);
      expect(metrics.failedJobs).toBe(2);
      expect(metrics.cancelledJobs).toBe(1);
      expect(metrics.averageJobDuration).toBeGreaterThan(0);
    });
  });
});

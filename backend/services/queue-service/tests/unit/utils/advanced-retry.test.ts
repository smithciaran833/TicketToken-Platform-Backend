import {
  calculateRetryDelay,
  shouldRetryJob,
  RetryConfig,
  RetryPresets,
  logRetryMetrics,
  getRetryConfig,
} from '../../../src/utils/advanced-retry';
import { BullJobData } from '../../../src/adapters/bull-job-adapter';
import { logger } from '../../../src/utils/logger';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Advanced Retry Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock Math.random for consistent jitter testing
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('calculateRetryDelay', () => {
    describe('exponential strategy', () => {
      const config: RetryConfig = {
        maxAttempts: 5,
        strategy: 'exponential',
        baseDelay: 1000,
      };

      it('should calculate exponential backoff correctly', () => {
        expect(calculateRetryDelay(1, config)).toBe(2000); // 2^1 * 1000
        expect(calculateRetryDelay(2, config)).toBe(4000); // 2^2 * 1000
        expect(calculateRetryDelay(3, config)).toBe(8000); // 2^3 * 1000
        expect(calculateRetryDelay(4, config)).toBe(16000); // 2^4 * 1000
      });

      it('should handle attempt number 0', () => {
        expect(calculateRetryDelay(0, config)).toBe(1000); // 2^0 * 1000
      });
    });

    describe('linear strategy', () => {
      const config: RetryConfig = {
        maxAttempts: 5,
        strategy: 'linear',
        baseDelay: 1000,
      };

      it('should calculate linear backoff correctly', () => {
        expect(calculateRetryDelay(1, config)).toBe(1000); // 1 * 1000
        expect(calculateRetryDelay(2, config)).toBe(2000); // 2 * 1000
        expect(calculateRetryDelay(3, config)).toBe(3000); // 3 * 1000
        expect(calculateRetryDelay(4, config)).toBe(4000); // 4 * 1000
      });

      it('should handle attempt number 0', () => {
        expect(calculateRetryDelay(0, config)).toBe(0); // 0 * 1000
      });
    });

    describe('fibonacci strategy', () => {
      const config: RetryConfig = {
        maxAttempts: 5,
        strategy: 'fibonacci',
        baseDelay: 1000,
      };

      it('should calculate fibonacci backoff correctly', () => {
        expect(calculateRetryDelay(0, config)).toBe(1000); // fib(0)=1 * 1000
        expect(calculateRetryDelay(1, config)).toBe(1000); // fib(1)=1 * 1000
        expect(calculateRetryDelay(2, config)).toBe(2000); // fib(2)=2 * 1000
        expect(calculateRetryDelay(3, config)).toBe(3000); // fib(3)=3 * 1000
        expect(calculateRetryDelay(4, config)).toBe(5000); // fib(4)=5 * 1000
        expect(calculateRetryDelay(5, config)).toBe(8000); // fib(5)=8 * 1000
      });
    });

    describe('fixed strategy', () => {
      const config: RetryConfig = {
        maxAttempts: 5,
        strategy: 'fixed',
        baseDelay: 5000,
      };

      it('should return fixed delay regardless of attempt number', () => {
        expect(calculateRetryDelay(1, config)).toBe(5000);
        expect(calculateRetryDelay(2, config)).toBe(5000);
        expect(calculateRetryDelay(10, config)).toBe(5000);
      });
    });

    describe('maxDelay cap', () => {
      it('should cap delay at maxDelay for exponential strategy', () => {
        const config: RetryConfig = {
          maxAttempts: 10,
          strategy: 'exponential',
          baseDelay: 1000,
          maxDelay: 10000,
        };

        expect(calculateRetryDelay(1, config)).toBe(2000); // Not capped
        expect(calculateRetryDelay(4, config)).toBe(10000); // 16000 capped to 10000
        expect(calculateRetryDelay(5, config)).toBe(10000); // 32000 capped to 10000
      });

      it('should cap delay at maxDelay for linear strategy', () => {
        const config: RetryConfig = {
          maxAttempts: 10,
          strategy: 'linear',
          baseDelay: 3000,
          maxDelay: 10000,
        };

        expect(calculateRetryDelay(3, config)).toBe(9000); // Not capped
        expect(calculateRetryDelay(4, config)).toBe(10000); // 12000 capped to 10000
      });
    });

    describe('jitter', () => {
      it('should add jitter when enabled', () => {
        const config: RetryConfig = {
          maxAttempts: 5,
          strategy: 'exponential',
          baseDelay: 1000,
          jitter: true,
        };

        // With Math.random mocked to 0.5, jitter should be 0
        // (0.5 * 2 - 1) = 0, so no change
        const delay = calculateRetryDelay(2, config);
        expect(delay).toBe(4000); // 2^2 * 1000 with 0 jitter
      });

      it('should not add jitter when disabled', () => {
        const config: RetryConfig = {
          maxAttempts: 5,
          strategy: 'exponential',
          baseDelay: 1000,
          jitter: false,
        };

        const delay = calculateRetryDelay(2, config);
        expect(delay).toBe(4000);
      });

      it('should apply jitter with different random values', () => {
        const config: RetryConfig = {
          maxAttempts: 5,
          strategy: 'exponential',
          baseDelay: 1000,
          jitter: true,
        };

        // Mock random to return 0 (minimum jitter: -25%)
        (Math.random as jest.Mock).mockReturnValue(0);
        const minDelay = calculateRetryDelay(2, config);
        expect(minDelay).toBe(3000); // 4000 - 25% = 3000

        // Mock random to return 1 (maximum jitter: +25%)
        (Math.random as jest.Mock).mockReturnValue(1);
        const maxDelay = calculateRetryDelay(2, config);
        expect(maxDelay).toBe(5000); // 4000 + 25% = 5000
      });

      it('should not return negative delay with jitter', () => {
        const config: RetryConfig = {
          maxAttempts: 5,
          strategy: 'fixed',
          baseDelay: 100,
          jitter: true,
        };

        // Mock random to return 0 (maximum negative jitter)
        (Math.random as jest.Mock).mockReturnValue(0);
        const delay = calculateRetryDelay(1, config);
        expect(delay).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('shouldRetryJob', () => {
    const baseConfig: RetryConfig = {
      maxAttempts: 3,
      strategy: 'exponential',
      baseDelay: 1000,
    };

    const createJob = (attemptsMade: number = 0): BullJobData => ({
      id: 'test-job-123',
      name: 'test-job',
      data: { test: 'data' },
      opts: {},
      timestamp: Date.now(),
      attemptsMade,
      processedOn: Date.now(),
      finishedOn: undefined,
      failedReason: undefined,
      stacktrace: [],
      returnvalue: undefined,
      progress: 0,
    });

    describe('retry decision', () => {
      it('should retry job when under max attempts', () => {
        const job = createJob(1);
        const error = new Error('Temporary error');
        const result = shouldRetryJob(job, error, baseConfig);

        expect(result.shouldRetry).toBe(true);
        expect(result.delay).toBeGreaterThan(0);
        expect(result.reason).toBeUndefined();
      });

      it('should not retry when max attempts reached', () => {
        const job = createJob(2); // attemptsMade = 2, next would be 3
        const error = new Error('Temporary error');
        const result = shouldRetryJob(job, error, baseConfig);

        expect(result.shouldRetry).toBe(false);
        expect(result.delay).toBe(0);
        expect(result.reason).toContain('Max retry attempts');
      });

      it('should handle job with no attemptsMade', () => {
        const job = createJob(0);
        const error = new Error('Temporary error');
        const result = shouldRetryJob(job, error, baseConfig);

        expect(result.shouldRetry).toBe(true);
        expect(result.delay).toBeGreaterThan(0);
      });
    });

    describe('non-retryable errors', () => {
      it('should not retry for authentication errors', () => {
        const job = createJob(0);
        const errors = [
          new Error('Invalid credentials'),
          new Error('Authentication failed'),
          new Error('Unauthorized access'),
          new Error('Forbidden resource'),
        ];

        errors.forEach(error => {
          const result = shouldRetryJob(job, error, baseConfig);
          expect(result.shouldRetry).toBe(false);
          expect(result.reason).toContain('Non-retryable error');
        });
      });

      it('should not retry for validation errors', () => {
        const job = createJob(0);
        const errors = [
          new Error('Invalid request format'),
          new Error('Bad request'),
          new Error('Validation error occurred'),
          new Error('Invalid format detected'),
          new Error('Malformed data'),
        ];

        errors.forEach(error => {
          const result = shouldRetryJob(job, error, baseConfig);
          expect(result.shouldRetry).toBe(false);
          expect(result.reason).toContain('Non-retryable error');
        });
      });

      it('should not retry for not found errors', () => {
        const job = createJob(0);
        const error = new Error('Resource not found');
        const result = shouldRetryJob(job, error, baseConfig);

        expect(result.shouldRetry).toBe(false);
        expect(result.reason).toContain('Non-retryable error');
      });

      it('should be case-insensitive for error detection', () => {
        const job = createJob(0);
        const errors = [
          new Error('INVALID CREDENTIALS'),
          new Error('Authentication FAILED'),
          new Error('VALIDATION ERROR'),
        ];

        errors.forEach(error => {
          const result = shouldRetryJob(job, error, baseConfig);
          expect(result.shouldRetry).toBe(false);
        });
      });
    });

    describe('retryable errors', () => {
      it('should retry for network errors', () => {
        const job = createJob(0);
        const errors = [
          new Error('Network timeout'),
          new Error('Connection refused'),
          new Error('ECONNRESET'),
          new Error('Service unavailable'),
        ];

        errors.forEach(error => {
          const result = shouldRetryJob(job, error, baseConfig);
          expect(result.shouldRetry).toBe(true);
          expect(result.delay).toBeGreaterThan(0);
        });
      });

      it('should retry for temporary errors', () => {
        const job = createJob(0);
        const errors = [
          new Error('Rate limit exceeded'),
          new Error('Service temporarily unavailable'),
          new Error('Timeout occurred'),
        ];

        errors.forEach(error => {
          const result = shouldRetryJob(job, error, baseConfig);
          expect(result.shouldRetry).toBe(true);
        });
      });
    });

    describe('delay calculation', () => {
      it('should calculate correct delay based on attempt number', () => {
        const config: RetryConfig = {
          maxAttempts: 5,
          strategy: 'exponential',
          baseDelay: 1000,
        };

        const job1 = createJob(0); // Next attempt = 1
        const result1 = shouldRetryJob(job1, new Error('Test'), config);
        expect(result1.delay).toBe(2000); // 2^1 * 1000

        const job2 = createJob(1); // Next attempt = 2
        const result2 = shouldRetryJob(job2, new Error('Test'), config);
        expect(result2.delay).toBe(4000); // 2^2 * 1000
      });
    });

    describe('logging', () => {
      it('should log retry information when retrying', () => {
        const job = createJob(1);
        const error = new Error('Temporary error');
        shouldRetryJob(job, error, baseConfig);

        expect(logger.info).toHaveBeenCalledWith(
          'Job will be retried',
          expect.objectContaining({
            jobId: 'test-job-123',
            attemptNumber: 2,
            maxAttempts: 3,
            strategy: 'exponential',
            error: 'Temporary error',
          })
        );
      });
    });
  });

  describe('RetryPresets', () => {
    it('should have payment preset with correct configuration', () => {
      expect(RetryPresets.payment).toEqual({
        maxAttempts: 5,
        strategy: 'exponential',
        baseDelay: 1000,
        maxDelay: 60000,
        jitter: true,
      });
    });

    it('should have nftMinting preset with correct configuration', () => {
      expect(RetryPresets.nftMinting).toEqual({
        maxAttempts: 3,
        strategy: 'exponential',
        baseDelay: 5000,
        maxDelay: 300000,
        jitter: true,
      });
    });

    it('should have notification preset with correct configuration', () => {
      expect(RetryPresets.notification).toEqual({
        maxAttempts: 3,
        strategy: 'linear',
        baseDelay: 2000,
        maxDelay: 10000,
        jitter: false,
      });
    });

    it('should have webhook preset with correct configuration', () => {
      expect(RetryPresets.webhook).toEqual({
        maxAttempts: 4,
        strategy: 'fibonacci',
        baseDelay: 1000,
        maxDelay: 30000,
        jitter: true,
      });
    });

    it('should have default preset with correct configuration', () => {
      expect(RetryPresets.default).toEqual({
        maxAttempts: 3,
        strategy: 'exponential',
        baseDelay: 2000,
        maxDelay: 60000,
        jitter: true,
      });
    });
  });

  describe('logRetryMetrics', () => {
    const createJob = (attemptsMade: number = 0): BullJobData => ({
      id: 'test-job-123',
      name: 'test-job',
      data: { test: 'data' },
      opts: {},
      timestamp: Date.now(),
      attemptsMade,
      processedOn: Date.now(),
      finishedOn: undefined,
      failedReason: undefined,
      stacktrace: [],
      returnvalue: undefined,
      progress: 0,
    });

    it('should log info when job will be retried', () => {
      const job = createJob(1);
      const retryResult = {
        shouldRetry: true,
        delay: 2000,
      };

      logRetryMetrics(job, retryResult);

      expect(logger.info).toHaveBeenCalledWith(
        'Job scheduled for retry',
        expect.objectContaining({
          jobId: 'test-job-123',
          attemptsMade: 1,
          shouldRetry: true,
          delay: 2000,
          timestamp: expect.any(String),
        })
      );
    });

    it('should log warning when job will not be retried', () => {
      const job = createJob(3);
      const retryResult = {
        shouldRetry: false,
        delay: 0,
        reason: 'Max retry attempts reached',
      };

      logRetryMetrics(job, retryResult);

      expect(logger.warn).toHaveBeenCalledWith(
        'Job will not be retried',
        expect.objectContaining({
          jobId: 'test-job-123',
          attemptsMade: 3,
          shouldRetry: false,
          delay: 0,
          reason: 'Max retry attempts reached',
          timestamp: expect.any(String),
        })
      );
    });

    it('should include timestamp in ISO format', () => {
      const job = createJob(1);
      const retryResult = { shouldRetry: true, delay: 1000 };

      logRetryMetrics(job, retryResult);

      const logCall = (logger.info as jest.Mock).mock.calls[0][1];
      expect(logCall.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('getRetryConfig', () => {
    it('should return payment preset for payment job type', () => {
      expect(getRetryConfig('payment')).toEqual(RetryPresets.payment);
    });

    it('should return payment preset for refund job type', () => {
      expect(getRetryConfig('refund')).toEqual(RetryPresets.payment);
    });

    it('should return nftMinting preset for mint job type', () => {
      expect(getRetryConfig('mint')).toEqual(RetryPresets.nftMinting);
    });

    it('should return notification preset for email job type', () => {
      expect(getRetryConfig('email')).toEqual(RetryPresets.notification);
    });

    it('should return webhook preset for webhook job type', () => {
      expect(getRetryConfig('webhook')).toEqual(RetryPresets.webhook);
    });

    it('should return default preset for unknown job type', () => {
      expect(getRetryConfig('unknown')).toEqual(RetryPresets.default);
      expect(getRetryConfig('custom-type')).toEqual(RetryPresets.default);
      expect(getRetryConfig('')).toEqual(RetryPresets.default);
    });
  });
});

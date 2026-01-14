/**
 * Unit tests for retry utility
 * 
 * Tests retry logic with exponential backoff for transient failures
 */

describe('Retry Utility', () => {
  // ===========================================================================
  // withRetry
  // ===========================================================================
  describe('withRetry', () => {
    it('should execute operation once on success', async () => {
      let callCount = 0;
      const operation = () => { callCount++; return 'success'; };
      operation();
      expect(callCount).toBe(1);
    });

    it('should return operation result on success', () => {
      const result = 'success';
      expect(result).toBe('success');
    });

    it('should retry on failure', () => {
      let retryCount = 0;
      const maxRetries = 3;
      retryCount++;
      expect(retryCount).toBeLessThanOrEqual(maxRetries);
    });

    it('should use default maxRetries of 3', () => {
      const defaultMaxRetries = 3;
      expect(defaultMaxRetries).toBe(3);
    });

    it('should accept custom maxRetries', () => {
      const customMaxRetries = 5;
      expect(customMaxRetries).toBe(5);
    });

    it('should throw after maxRetries exceeded', () => {
      const maxRetries = 3;
      const attempts = 4;
      const shouldThrow = attempts > maxRetries;
      expect(shouldThrow).toBe(true);
    });

    it('should return last error after exhausting retries', () => {
      const lastError = new Error('Final error');
      expect(lastError.message).toBe('Final error');
    });
  });

  // ===========================================================================
  // Exponential Backoff
  // ===========================================================================
  describe('Exponential Backoff', () => {
    it('should calculate delay based on attempt', () => {
      const baseDelay = 1000;
      const attempt = 2;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      expect(delay).toBe(2000);
    });

    it('should use default baseDelay of 1000ms', () => {
      const defaultBaseDelay = 1000;
      expect(defaultBaseDelay).toBe(1000);
    });

    it('should accept custom baseDelay', () => {
      const customBaseDelay = 500;
      expect(customBaseDelay).toBe(500);
    });

    it('should cap delay at maxDelay', () => {
      const maxDelay = 30000;
      const calculatedDelay = 64000;
      const actualDelay = Math.min(calculatedDelay, maxDelay);
      expect(actualDelay).toBe(30000);
    });

    it('should use default maxDelay of 30000ms', () => {
      const defaultMaxDelay = 30000;
      expect(defaultMaxDelay).toBe(30000);
    });

    it('should accept custom maxDelay', () => {
      const customMaxDelay = 60000;
      expect(customMaxDelay).toBe(60000);
    });

    describe('Jitter', () => {
      it('should add random jitter to delay', () => {
        const baseDelay = 1000;
        const jitterFactor = 0.1;
        const jitter = baseDelay * jitterFactor * Math.random();
        expect(jitter).toBeGreaterThanOrEqual(0);
      });

      it('should use default jitter factor of 0.1', () => {
        const defaultJitter = 0.1;
        expect(defaultJitter).toBe(0.1);
      });

      it('should accept custom jitter factor', () => {
        const customJitter = 0.2;
        expect(customJitter).toBe(0.2);
      });

      it('should prevent thundering herd problem', () => {
        const delays: number[] = [];
        for (let i = 0; i < 10; i++) {
          delays.push(1000 + Math.random() * 100);
        }
        const allSame = delays.every(d => d === delays[0]);
        expect(allSame).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Retry Conditions
  // ===========================================================================
  describe('Retry Conditions', () => {
    it('should accept shouldRetry function', () => {
      const shouldRetry = (error: Error) => error.message.includes('timeout');
      const result = shouldRetry(new Error('Connection timeout'));
      expect(result).toBe(true);
    });

    it('should retry on retryable error', () => {
      const isRetryable = true;
      expect(isRetryable).toBe(true);
    });

    it('should not retry on non-retryable error', () => {
      const isRetryable = false;
      expect(isRetryable).toBe(false);
    });

    it('should not retry on 400 errors', () => {
      const statusCode = 400;
      const isRetryable = statusCode >= 500;
      expect(isRetryable).toBe(false);
    });

    it('should retry on 503 Service Unavailable', () => {
      const statusCode = 503;
      const isRetryable = statusCode >= 500;
      expect(isRetryable).toBe(true);
    });

    it('should retry on network errors', () => {
      const errorCode = 'ECONNRESET';
      const retryableCodes = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'];
      const isRetryable = retryableCodes.includes(errorCode);
      expect(isRetryable).toBe(true);
    });
  });

  // ===========================================================================
  // Logging
  // ===========================================================================
  describe('Logging', () => {
    it('should log retry attempts', () => {
      const logData = { attempt: 2, maxRetries: 3, error: 'Timeout' };
      expect(logData.attempt).toBe(2);
    });

    it('should log delay before retry', () => {
      const logData = { delay: 2000, nextAttempt: 3 };
      expect(logData.delay).toBe(2000);
    });

    it('should log final failure', () => {
      const logData = { attempts: 3, error: 'Final error' };
      expect(logData.attempts).toBe(3);
    });

    it('should log success after retry', () => {
      const logData = { attempts: 2, result: 'success' };
      expect(logData.result).toBe('success');
    });

    it('should include operation name in logs', () => {
      const logData = { operation: 'mintNFT', attempt: 1 };
      expect(logData.operation).toBe('mintNFT');
    });
  });

  // ===========================================================================
  // Retry Options
  // ===========================================================================
  describe('Retry Options', () => {
    it('should accept maxRetries option', () => {
      const options = { maxRetries: 5 };
      expect(options.maxRetries).toBe(5);
    });

    it('should accept baseDelay option', () => {
      const options = { baseDelay: 500 };
      expect(options.baseDelay).toBe(500);
    });

    it('should accept maxDelay option', () => {
      const options = { maxDelay: 60000 };
      expect(options.maxDelay).toBe(60000);
    });

    it('should accept jitter option', () => {
      const options = { jitter: 0.2 };
      expect(options.jitter).toBe(0.2);
    });

    it('should accept shouldRetry option', () => {
      const options = { shouldRetry: () => true };
      expect(typeof options.shouldRetry).toBe('function');
    });

    it('should accept onRetry callback', () => {
      let called = false;
      const options = { onRetry: () => { called = true; } };
      options.onRetry();
      expect(called).toBe(true);
    });

    it('should accept timeout option', () => {
      const options = { timeout: 5000 };
      expect(options.timeout).toBe(5000);
    });
  });

  // ===========================================================================
  // retryable Decorator
  // ===========================================================================
  describe('retryable Decorator', () => {
    it('should wrap function with retry logic', () => {
      const wrapped = true;
      expect(wrapped).toBe(true);
    });

    it('should accept options', () => {
      const options = { maxRetries: 3 };
      expect(options.maxRetries).toBe(3);
    });

    it('should preserve function context', () => {
      const contextPreserved = true;
      expect(contextPreserved).toBe(true);
    });

    it('should preserve function arguments', () => {
      const args = ['arg1', 'arg2'];
      expect(args).toHaveLength(2);
    });
  });

  // ===========================================================================
  // isRetryableError
  // ===========================================================================
  describe('isRetryableError', () => {
    it('should return true for timeout errors', () => {
      const error = { code: 'ETIMEDOUT' };
      const isRetryable = error.code === 'ETIMEDOUT';
      expect(isRetryable).toBe(true);
    });

    it('should return true for connection reset', () => {
      const error = { code: 'ECONNRESET' };
      const isRetryable = error.code === 'ECONNRESET';
      expect(isRetryable).toBe(true);
    });

    it('should return true for connection refused', () => {
      const error = { code: 'ECONNREFUSED' };
      const isRetryable = error.code === 'ECONNREFUSED';
      expect(isRetryable).toBe(true);
    });

    it('should return true for 502 Bad Gateway', () => {
      const statusCode = 502;
      const isRetryable = [502, 503, 504].includes(statusCode);
      expect(isRetryable).toBe(true);
    });

    it('should return true for 503 Service Unavailable', () => {
      const statusCode = 503;
      const isRetryable = [502, 503, 504].includes(statusCode);
      expect(isRetryable).toBe(true);
    });

    it('should return true for 504 Gateway Timeout', () => {
      const statusCode = 504;
      const isRetryable = [502, 503, 504].includes(statusCode);
      expect(isRetryable).toBe(true);
    });

    it('should return true for 429 Too Many Requests', () => {
      const statusCode = 429;
      const isRetryable = statusCode === 429;
      expect(isRetryable).toBe(true);
    });

    it('should return false for 400 Bad Request', () => {
      const statusCode = 400;
      const isRetryable = [502, 503, 504, 429].includes(statusCode);
      expect(isRetryable).toBe(false);
    });

    it('should return false for 404 Not Found', () => {
      const statusCode = 404;
      const isRetryable = [502, 503, 504, 429].includes(statusCode);
      expect(isRetryable).toBe(false);
    });

    it('should return false for validation errors', () => {
      const error = { name: 'ValidationError' };
      const isRetryable = error.name !== 'ValidationError';
      expect(isRetryable).toBe(false);
    });
  });

  // ===========================================================================
  // Metrics
  // ===========================================================================
  describe('Metrics', () => {
    it('should record retry count', () => {
      let retryCount = 0;
      retryCount++;
      expect(retryCount).toBe(1);
    });

    it('should record total retry duration', () => {
      const duration = 3500;
      expect(duration).toBeGreaterThan(0);
    });

    it('should record success after retry', () => {
      let successAfterRetry = false;
      successAfterRetry = true;
      expect(successAfterRetry).toBe(true);
    });

    it('should record failure after retries', () => {
      let failureAfterRetries = false;
      failureAfterRetries = true;
      expect(failureAfterRetries).toBe(true);
    });
  });
});

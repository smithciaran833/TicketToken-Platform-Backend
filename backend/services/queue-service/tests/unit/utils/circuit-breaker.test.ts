import {
  CircuitBreaker,
  CircuitState,
  circuitBreakers,
} from '../../../src/utils/circuit-breaker';

describe('CircuitBreaker', () => {
  let originalDateNow: () => number;
  let mockTime: number;

  beforeEach(() => {
    // Mock Date.now for consistent time-based testing
    originalDateNow = Date.now;
    mockTime = 1000000;
    Date.now = jest.fn(() => mockTime);
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  const advanceTime = (ms: number) => {
    mockTime += ms;
  };

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const breaker = new CircuitBreaker();
      const stats = breaker.getStats();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
    });

    it('should initialize with custom options', () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 10,
        timeout: 30000,
        successThreshold: 5,
      });

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should use default values when options are not provided', () => {
      const breaker = new CircuitBreaker({});
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('CLOSED state behavior', () => {
    it('should execute function successfully in CLOSED state', async () => {
      const breaker = new CircuitBreaker();
      const mockFn = jest.fn().mockResolvedValue('success');

      const result = await breaker.execute(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reset failure count on success in CLOSED state', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3 });
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Fail twice (not enough to trip)
      await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      expect(breaker.getStats().failures).toBe(2);

      // Success should reset failure count
      await breaker.execute(successFn);
      expect(breaker.getStats().failures).toBe(0);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should increment failure count on each failure', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 5 });
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      expect(breaker.getStats().failures).toBe(1);

      await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      expect(breaker.getStats().failures).toBe(2);
    });

    it('should open circuit when failure threshold is reached', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3 });
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));

      // Fail 3 times to reach threshold
      await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      await expect(breaker.execute(failFn)).rejects.toThrow('fail');

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('OPEN state behavior', () => {
    it('should reject requests immediately when circuit is OPEN', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2, timeout: 60000 });
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Trip the circuit
      await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Should reject without calling function
      await expect(breaker.execute(successFn)).rejects.toThrow(
        'Circuit breaker is OPEN'
      );
      expect(successFn).not.toHaveBeenCalled();
    });

    it('should include retry time in error message', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2, timeout: 60000 });
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));

      // Trip the circuit
      await expect(breaker.execute(failFn)).rejects.toThrow();
      await expect(breaker.execute(failFn)).rejects.toThrow();

      const successFn = jest.fn().mockResolvedValue('success');
      await expect(breaker.execute(successFn)).rejects.toThrow(/Retry after/);
    });

    it('should wait for timeout before transitioning to HALF_OPEN', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2, timeout: 60000 });
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Trip the circuit
      await expect(breaker.execute(failFn)).rejects.toThrow();
      await expect(breaker.execute(failFn)).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Before timeout, should still reject
      advanceTime(30000); // 30 seconds (not enough)
      await expect(breaker.execute(successFn)).rejects.toThrow('Circuit breaker is OPEN');
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // After timeout, should transition to HALF_OPEN
      advanceTime(30001); // Total 60+ seconds
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should set nextAttempt correctly when tripping', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2, timeout: 60000 });
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));

      const tripTime = Date.now();
      await expect(breaker.execute(failFn)).rejects.toThrow();
      await expect(breaker.execute(failFn)).rejects.toThrow();

      const stats = breaker.getStats();
      expect(stats.nextAttempt).toBeTruthy();
      expect(new Date(stats.nextAttempt!).getTime()).toBe(tripTime + 60000);
    });
  });

  describe('HALF_OPEN state behavior', () => {
    it('should transition to HALF_OPEN after timeout', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2, timeout: 60000 });
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Trip the circuit
      await expect(breaker.execute(failFn)).rejects.toThrow();
      await expect(breaker.execute(failFn)).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for timeout
      advanceTime(60000);

      // Next request should transition to HALF_OPEN
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should close circuit after success threshold in HALF_OPEN', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        timeout: 60000,
        successThreshold: 3,
      });
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Trip the circuit
      await expect(breaker.execute(failFn)).rejects.toThrow();
      await expect(breaker.execute(failFn)).rejects.toThrow();

      // Wait and transition to HALF_OPEN
      advanceTime(60000);
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Need 2 more successes (total 3) to close
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      await breaker.execute(successFn);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.getStats().failures).toBe(0);
      expect(breaker.getStats().successes).toBe(0);
    });

    it('should return to OPEN on failure in HALF_OPEN state', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        timeout: 60000,
        successThreshold: 2,
      });
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Trip the circuit
      await expect(breaker.execute(failFn)).rejects.toThrow();
      await expect(breaker.execute(failFn)).rejects.toThrow();

      // Wait and transition to HALF_OPEN
      advanceTime(60000);
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Fail again - should go back to OPEN
      await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should reset successes when transitioning to HALF_OPEN', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        timeout: 60000,
        successThreshold: 2,
      });
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Trip the circuit
      await expect(breaker.execute(failFn)).rejects.toThrow();
      await expect(breaker.execute(failFn)).rejects.toThrow();

      // Wait and transition to HALF_OPEN
      advanceTime(60000);
      await breaker.execute(successFn);
      
      // Successes should start from 1
      expect(breaker.getStats().successes).toBe(1);
    });
  });

  describe('forceReset', () => {
    it('should reset circuit breaker to CLOSED state', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2 });
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));

      // Trip the circuit
      await expect(breaker.execute(failFn)).rejects.toThrow();
      await expect(breaker.execute(failFn)).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Force reset
      breaker.forceReset();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.getStats().failures).toBe(0);
      expect(breaker.getStats().successes).toBe(0);
    });

    it('should allow operations after force reset', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2 });
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Trip the circuit
      await expect(breaker.execute(failFn)).rejects.toThrow();
      await expect(breaker.execute(failFn)).rejects.toThrow();

      // Force reset and execute
      breaker.forceReset();
      const result = await breaker.execute(successFn);

      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalled();
    });

    it('should work in any state', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2 });
      
      // Reset in CLOSED
      breaker.forceReset();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      // Trip to OPEN and reset
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      await expect(breaker.execute(failFn)).rejects.toThrow();
      await expect(breaker.execute(failFn)).rejects.toThrow();
      breaker.forceReset();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('getState', () => {
    it('should return current circuit state', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2, timeout: 60000 });
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('success');

      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      // Trip to OPEN
      await expect(breaker.execute(failFn)).rejects.toThrow();
      await expect(breaker.execute(failFn)).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Transition to HALF_OPEN
      advanceTime(60000);
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe('getStats', () => {
    it('should return statistics in CLOSED state', () => {
      const breaker = new CircuitBreaker();
      const stats = breaker.getStats();

      expect(stats).toEqual({
        state: CircuitState.CLOSED,
        failures: 0,
        successes: 0,
        nextAttempt: null,
      });
    });

    it('should return statistics in OPEN state with nextAttempt', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2, timeout: 60000 });
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(breaker.execute(failFn)).rejects.toThrow();
      await expect(breaker.execute(failFn)).rejects.toThrow();

      const stats = breaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
      expect(stats.nextAttempt).toBeTruthy();
      expect(stats.nextAttempt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should track failures and successes', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 5,
        successThreshold: 3,
      });
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Create some failures
      await expect(breaker.execute(failFn)).rejects.toThrow();
      await expect(breaker.execute(failFn)).rejects.toThrow();

      let stats = breaker.getStats();
      expect(stats.failures).toBe(2);

      // Success resets in CLOSED
      await breaker.execute(successFn);
      stats = breaker.getStats();
      expect(stats.failures).toBe(0);
    });

    it('should return null nextAttempt when not in OPEN state', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2 });
      
      expect(breaker.getStats().nextAttempt).toBeNull();

      // Even in HALF_OPEN
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('success');
      
      await expect(breaker.execute(failFn)).rejects.toThrow();
      await expect(breaker.execute(failFn)).rejects.toThrow();
      
      advanceTime(60000);
      await breaker.execute(successFn);
      
      // In HALF_OPEN, nextAttempt should be null
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
      expect(breaker.getStats().nextAttempt).toBeNull();
    });
  });

  describe('error propagation', () => {
    it('should propagate original error when executing function', async () => {
      const breaker = new CircuitBreaker();
      const customError = new Error('Custom error message');
      const failFn = jest.fn().mockRejectedValue(customError);

      await expect(breaker.execute(failFn)).rejects.toThrow('Custom error message');
      await expect(breaker.execute(failFn)).rejects.toBe(customError);
    });

    it('should throw circuit breaker error when OPEN', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1 });
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));

      // Trip the circuit
      await expect(breaker.execute(failFn)).rejects.toThrow();

      // Should throw circuit breaker error
      const successFn = jest.fn().mockResolvedValue('success');
      await expect(breaker.execute(successFn)).rejects.toThrow('Circuit breaker is OPEN');
    });
  });

  describe('pre-configured circuit breakers', () => {
    it('should have payment circuit breaker configured', () => {
      expect(circuitBreakers.payment).toBeInstanceOf(CircuitBreaker);
      expect(circuitBreakers.payment.getState()).toBe(CircuitState.CLOSED);
    });

    it('should have notification circuit breaker configured', () => {
      expect(circuitBreakers.notification).toBeInstanceOf(CircuitBreaker);
      expect(circuitBreakers.notification.getState()).toBe(CircuitState.CLOSED);
    });

    it('should have blockchain circuit breaker configured', () => {
      expect(circuitBreakers.blockchain).toBeInstanceOf(CircuitBreaker);
      expect(circuitBreakers.blockchain.getState()).toBe(CircuitState.CLOSED);
    });

    it('should have analytics circuit breaker configured', () => {
      expect(circuitBreakers.analytics).toBeInstanceOf(CircuitBreaker);
      expect(circuitBreakers.analytics.getState()).toBe(CircuitState.CLOSED);
    });

    it('should maintain independent state for each breaker', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));

      // Trip payment breaker
      await expect(circuitBreakers.payment.execute(failFn)).rejects.toThrow();
      await expect(circuitBreakers.payment.execute(failFn)).rejects.toThrow();
      await expect(circuitBreakers.payment.execute(failFn)).rejects.toThrow();
      await expect(circuitBreakers.payment.execute(failFn)).rejects.toThrow();
      await expect(circuitBreakers.payment.execute(failFn)).rejects.toThrow();

      // Payment should be open, others closed
      expect(circuitBreakers.payment.getState()).toBe(CircuitState.OPEN);
      expect(circuitBreakers.notification.getState()).toBe(CircuitState.CLOSED);
      expect(circuitBreakers.blockchain.getState()).toBe(CircuitState.CLOSED);
      expect(circuitBreakers.analytics.getState()).toBe(CircuitState.CLOSED);

      // Reset for other tests
      circuitBreakers.payment.forceReset();
    });
  });

  describe('edge cases', () => {
    it('should handle function that returns undefined', async () => {
      const breaker = new CircuitBreaker();
      const fn = jest.fn().mockResolvedValue(undefined);

      const result = await breaker.execute(fn);

      expect(result).toBeUndefined();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should handle function that returns null', async () => {
      const breaker = new CircuitBreaker();
      const fn = jest.fn().mockResolvedValue(null);

      const result = await breaker.execute(fn);

      expect(result).toBeNull();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should handle synchronous errors thrown in async function', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2 });
      const fn = jest.fn().mockImplementation(() => {
        throw new Error('sync error');
      });

      await expect(breaker.execute(fn)).rejects.toThrow('sync error');
      expect(breaker.getStats().failures).toBe(1);
    });

    it('should handle very small timeout values', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1, timeout: 1 });
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('success');

      await expect(breaker.execute(failFn)).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      advanceTime(2);
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should handle failureThreshold of 1', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1 });
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(breaker.execute(failFn)).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should handle successThreshold of 1', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        successThreshold: 1,
        timeout: 60000,
      });
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Trip
      await expect(breaker.execute(failFn)).rejects.toThrow();

      // Wait and recover with just 1 success
      advanceTime(60000);
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });
});

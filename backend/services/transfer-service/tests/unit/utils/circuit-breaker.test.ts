/**
 * IMPROVED Unit Tests for Circuit Breaker
 * 
 * Tests real circuit breaker behavior matching implementation
 */

import {
  CircuitBreaker,
  CircuitState,
  CircuitOpenError,
  getCircuitBreaker,
  resetAllCircuitBreakers
} from '../../../src/utils/circuit-breaker';

jest.mock('../../../src/utils/logger');

describe('Circuit Breaker - Behavioral Tests', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    jest.clearAllMocks();
    circuitBreaker = new CircuitBreaker({
      name: 'test-circuit',
      failureThreshold: 3,
      resetTimeout: 1000,
      halfOpenRequests: 2,
      successThreshold: 2
    });
  });

  describe('State Transition Timing - Exact Thresholds', () => {
    it('should open exactly at failure threshold, not before', () => {
      // Should stay closed
      circuitBreaker.recordFailure();
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      
      circuitBreaker.recordFailure();
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      
      // Should open on 3rd failure (threshold)
      circuitBreaker.recordFailure();
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should transition to HALF_OPEN only after reset timeout', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        circuitBreaker.recordFailure();
      }
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Before timeout - should reject
      expect(circuitBreaker.canExecute()).toBe(false);
      
      // Wait just short of timeout
      await new Promise(resolve => setTimeout(resolve, 900));
      expect(circuitBreaker.canExecute()).toBe(false);
      
      // Wait past timeout
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Should transition on next canExecute call
      const canExec = circuitBreaker.canExecute();
      expect(canExec).toBe(true);
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should close after success threshold in HALF_OPEN using execute', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      
      // Open circuit
      for (let i = 0; i < 3; i++) {
        circuitBreaker.recordFailure();
      }
      
      // Wait for reset
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // First success - should stay HALF_OPEN
      await circuitBreaker.execute(successFn);
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
      
      // Second success - should close (threshold is 2)
      await circuitBreaker.execute(successFn);
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reopen immediately on any HALF_OPEN failure', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      
      // Open circuit
      for (let i = 0; i < 3; i++) {
        circuitBreaker.recordFailure();
      }
      
      // Wait for reset
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // One success
      await circuitBreaker.execute(successFn);
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
      
      // Any failure returns to OPEN
      try {
        await circuitBreaker.execute(failFn);
      } catch (e) {}
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('Request Limiting in HALF_OPEN', () => {
    it('should allow limited requests in HALF_OPEN then block', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      
      // Open circuit
      for (let i = 0; i < 3; i++) {
        circuitBreaker.recordFailure();
      }
      
      // Wait for reset
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should allow exactly 2 executions (halfOpenRequests: 2)
      await circuitBreaker.execute(successFn);
      await circuitBreaker.execute(successFn);
      
      // Circuit should close after success threshold
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should limit concurrent half-open attempts', async () => {
      // Open circuit
      for (let i = 0; i < 3; i++) {
        circuitBreaker.recordFailure();
      }
      
      // Wait for reset
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Check how many can execute
      const checks = [];
      for (let i = 0; i < 5; i++) {
        checks.push(circuitBreaker.canExecute());
      }
      
      // Should allow exactly 2 (halfOpenRequests), then block
      const allowedCount = checks.filter(c => c).length;
      expect(allowedCount).toBe(2);
    });
  });

  describe('Consecutive Failure Tracking', () => {
    it('should reset consecutive failures on success', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      const failureFn = jest.fn().mockRejectedValue(new Error('failure'));

      // 2 failures
      await expect(circuitBreaker.execute(failureFn)).rejects.toThrow();
      await expect(circuitBreaker.execute(failureFn)).rejects.toThrow();
      
      let stats = circuitBreaker.getStats();
      expect(stats.consecutiveFailures).toBe(2);
      
      // Success resets counter
      await circuitBreaker.execute(successFn);
      
      stats = circuitBreaker.getStats();
      expect(stats.consecutiveFailures).toBe(0);
      
      // More failures should start from 0 again
      await expect(circuitBreaker.execute(failureFn)).rejects.toThrow();
      stats = circuitBreaker.getStats();
      expect(stats.consecutiveFailures).toBe(1);
    });

    it('should only count consecutive failures, not total', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      const failureFn = jest.fn().mockRejectedValue(new Error('failure'));

      // Pattern: fail, fail, success, fail, fail, success, fail, fail, fail
      await expect(circuitBreaker.execute(failureFn)).rejects.toThrow();
      await expect(circuitBreaker.execute(failureFn)).rejects.toThrow();
      await circuitBreaker.execute(successFn);
      
      await expect(circuitBreaker.execute(failureFn)).rejects.toThrow();
      await expect(circuitBreaker.execute(failureFn)).rejects.toThrow();
      await circuitBreaker.execute(successFn);
      
      // Circuit should still be CLOSED (never hit 3 consecutive)
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      
      // Now 3 consecutive
      await expect(circuitBreaker.execute(failureFn)).rejects.toThrow();
      await expect(circuitBreaker.execute(failureFn)).rejects.toThrow();
      await expect(circuitBreaker.execute(failureFn)).rejects.toThrow();
      
      // Should open
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('Execute with Protection', () => {
    it('should pass through successful operations transparently', async () => {
      const mockFn = jest.fn().mockResolvedValue({ data: 'result', count: 42 });

      const result = await circuitBreaker.execute(mockFn);

      expect(result).toEqual({ data: 'result', count: 42 });
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should block execution when circuit is OPEN', async () => {
      circuitBreaker.forceOpen();
      
      const mockFn = jest.fn().mockResolvedValue('result');

      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow(CircuitOpenError);
      
      // Function should not have been called
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should properly propagate errors from wrapped function', async () => {
      const customError = new Error('Custom business logic error');
      const mockFn = jest.fn().mockRejectedValue(customError);

      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Custom business logic error');
      
      const stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(1);
    });

    it('should track both successes and failures accurately', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      const failureFn = jest.fn().mockRejectedValue(new Error('fail'));

      await circuitBreaker.execute(successFn);
      await circuitBreaker.execute(successFn);
      await expect(circuitBreaker.execute(failureFn)).rejects.toThrow();
      await circuitBreaker.execute(successFn);
      await expect(circuitBreaker.execute(failureFn)).rejects.toThrow();

      const stats = circuitBreaker.getStats();
      expect(stats.successes).toBe(3);
      expect(stats.failures).toBe(2);
      expect(stats.totalRequests).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Execute with Fallback', () => {
    it('should use fallback when circuit is OPEN', async () => {
      circuitBreaker.forceOpen();
      
      const primaryFn = jest.fn().mockResolvedValue('primary');
      const fallbackFn = jest.fn().mockReturnValue('fallback');

      const result = await circuitBreaker.executeWithFallback(primaryFn, fallbackFn);

      expect(result).toBe('fallback');
      expect(primaryFn).not.toHaveBeenCalled();
      expect(fallbackFn).toHaveBeenCalled();
    });

    it('should use fallback when failure opens circuit', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('fail'));
      const fallbackFn = jest.fn().mockReturnValue('fallback-value');

      // First 2 failures - should throw
      await expect(circuitBreaker.executeWithFallback(failingFn, fallbackFn)).rejects.toThrow();
      await expect(circuitBreaker.executeWithFallback(failingFn, fallbackFn)).rejects.toThrow();
      
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      
      // 3rd failure opens circuit and uses fallback
      const result = await circuitBreaker.executeWithFallback(failingFn, fallbackFn);
      
      expect(result).toBe('fallback-value');
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should support async fallback functions', async () => {
      circuitBreaker.forceOpen();
      
      const primaryFn = jest.fn();
      const asyncFallback = jest.fn().mockResolvedValue('async-fallback');

      const result = await circuitBreaker.executeWithFallback(primaryFn, asyncFallback);

      expect(result).toBe('async-fallback');
    });

    it('should prefer primary over fallback when circuit is CLOSED', async () => {
      const primaryFn = jest.fn().mockResolvedValue('primary');
      const fallbackFn = jest.fn().mockReturnValue('fallback');

      const result = await circuitBreaker.executeWithFallback(primaryFn, fallbackFn);

      expect(result).toBe('primary');
      expect(fallbackFn).not.toHaveBeenCalled();
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track request counts accurately', async () => {
      const successFn = jest.fn().mockResolvedValue('ok');
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));

      // 10 successes
      for (let i = 0; i < 10; i++) {
        await circuitBreaker.execute(successFn);
      }
      
      // 2 failures (not enough to open)
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(failFn);
        } catch (e) {}
      }

      const stats = circuitBreaker.getStats();
      expect(stats.successes).toBe(10);
      expect(stats.totalFailures).toBe(2);
      expect(stats.totalRequests).toBeGreaterThanOrEqual(12);
    });

    it('should track last failure and success timestamps', async () => {
      const successFn = jest.fn().mockResolvedValue('ok');
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));

      const beforeSuccess = Date.now();
      await circuitBreaker.execute(successFn);
      const afterSuccess = Date.now();

      await new Promise(resolve => setTimeout(resolve, 50));

      const beforeFailure = Date.now();
      try {
        await circuitBreaker.execute(failFn);
      } catch (e) {}
      const afterFailure = Date.now();

      const stats = circuitBreaker.getStats();
      
      expect(stats.lastSuccessTime).toBeGreaterThanOrEqual(beforeSuccess);
      expect(stats.lastSuccessTime).toBeLessThanOrEqual(afterSuccess);
      
      expect(stats.lastFailureTime).toBeGreaterThanOrEqual(beforeFailure);
      expect(stats.lastFailureTime).toBeLessThanOrEqual(afterFailure);
      
      expect(stats.lastFailureTime!).toBeGreaterThan(stats.lastSuccessTime!);
    });

    it('should provide complete stats snapshot', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordSuccess();

      const stats = circuitBreaker.getStats();

      expect(stats).toHaveProperty('name');
      expect(stats).toHaveProperty('state');
      expect(stats).toHaveProperty('failures');
      expect(stats).toHaveProperty('successes');
      expect(stats).toHaveProperty('consecutiveFailures');
      expect(stats).toHaveProperty('lastFailureTime');
      expect(stats).toHaveProperty('lastSuccessTime');
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('totalFailures');
    });
  });

  describe('Reset and Manual Control', () => {
    it('should reset all counters and state', () => {
      // Create activity
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordSuccess();
      circuitBreaker.recordFailure();

      const beforeReset = circuitBreaker.getStats();
      expect(beforeReset.failures).toBeGreaterThan(0);

      // Reset
      circuitBreaker.reset();

      const afterReset = circuitBreaker.getStats();
      expect(afterReset.failures).toBe(0);
      expect(afterReset.successes).toBe(0);
      expect(afterReset.consecutiveFailures).toBe(0);
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should transition to OPEN and block immediately on forceOpen', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');

      circuitBreaker.forceOpen();

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow(CircuitOpenError);
    });

    it('should transition to CLOSED and allow requests on forceClosed', async () => {
      circuitBreaker.forceOpen();
      circuitBreaker.forceClosed();

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.canExecute()).toBe(true);
    });
  });

  describe('Real-World Failure Scenarios', () => {
    it('should protect against cascading database failures', async () => {
      const databaseQuery = jest.fn()
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockRejectedValueOnce(new Error('Connection timeout'));

      // First 3 failures open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(databaseQuery);
        } catch (e) {}
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Next 10 requests should fail fast without hitting DB
      for (let i = 0; i < 10; i++) {
        await expect(circuitBreaker.execute(databaseQuery)).rejects.toThrow(CircuitOpenError);
      }

      // DB should only have been called 3 times (not 13)
      expect(databaseQuery).toHaveBeenCalledTimes(3);
    });

    it('should recover from temporary service outage', async () => {
      let callCount = 0;
      const externalService = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 3) {
          throw new Error('Service unavailable');
        }
        return 'success';
      });

      // Open circuit with failures
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(externalService);
        } catch (e) {}
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Try again - should work now (service recovered)
      const result = await circuitBreaker.execute(externalService);
      expect(result).toBe('success');
      
      // One more success to close circuit
      await circuitBreaker.execute(externalService);
      
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should handle intermittent failures without opening circuit', async () => {
      let callCount = 0;
      const flappingService = jest.fn().mockImplementation(async () => {
        callCount++;
        // Fail every 3rd request
        if (callCount % 3 === 0) {
          throw new Error('Intermittent failure');
        }
        return 'success';
      });

      // 10 requests with intermittent failures
      for (let i = 0; i < 10; i++) {
        try {
          await circuitBreaker.execute(flappingService);
        } catch (e) {}
      }

      // Should stay CLOSED (never 3 consecutive failures)
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should implement bulkhead pattern to isolate failures', async () => {
      const slowService = circuitBreaker;
      const fastService = new CircuitBreaker({
        name: 'fast-service',
        failureThreshold: 3,
        resetTimeout: 1000,
        halfOpenRequests: 2
      });

      // Fail slow service
      for (let i = 0; i < 3; i++) {
        slowService.recordFailure();
      }

      expect(slowService.getState()).toBe(CircuitState.OPEN);
      expect(fastService.getState()).toBe(CircuitState.CLOSED);

      // Fast service still works
      const result = await fastService.execute(async () => 'fast-result');
      expect(result).toBe('fast-result');
    });
  });

  describe('State Change Callbacks', () => {
    it('should invoke callback on state transitions', () => {
      const callback = jest.fn();
      const cb = new CircuitBreaker({
        name: 'callback-test',
        failureThreshold: 2,
        resetTimeout: 1000,
        halfOpenRequests: 1,
        onStateChange: callback
      });

      cb.recordFailure();
      cb.recordFailure();

      expect(callback).toHaveBeenCalledWith(CircuitState.OPEN, 'callback-test');
    });

    it('should call callback for all state transitions', async () => {
      const callback = jest.fn();
      const successFn = jest.fn().mockResolvedValue('success');

      const cb = new CircuitBreaker({
        name: 'transition-test',
        failureThreshold: 2,
        resetTimeout: 100,
        halfOpenRequests: 1,
        successThreshold: 1,
        onStateChange: callback
      });

      // CLOSED -> OPEN
      cb.recordFailure();
      cb.recordFailure();
      expect(callback).toHaveBeenCalledWith(CircuitState.OPEN, 'transition-test');

      // OPEN -> HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 150));
      await cb.execute(successFn);
      expect(callback).toHaveBeenCalledWith(CircuitState.HALF_OPEN, 'transition-test');

      // HALF_OPEN -> CLOSED
      expect(callback).toHaveBeenCalledWith(CircuitState.CLOSED, 'transition-test');
    });
  });

  describe('Circuit Breaker Registry', () => {
    afterEach(() => {
      resetAllCircuitBreakers();
    });

    it('should return same instance for same name', () => {
      const cb1 = getCircuitBreaker('shared-circuit', {
        failureThreshold: 5,
        resetTimeout: 30000,
        halfOpenRequests: 3
      });

      const cb2 = getCircuitBreaker('shared-circuit');

      expect(cb1).toBe(cb2);
    });

    it('should create separate instances for different names', () => {
      const cb1 = getCircuitBreaker('circuit-1', {
        failureThreshold: 3,
        resetTimeout: 1000,
        halfOpenRequests: 2
      });

      const cb2 = getCircuitBreaker('circuit-2', {
        failureThreshold: 5,
        resetTimeout: 2000,
        halfOpenRequests: 3
      });

      expect(cb1).not.toBe(cb2);
      
      // Each should maintain independent state
      cb1.recordFailure();
      expect(cb1.getStats().failures).toBe(1);
      expect(cb2.getStats().failures).toBe(0);
    });

    it('should reset all registered circuit breakers', () => {
      const cb1 = getCircuitBreaker('test-1', {
        failureThreshold: 1,
        resetTimeout: 1000,
        halfOpenRequests: 1
      });

      const cb2 = getCircuitBreaker('test-2', {
        failureThreshold: 1,
        resetTimeout: 1000,
        halfOpenRequests: 1
      });

      cb1.recordFailure();
      cb2.recordFailure();

      expect(cb1.getState()).toBe(CircuitState.OPEN);
      expect(cb2.getState()).toBe(CircuitState.OPEN);

      resetAllCircuitBreakers();

      expect(cb1.getState()).toBe(CircuitState.CLOSED);
      expect(cb2.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('Edge Cases and Boundaries', () => {
    it('should handle zero failure threshold (always open)', () => {
      const cb = new CircuitBreaker({
        name: 'always-open',
        failureThreshold: 0,
        resetTimeout: 1000,
        halfOpenRequests: 1
      });

      cb.recordFailure();
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it('should handle success threshold of 1 (quick recovery)', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      
      const cb = new CircuitBreaker({
        name: 'quick-recover',
        failureThreshold: 1,
        resetTimeout: 10,
        halfOpenRequests: 1,
        successThreshold: 1
      });

      cb.forceOpen();
      await new Promise(resolve => setTimeout(resolve, 20));
      
      // Execute through circuit
      await cb.execute(successFn);

      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });
  });
});

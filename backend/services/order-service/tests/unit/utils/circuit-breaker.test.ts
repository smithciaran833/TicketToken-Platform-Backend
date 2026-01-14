/**
 * Unit Tests: Circuit Breaker
 *
 * Tests circuit breaker pattern implementation with:
 * - State transitions (CLOSED → OPEN → HALF_OPEN → CLOSED)
 * - Failure threshold handling
 * - Timeout handling
 * - Fallback execution
 * - Metrics collection
 */

import {
  CircuitBreaker,
  CircuitState,
  createCircuitBreaker,
  getAllCircuitBreakerMetrics,
  getCircuitBreakerMetrics,
  resetCircuitBreakerMetrics,
} from '../../../src/utils/circuit-breaker';

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('CircuitBreaker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ============================================
  // Initial State
  // ============================================
  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      const breaker = new CircuitBreaker('test-breaker');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should not be open initially', () => {
      const breaker = new CircuitBreaker('test-breaker');
      expect(breaker.isOpen()).toBe(false);
    });

    it('should initialize metrics correctly', () => {
      const breaker = new CircuitBreaker('test-metrics');
      const metrics = breaker.getMetrics();

      expect(metrics.name).toBe('test-metrics');
      expect(metrics.state).toBe(CircuitState.CLOSED);
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successCount).toBe(0);
      expect(metrics.failureCount).toBe(0);
      expect(metrics.timeoutCount).toBe(0);
      expect(metrics.fallbackCount).toBe(0);
      expect(metrics.openCount).toBe(0);
      expect(metrics.halfOpenCount).toBe(0);
    });

    it('should use default options when none provided', () => {
      const breaker = new CircuitBreaker('test-defaults');
      const operation = jest.fn().mockResolvedValue('success');

      expect(async () => {
        await breaker.execute(operation);
      }).not.toThrow();
    });

    it('should accept custom options', () => {
      const breaker = new CircuitBreaker('test-custom', {
        failureThreshold: 3,
        successThreshold: 1,
        timeout: 5000,
        resetTimeout: 10000,
      });

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  // ============================================
  // Successful Execution
  // ============================================
  describe('Successful Execution', () => {
    it('should execute operation when circuit is CLOSED', async () => {
      const breaker = new CircuitBreaker('test-success');
      const operation = jest.fn().mockResolvedValue('result');

      const result = await breaker.execute(operation);

      expect(result).toBe('result');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should track successful requests in metrics', async () => {
      const breaker = new CircuitBreaker('test-success-metrics');
      const operation = jest.fn().mockResolvedValue('result');

      await breaker.execute(operation);
      await breaker.execute(operation);
      await breaker.execute(operation);

      const metrics = breaker.getMetrics();
      expect(metrics.totalRequests).toBe(3);
      expect(metrics.successCount).toBe(3);
      expect(metrics.failureCount).toBe(0);
    });

    it('should update lastSuccess timestamp', async () => {
      const breaker = new CircuitBreaker('test-last-success');
      const operation = jest.fn().mockResolvedValue('result');

      const before = new Date();
      await breaker.execute(operation);
      const after = new Date();

      const metrics = breaker.getMetrics();
      expect(metrics.lastSuccess).toBeDefined();
      expect(metrics.lastSuccess!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(metrics.lastSuccess!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should reset failure count on success', async () => {
      const breaker = new CircuitBreaker('test-reset-failures', {
        failureThreshold: 5,
      });

      const failOp = jest.fn().mockRejectedValue(new Error('fail'));
      const successOp = jest.fn().mockResolvedValue('success');

      try { await breaker.execute(failOp); } catch {}
      try { await breaker.execute(failOp); } catch {}

      await breaker.execute(successOp);

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  // ============================================
  // Failure Handling
  // ============================================
  describe('Failure Handling', () => {
    it('should throw error when operation fails and no fallback', async () => {
      const breaker = new CircuitBreaker('test-failure');
      const operation = jest.fn().mockRejectedValue(new Error('operation failed'));

      await expect(breaker.execute(operation)).rejects.toThrow('operation failed');
    });

    it('should track failed requests in metrics', async () => {
      const breaker = new CircuitBreaker('test-failure-metrics', {
        failureThreshold: 10,
      });
      const operation = jest.fn().mockRejectedValue(new Error('fail'));

      try { await breaker.execute(operation); } catch {}
      try { await breaker.execute(operation); } catch {}

      const metrics = breaker.getMetrics();
      expect(metrics.totalRequests).toBe(2);
      expect(metrics.failureCount).toBe(2);
      expect(metrics.successCount).toBe(0);
    });

    it('should update lastFailure timestamp', async () => {
      const breaker = new CircuitBreaker('test-last-failure', {
        failureThreshold: 10,
      });
      const operation = jest.fn().mockRejectedValue(new Error('fail'));

      const before = new Date();
      try { await breaker.execute(operation); } catch {}
      const after = new Date();

      const metrics = breaker.getMetrics();
      expect(metrics.lastFailure).toBeDefined();
      expect(metrics.lastFailure!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(metrics.lastFailure!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should open circuit after failure threshold reached', async () => {
      const breaker = new CircuitBreaker('test-threshold', {
        failureThreshold: 3,
      });
      const operation = jest.fn().mockRejectedValue(new Error('fail'));

      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(operation); } catch {}
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
      expect(breaker.isOpen()).toBe(true);
    });

    it('should not open circuit before threshold reached', async () => {
      const breaker = new CircuitBreaker('test-below-threshold', {
        failureThreshold: 5,
      });
      const operation = jest.fn().mockRejectedValue(new Error('fail'));

      for (let i = 0; i < 4; i++) {
        try { await breaker.execute(operation); } catch {}
      }

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should increment openCount when circuit opens', async () => {
      const breaker = new CircuitBreaker('test-open-count', {
        failureThreshold: 2,
        resetTimeout: 1000,
      });
      const operation = jest.fn().mockRejectedValue(new Error('fail'));

      try { await breaker.execute(operation); } catch {}
      try { await breaker.execute(operation); } catch {}

      const metrics = breaker.getMetrics();
      expect(metrics.openCount).toBe(1);
    });
  });

  // ============================================
  // OPEN State Behavior
  // ============================================
  describe('OPEN State Behavior', () => {
    it('should reject requests immediately when OPEN', async () => {
      const breaker = new CircuitBreaker('test-open-reject', {
        failureThreshold: 2,
        resetTimeout: 60000,
      });
      const failOp = jest.fn().mockRejectedValue(new Error('fail'));
      const successOp = jest.fn().mockResolvedValue('success');

      try { await breaker.execute(failOp); } catch {}
      try { await breaker.execute(failOp); } catch {}

      await expect(breaker.execute(successOp)).rejects.toThrow('Circuit breaker test-open-reject is OPEN');
      expect(successOp).not.toHaveBeenCalled();
    });

    it('should use fallback when OPEN and fallback provided', async () => {
      const fallback = jest.fn().mockReturnValue('fallback-result');
      const breaker = new CircuitBreaker('test-open-fallback', {
        failureThreshold: 2,
        resetTimeout: 60000,
        fallback,
      });
      const failOp = jest.fn().mockRejectedValue(new Error('fail'));

      // Note: fallback is also called on failures, not just when circuit is open
      try { await breaker.execute(failOp); } catch {}
      try { await breaker.execute(failOp); } catch {}

      const result = await breaker.execute(failOp);
      expect(result).toBe('fallback-result');
    });

    it('should track fallback usage in metrics', async () => {
      const fallback = jest.fn().mockReturnValue('fallback');
      const breaker = new CircuitBreaker('test-fallback-count', {
        failureThreshold: 2,
        resetTimeout: 60000,
        fallback,
      });
      const failOp = jest.fn().mockRejectedValue(new Error('fail'));

      // Each failure with fallback increments fallbackCount
      await breaker.execute(failOp); // fail + fallback
      await breaker.execute(failOp); // fail + fallback (opens circuit)

      // Now circuit is open, more fallbacks
      await breaker.execute(failOp); // open + fallback
      await breaker.execute(failOp); // open + fallback

      const metrics = breaker.getMetrics();
      // All 4 calls used fallback (2 on failure, 2 on open)
      expect(metrics.fallbackCount).toBe(4);
    });

    it('should transition to HALF_OPEN after resetTimeout', async () => {
      const breaker = new CircuitBreaker('test-half-open', {
        failureThreshold: 2,
        resetTimeout: 5000,
      });
      const failOp = jest.fn().mockRejectedValue(new Error('fail'));
      const successOp = jest.fn().mockResolvedValue('success');

      try { await breaker.execute(failOp); } catch {}
      try { await breaker.execute(failOp); } catch {}

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      jest.advanceTimersByTime(5001);

      await breaker.execute(successOp);
      
      expect(successOp).toHaveBeenCalled();
    });
  });

  // ============================================
  // HALF_OPEN State Behavior
  // ============================================
  describe('HALF_OPEN State Behavior', () => {
    it('should transition to CLOSED after successThreshold successes', async () => {
      const breaker = new CircuitBreaker('test-half-to-closed', {
        failureThreshold: 2,
        successThreshold: 2,
        resetTimeout: 1000,
      });
      const failOp = jest.fn().mockRejectedValue(new Error('fail'));
      const successOp = jest.fn().mockResolvedValue('success');

      try { await breaker.execute(failOp); } catch {}
      try { await breaker.execute(failOp); } catch {}

      jest.advanceTimersByTime(1001);

      await breaker.execute(successOp);
      await breaker.execute(successOp);

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should increment failure count and eventually re-open on failure in HALF_OPEN', async () => {
      const breaker = new CircuitBreaker('test-half-failure', {
        failureThreshold: 2,
        successThreshold: 3,
        resetTimeout: 1000,
      });
      const failOp = jest.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      try { await breaker.execute(failOp); } catch {}
      try { await breaker.execute(failOp); } catch {}

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Advance past resetTimeout to enter HALF_OPEN
      jest.advanceTimersByTime(1001);

      // Failure in HALF_OPEN - the implementation may need multiple failures
      // to re-open based on failureThreshold
      try { await breaker.execute(failOp); } catch {}
      try { await breaker.execute(failOp); } catch {}

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should increment halfOpenCount when entering HALF_OPEN', async () => {
      const breaker = new CircuitBreaker('test-half-open-count', {
        failureThreshold: 2,
        resetTimeout: 1000,
      });
      const failOp = jest.fn().mockRejectedValue(new Error('fail'));
      const successOp = jest.fn().mockResolvedValue('success');

      try { await breaker.execute(failOp); } catch {}
      try { await breaker.execute(failOp); } catch {}

      jest.advanceTimersByTime(1001);

      await breaker.execute(successOp);

      const metrics = breaker.getMetrics();
      expect(metrics.halfOpenCount).toBe(1);
    });
  });

  // ============================================
  // Timeout Handling
  // ============================================
  describe('Timeout Handling', () => {
    it('should timeout slow operations', async () => {
      const breaker = new CircuitBreaker('test-timeout', {
        timeout: 100,
        failureThreshold: 5,
      });
      
      const slowOp = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('slow'), 200))
      );

      const promise = breaker.execute(slowOp);
      
      jest.advanceTimersByTime(101);
      
      await expect(promise).rejects.toThrow('Operation timeout');
    });

    it('should track timeouts in metrics', async () => {
      const breaker = new CircuitBreaker('test-timeout-metrics', {
        timeout: 100,
        failureThreshold: 10,
      });
      
      const slowOp = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('slow'), 200))
      );

      const promise = breaker.execute(slowOp);
      jest.advanceTimersByTime(101);
      
      try { await promise; } catch {}

      const metrics = breaker.getMetrics();
      expect(metrics.timeoutCount).toBe(1);
    });

    it('should count timeout as failure', async () => {
      const breaker = new CircuitBreaker('test-timeout-failure', {
        timeout: 100,
        failureThreshold: 2,
      });
      
      const slowOp = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('slow'), 200))
      );

      let promise = breaker.execute(slowOp);
      jest.advanceTimersByTime(101);
      try { await promise; } catch {}

      promise = breaker.execute(slowOp);
      jest.advanceTimersByTime(101);
      try { await promise; } catch {}

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  // ============================================
  // Fallback on Error
  // ============================================
  describe('Fallback on Error', () => {
    it('should use fallback when operation fails', async () => {
      const fallback = jest.fn().mockReturnValue('fallback-value');
      const breaker = new CircuitBreaker('test-error-fallback', {
        failureThreshold: 10,
        fallback,
      });
      const failOp = jest.fn().mockRejectedValue(new Error('fail'));

      const result = await breaker.execute(failOp);

      expect(result).toBe('fallback-value');
      expect(fallback).toHaveBeenCalled();
    });

    it('should pass arguments to fallback', async () => {
      const fallback = jest.fn().mockReturnValue('fallback');
      const breaker = new CircuitBreaker('test-fallback-args', {
        failureThreshold: 10,
        fallback,
      });
      const failOp = jest.fn().mockRejectedValue(new Error('fail'));

      await breaker.execute(failOp, 'arg1', 'arg2', 123);

      expect(fallback).toHaveBeenCalledWith('arg1', 'arg2', 123);
    });
  });

  // ============================================
  // Reset
  // ============================================
  describe('Reset', () => {
    it('should reset circuit to CLOSED state', async () => {
      const breaker = new CircuitBreaker('test-reset', {
        failureThreshold: 2,
      });
      const failOp = jest.fn().mockRejectedValue(new Error('fail'));

      try { await breaker.execute(failOp); } catch {}
      try { await breaker.execute(failOp); } catch {}

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      breaker.reset();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.isOpen()).toBe(false);
    });

    it('should reset failure counts', async () => {
      const breaker = new CircuitBreaker('test-reset-counts', {
        failureThreshold: 5,
      });
      const failOp = jest.fn().mockRejectedValue(new Error('fail'));

      try { await breaker.execute(failOp); } catch {}
      try { await breaker.execute(failOp); } catch {}

      breaker.reset();

      try { await breaker.execute(failOp); } catch {}
      try { await breaker.execute(failOp); } catch {}

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  // ============================================
  // createCircuitBreaker Factory
  // ============================================
  describe('createCircuitBreaker Factory', () => {
    it('should create a wrapped function with circuit breaker', async () => {
      const originalFn = jest.fn().mockResolvedValue('result');
      const wrapped = createCircuitBreaker(originalFn, { name: 'factory-test' });

      const result = await wrapped.fire();

      expect(result).toBe('result');
      expect(originalFn).toHaveBeenCalled();
    });

    it('should pass arguments to wrapped function', async () => {
      const originalFn = jest.fn().mockResolvedValue('result');
      const wrapped = createCircuitBreaker(originalFn, { name: 'factory-args' });

      await wrapped.fire('arg1', 'arg2');

      expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should expose getState method', () => {
      const originalFn = jest.fn().mockResolvedValue('result');
      const wrapped = createCircuitBreaker(originalFn, { name: 'factory-state' });

      expect(wrapped.getState()).toBe(CircuitState.CLOSED);
    });

    it('should expose isOpen method', () => {
      const originalFn = jest.fn().mockResolvedValue('result');
      const wrapped = createCircuitBreaker(originalFn, { name: 'factory-isopen' });

      expect(wrapped.isOpen()).toBe(false);
    });

    it('should expose reset method', async () => {
      const originalFn = jest.fn().mockRejectedValue(new Error('fail'));
      const wrapped = createCircuitBreaker(originalFn, {
        name: 'factory-reset',
        failureThreshold: 2,
      });

      try { await wrapped.fire(); } catch {}
      try { await wrapped.fire(); } catch {}

      expect(wrapped.getState()).toBe(CircuitState.OPEN);

      wrapped.reset();

      expect(wrapped.getState()).toBe(CircuitState.CLOSED);
    });

    it('should expose getMetrics method', async () => {
      const originalFn = jest.fn().mockResolvedValue('result');
      const wrapped = createCircuitBreaker(originalFn, { name: 'factory-metrics' });

      await wrapped.fire();

      const metrics = wrapped.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successCount).toBe(1);
    });

    it('should support fallback option', async () => {
      const originalFn = jest.fn().mockRejectedValue(new Error('fail'));
      const fallback = jest.fn().mockReturnValue('fallback');
      const wrapped = createCircuitBreaker(originalFn, {
        name: 'factory-fallback',
        failureThreshold: 10,
        fallback,
      });

      const result = await wrapped.fire();

      expect(result).toBe('fallback');
    });
  });

  // ============================================
  // Global Metrics Registry
  // ============================================
  describe('Global Metrics Registry', () => {
    it('should register circuit breaker in global registry', () => {
      const breaker = new CircuitBreaker('registry-test-1');
      
      const metrics = getCircuitBreakerMetrics('registry-test-1');
      expect(metrics).toBeDefined();
      expect(metrics?.name).toBe('registry-test-1');
    });

    it('should return all circuit breaker metrics', () => {
      new CircuitBreaker('registry-all-1');
      new CircuitBreaker('registry-all-2');

      const allMetrics = getAllCircuitBreakerMetrics();
      
      const names = allMetrics.map(m => m.name);
      expect(names).toContain('registry-all-1');
      expect(names).toContain('registry-all-2');
    });

    it('should reset metrics for specific circuit breaker', async () => {
      const breaker = new CircuitBreaker('registry-reset');
      const op = jest.fn().mockResolvedValue('result');

      await breaker.execute(op);
      await breaker.execute(op);

      expect(breaker.getMetrics().totalRequests).toBe(2);

      resetCircuitBreakerMetrics('registry-reset');

      const metrics = getCircuitBreakerMetrics('registry-reset');
      expect(metrics?.totalRequests).toBe(0);
    });

    it('should return undefined for non-existent circuit breaker', () => {
      const metrics = getCircuitBreakerMetrics('non-existent');
      expect(metrics).toBeUndefined();
    });

    it('should not register when enableMetrics is false', () => {
      const breaker = new CircuitBreaker('no-metrics-test', {
        enableMetrics: false,
      });

      const metrics = getCircuitBreakerMetrics('no-metrics-test');
      expect(metrics).toBeUndefined();
    });
  });
});

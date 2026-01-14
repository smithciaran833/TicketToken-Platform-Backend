/**
 * Comprehensive Unit Tests for src/utils/circuit-breaker.ts
 *
 * Tests circuit breaker pattern implementation
 */

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  default: mockLogger,
  __esModule: true,
}));

import {
  CircuitBreaker,
  CircuitState,
  CircuitBreakerOpenError,
  getCircuitBreaker,
  getAllCircuitBreakerMetrics,
  resetAllCircuitBreakers,
  solanaRpcBreaker,
  marketplaceApiBreaker,
  mongoBreaker,
  postgresBreaker,
} from '../../../src/utils/circuit-breaker';

describe('src/utils/circuit-breaker.ts - Comprehensive Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // =============================================================================
  // CIRCUIT BREAKER - CONSTRUCTOR
  // =============================================================================

  describe('CircuitBreaker - Constructor', () => {
    it('should create circuit breaker with default options', () => {
      const breaker = new CircuitBreaker();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'default',
          failureThreshold: 5,
          resetTimeout: 30000,
        }),
        'Circuit breaker initialized'
      );
    });

    it('should create circuit breaker with custom options', () => {
      const breaker = new CircuitBreaker({
        name: 'test-breaker',
        failureThreshold: 3,
        successThreshold: 1,
        resetTimeout: 60000,
        callTimeout: 5000,
      });

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-breaker',
          failureThreshold: 3,
          resetTimeout: 60000,
        }),
        'Circuit breaker initialized'
      );
    });

    it('should accept custom state change handler', () => {
      const onStateChange = jest.fn();
      const breaker = new CircuitBreaker({
        name: 'custom-handler',
        onStateChange,
      });

      expect(breaker).toBeDefined();
    });

    it('should accept custom isFailure function', () => {
      const isFailure = jest.fn(() => false);
      const breaker = new CircuitBreaker({
        name: 'custom-failure',
        isFailure,
      });

      expect(breaker).toBeDefined();
    });
  });

  // =============================================================================
  // CIRCUIT BREAKER - CLOSED STATE
  // =============================================================================

  describe('CircuitBreaker - CLOSED State', () => {
    it('should execute successful calls in closed state', async () => {
      const breaker = new CircuitBreaker({ name: 'test' });
      const successFn = jest.fn().mockResolvedValue('success');

      const result = await breaker.execute(successFn);

      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalledTimes(1);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should handle failures without opening immediately', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 3,
      });
      const errorFn = jest.fn().mockRejectedValue(new Error('Failed'));

      // First failure
      await expect(breaker.execute(errorFn)).rejects.toThrow('Failed');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      // Second failure
      await expect(breaker.execute(errorFn)).rejects.toThrow('Failed');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should open circuit after reaching failure threshold', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 3,
      });
      const errorFn = jest.fn().mockRejectedValue(new Error('Failed'));

      // Fail 3 times
      await expect(breaker.execute(errorFn)).rejects.toThrow('Failed');
      await expect(breaker.execute(errorFn)).rejects.toThrow('Failed');
      await expect(breaker.execute(errorFn)).rejects.toThrow('Failed');

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should reset failure count after success', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 3,
      });

      // Fail twice
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      // Then succeed
      await breaker.execute(() => Promise.resolve('success'));

      const metrics = breaker.getMetrics();
      expect(metrics.failures).toBe(0);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  // =============================================================================
  // CIRCUIT BREAKER - OPEN STATE
  // =============================================================================

  describe('CircuitBreaker - OPEN State', () => {
    it('should reject calls immediately when open', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        resetTimeout: 5000,
      });

      // Open the circuit
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Try to call - should be rejected without executing
      const fn = jest.fn().mockResolvedValue('should not execute');
      await expect(breaker.execute(fn)).rejects.toThrow(CircuitBreakerOpenError);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should include retry time in open error', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
        resetTimeout: 5000,
      });

      // Open the circuit
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      try {
        await breaker.execute(() => Promise.resolve('test'));
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerOpenError);
        expect((error as CircuitBreakerOpenError).retryAfterMs).toBeGreaterThan(0);
        expect((error as CircuitBreakerOpenError).retryAfterMs).toBeLessThanOrEqual(5000);
      }
    });

    it('should transition to half-open after reset timeout', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
        resetTimeout: 5000,
      });

      // Open the circuit
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Advance time past reset timeout
      jest.advanceTimersByTime(5001);

      // Next call should transition to half-open
      const fn = jest.fn().mockResolvedValue('success');
      await breaker.execute(fn);

      expect(breaker.getState()).toBe(CircuitState.CLOSED); // Success in half-open closes it
      expect(fn).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // CIRCUIT BREAKER - HALF_OPEN STATE
  // =============================================================================

  describe('CircuitBreaker - HALF_OPEN State', () => {
    it('should allow test calls in half-open state', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
        resetTimeout: 1000,
      });

      // Open the circuit
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      // Move to half-open
      jest.advanceTimersByTime(1001);

      const fn = jest.fn().mockResolvedValue('success');
      await breaker.execute(fn);

      expect(fn).toHaveBeenCalled();
    });

    it('should close circuit after success threshold in half-open', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
        successThreshold: 2,
        resetTimeout: 1000,
      });

      // Open the circuit
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Move to half-open
      jest.advanceTimersByTime(1001);

      // First success - should stay half-open
      await breaker.execute(() => Promise.resolve('success1'));
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Second success - should close
      await breaker.execute(() => Promise.resolve('success2'));
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reopen immediately on failure in half-open', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
        resetTimeout: 1000,
      });

      // Open the circuit
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      // Move to half-open
      jest.advanceTimersByTime(1001);
      breaker.forceState(CircuitState.HALF_OPEN);

      // Fail in half-open - should reopen
      await expect(breaker.execute(() => Promise.reject(new Error('fail again')))).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  // =============================================================================
  // CIRCUIT BREAKER - TIMEOUT
  // =============================================================================

  describe('CircuitBreaker - Timeout', () => {
    it('should timeout slow calls', async () => {
      jest.useRealTimers(); // Need real timers for timeout
      const breaker = new CircuitBreaker({
        name: 'test',
        callTimeout: 100,
      });

      const slowFn = () => new Promise((resolve) => setTimeout(resolve, 200));

      await expect(breaker.execute(slowFn)).rejects.toThrow('timeout');

      jest.useFakeTimers();
    });

    it('should not timeout fast calls', async () => {
      jest.useRealTimers();
      const breaker = new CircuitBreaker({
        name: 'test',
        callTimeout: 1000,
      });

      const fastFn = () => new Promise((resolve) => setTimeout(() => resolve('fast'), 50));

      const result = await breaker.execute(fastFn);
      expect(result).toBe('fast');

      jest.useFakeTimers();
    });

    it('should work without timeout configured', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        callTimeout: 0, // Disable timeout
      });

      const fn = jest.fn().mockResolvedValue('success');
      await breaker.execute(fn);

      expect(fn).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // CIRCUIT BREAKER - CUSTOM IS FAILURE
  // =============================================================================

  describe('CircuitBreaker - Custom isFailure', () => {
    it('should not count error as failure when isFailure returns false', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        isFailure: (error) => error.message !== 'ignore-this',
      });

      // This error should not count
      await expect(
        breaker.execute(() => Promise.reject(new Error('ignore-this')))
      ).rejects.toThrow();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      const metrics = breaker.getMetrics();
      expect(metrics.failures).toBe(0);
    });

    it('should count error as failure when isFailure returns true', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        isFailure: (error) => error.message.includes('fatal'),
      });

      // This error should count
      await expect(
        breaker.execute(() => Promise.reject(new Error('fatal error')))
      ).rejects.toThrow();

      const metrics = breaker.getMetrics();
      expect(metrics.failures).toBe(1);
    });
  });

  // =============================================================================
  // CIRCUIT BREAKER - STATE CHANGE CALLBACK
  // =============================================================================

  describe('CircuitBreaker - State Change Callback', () => {
    it('should call onStateChange when transitioning states', async () => {
      const onStateChange = jest.fn();
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
        onStateChange,
      });

      // Open the circuit
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      expect(onStateChange).toHaveBeenCalledWith(
        CircuitState.CLOSED,
        CircuitState.OPEN,
        'test'
      );
    });

    it('should call default handler when no custom handler provided', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
      });

      // Open the circuit
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          from: CircuitState.CLOSED,
          to: CircuitState.OPEN,
        }),
        'Circuit breaker state changed'
      );
    });
  });

  // =============================================================================
  // CIRCUIT BREAKER - GET METRICS
  // =============================================================================

  describe('CircuitBreaker - getMetrics()', () => {
    it('should return current metrics', async () => {
      const breaker = new CircuitBreaker({ name: 'test-metrics' });

      await breaker.execute(() => Promise.resolve('success'));
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      const metrics = breaker.getMetrics();

      expect(metrics.name).toBe('test-metrics');
      expect(metrics.state).toBe(CircuitState.CLOSED);
      expect(metrics.totalCalls).toBe(2);
      expect(metrics.failures).toBe(1);
      expect(metrics.successes).toBe(0); // Only counts in half-open
      expect(metrics.lastSuccessTime).toBeGreaterThan(0);
      expect(metrics.lastFailureTime).toBeGreaterThan(0);
      expect(metrics.lastStateChange).toBeGreaterThan(0);
    });

    it('should show null timestamps when no calls made', () => {
      const breaker = new CircuitBreaker({ name: 'test' });

      const metrics = breaker.getMetrics();

      expect(metrics.lastSuccessTime).toBeNull();
      expect(metrics.lastFailureTime).toBeNull();
    });
  });

  // =============================================================================
  // CIRCUIT BREAKER - GET STATE
  // =============================================================================

  describe('CircuitBreaker - getState()', () => {
    it('should return current state', () => {
      const breaker = new CircuitBreaker();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  // =============================================================================
  // CIRCUIT BREAKER - IS CALL ALLOWED
  // =============================================================================

  describe('CircuitBreaker - isCallAllowed()', () => {
    it('should return true in closed state', () => {
      const breaker = new CircuitBreaker();
      expect(breaker.isCallAllowed()).toBe(true);
    });

    it('should return true in half-open state', () => {
      const breaker = new CircuitBreaker();
      breaker.forceState(CircuitState.HALF_OPEN);
      expect(breaker.isCallAllowed()).toBe(true);
    });

    it('should return false in open state before timeout', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeout: 5000,
      });

      // Open the circuit
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      expect(breaker.isCallAllowed()).toBe(false);
    });

    it('should return true in open state after timeout', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeout: 1000,
      });

      // Open the circuit
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(breaker.isCallAllowed()).toBe(false);

      // Advance time
      jest.advanceTimersByTime(1001);
      expect(breaker.isCallAllowed()).toBe(true);
    });
  });

  // =============================================================================
  // CIRCUIT BREAKER - FORCE STATE
  // =============================================================================

  describe('CircuitBreaker - forceState()', () => {
    it('should force circuit to open', () => {
      const breaker = new CircuitBreaker({ name: 'test' });

      breaker.forceState(CircuitState.OPEN);

      expect(breaker.getState()).toBe(CircuitState.OPEN);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { name: 'test', state: CircuitState.OPEN },
        'Circuit breaker state forced'
      );
    });

    it('should force circuit to closed', () => {
      const breaker = new CircuitBreaker({ name: 'test' });
      breaker.forceState(CircuitState.OPEN);

      breaker.forceState(CircuitState.CLOSED);

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should force circuit to half-open', () => {
      const breaker = new CircuitBreaker({ name: 'test' });

      breaker.forceState(CircuitState.HALF_OPEN);

      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });
  });

  // =============================================================================
  // CIRCUIT BREAKER - RESET
  // =============================================================================

  describe('CircuitBreaker - reset()', () => {
    it('should reset circuit to initial state', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
      });

      // Open the circuit
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Reset
      breaker.reset();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      const metrics = breaker.getMetrics();
      expect(metrics.failures).toBe(0);
      expect(metrics.successes).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        { name: 'test' },
        'Circuit breaker reset'
      );
    });
  });

  // =============================================================================
  // CIRCUIT BREAKER OPEN ERROR
  // =============================================================================

  describe('CircuitBreakerOpenError', () => {
    it('should create error with retry time', () => {
      const error = new CircuitBreakerOpenError('Circuit open', 5000);

      expect(error.message).toBe('Circuit open');
      expect(error.name).toBe('CircuitBreakerOpenError');
      expect(error.retryAfterMs).toBe(5000);
      expect(error).toBeInstanceOf(Error);
    });
  });

  // =============================================================================
  // CIRCUIT BREAKER REGISTRY
  // =============================================================================

  describe('Circuit Breaker Registry', () => {
    it('should get or create circuit breaker', () => {
      const breaker1 = getCircuitBreaker('test-registry');
      const breaker2 = getCircuitBreaker('test-registry');

      expect(breaker1).toBe(breaker2);
      expect(breaker1.getMetrics().name).toBe('test-registry');
    });

    it('should create different breakers for different names', () => {
      const breaker1 = getCircuitBreaker('breaker1');
      const breaker2 = getCircuitBreaker('breaker2');

      expect(breaker1).not.toBe(breaker2);
    });

    it('should pass options when creating new breaker', () => {
      const breaker = getCircuitBreaker('custom-options', {
        failureThreshold: 10,
        resetTimeout: 60000,
      });

      expect(breaker.getMetrics().name).toBe('custom-options');
    });

    it('should get all circuit breaker metrics', async () => {
      const breaker1 = getCircuitBreaker('metric-test-1');
      const breaker2 = getCircuitBreaker('metric-test-2');

      await breaker1.execute(() => Promise.resolve('ok'));
      await expect(breaker2.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      const allMetrics = getAllCircuitBreakerMetrics();

      expect(allMetrics.length).toBeGreaterThanOrEqual(2);
      const metric1 = allMetrics.find(m => m.name === 'metric-test-1');
      const metric2 = allMetrics.find(m => m.name === 'metric-test-2');

      expect(metric1).toBeDefined();
      expect(metric2).toBeDefined();
    });

    it('should reset all circuit breakers', async () => {
      const breaker1 = getCircuitBreaker('reset-test-1', { failureThreshold: 1 });
      const breaker2 = getCircuitBreaker('reset-test-2', { failureThreshold: 1 });

      // Open both circuits
      await expect(breaker1.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      await expect(breaker2.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      expect(breaker1.getState()).toBe(CircuitState.OPEN);
      expect(breaker2.getState()).toBe(CircuitState.OPEN);

      // Reset all
      resetAllCircuitBreakers();

      expect(breaker1.getState()).toBe(CircuitState.CLOSED);
      expect(breaker2.getState()).toBe(CircuitState.CLOSED);
    });
  });

  // =============================================================================
  // PRE-CONFIGURED CIRCUIT BREAKERS
  // =============================================================================

  describe('Pre-configured Circuit Breakers', () => {
    it('should export solanaRpcBreaker', () => {
      expect(solanaRpcBreaker).toBeInstanceOf(CircuitBreaker);
      expect(solanaRpcBreaker.getMetrics().name).toBe('solana-rpc');
    });

    it('should export marketplaceApiBreaker', () => {
      expect(marketplaceApiBreaker).toBeInstanceOf(CircuitBreaker);
      expect(marketplaceApiBreaker.getMetrics().name).toBe('marketplace-api');
    });

    it('should export mongoBreaker', () => {
      expect(mongoBreaker).toBeInstanceOf(CircuitBreaker);
      expect(mongoBreaker.getMetrics().name).toBe('mongodb');
    });

    it('should export postgresBreaker', () => {
      expect(postgresBreaker).toBeInstanceOf(CircuitBreaker);
      expect(postgresBreaker.getMetrics().name).toBe('postgresql');
    });

    it('should allow using pre-configured breakers', async () => {
      const result = await solanaRpcBreaker.execute(() => Promise.resolve('rpc-call'));
      expect(result).toBe('rpc-call');
    });
  });

  // =============================================================================
  // INTEGRATION TESTS
  // =============================================================================

  describe('Integration Tests', () => {
    it('should handle complete failure and recovery cycle', async () => {
      const breaker = new CircuitBreaker({
        name: 'integration',
        failureThreshold: 2,
        successThreshold: 2,
        resetTimeout: 1000,
      });

      // Initial state: CLOSED
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      // Fail twice to open circuit
      await expect(breaker.execute(() => Promise.reject(new Error('fail1')))).rejects.toThrow();
      await expect(breaker.execute(() => Promise.reject(new Error('fail2')))).rejects.toThrow();

      // Now OPEN
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Calls rejected immediately
      await expect(breaker.execute(() => Promise.resolve('should not run'))).rejects.toThrow(
        CircuitBreakerOpenError
      );

      // Wait for reset timeout
      jest.advanceTimersByTime(1001);

      // Next call transitions to HALF_OPEN and succeeds
      await breaker.execute(() => Promise.resolve('test1'));
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Second success closes circuit
      await breaker.execute(() => Promise.resolve('test2'));
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      // Circuit is now healthy again
      const result = await breaker.execute(() => Promise.resolve('healthy'));
      expect(result).toBe('healthy');
    });

    it('should handle rapid failures and prevent cascading', async () => {
      const breaker = new CircuitBreaker({
        name: 'rapid-fail',
        failureThreshold: 3,
      });

      const failingService = jest.fn().mockRejectedValue(new Error('Service down'));

      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingService)).rejects.toThrow();
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Next 10 calls are rejected immediately without hitting service
      for (let i = 0; i < 10; i++) {
        await expect(breaker.execute(failingService)).rejects.toThrow(CircuitBreakerOpenError);
      }

      // Service only called 3 times (during failures), not 13 times
      expect(failingService).toHaveBeenCalledTimes(3);
    });

    it('should track total calls across all states', async () => {
      const breaker = new CircuitBreaker({
        name: 'call-tracking',
        failureThreshold: 2,
        resetTimeout: 1000,
      });

      // Make 2 successful calls
      await breaker.execute(() => Promise.resolve('1'));
      await breaker.execute(() => Promise.resolve('2'));

      // Make 2 failed calls (opens circuit)
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      // Make 3 rejected calls (circuit open)
      await expect(breaker.execute(() => Promise.resolve('x'))).rejects.toThrow(
        CircuitBreakerOpenError
      );
      await expect(breaker.execute(() => Promise.resolve('x'))).rejects.toThrow(
        CircuitBreakerOpenError
      );
      await expect(breaker.execute(() => Promise.resolve('x'))).rejects.toThrow(
        CircuitBreakerOpenError
      );

      const metrics = breaker.getMetrics();
      expect(metrics.totalCalls).toBe(7);
    });
  });
});

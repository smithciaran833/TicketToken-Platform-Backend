// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock errors
jest.mock('../../../src/errors/index', () => ({
  ServiceUnavailableError: class ServiceUnavailableError extends Error {
    constructor(service: string) {
      super(`Service unavailable: ${service}`);
      this.name = 'ServiceUnavailableError';
    }
  },
}));

import {
  CircuitBreaker,
  CircuitState,
  getCircuitBreaker,
  getAllCircuitBreakerStats,
} from '../../../src/utils/circuit-breaker';
import { logger } from '../../../src/utils/logger';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create circuit breaker with default options', () => {
      const cb = new CircuitBreaker({ name: 'test' });

      const stats = cb.getStats();
      expect(stats.name).toBe('test');
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
    });

    it('should create circuit breaker with custom options', () => {
      const cb = new CircuitBreaker({
        name: 'custom',
        failureThreshold: 10,
        successThreshold: 5,
        timeout: 5000,
        resetTimeout: 60000,
      });

      expect(cb.getStats().name).toBe('custom');
      expect(logger.info).toHaveBeenCalledWith(
        'Circuit breaker created',
        expect.objectContaining({ name: 'custom' })
      );
    });
  });

  describe('execute', () => {
    it('should execute function successfully when circuit is closed', async () => {
      const cb = new CircuitBreaker({ name: 'test' });
      const fn = jest.fn().mockResolvedValue('success');

      const result = await cb.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
      expect(cb.getStats().successes).toBe(1);
    });

    it('should track failures on execution error', async () => {
      const cb = new CircuitBreaker({
        name: 'test',
        failureThreshold: 5,
        volumeThreshold: 1,
      });
      const error = new Error('Test error');
      const fn = jest.fn().mockRejectedValue(error);

      await expect(cb.execute(fn)).rejects.toThrow('Test error');

      expect(cb.getStats().failures).toBe(1);
      expect(logger.warn).toHaveBeenCalledWith(
        'Circuit breaker recorded failure',
        expect.any(Object)
      );
    });

    it('should open circuit after failure threshold exceeded', async () => {
      const cb = new CircuitBreaker({
        name: 'test',
        failureThreshold: 3,
        volumeThreshold: 3,
      });
      const error = new Error('Failure');
      const fn = jest.fn().mockRejectedValue(error);

      // Trigger failures
      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(fn)).rejects.toThrow();
      }

      expect(cb.getStats().state).toBe(CircuitState.OPEN);
      expect(logger.error).toHaveBeenCalledWith(
        'Circuit breaker opened',
        expect.any(Object)
      );
    });

    it('should reject requests when circuit is open', async () => {
      const cb = new CircuitBreaker({
        name: 'test-service',
        failureThreshold: 2,
        volumeThreshold: 2,
      });
      const error = new Error('Failure');
      const failFn = jest.fn().mockRejectedValue(error);
      const successFn = jest.fn().mockResolvedValue('success');

      // Open the circuit
      await expect(cb.execute(failFn)).rejects.toThrow();
      await expect(cb.execute(failFn)).rejects.toThrow();

      // Now circuit should be open
      await expect(cb.execute(successFn)).rejects.toThrow('Service unavailable');
      expect(successFn).not.toHaveBeenCalled();
    });

    it('should transition to half-open after reset timeout', async () => {
      const cb = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        volumeThreshold: 2,
        resetTimeout: 5000,
      });
      const error = new Error('Failure');
      const fn = jest.fn().mockRejectedValue(error);

      // Open the circuit
      await expect(cb.execute(fn)).rejects.toThrow();
      await expect(cb.execute(fn)).rejects.toThrow();

      expect(cb.getStats().state).toBe(CircuitState.OPEN);

      // Advance time past reset timeout
      jest.advanceTimersByTime(5001);

      expect(cb.getStats().state).toBe(CircuitState.HALF_OPEN);
      expect(logger.info).toHaveBeenCalledWith(
        'Circuit breaker half-open, testing service',
        expect.any(Object)
      );
    });

    it('should close circuit after success threshold in half-open', async () => {
      const cb = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        volumeThreshold: 2,
        successThreshold: 2,
        resetTimeout: 1000,
      });

      const error = new Error('Failure');
      const failFn = jest.fn().mockRejectedValue(error);
      const successFn = jest.fn().mockResolvedValue('ok');

      // Open the circuit
      await expect(cb.execute(failFn)).rejects.toThrow();
      await expect(cb.execute(failFn)).rejects.toThrow();

      // Move to half-open
      jest.advanceTimersByTime(1001);
      expect(cb.getStats().state).toBe(CircuitState.HALF_OPEN);

      // Success in half-open
      await cb.execute(successFn);
      await cb.execute(successFn);

      expect(cb.getStats().state).toBe(CircuitState.CLOSED);
      expect(logger.info).toHaveBeenCalledWith(
        'Circuit breaker closed',
        expect.any(Object)
      );
    });

    it('should reopen circuit on failure in half-open state', async () => {
      const cb = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        volumeThreshold: 2,
        resetTimeout: 1000,
      });

      const error = new Error('Failure');
      const failFn = jest.fn().mockRejectedValue(error);

      // Open the circuit
      await expect(cb.execute(failFn)).rejects.toThrow();
      await expect(cb.execute(failFn)).rejects.toThrow();

      // Move to half-open
      jest.advanceTimersByTime(1001);
      expect(cb.getStats().state).toBe(CircuitState.HALF_OPEN);

      // Failure in half-open
      await expect(cb.execute(failFn)).rejects.toThrow();

      expect(cb.getStats().state).toBe(CircuitState.OPEN);
    });

    it('should timeout long-running requests', async () => {
      const cb = new CircuitBreaker({
        name: 'test',
        timeout: 100,
        failureThreshold: 5,
        volumeThreshold: 1,
      });

      const slowFn = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 200))
      );

      const executePromise = cb.execute(slowFn);

      // Advance past timeout
      jest.advanceTimersByTime(101);

      await expect(executePromise).rejects.toThrow('Request timeout after 100ms');
    });

    it('should not count filtered errors as failures', async () => {
      const cb = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        volumeThreshold: 2,
        errorFilter: (error: any) => error.status >= 500,
      });

      const clientError = { status: 400, message: 'Bad request' };
      const fn = jest.fn().mockRejectedValue(clientError);

      await expect(cb.execute(fn)).rejects.toEqual(clientError);
      await expect(cb.execute(fn)).rejects.toEqual(clientError);

      // Circuit should still be closed since 4xx errors are filtered
      expect(cb.getStats().state).toBe(CircuitState.CLOSED);
      expect(cb.getStats().failures).toBe(0);
    });

    it('should reset failure count on success in closed state', async () => {
      const cb = new CircuitBreaker({
        name: 'test',
        failureThreshold: 5,
        volumeThreshold: 10,
      });

      const error = new Error('Failure');
      const failFn = jest.fn().mockRejectedValue(error);
      const successFn = jest.fn().mockResolvedValue('ok');

      // Some failures
      await expect(cb.execute(failFn)).rejects.toThrow();
      await expect(cb.execute(failFn)).rejects.toThrow();
      expect(cb.getStats().failures).toBe(2);

      // Success resets failure count
      await cb.execute(successFn);
      expect(cb.getStats().failures).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return current statistics', async () => {
      const cb = new CircuitBreaker({ name: 'stats-test' });
      const fn = jest.fn().mockResolvedValue('ok');

      await cb.execute(fn);
      await cb.execute(fn);

      const stats = cb.getStats();

      expect(stats.name).toBe('stats-test');
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.successes).toBe(2);
      expect(stats.totalRequests).toBe(2);
      expect(stats.lastSuccess).toBeInstanceOf(Date);
    });

    it('should track last failure time', async () => {
      const cb = new CircuitBreaker({
        name: 'test',
        failureThreshold: 10,
        volumeThreshold: 10,
      });
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(cb.execute(fn)).rejects.toThrow();

      const stats = cb.getStats();
      expect(stats.lastFailure).toBeInstanceOf(Date);
    });
  });

  describe('reset', () => {
    it('should reset circuit to initial state', async () => {
      const cb = new CircuitBreaker({
        name: 'test',
        failureThreshold: 2,
        volumeThreshold: 2,
      });
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      await expect(cb.execute(fn)).rejects.toThrow();
      await expect(cb.execute(fn)).rejects.toThrow();
      expect(cb.getStats().state).toBe(CircuitState.OPEN);

      // Reset
      cb.reset();

      const stats = cb.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('isHealthy', () => {
    it('should return true when circuit is closed', () => {
      const cb = new CircuitBreaker({ name: 'test' });
      expect(cb.isHealthy()).toBe(true);
    });

    it('should return false when circuit is open', async () => {
      const cb = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
        volumeThreshold: 1,
      });
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(cb.execute(fn)).rejects.toThrow();

      expect(cb.isHealthy()).toBe(false);
    });

    it('should return false when circuit is half-open', async () => {
      const cb = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
        volumeThreshold: 1,
        resetTimeout: 1000,
      });
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(cb.execute(fn)).rejects.toThrow();
      jest.advanceTimersByTime(1001);

      expect(cb.getStats().state).toBe(CircuitState.HALF_OPEN);
      expect(cb.isHealthy()).toBe(false);
    });
  });
});

describe('getCircuitBreaker', () => {
  it('should create new circuit breaker for unknown provider', () => {
    const cb = getCircuitBreaker('new-provider');
    expect(cb).toBeInstanceOf(CircuitBreaker);
    expect(cb.getStats().name).toBe('new-provider');
  });

  it('should return same instance for same provider', () => {
    const cb1 = getCircuitBreaker('same-provider');
    const cb2 = getCircuitBreaker('same-provider');
    expect(cb1).toBe(cb2);
  });

  it('should normalize provider name to lowercase', () => {
    const cb1 = getCircuitBreaker('MyProvider');
    const cb2 = getCircuitBreaker('myprovider');
    expect(cb1).toBe(cb2);
  });

  it('should accept custom options', () => {
    const cb = getCircuitBreaker('custom-opts', {
      timeout: 5000,
      failureThreshold: 10,
    });
    expect(cb.getStats().name).toBe('custom-opts');
  });
});

describe('getAllCircuitBreakerStats', () => {
  it('should return stats for all circuit breakers', () => {
    // Create some breakers
    getCircuitBreaker('provider-a');
    getCircuitBreaker('provider-b');

    const allStats = getAllCircuitBreakerStats();

    expect(Array.isArray(allStats)).toBe(true);
    expect(allStats.length).toBeGreaterThanOrEqual(2);

    const names = allStats.map(s => s.name);
    expect(names).toContain('provider-a');
    expect(names).toContain('provider-b');
  });
});

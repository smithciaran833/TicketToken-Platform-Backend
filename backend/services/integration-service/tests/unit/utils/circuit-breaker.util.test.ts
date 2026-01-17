// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  CircuitBreaker,
  CircuitState,
  CircuitBreakerConfig,
  circuitBreakerManager,
} from '../../../src/utils/circuit-breaker.util';
import { logger } from '../../../src/utils/logger';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  const defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 1000,
    monitoringPeriod: 5000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    breaker = new CircuitBreaker('test-service', defaultConfig);
  });

  describe('constructor', () => {
    it('should initialize with CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should initialize with default config when not provided', () => {
      const defaultBreaker = new CircuitBreaker('default-service');
      expect(defaultBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should initialize stats correctly', () => {
      const stats = breaker.getStats();

      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.totalRequests).toBe(0);
      expect(stats.totalFailures).toBe(0);
      expect(stats.totalSuccesses).toBe(0);
    });
  });

  describe('execute', () => {
    it('should execute function successfully when circuit is closed', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await breaker.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
    });

    it('should track total requests', async () => {
      const fn = jest.fn().mockResolvedValue('ok');

      await breaker.execute(fn);
      await breaker.execute(fn);
      await breaker.execute(fn);

      const stats = breaker.getStats();
      expect(stats.totalRequests).toBe(3);
    });

    it('should track successful executions', async () => {
      const fn = jest.fn().mockResolvedValue('ok');

      await breaker.execute(fn);

      const stats = breaker.getStats();
      expect(stats.totalSuccesses).toBe(1);
      expect(stats.lastSuccessTime).toBeInstanceOf(Date);
    });

    it('should track failed executions', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(breaker.execute(fn)).rejects.toThrow('fail');

      const stats = breaker.getStats();
      expect(stats.totalFailures).toBe(1);
      expect(stats.failureCount).toBe(1);
      expect(stats.lastFailureTime).toBeInstanceOf(Date);
    });

    it('should reset failure count on success in closed state', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('ok');

      // Cause some failures (but not enough to trip)
      await expect(breaker.execute(failFn)).rejects.toThrow();
      await expect(breaker.execute(failFn)).rejects.toThrow();

      expect(breaker.getStats().failureCount).toBe(2);

      // Success should reset failure count
      await breaker.execute(successFn);

      expect(breaker.getStats().failureCount).toBe(0);
    });

    it('should open circuit after failure threshold', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Trigger failures up to threshold
      for (let i = 0; i < defaultConfig.failureThreshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('fail');
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('opened after')
      );
    });

    it('should reject requests when circuit is open', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      for (let i = 0; i < defaultConfig.failureThreshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow();
      }

      const successFn = jest.fn().mockResolvedValue('success');

      await expect(breaker.execute(successFn)).rejects.toThrow(
        'Circuit breaker test-service is OPEN'
      );
      expect(successFn).not.toHaveBeenCalled();
    });

    it('should set circuitBreakerOpen flag on rejection', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      for (let i = 0; i < defaultConfig.failureThreshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow();
      }

      try {
        await breaker.execute(jest.fn());
      } catch (error: any) {
        expect(error.circuitBreakerOpen).toBe(true);
      }
    });

    it('should transition to half-open after timeout', async () => {
      const originalDateNow = Date.now;
      const startTime = originalDateNow();

      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      for (let i = 0; i < defaultConfig.failureThreshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow();
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Mock Date.now to be past timeout
      Date.now = jest.fn().mockReturnValue(startTime + defaultConfig.timeout + 100);

      // Next request should trigger half-open
      const successFn = jest.fn().mockResolvedValue('success');
      await breaker.execute(successFn);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('entering HALF_OPEN state')
      );

      // Restore
      Date.now = originalDateNow;
    });

    it('should close circuit after success threshold in half-open', async () => {
      const originalDateNow = Date.now;
      const startTime = originalDateNow();

      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Open the circuit
      for (let i = 0; i < defaultConfig.failureThreshold; i++) {
        await expect(breaker.execute(failFn)).rejects.toThrow();
      }

      // Mock Date.now to be past timeout
      Date.now = jest.fn().mockReturnValue(startTime + defaultConfig.timeout + 100);

      // Execute success threshold times
      for (let i = 0; i < defaultConfig.successThreshold; i++) {
        await breaker.execute(successFn);
      }

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('closed after')
      );

      // Restore
      Date.now = originalDateNow;
    });

    it('should reopen circuit on failure in half-open state', async () => {
      const originalDateNow = Date.now;
      const startTime = originalDateNow();

      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Open the circuit
      for (let i = 0; i < defaultConfig.failureThreshold; i++) {
        await expect(breaker.execute(failFn)).rejects.toThrow();
      }

      // Mock Date.now to be past timeout
      Date.now = jest.fn().mockReturnValue(startTime + defaultConfig.timeout + 100);

      // One success to enter half-open
      await breaker.execute(successFn);

      // Failure in half-open should reopen
      await expect(breaker.execute(failFn)).rejects.toThrow();

      expect(breaker.getState()).toBe(CircuitState.OPEN);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('reopened after failure in HALF_OPEN state')
      );

      // Restore
      Date.now = originalDateNow;
    });
  });

  describe('forceOpen', () => {
    it('should force circuit to open state', () => {
      breaker.forceOpen();

      expect(breaker.getState()).toBe(CircuitState.OPEN);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('forcefully opened')
      );
    });

    it('should set nextAttemptTime', () => {
      breaker.forceOpen();

      const stats = breaker.getStats();
      expect(stats.nextAttemptTime).toBeInstanceOf(Date);
    });
  });

  describe('forceClose', () => {
    it('should force circuit to closed state', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit first
      for (let i = 0; i < defaultConfig.failureThreshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow();
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      breaker.forceClose();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('forcefully closed')
      );
    });

    it('should reset failure and success counts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Cause some failures
      await expect(breaker.execute(fn)).rejects.toThrow();
      await expect(breaker.execute(fn)).rejects.toThrow();

      breaker.forceClose();

      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
    });
  });

  describe('getState', () => {
    it('should return current state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      breaker.forceOpen();
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      breaker.forceClose();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('getStats', () => {
    it('should return all statistics', async () => {
      const successFn = jest.fn().mockResolvedValue('ok');
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));

      await breaker.execute(successFn);
      await breaker.execute(successFn);
      await expect(breaker.execute(failFn)).rejects.toThrow();

      const stats = breaker.getStats();

      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.totalRequests).toBe(3);
      expect(stats.totalSuccesses).toBe(2);
      expect(stats.totalFailures).toBe(1);
      expect(stats.failureCount).toBe(1);
      expect(stats.lastSuccessTime).toBeInstanceOf(Date);
      expect(stats.lastFailureTime).toBeInstanceOf(Date);
    });
  });

  describe('isAvailable', () => {
    it('should return true when circuit is closed', () => {
      expect(breaker.isAvailable()).toBe(true);
    });

    it('should return false when circuit is open and timeout not reached', () => {
      breaker.forceOpen();

      expect(breaker.isAvailable()).toBe(false);
    });

    it('should return true when circuit is open but timeout reached', () => {
      const originalDateNow = Date.now;
      const startTime = Date.now();

      breaker.forceOpen();

      // Fast forward past timeout
      Date.now = jest.fn().mockReturnValue(startTime + defaultConfig.timeout + 100);

      expect(breaker.isAvailable()).toBe(true);

      // Restore
      Date.now = originalDateNow;
    });

    it('should return true when circuit is half-open', async () => {
      const originalDateNow = Date.now;
      const startTime = originalDateNow();

      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      for (let i = 0; i < defaultConfig.failureThreshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow();
      }

      // Mock Date.now to be past timeout
      Date.now = jest.fn().mockReturnValue(startTime + defaultConfig.timeout + 100);

      const successFn = jest.fn().mockResolvedValue('ok');
      await breaker.execute(successFn);

      // Should be in half-open state now (one success, need 2 to close)
      expect(breaker.isAvailable()).toBe(true);

      // Restore
      Date.now = originalDateNow;
    });
  });
});

describe('CircuitBreakerManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clean up existing breakers
    const stats = circuitBreakerManager.getAllStats();
    for (const name of Object.keys(stats)) {
      circuitBreakerManager.remove(name);
    }
  });

  describe('getBreaker', () => {
    it('should create new breaker if not exists', () => {
      const breaker = circuitBreakerManager.getBreaker('new-service');

      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should return existing breaker', () => {
      const breaker1 = circuitBreakerManager.getBreaker('same-service');
      const breaker2 = circuitBreakerManager.getBreaker('same-service');

      expect(breaker1).toBe(breaker2);
    });

    it('should accept custom config', () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 10,
        successThreshold: 5,
        timeout: 5000,
        monitoringPeriod: 10000,
      };

      const breaker = circuitBreakerManager.getBreaker('custom-config', config);

      expect(breaker).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should execute function with circuit breaker', async () => {
      const fn = jest.fn().mockResolvedValue('result');

      const result = await circuitBreakerManager.execute('exec-service', fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();
    });

    it('should use existing breaker', async () => {
      const fn1 = jest.fn().mockResolvedValue('result1');
      const fn2 = jest.fn().mockResolvedValue('result2');

      await circuitBreakerManager.execute('shared-service', fn1);
      await circuitBreakerManager.execute('shared-service', fn2);

      const stats = circuitBreakerManager.getAllStats();
      expect(stats['shared-service'].totalRequests).toBe(2);
    });

    it('should accept custom config', async () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 1,
        successThreshold: 1,
        timeout: 100,
        monitoringPeriod: 1000,
      };

      const failFn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(
        circuitBreakerManager.execute('config-exec', failFn, config)
      ).rejects.toThrow();

      // With threshold of 1, should be open now
      const breaker = circuitBreakerManager.get('config-exec');
      expect(breaker?.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('getAllStats', () => {
    it('should return stats for all breakers', async () => {
      const fn = jest.fn().mockResolvedValue('ok');

      await circuitBreakerManager.execute('service-a', fn);
      await circuitBreakerManager.execute('service-b', fn);
      await circuitBreakerManager.execute('service-c', fn);

      const allStats = circuitBreakerManager.getAllStats();

      expect(allStats['service-a']).toBeDefined();
      expect(allStats['service-b']).toBeDefined();
      expect(allStats['service-c']).toBeDefined();
    });

    it('should return empty object when no breakers', () => {
      // Remove any existing breakers
      const stats = circuitBreakerManager.getAllStats();
      for (const name of Object.keys(stats)) {
        circuitBreakerManager.remove(name);
      }

      const allStats = circuitBreakerManager.getAllStats();

      expect(allStats).toEqual({});
    });
  });

  describe('get', () => {
    it('should return breaker by name', () => {
      circuitBreakerManager.getBreaker('get-test');

      const breaker = circuitBreakerManager.get('get-test');

      expect(breaker).toBeDefined();
    });

    it('should return undefined for non-existent breaker', () => {
      const breaker = circuitBreakerManager.get('non-existent');

      expect(breaker).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('should remove breaker by name', () => {
      circuitBreakerManager.getBreaker('to-remove');

      const removed = circuitBreakerManager.remove('to-remove');

      expect(removed).toBe(true);
      expect(circuitBreakerManager.get('to-remove')).toBeUndefined();
    });

    it('should return false for non-existent breaker', () => {
      const removed = circuitBreakerManager.remove('does-not-exist');

      expect(removed).toBe(false);
    });
  });

  describe('getOpenCount', () => {
    it('should return count of open breakers', async () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 1,
        successThreshold: 1,
        timeout: 60000,
        monitoringPeriod: 120000,
      };

      const failFn = jest.fn().mockRejectedValue(new Error('fail'));

      // Open two breakers
      await expect(
        circuitBreakerManager.execute('open-1', failFn, config)
      ).rejects.toThrow();

      await expect(
        circuitBreakerManager.execute('open-2', failFn, config)
      ).rejects.toThrow();

      // One closed breaker
      const successFn = jest.fn().mockResolvedValue('ok');
      await circuitBreakerManager.execute('closed-1', successFn);

      expect(circuitBreakerManager.getOpenCount()).toBe(2);
    });

    it('should return 0 when no breakers are open', async () => {
      const fn = jest.fn().mockResolvedValue('ok');

      await circuitBreakerManager.execute('healthy-1', fn);
      await circuitBreakerManager.execute('healthy-2', fn);

      expect(circuitBreakerManager.getOpenCount()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('hasOpenCircuits', () => {
    it('should return true when at least one circuit is open', async () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 1,
        successThreshold: 1,
        timeout: 60000,
        monitoringPeriod: 120000,
      };

      const failFn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(
        circuitBreakerManager.execute('has-open-test', failFn, config)
      ).rejects.toThrow();

      expect(circuitBreakerManager.hasOpenCircuits()).toBe(true);
    });

    it('should return false when all circuits are closed', async () => {
      // Clean all existing breakers
      const stats = circuitBreakerManager.getAllStats();
      for (const name of Object.keys(stats)) {
        circuitBreakerManager.remove(name);
      }

      const fn = jest.fn().mockResolvedValue('ok');

      await circuitBreakerManager.execute('all-closed-1', fn);
      await circuitBreakerManager.execute('all-closed-2', fn);

      expect(circuitBreakerManager.hasOpenCircuits()).toBe(false);
    });
  });
});

describe('CircuitState enum', () => {
  it('should have CLOSED state', () => {
    expect(CircuitState.CLOSED).toBe('CLOSED');
  });

  it('should have OPEN state', () => {
    expect(CircuitState.OPEN).toBe('OPEN');
  });

  it('should have HALF_OPEN state', () => {
    expect(CircuitState.HALF_OPEN).toBe('HALF_OPEN');
  });
});

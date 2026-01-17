import { CircuitBreaker, CircuitBreakerManager, CircuitState, circuitBreakerManager } from '../../../src/utils/circuit-breaker';
import { logger } from '../../../src/config/logger';
import { metricsService } from '../../../src/services/metrics.service';

// Mock dependencies
jest.mock('../../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../src/services/metrics.service', () => ({
  metricsService: {
    incrementCounter: jest.fn(),
    setGauge: jest.fn(),
  },
}));

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with default options', () => {
      circuitBreaker = new CircuitBreaker();
      
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('initialized'),
        expect.objectContaining({
          options: expect.objectContaining({
            failureThreshold: 5,
            successThreshold: 2,
            timeout: 60000,
            monitoringPeriod: 120000,
            name: 'unnamed',
          }),
        })
      );
    });

    it('should initialize with custom options', () => {
      circuitBreaker = new CircuitBreaker({
        name: 'test-breaker',
        failureThreshold: 3,
        successThreshold: 1,
        timeout: 30000,
        monitoringPeriod: 60000,
      });

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('test-breaker'),
        expect.objectContaining({
          options: expect.objectContaining({
            name: 'test-breaker',
            failureThreshold: 3,
            successThreshold: 1,
            timeout: 30000,
            monitoringPeriod: 60000,
          }),
        })
      );
    });
  });

  describe('State: CLOSED', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        name: 'test-breaker',
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 60000,
      });
    });

    it('should execute function successfully when CLOSED', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(metricsService.incrementCounter).toHaveBeenCalledWith(
        'circuit_breaker_success_total',
        expect.objectContaining({
          circuit_name: 'test-breaker',
          state: CircuitState.CLOSED,
        })
      );
    });

    it('should record failure but remain CLOSED below threshold', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('test error'));
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('test error');
      
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(logger.warn).toHaveBeenCalledWith(
        'Circuit breaker failure recorded',
        expect.objectContaining({
          name: 'test-breaker',
          state: CircuitState.CLOSED,
          failureCount: 1,
          threshold: 3,
        })
      );
      expect(metricsService.incrementCounter).toHaveBeenCalledWith(
        'circuit_breaker_failure_total',
        expect.objectContaining({
          circuit_name: 'test-breaker',
          state: CircuitState.CLOSED,
        })
      );
    });

    it('should transition to OPEN when failure threshold is reached', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('test error'));
      
      // Execute 3 times to reach threshold
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('test error');
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      expect(logger.info).toHaveBeenCalledWith(
        'Circuit breaker state transition',
        expect.objectContaining({
          name: 'test-breaker',
          from: CircuitState.CLOSED,
          to: CircuitState.OPEN,
        })
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('OPENED'),
        expect.objectContaining({
          failures: 3,
        })
      );
      expect(metricsService.setGauge).toHaveBeenCalledWith(
        'circuit_breaker_state',
        2, // OPEN = 2
        expect.objectContaining({
          circuit_name: 'test-breaker',
        })
      );
    });

    it('should reset failure count on success', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('error'));
      const successFn = jest.fn().mockResolvedValue('success');
      
      // Record 2 failures
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      
      // Then succeed
      await circuitBreaker.execute(successFn);
      
      // Should still be CLOSED and failure count reset
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.recentFailures).toBe(0);
    });
  });

  describe('State: OPEN', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        name: 'test-breaker',
        failureThreshold: 2,
        successThreshold: 2,
        timeout: 60000,
      });
    });

    it('should reject requests immediately when OPEN', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('error'));
      
      // Trigger OPEN state
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow();
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow();
      
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      
      // Try to execute - should be rejected without calling function
      const newMockFn = jest.fn().mockResolvedValue('success');
      await expect(circuitBreaker.execute(newMockFn)).rejects.toThrow(
        "Circuit breaker 'test-breaker' is OPEN"
      );
      
      expect(newMockFn).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'Circuit breaker rejecting request',
        expect.objectContaining({
          name: 'test-breaker',
          state: CircuitState.OPEN,
        })
      );
      expect(metricsService.incrementCounter).toHaveBeenCalledWith(
        'circuit_breaker_open_total',
        expect.objectContaining({
          circuit_name: 'test-breaker',
        })
      );
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('error'));
      
      // Trigger OPEN state
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow();
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow();
      
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      
      // Advance time past timeout
      jest.advanceTimersByTime(60001);
      
      // Next execution should transition to HALF_OPEN
      const successFn = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(successFn);
      
      expect(successFn).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Circuit breaker state transition',
        expect.objectContaining({
          from: CircuitState.OPEN,
          to: CircuitState.HALF_OPEN,
        })
      );
    });

    it('should correctly report next attempt time', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('error'));
      const now = Date.now();
      
      // Trigger OPEN state
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow();
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow();
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
      expect(stats.nextAttemptTime).toBeDefined();
      
      const nextAttempt = new Date(stats.nextAttemptTime!).getTime();
      expect(nextAttempt).toBeGreaterThanOrEqual(now + 59000);
      expect(nextAttempt).toBeLessThanOrEqual(now + 61000);
    });
  });

  describe('State: HALF_OPEN', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        name: 'test-breaker',
        failureThreshold: 2,
        successThreshold: 2,
        timeout: 60000,
      });
    });

    it('should transition to CLOSED after success threshold is met', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('error'));
      
      // Trigger OPEN state
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      
      // Advance time to trigger HALF_OPEN
      jest.advanceTimersByTime(60001);
      
      // Execute successfully twice to meet success threshold
      const successFn = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(successFn);
      
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
      expect(logger.info).toHaveBeenCalledWith(
        'Circuit breaker success in HALF_OPEN',
        expect.objectContaining({
          name: 'test-breaker',
          successCount: 1,
          threshold: 2,
        })
      );
      
      await circuitBreaker.execute(successFn);
      
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(logger.info).toHaveBeenCalledWith(
        'Circuit breaker state transition',
        expect.objectContaining({
          from: CircuitState.HALF_OPEN,
          to: CircuitState.CLOSED,
        })
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('CLOSED')
      );
    });

    it('should transition back to OPEN on any failure in HALF_OPEN', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('error'));
      
      // Trigger OPEN state
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      
      // Advance time to trigger HALF_OPEN
      jest.advanceTimersByTime(60001);
      
      // One success
      const successFn = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(successFn);
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
      
      // One failure should reopen
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      expect(logger.info).toHaveBeenCalledWith(
        'Circuit breaker state transition',
        expect.objectContaining({
          from: CircuitState.HALF_OPEN,
          to: CircuitState.OPEN,
        })
      );
    });
  });

  describe('Monitoring Period and Cleanup', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        name: 'test-breaker',
        failureThreshold: 3,
        monitoringPeriod: 120000, // 2 minutes
      });
    });

    it('should clean up old failures outside monitoring period', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('error'));
      
      // Record 2 failures
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      
      let stats = circuitBreaker.getStats();
      expect(stats.recentFailures).toBe(2);
      
      // Advance time past monitoring period
      jest.advanceTimersByTime(121000);
      
      // Check stats - old failures should be cleaned
      stats = circuitBreaker.getStats();
      expect(stats.recentFailures).toBe(0);
      
      // Should not trigger OPEN even with one more failure
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should only count recent failures within monitoring period', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('error'));
      
      // Record 2 failures
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      
      // Advance time by half the monitoring period
      jest.advanceTimersByTime(60000);
      
      // Record one more failure - should trigger OPEN
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      
      const stats = circuitBreaker.getStats();
      expect(stats.recentFailures).toBe(3);
    });
  });

  describe('Manual Controls', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        name: 'test-breaker',
        failureThreshold: 2,
      });
    });

    it('should reset circuit breaker manually', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('error'));
      
      // Trigger OPEN state
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      
      // Manually reset
      circuitBreaker.reset();
      
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('manually reset')
      );
      
      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.recentFailures).toBe(0);
    });

    it('should correctly report availability status', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('error'));
      
      // Initially available
      expect(circuitBreaker.isAvailable()).toBe(true);
      
      // Trigger OPEN state
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      
      // Not available when OPEN
      expect(circuitBreaker.isAvailable()).toBe(false);
      
      // Advance time past timeout
      jest.advanceTimersByTime(60001);
      
      // Available after timeout
      expect(circuitBreaker.isAvailable()).toBe(true);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        name: 'test-breaker',
        failureThreshold: 3,
        successThreshold: 2,
      });
    });

    it('should provide accurate statistics', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('error'));
      const successFn = jest.fn().mockResolvedValue('success');
      
      // Initial stats
      let stats = circuitBreaker.getStats();
      expect(stats).toEqual({
        state: CircuitState.CLOSED,
        failureCount: 0,
        successCount: 0,
        recentFailures: 0,
        nextAttemptTime: undefined,
      });
      
      // After 2 failures
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      
      stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failureCount).toBe(2);
      expect(stats.recentFailures).toBe(2);
      
      // After opening
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
      
      stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
      expect(stats.failureCount).toBe(3);
      expect(stats.recentFailures).toBe(3);
      expect(stats.nextAttemptTime).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        name: 'test-breaker',
        failureThreshold: 2,
      });
    });

    it('should handle errors without message property', async () => {
      const failFn = jest.fn().mockRejectedValue({ error: 'no message' });
      
      await expect(circuitBreaker.execute(failFn)).rejects.toEqual({
        error: 'no message',
      });
      
      expect(logger.warn).toHaveBeenCalledWith(
        'Circuit breaker failure recorded',
        expect.objectContaining({
          error: 'Unknown error',
        })
      );
    });

    it('should propagate original error after recording failure', async () => {
      const customError = new Error('Custom error message');
      const failFn = jest.fn().mockRejectedValue(customError);
      
      await expect(circuitBreaker.execute(failFn)).rejects.toThrow(customError);
      
      expect(logger.warn).toHaveBeenCalledWith(
        'Circuit breaker failure recorded',
        expect.objectContaining({
          error: 'Custom error message',
        })
      );
    });
  });
});

describe('CircuitBreakerManager', () => {
  let manager: CircuitBreakerManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new CircuitBreakerManager();
  });

  describe('Breaker Management', () => {
    it('should create and retrieve circuit breakers', () => {
      const breaker1 = manager.getBreaker('service-1', {
        failureThreshold: 5,
      });
      
      expect(breaker1).toBeInstanceOf(CircuitBreaker);
      expect(breaker1.getState()).toBe(CircuitState.CLOSED);
      
      // Getting same breaker should return same instance
      const breaker1Again = manager.getBreaker('service-1');
      expect(breaker1Again).toBe(breaker1);
    });

    it('should create separate breakers for different names', () => {
      const breaker1 = manager.getBreaker('service-1');
      const breaker2 = manager.getBreaker('service-2');
      
      expect(breaker1).not.toBe(breaker2);
    });

    it('should get all breakers', () => {
      manager.getBreaker('service-1');
      manager.getBreaker('service-2');
      manager.getBreaker('service-3');
      
      const allBreakers = manager.getAllBreakers();
      expect(allBreakers.size).toBe(3);
      expect(allBreakers.has('service-1')).toBe(true);
      expect(allBreakers.has('service-2')).toBe(true);
      expect(allBreakers.has('service-3')).toBe(true);
    });
  });

  describe('Statistics Aggregation', () => {
    it('should get statistics for all breakers', async () => {
      const breaker1 = manager.getBreaker('service-1', {
        failureThreshold: 2,
      });
      const breaker2 = manager.getBreaker('service-2', {
        failureThreshold: 2,
      });
      
      // Trigger some failures in breaker1
      const failFn = jest.fn().mockRejectedValue(new Error('error'));
      await expect(breaker1.execute(failFn)).rejects.toThrow();
      
      const allStats = manager.getAllStats();
      
      expect(allStats).toHaveProperty('service-1');
      expect(allStats).toHaveProperty('service-2');
      expect(allStats['service-1'].failureCount).toBe(1);
      expect(allStats['service-2'].failureCount).toBe(0);
    });

    it('should return empty object when no breakers exist', () => {
      const stats = manager.getAllStats();
      expect(stats).toEqual({});
    });
  });

  describe('Reset Operations', () => {
    it('should reset all circuit breakers', async () => {
      const breaker1 = manager.getBreaker('service-1', {
        failureThreshold: 2,
      });
      const breaker2 = manager.getBreaker('service-2', {
        failureThreshold: 2,
      });
      
      // Trigger OPEN state in both
      const failFn = jest.fn().mockRejectedValue(new Error('error'));
      await expect(breaker1.execute(failFn)).rejects.toThrow();
      await expect(breaker1.execute(failFn)).rejects.toThrow();
      await expect(breaker2.execute(failFn)).rejects.toThrow();
      await expect(breaker2.execute(failFn)).rejects.toThrow();
      
      expect(breaker1.getState()).toBe(CircuitState.OPEN);
      expect(breaker2.getState()).toBe(CircuitState.OPEN);
      
      // Reset all
      manager.resetAll();
      
      expect(breaker1.getState()).toBe(CircuitState.CLOSED);
      expect(breaker2.getState()).toBe(CircuitState.CLOSED);
    });
  });
});

describe('Singleton circuitBreakerManager', () => {
  it('should export a singleton instance', () => {
    expect(circuitBreakerManager).toBeInstanceOf(CircuitBreakerManager);
  });

  it('should maintain state across imports', () => {
    circuitBreakerManager.getBreaker('singleton-test');
    
    const allBreakers = circuitBreakerManager.getAllBreakers();
    expect(allBreakers.has('singleton-test')).toBe(true);
  });
});

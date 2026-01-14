import { CircuitBreaker, CircuitState } from '../../../src/utils/circuit-breaker';
import { logger } from '../../../src/utils/logger';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
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

  describe('Initialization', () => {
    it('should initialize with CLOSED state', () => {
      const cb = new CircuitBreaker('test-service');
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should use default options when none provided', async () => {
      const cb = new CircuitBreaker('test-service');
      
      // Default failureThreshold is 5
      for (let i = 0; i < 4; i++) {
        try {
          await cb.execute(async () => { throw new Error('fail'); });
        } catch (e) {}
      }
      expect(cb.getState()).toBe(CircuitState.CLOSED);
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it('should accept custom failureThreshold', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 2 });
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      expect(cb.getState()).toBe(CircuitState.CLOSED);
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it('should accept custom successThreshold', async () => {
      const cb = new CircuitBreaker('test-service', {
        failureThreshold: 1,
        successThreshold: 3,
        resetTimeout: 0,
      });
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      // Move to HALF_OPEN
      jest.advanceTimersByTime(1);
      
      // Need 3 successes to close (custom successThreshold)
      await cb.execute(async () => 'success1');
      expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
      
      await cb.execute(async () => 'success2');
      expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
      
      await cb.execute(async () => 'success3');
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should accept custom timeout', async () => {
      const cb = new CircuitBreaker('test-service', { timeout: 100 });
      
      const slowOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'result';
      };
      
      await expect(cb.execute(slowOperation)).rejects.toThrow('Operation timeout');
    });

    it('should accept custom resetTimeout', async () => {
      const cb = new CircuitBreaker('test-service', {
        failureThreshold: 1,
        resetTimeout: 5000,
      });
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      expect(cb.getState()).toBe(CircuitState.OPEN);
      
      // Before resetTimeout
      jest.advanceTimersByTime(4999);
      await expect(cb.execute(async () => 'test')).rejects.toThrow('Circuit breaker test-service is OPEN');
      
      // After resetTimeout
      jest.advanceTimersByTime(2);
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('CLOSED State', () => {
    it('should execute operations successfully in CLOSED state', async () => {
      const cb = new CircuitBreaker('test-service');
      const result = await cb.execute(async () => 'success');
      
      expect(result).toBe('success');
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should handle multiple successful operations', async () => {
      const cb = new CircuitBreaker('test-service');
      
      for (let i = 0; i < 10; i++) {
        const result = await cb.execute(async () => `success-${i}`);
        expect(result).toBe(`success-${i}`);
      }
      
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should remain CLOSED if failures are below threshold', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 5 });
      
      for (let i = 0; i < 4; i++) {
        try {
          await cb.execute(async () => { throw new Error(`fail-${i}`); });
        } catch (e) {}
      }
      
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should transition to OPEN when failure threshold is reached', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 3 });
      
      for (let i = 0; i < 3; i++) {
        try {
          await cb.execute(async () => { throw new Error('fail'); });
        } catch (e) {}
      }
      
      expect(cb.getState()).toBe(CircuitState.OPEN);
      expect(logger.error).toHaveBeenCalledWith(
        'Circuit breaker test-service opened after 3 failures'
      );
    });

    it('should reset failure count after successful operation', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 3 });
      
      // 2 failures
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      // Success resets count
      await cb.execute(async () => 'success');
      
      // 2 more failures shouldn't open circuit
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should pass through operation errors in CLOSED state', async () => {
      const cb = new CircuitBreaker('test-service');
      const testError = new Error('custom error');
      
      await expect(cb.execute(async () => { throw testError; })).rejects.toThrow('custom error');
    });

    it('should handle operations returning different types', async () => {
      const cb = new CircuitBreaker('test-service');
      
      expect(await cb.execute(async () => 42)).toBe(42);
      expect(await cb.execute(async () => 'string')).toBe('string');
      expect(await cb.execute(async () => ({ key: 'value' }))).toEqual({ key: 'value' });
      expect(await cb.execute(async () => [1, 2, 3])).toEqual([1, 2, 3]);
      expect(await cb.execute(async () => null)).toBeNull();
    });
  });

  describe('OPEN State', () => {
    it('should reject all operations immediately when OPEN', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 1 });
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      expect(cb.getState()).toBe(CircuitState.OPEN);
      
      await expect(cb.execute(async () => 'test')).rejects.toThrow('Circuit breaker test-service is OPEN');
    });

    it('should not execute operation when OPEN', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 1 });
      const mockOperation = jest.fn().mockResolvedValue('result');
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      try {
        await cb.execute(mockOperation);
      } catch (e) {}
      
      expect(mockOperation).not.toHaveBeenCalled();
    });

    it('should attempt HALF_OPEN after resetTimeout', async () => {
      const cb = new CircuitBreaker('test-service', {
        failureThreshold: 1,
        resetTimeout: 1000,
      });
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      expect(cb.getState()).toBe(CircuitState.OPEN);
      
      jest.advanceTimersByTime(1000);
      
      // Next call should transition to HALF_OPEN
      await cb.execute(async () => 'success');
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should remain OPEN if resetTimeout has not elapsed', async () => {
      const cb = new CircuitBreaker('test-service', {
        failureThreshold: 1,
        resetTimeout: 1000,
      });
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      jest.advanceTimersByTime(500);
      
      await expect(cb.execute(async () => 'test')).rejects.toThrow('Circuit breaker test-service is OPEN');
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it('should log error when opening circuit', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 2 });
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      expect(logger.error).toHaveBeenCalledWith(
        'Circuit breaker test-service opened after 2 failures'
      );
    });
  });

  describe('HALF_OPEN State', () => {
    async function getHalfOpenCircuit(): Promise<CircuitBreaker> {
      const cb = new CircuitBreaker('test-service', {
        failureThreshold: 1,
        successThreshold: 2,
        resetTimeout: 100,
      });
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      jest.advanceTimersByTime(100);
      
      return cb;
    }

    it('should transition to HALF_OPEN after resetTimeout on first attempt', async () => {
      const cb = await getHalfOpenCircuit();
      
      const promise = cb.execute(async () => 'test');
      expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
      await promise;
    });

    it('should allow operations in HALF_OPEN state', async () => {
      const cb = await getHalfOpenCircuit();
      const result = await cb.execute(async () => 'test-result');
      
      expect(result).toBe('test-result');
    });

    it('should transition to CLOSED after successThreshold successes', async () => {
      const cb = await getHalfOpenCircuit();
      
      await cb.execute(async () => 'success1');
      expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
      
      await cb.execute(async () => 'success2');
      expect(cb.getState()).toBe(CircuitState.CLOSED);
      
      expect(logger.info).toHaveBeenCalledWith(
        'Circuit breaker test-service closed after successful attempts'
      );
    });

    it('should transition back to OPEN on failure in HALF_OPEN state', async () => {
      const cb = await getHalfOpenCircuit();
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it('should reset success count if failure occurs before threshold met', async () => {
      const cb = new CircuitBreaker('test-service', {
        failureThreshold: 1,
        successThreshold: 3,
        resetTimeout: 100,
      });
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      jest.advanceTimersByTime(100);
      
      // 2 successes
      await cb.execute(async () => 'success1');
      await cb.execute(async () => 'success2');
      expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
      
      // Failure resets count
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      expect(cb.getState()).toBe(CircuitState.OPEN);
      
      // Need to start over
      jest.advanceTimersByTime(100);
      await cb.execute(async () => 'success1');
      await cb.execute(async () => 'success2');
      expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
      
      await cb.execute(async () => 'success3');
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should log info when entering HALF_OPEN', async () => {
      const cb = await getHalfOpenCircuit();
      await cb.execute(async () => 'test');
      
      expect(logger.info).toHaveBeenCalledWith(
        'Circuit breaker test-service entering HALF_OPEN state'
      );
    });
  });

  describe('Operation Timeout', () => {
    it('should timeout long-running operations', async () => {
      const cb = new CircuitBreaker('test-service', { timeout: 100 });
      
      const slowOp = async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'should not reach';
      };
      
      await expect(cb.execute(slowOp)).rejects.toThrow('Operation timeout');
    });

    it('should count timeout as failure', async () => {
      const cb = new CircuitBreaker('test-service', {
        timeout: 100,
        failureThreshold: 2,
      });
      
      const slowOp = async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'result';
      };
      
      try {
        await cb.execute(slowOp);
      } catch (e) {}
      
      try {
        await cb.execute(slowOp);
      } catch (e) {}
      
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it('should not timeout fast operations', async () => {
      const cb = new CircuitBreaker('test-service', { timeout: 1000 });
      
      const fastOp = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'success';
      };
      
      const result = await cb.execute(fastOp);
      expect(result).toBe('success');
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should handle immediate operations', async () => {
      const cb = new CircuitBreaker('test-service', { timeout: 1000 });
      
      const result = await cb.execute(async () => 'immediate');
      expect(result).toBe('immediate');
    });

    it('should use different timeout values', async () => {
      const cb1 = new CircuitBreaker('cb1', { timeout: 50 });
      const cb2 = new CircuitBreaker('cb2', { timeout: 150 });
      
      const op = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'result';
      };
      
      await expect(cb1.execute(op)).rejects.toThrow('Operation timeout');
      expect(await cb2.execute(op)).toBe('result');
    });
  });

  describe('Manual Reset', () => {
    it('should reset circuit to CLOSED state', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 1 });
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      expect(cb.getState()).toBe(CircuitState.OPEN);
      
      cb.reset();
      
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reset failure count', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 3 });
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      cb.reset();
      
      // Should take 3 failures again to open
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reset success count', async () => {
      const cb = new CircuitBreaker('test-service', {
        failureThreshold: 1,
        successThreshold: 2,
        resetTimeout: 100,
      });
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      jest.advanceTimersByTime(100);
      await cb.execute(async () => 'success1');
      
      cb.reset();
      
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should log info on manual reset', () => {
      const cb = new CircuitBreaker('test-service');
      cb.reset();
      
      expect(logger.info).toHaveBeenCalledWith(
        'Circuit breaker test-service manually reset'
      );
    });

    it('should allow operations after manual reset', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 1 });
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      cb.reset();
      
      const result = await cb.execute(async () => 'success');
      expect(result).toBe('success');
    });
  });

  describe('State Management', () => {
    it('should correctly report current state', async () => {
      const cb = new CircuitBreaker('test-service', {
        failureThreshold: 1,
        resetTimeout: 100,
      });
      
      expect(cb.getState()).toBe(CircuitState.CLOSED);
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      expect(cb.getState()).toBe(CircuitState.OPEN);
      
      jest.advanceTimersByTime(100);
      const promise = cb.execute(async () => 'test');
      expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
      await promise;
      
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should maintain independent state per instance', async () => {
      const cb1 = new CircuitBreaker('service1', { failureThreshold: 1 });
      const cb2 = new CircuitBreaker('service2', { failureThreshold: 1 });
      
      try {
        await cb1.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      expect(cb1.getState()).toBe(CircuitState.OPEN);
      expect(cb2.getState()).toBe(CircuitState.CLOSED);
      
      const result = await cb2.execute(async () => 'success');
      expect(result).toBe('success');
    });
  });

  describe('Edge Cases', () => {
    it('should handle failureThreshold of 1', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 1 });
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it('should handle successThreshold of 1', async () => {
      const cb = new CircuitBreaker('test-service', {
        failureThreshold: 1,
        successThreshold: 1,
        resetTimeout: 0,
      });
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      jest.advanceTimersByTime(1);
      await cb.execute(async () => 'success');
      
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should handle operations that return undefined', async () => {
      const cb = new CircuitBreaker('test-service');
      const result = await cb.execute(async () => undefined);
      
      expect(result).toBeUndefined();
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should handle operations that throw non-Error objects', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 1 });
      
      try {
        await cb.execute(async () => { throw 'string error'; });
      } catch (e) {
        expect(e).toBe('string error');
      }
      
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it('should handle very high failure thresholds', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 100 });
      
      for (let i = 0; i < 99; i++) {
        try {
          await cb.execute(async () => { throw new Error('fail'); });
        } catch (e) {}
      }
      
      expect(cb.getState()).toBe(CircuitState.CLOSED);
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it('should handle zero resetTimeout', async () => {
      const cb = new CircuitBreaker('test-service', {
        failureThreshold: 1,
        resetTimeout: 0,
      });
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      expect(cb.getState()).toBe(CircuitState.OPEN);
      
      // Immediately ready to try again
      await cb.execute(async () => 'success');
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should handle concurrent operations', async () => {
      const cb = new CircuitBreaker('test-service');
      
      const operations = Array(10).fill(null).map((_, i) =>
        cb.execute(async () => `result-${i}`)
      );
      
      const results = await Promise.all(operations);
      expect(results).toHaveLength(10);
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle intermittent failures', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 3 });
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      await cb.execute(async () => 'success');
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      await cb.execute(async () => 'success');
      
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should handle  pattern: CLOSED -> OPEN -> HALF_OPEN -> OPEN -> CLOSED', async () => {
      const cb = new CircuitBreaker('test-service', {
        failureThreshold: 1,
        successThreshold: 2,
        resetTimeout: 100,
      });
      
      // CLOSED
      expect(cb.getState()).toBe(CircuitState.CLOSED);
      
      // OPEN
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      expect(cb.getState()).toBe(CircuitState.OPEN);
      
      // HALF_OPEN
      jest.advanceTimersByTime(100);
      await cb.execute(async () => 'success1');
      expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
      
      // Back to OPEN
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      expect(cb.getState()).toBe(CircuitState.OPEN);
      
      // HALF_OPEN again
      jest.advanceTimersByTime(100);
      await cb.execute(async () => 'success1');
      expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
      
      // Finally CLOSED
      await cb.execute(async () => 'success2');
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should track failures across multiple operations', async () => {
      const cb = new CircuitBreaker('test-service', { failureThreshold: 5 });
      
      const operations = [
        async () => 'success',
        async () => { throw new Error('fail1'); },
        async () => 'success',
        async () => { throw new Error('fail2'); },
        async () => { throw new Error('fail3'); },
        async () => { throw new Error('fail4'); },
        async () => { throw new Error('fail5'); },
      ];
      
      for (const op of operations) {
        try {
          await cb.execute(op);
        } catch (e) {}
      }
      
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it('should handle rapid state changes', async () => {
      const cb = new CircuitBreaker('test-service', {
        failureThreshold: 1,
        successThreshold: 1,
        resetTimeout: 10,
      });
      
      for (let cycle = 0; cycle < 5; cycle++) {
        try {
          await cb.execute(async () => { throw new Error('fail'); });
        } catch (e) {}
        
        jest.advanceTimersByTime(10);
        await cb.execute(async () => 'success');
        
        expect(cb.getState()).toBe(CircuitState.CLOSED);
      }
    });
  });

  describe('Named Instances', () => {
    it('should use circuit breaker name in error messages', async () => {
      const cb = new CircuitBreaker('payment-service', { failureThreshold: 1 });
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      await expect(cb.execute(async () => 'test')).rejects.toThrow('Circuit breaker payment-service is OPEN');
    });

    it('should use circuit breaker name in logs', async () => {
      const cb = new CircuitBreaker('database-service', { failureThreshold: 1 });
      
      try {
        await cb.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      expect(logger.error).toHaveBeenCalledWith(
        'Circuit breaker database-service opened after 1 failures'
      );
    });

    it('should support different names for different instances', async () => {
      const cb1 = new CircuitBreaker('service-a', { failureThreshold: 1 });
      const cb2 = new CircuitBreaker('service-b', { failureThreshold: 1 });
      
      try {
        await cb1.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      try {
        await cb2.execute(async () => { throw new Error('fail'); });
      } catch (e) {}
      
      await expect(cb1.execute(async () => 'test')).rejects.toThrow('Circuit breaker service-a is OPEN');
      await expect(cb2.execute(async () => 'test')).rejects.toThrow('Circuit breaker service-b is OPEN');
    });
  });
});

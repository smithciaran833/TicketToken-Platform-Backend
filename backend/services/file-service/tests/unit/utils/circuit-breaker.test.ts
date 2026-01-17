/**
 * Unit Tests for Circuit Breaker
 * Tests circuit breaker pattern implementation with state transitions,
 * timeout handling, error filtering, and registry management
 */

import {
  CircuitBreaker,
  CircuitState,
  CircuitOpenError,
  TimeoutError,
  getOrCreateCircuit,
  getCircuit,
  getAllCircuits,
  getCircuitStats,
  withCircuit,
  areAllCircuitsHealthy,
  getUnhealthyCircuits,
} from '../../../src/utils/circuit-breaker';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('utils/circuit-breaker', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('CircuitBreaker Class', () => {
    describe('Constructor and Options', () => {
      it('should create circuit breaker with default options', () => {
        const circuit = new CircuitBreaker({ name: 'test-circuit' });

        expect(circuit.getState()).toBe(CircuitState.CLOSED);
        expect(circuit.isHealthy()).toBe(true);
      });

      it('should create circuit breaker with custom options', () => {
        const circuit = new CircuitBreaker({
          name: 'custom-circuit',
          failureThreshold: 10,
          successThreshold: 5,
          timeout: 60000,
          requestTimeout: 20000,
          volumeThreshold: 20,
        });

        expect(circuit.getState()).toBe(CircuitState.CLOSED);
        const stats = circuit.getStats();
        expect(stats.totalRequests).toBe(0);
        expect(stats.totalFailures).toBe(0);
      });

      it('should accept custom error filter', () => {
        const errorFilter = jest.fn(() => true);
        const circuit = new CircuitBreaker({
          name: 'filtered-circuit',
          errorFilter,
        });

        expect(circuit).toBeDefined();
      });
    });

    describe('Execute - Successful Operations', () => {
      it('should execute successful operation and remain closed', async () => {
        const circuit = new CircuitBreaker({ name: 'success-circuit' });
        const mockFn = jest.fn().mockResolvedValue('success');

        const result = await circuit.execute(mockFn);

        expect(result).toBe('success');
        expect(mockFn).toHaveBeenCalledTimes(1);
        expect(circuit.getState()).toBe(CircuitState.CLOSED);
        expect(circuit.isHealthy()).toBe(true);
      });

      it('should track successful requests in stats', async () => {
        const circuit = new CircuitBreaker({ name: 'stats-circuit' });
        const mockFn = jest.fn().mockResolvedValue('ok');

        await circuit.execute(mockFn);
        await circuit.execute(mockFn);
        await circuit.execute(mockFn);

        const stats = circuit.getStats();
        expect(stats.totalRequests).toBe(3);
        expect(stats.totalSuccesses).toBe(3);
        expect(stats.totalFailures).toBe(0);
        expect(stats.consecutiveFailures).toBe(0);
      });

      it('should return various data types correctly', async () => {
        const circuit = new CircuitBreaker({ name: 'types-circuit' });

        const stringResult = await circuit.execute(() => Promise.resolve('string'));
        expect(stringResult).toBe('string');

        const numberResult = await circuit.execute(() => Promise.resolve(42));
        expect(numberResult).toBe(42);

        const objectResult = await circuit.execute(() => Promise.resolve({ key: 'value' }));
        expect(objectResult).toEqual({ key: 'value' });

        const arrayResult = await circuit.execute(() => Promise.resolve([1, 2, 3]));
        expect(arrayResult).toEqual([1, 2, 3]);
      });
    });

    describe('Execute - Failed Operations', () => {
      it('should track failed requests', async () => {
        const circuit = new CircuitBreaker({
          name: 'fail-circuit',
          failureThreshold: 5,
          volumeThreshold: 1,
        });
        const mockFn = jest.fn().mockRejectedValue(new Error('Failed'));

        await expect(circuit.execute(mockFn)).rejects.toThrow('Failed');

        const stats = circuit.getStats();
        expect(stats.totalRequests).toBe(1);
        expect(stats.totalFailures).toBe(1);
        expect(stats.consecutiveFailures).toBe(1);
      });

      it('should reset consecutive failures on success', async () => {
        const circuit = new CircuitBreaker({
          name: 'reset-circuit',
          failureThreshold: 5,
          volumeThreshold: 1,
        });

        // Two failures
        await expect(
          circuit.execute(() => Promise.reject(new Error('Fail')))
        ).rejects.toThrow('Fail');
        await expect(
          circuit.execute(() => Promise.reject(new Error('Fail')))
        ).rejects.toThrow('Fail');

        let stats = circuit.getStats();
        expect(stats.consecutiveFailures).toBe(2);

        // One success
        await circuit.execute(() => Promise.resolve('ok'));

        stats = circuit.getStats();
        expect(stats.consecutiveFailures).toBe(0);
        expect(stats.totalSuccesses).toBe(1);
      });

      it('should respect error filter', async () => {
        const circuit = new CircuitBreaker({
          name: 'filter-circuit',
          failureThreshold: 2,
          volumeThreshold: 1,
          errorFilter: (error) => !error.message.includes('IGNORED'),
        });

        // Ignored error - should not count
        await expect(
          circuit.execute(() => Promise.reject(new Error('IGNORED error')))
        ).rejects.toThrow('IGNORED error');

        let stats = circuit.getStats();
        expect(stats.consecutiveFailures).toBe(0);
        expect(circuit.getState()).toBe(CircuitState.CLOSED);

        // Counted error
        await expect(
          circuit.execute(() => Promise.reject(new Error('Real error')))
        ).rejects.toThrow('Real error');

        stats = circuit.getStats();
        expect(stats.consecutiveFailures).toBe(1);
      });
    });

    describe('State Transitions', () => {
      it('should transition from CLOSED to OPEN after threshold failures', async () => {
        const circuit = new CircuitBreaker({
          name: 'transition-circuit',
          failureThreshold: 3,
          volumeThreshold: 1,
        });

        expect(circuit.getState()).toBe(CircuitState.CLOSED);

        // Trigger failures
        for (let i = 0; i < 3; i++) {
          await expect(
            circuit.execute(() => Promise.reject(new Error('Fail')))
          ).rejects.toThrow('Fail');
        }

        expect(circuit.getState()).toBe(CircuitState.OPEN);
        expect(circuit.isHealthy()).toBe(false);
      });

      it('should not open circuit before volume threshold is met', async () => {
        const circuit = new CircuitBreaker({
          name: 'volume-circuit',
          failureThreshold: 3,
          volumeThreshold: 10,
        });

        // Only 3 requests (below volume threshold)
        for (let i = 0; i < 3; i++) {
          await expect(
            circuit.execute(() => Promise.reject(new Error('Fail')))
          ).rejects.toThrow('Fail');
        }

        expect(circuit.getState()).toBe(CircuitState.CLOSED);
      });

      it('should transition from OPEN to HALF_OPEN after timeout', async () => {
        jest.useFakeTimers();
        const circuit = new CircuitBreaker({
          name: 'half-open-circuit',
          failureThreshold: 2,
          volumeThreshold: 1,
          timeout: 30000,
        });

        // Trigger circuit open
        for (let i = 0; i < 2; i++) {
          await expect(
            circuit.execute(() => Promise.reject(new Error('Fail')))
          ).rejects.toThrow('Fail');
        }

        expect(circuit.getState()).toBe(CircuitState.OPEN);

        // Attempt execution immediately - should fail with CircuitOpenError
        await expect(
          circuit.execute(() => Promise.resolve('ok'))
        ).rejects.toThrow(CircuitOpenError);

        // Advance time past timeout
        jest.advanceTimersByTime(30001);

        // Next execution should transition to HALF_OPEN
        await circuit.execute(() => Promise.resolve('ok'));

        expect(circuit.getState()).toBe(CircuitState.HALF_OPEN);
      });

      it('should transition from HALF_OPEN to CLOSED after success threshold', async () => {
        jest.useFakeTimers();
        const circuit = new CircuitBreaker({
          name: 'recovery-circuit',
          failureThreshold: 2,
          successThreshold: 3,
          volumeThreshold: 1,
          timeout: 30000,
        });

        // Open the circuit
        for (let i = 0; i < 2; i++) {
          await expect(
            circuit.execute(() => Promise.reject(new Error('Fail')))
          ).rejects.toThrow('Fail');
        }

        // Wait for timeout
        jest.advanceTimersByTime(30001);

        // Execute to enter HALF_OPEN
        await circuit.execute(() => Promise.resolve('ok'));
        expect(circuit.getState()).toBe(CircuitState.HALF_OPEN);

        // Execute success threshold times
        await circuit.execute(() => Promise.resolve('ok'));
        await circuit.execute(() => Promise.resolve('ok'));

        expect(circuit.getState()).toBe(CircuitState.CLOSED);
        expect(circuit.isHealthy()).toBe(true);
      });

      it('should transition from HALF_OPEN back to OPEN on failure', async () => {
        jest.useFakeTimers();
        const circuit = new CircuitBreaker({
          name: 'fail-recovery-circuit',
          failureThreshold: 2,
          volumeThreshold: 1,
          timeout: 30000,
        });

        // Open the circuit
        for (let i = 0; i < 2; i++) {
          await expect(
            circuit.execute(() => Promise.reject(new Error('Fail')))
          ).rejects.toThrow('Fail');
        }

        jest.advanceTimersByTime(30001);

        // Enter HALF_OPEN
        await circuit.execute(() => Promise.resolve('ok'));
        expect(circuit.getState()).toBe(CircuitState.HALF_OPEN);

        // Fail again
        await expect(
          circuit.execute(() => Promise.reject(new Error('Fail again')))
        ).rejects.toThrow('Fail again');

        expect(circuit.getState()).toBe(CircuitState.OPEN);
      });
    });

    describe('Timeout Handling', () => {
      it('should timeout slow operations', async () => {
        jest.useFakeTimers();
        const circuit = new CircuitBreaker({
          name: 'timeout-circuit',
          requestTimeout: 5000,
        });

        const slowOperation = () =>
          new Promise<string>((resolve) => {
            setTimeout(() => resolve('too slow'), 10000);
          });

        const executePromise = circuit.execute(slowOperation);

        // Advance time to trigger timeout
        jest.advanceTimersByTime(5001);

        await expect(executePromise).rejects.toThrow(TimeoutError);
        await expect(executePromise).rejects.toThrow(
          "Operation in circuit 'timeout-circuit' timed out after 5000ms"
        );
      });

      it('should not timeout fast operations', async () => {
        jest.useFakeTimers();
        const circuit = new CircuitBreaker({
          name: 'fast-circuit',
          requestTimeout: 5000,
        });

        const fastOperation = () => Promise.resolve('fast');

        const result = await circuit.execute(fastOperation);

        expect(result).toBe('fast');
      });

      it('should track timeout failures in stats', async () => {
        jest.useFakeTimers();
        const circuit = new CircuitBreaker({
          name: 'timeout-stats-circuit',
          requestTimeout: 1000,
          failureThreshold: 5,
          volumeThreshold: 1,
        });

        const slowOp = () => new Promise((resolve) => setTimeout(resolve, 2000));

        const promise = circuit.execute(slowOp);
        jest.advanceTimersByTime(1001);

        await expect(promise).rejects.toThrow(TimeoutError);

        const stats = circuit.getStats();
        expect(stats.totalFailures).toBe(1);
      });
    });

    describe('Statistics', () => {
      it('should provide accurate statistics', async () => {
        const circuit = new CircuitBreaker({
          name: 'stats-detailed-circuit',
          failureThreshold: 5,
          volumeThreshold: 1,
        });

        // 3 successes
        await circuit.execute(() => Promise.resolve('ok'));
        await circuit.execute(() => Promise.resolve('ok'));
        await circuit.execute(() => Promise.resolve('ok'));

        // 2 failures
        await expect(
          circuit.execute(() => Promise.reject(new Error('Fail')))
        ).rejects.toThrow();
        await expect(
          circuit.execute(() => Promise.reject(new Error('Fail')))
        ).rejects.toThrow();

        const stats = circuit.getStats();
        expect(stats.totalRequests).toBe(5);
        expect(stats.totalSuccesses).toBe(3);
        expect(stats.totalFailures).toBe(2);
        expect(stats.consecutiveFailures).toBe(2);
        expect(stats.state).toBe(CircuitState.CLOSED);
      });

      it('should include state in stats', () => {
        const circuit = new CircuitBreaker({ name: 'state-stats-circuit' });
        const stats = circuit.getStats();

        expect(stats.state).toBe(CircuitState.CLOSED);
        expect(stats).toHaveProperty('totalRequests');
        expect(stats).toHaveProperty('totalFailures');
        expect(stats).toHaveProperty('totalSuccesses');
        expect(stats).toHaveProperty('consecutiveFailures');
      });
    });

    describe('Manual Control', () => {
      it('should allow forcing circuit state', () => {
        const circuit = new CircuitBreaker({ name: 'force-circuit' });

        circuit.forceState(CircuitState.OPEN);
        expect(circuit.getState()).toBe(CircuitState.OPEN);

        circuit.forceState(CircuitState.HALF_OPEN);
        expect(circuit.getState()).toBe(CircuitState.HALF_OPEN);
      });

      it('should reset circuit completely', async () => {
        const circuit = new CircuitBreaker({
          name: 'reset-test-circuit',
          failureThreshold: 2,
          volumeThreshold: 1,
        });

        // Create some failures
        await expect(
          circuit.execute(() => Promise.reject(new Error('Fail')))
        ).rejects.toThrow();

        let stats = circuit.getStats();
        expect(stats.totalRequests).toBeGreaterThan(0);

        // Reset
        circuit.reset();

        stats = circuit.getStats();
        expect(stats.totalRequests).toBe(0);
        expect(stats.totalFailures).toBe(0);
        expect(stats.totalSuccesses).toBe(0);
        expect(stats.consecutiveFailures).toBe(0);
        expect(circuit.getState()).toBe(CircuitState.CLOSED);
      });
    });

    describe('isHealthy', () => {
      it('should return true when circuit is closed', () => {
        const circuit = new CircuitBreaker({ name: 'healthy-circuit' });
        expect(circuit.isHealthy()).toBe(true);
      });

      it('should return false when circuit is open', async () => {
        const circuit = new CircuitBreaker({
          name: 'unhealthy-circuit',
          failureThreshold: 1,
          volumeThreshold: 1,
        });

        await expect(
          circuit.execute(() => Promise.reject(new Error('Fail')))
        ).rejects.toThrow();

        expect(circuit.isHealthy()).toBe(false);
      });

      it('should return false when circuit is half-open', async () => {
        jest.useFakeTimers();
        const circuit = new CircuitBreaker({
          name: 'half-open-health-circuit',
          failureThreshold: 1,
          volumeThreshold: 1,
          timeout: 10000,
        });

        // Open circuit
        await expect(
          circuit.execute(() => Promise.reject(new Error('Fail')))
        ).rejects.toThrow();

        // Move to half-open
        jest.advanceTimersByTime(10001);
        await circuit.execute(() => Promise.resolve('ok'));

        expect(circuit.isHealthy()).toBe(false);
      });
    });
  });

  describe('Custom Errors', () => {
    describe('CircuitOpenError', () => {
      it('should create error with correct properties', () => {
        const error = new CircuitOpenError('test-circuit', 30000);

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(CircuitOpenError);
        expect(error.name).toBe('CircuitOpenError');
        expect(error.circuitName).toBe('test-circuit');
        expect(error.retryAfterMs).toBe(30000);
        expect(error.message).toContain('test-circuit');
        expect(error.message).toContain('30s');
      });

      it('should be throwable and catchable', () => {
        expect(() => {
          throw new CircuitOpenError('my-circuit', 15000);
        }).toThrow(CircuitOpenError);

        try {
          throw new CircuitOpenError('catch-circuit', 20000);
        } catch (error) {
          expect(error).toBeInstanceOf(CircuitOpenError);
          expect((error as CircuitOpenError).circuitName).toBe('catch-circuit');
        }
      });
    });

    describe('TimeoutError', () => {
      it('should create error with correct properties', () => {
        const error = new TimeoutError('slow-circuit', 5000);

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(TimeoutError);
        expect(error.name).toBe('TimeoutError');
        expect(error.circuitName).toBe('slow-circuit');
        expect(error.timeoutMs).toBe(5000);
        expect(error.message).toContain('slow-circuit');
        expect(error.message).toContain('5000ms');
      });

      it('should be throwable and catchable', () => {
        expect(() => {
          throw new TimeoutError('timeout-test', 3000);
        }).toThrow(TimeoutError);

        try {
          throw new TimeoutError('catch-timeout', 2000);
        } catch (error) {
          expect(error).toBeInstanceOf(TimeoutError);
          expect((error as TimeoutError).timeoutMs).toBe(2000);
        }
      });
    });
  });

  describe('Registry Functions', () => {
    describe('getOrCreateCircuit', () => {
      it('should create new circuit if not exists', () => {
        const circuit = getOrCreateCircuit({
          name: 'new-registry-circuit',
        });

        expect(circuit).toBeInstanceOf(CircuitBreaker);
        expect(circuit.getState()).toBe(CircuitState.CLOSED);
      });

      it('should return existing circuit if already created', () => {
        const circuit1 = getOrCreateCircuit({
          name: 'existing-circuit',
          failureThreshold: 10,
        });

        const circuit2 = getOrCreateCircuit({
          name: 'existing-circuit',
          failureThreshold: 20, // Different options
        });

        expect(circuit1).toBe(circuit2);
      });
    });

    describe('getCircuit', () => {
      it('should return circuit if exists', () => {
        getOrCreateCircuit({ name: 'findable-circuit' });

        const circuit = getCircuit('findable-circuit');
        expect(circuit).toBeInstanceOf(CircuitBreaker);
      });

      it('should return undefined if circuit does not exist', () => {
        const circuit = getCircuit('nonexistent-circuit-xyz');
        expect(circuit).toBeUndefined();
      });
    });

    describe('getAllCircuits', () => {
      it('should return all registered circuits', () => {
        getOrCreateCircuit({ name: 'circuit-a' });
        getOrCreateCircuit({ name: 'circuit-b' });
        getOrCreateCircuit({ name: 'circuit-c' });

        const circuits = getAllCircuits();
        expect(circuits).toBeInstanceOf(Map);
        expect(circuits.has('circuit-a')).toBe(true);
        expect(circuits.has('circuit-b')).toBe(true);
        expect(circuits.has('circuit-c')).toBe(true);
      });

      it('should return a copy of the circuits map', () => {
        getOrCreateCircuit({ name: 'original-circuit' });

        const circuits1 = getAllCircuits();
        const circuits2 = getAllCircuits();

        expect(circuits1).not.toBe(circuits2);
      });
    });

    describe('getCircuitStats', () => {
      it('should return stats for all circuits', async () => {
        const circuit1 = getOrCreateCircuit({ name: 'stats-circuit-a' });
        const circuit2 = getOrCreateCircuit({ name: 'stats-circuit-b' });

        await circuit1.execute(() => Promise.resolve('ok'));
        await circuit2.execute(() => Promise.resolve('ok'));

        const stats = getCircuitStats();

        expect(stats).toHaveProperty('stats-circuit-a');
        expect(stats).toHaveProperty('stats-circuit-b');
        expect(stats['stats-circuit-a']!.totalRequests).toBe(1);
        expect(stats['stats-circuit-b']!.totalRequests).toBe(1);
      });

      it('should include default circuits from module initialization', () => {
        const stats = getCircuitStats();
        // The module creates s3, clamav, postgres, redis, external_service on import
        expect(stats).toHaveProperty('s3');
        expect(stats).toHaveProperty('clamav');
        expect(stats).toHaveProperty('postgres');
        expect(stats).toHaveProperty('redis');
        expect(stats).toHaveProperty('external_service');
      });
    });
  });

  describe('Utility Functions', () => {
    describe('withCircuit', () => {
      it('should execute function with circuit protection', async () => {
        const mockFn = jest.fn().mockResolvedValue('protected');

        const result = await withCircuit('with-circuit-test', mockFn);

        expect(result).toBe('protected');
        expect(mockFn).toHaveBeenCalledTimes(1);
      });

      it('should create circuit if not exists', async () => {
        await withCircuit('auto-created-circuit', () => Promise.resolve('ok'));

        const circuit = getCircuit('auto-created-circuit');
        expect(circuit).toBeDefined();
      });

      it('should accept custom options', async () => {
        await withCircuit(
          'custom-options-circuit',
          () => Promise.resolve('ok'),
          { failureThreshold: 10 }
        );

        const circuit = getCircuit('custom-options-circuit');
        expect(circuit).toBeDefined();
      });

      it('should reuse existing circuit', async () => {
        const circuit1 = getOrCreateCircuit({ name: 'reusable-circuit' });

        await withCircuit('reusable-circuit', () => Promise.resolve('ok'));

        const circuit2 = getCircuit('reusable-circuit');
        expect(circuit1).toBe(circuit2);
      });
    });

    describe('areAllCircuitsHealthy', () => {
      it('should return false when any circuit is unhealthy', async () => {
        const unhealthy = getOrCreateCircuit({
          name: 'test-unhealthy',
          failureThreshold: 1,
          volumeThreshold: 1,
        });

        await expect(
          unhealthy.execute(() => Promise.reject(new Error('Fail')))
        ).rejects.toThrow();

        expect(areAllCircuitsHealthy()).toBe(false);
      });
    });

    describe('getUnhealthyCircuits', () => {
      it('should return list of unhealthy circuit names', async () => {
        const unhealthy1 = getOrCreateCircuit({
          name: 'test-unhealthy-1',
          failureThreshold: 1,
          volumeThreshold: 1,
        });
        const unhealthy2 = getOrCreateCircuit({
          name: 'test-unhealthy-2',
          failureThreshold: 1,
          volumeThreshold: 1,
        });

        await expect(
          unhealthy1.execute(() => Promise.reject(new Error('Fail')))
        ).rejects.toThrow();
        await expect(
          unhealthy2.execute(() => Promise.reject(new Error('Fail')))
        ).rejects.toThrow();

        const unhealthyList = getUnhealthyCircuits();

        expect(unhealthyList).toContain('test-unhealthy-1');
        expect(unhealthyList).toContain('test-unhealthy-2');
      });
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle rapid consecutive failures', async () => {
      const circuit = new CircuitBreaker({
        name: 'rapid-fail-circuit',
        failureThreshold: 5,
        volumeThreshold: 1,
      });

      // Rapid failures
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          circuit.execute(() => Promise.reject(new Error('Rapid fail'))).catch(() => {})
        );
      }

      await Promise.all(promises);

      expect(circuit.getState()).toBe(CircuitState.OPEN);
    });

    it('should handle mixed success and failure patterns', async () => {
      const circuit = new CircuitBreaker({
        name: 'mixed-pattern-circuit',
        failureThreshold: 3,
        volumeThreshold: 1,
      });

      // Pattern: fail, fail, success, fail, fail, success
      await expect(
        circuit.execute(() => Promise.reject(new Error('Fail')))
      ).rejects.toThrow();
      await expect(
        circuit.execute(() => Promise.reject(new Error('Fail')))
      ).rejects.toThrow();
      await circuit.execute(() => Promise.resolve('ok'));
      await expect(
        circuit.execute(() => Promise.reject(new Error('Fail')))
      ).rejects.toThrow();
      await expect(
        circuit.execute(() => Promise.reject(new Error('Fail')))
      ).rejects.toThrow();
      await circuit.execute(() => Promise.resolve('ok'));

      const stats = circuit.getStats();
      expect(stats.totalRequests).toBe(6);
      expect(stats.totalFailures).toBe(4);
      expect(stats.totalSuccesses).toBe(2);
      expect(stats.consecutiveFailures).toBe(0); // Reset by last success
    });

    it('should prevent cascading failures when circuit is open', async () => {
      jest.useFakeTimers();
      const circuit = new CircuitBreaker({
        name: 'cascade-prevent-circuit',
        failureThreshold: 2,
        volumeThreshold: 1,
        timeout: 60000,
      });

      // Open the circuit
      await expect(
        circuit.execute(() => Promise.reject(new Error('Fail')))
      ).rejects.toThrow('Fail');
      await expect(
        circuit.execute(() => Promise.reject(new Error('Fail')))
      ).rejects.toThrow('Fail');

      expect(circuit.getState()).toBe(CircuitState.OPEN);

      // Subsequent calls should fail fast with CircuitOpenError
      const mockFn = jest.fn().mockRejectedValue(new Error('Should not be called'));

      await expect(circuit.execute(mockFn)).rejects.toThrow(CircuitOpenError);
      await expect(circuit.execute(mockFn)).rejects.toThrow(CircuitOpenError);
      await expect(circuit.execute(mockFn)).rejects.toThrow(CircuitOpenError);

      // The actual function should never be called
      expect(mockFn).not.toHaveBeenCalled();
    });
  });
});

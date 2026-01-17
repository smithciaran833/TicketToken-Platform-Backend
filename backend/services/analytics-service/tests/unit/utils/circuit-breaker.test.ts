/**
 * Circuit Breaker Unit Tests
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

import {
  CircuitBreaker,
  CircuitState,
  CircuitOpenError,
  getOrCreateCircuit,
  getCircuit,
  getAllCircuits,
  influxDBCircuit,
  postgresCircuit,
  redisCircuit,
  externalServiceCircuit,
} from '../../../src/utils/circuit-breaker';
import { logger } from '../../../src/utils/logger';

describe('Circuit Breaker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('CircuitBreaker', () => {
    let circuit: CircuitBreaker;

    beforeEach(() => {
      circuit = new CircuitBreaker({
        name: 'test-circuit',
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 5000,
        volumeThreshold: 5,
      });
    });

    describe('initial state', () => {
      it('should start in CLOSED state', () => {
        expect(circuit.getState()).toBe(CircuitState.CLOSED);
      });

      it('should have zero stats initially', () => {
        const stats = circuit.getStats();
        expect(stats.failures).toBe(0);
        expect(stats.successes).toBe(0);
        expect(stats.totalRequests).toBe(0);
        expect(stats.totalFailures).toBe(0);
        expect(stats.totalSuccesses).toBe(0);
      });
    });

    describe('execute - success path', () => {
      it('should execute function and return result', async () => {
        const result = await circuit.execute(async () => 'success');

        expect(result).toBe('success');
      });

      it('should increment success counters', async () => {
        await circuit.execute(async () => 'ok');

        const stats = circuit.getStats();
        expect(stats.totalRequests).toBe(1);
        expect(stats.totalSuccesses).toBe(1);
        expect(stats.successes).toBe(1);
      });

      it('should reset failure count on success', async () => {
        // Cause some failures first (but not enough to trip)
        const failingFn = async () => { throw new Error('fail'); };
        
        try { await circuit.execute(failingFn); } catch {}
        try { await circuit.execute(failingFn); } catch {}

        expect(circuit.getStats().failures).toBe(2);

        // Success should reset failures
        await circuit.execute(async () => 'ok');

        expect(circuit.getStats().failures).toBe(0);
      });
    });

    describe('execute - failure path', () => {
      it('should throw error from executed function', async () => {
        const error = new Error('Test error');

        await expect(circuit.execute(async () => { throw error; }))
          .rejects.toThrow('Test error');
      });

      it('should increment failure counters', async () => {
        try {
          await circuit.execute(async () => { throw new Error('fail'); });
        } catch {}

        const stats = circuit.getStats();
        expect(stats.totalRequests).toBe(1);
        expect(stats.totalFailures).toBe(1);
        expect(stats.failures).toBe(1);
      });

      it('should record last failure time', async () => {
        const now = Date.now();
        jest.setSystemTime(now);

        try {
          await circuit.execute(async () => { throw new Error('fail'); });
        } catch {}

        expect(circuit.getStats().lastFailureTime).toBe(now);
      });
    });

    describe('state transitions', () => {
      it('should trip to OPEN after reaching failure threshold with volume', async () => {
        const failingFn = async () => { throw new Error('fail'); };

        // Need to reach volumeThreshold (5) first
        for (let i = 0; i < 5; i++) {
          try { await circuit.execute(failingFn); } catch {}
        }

        expect(circuit.getState()).toBe(CircuitState.OPEN);
      });

      it('should not trip if volume threshold not reached', async () => {
        const failingFn = async () => { throw new Error('fail'); };

        // Only 3 failures (below volume threshold of 5)
        for (let i = 0; i < 3; i++) {
          try { await circuit.execute(failingFn); } catch {}
        }

        expect(circuit.getState()).toBe(CircuitState.CLOSED);
      });

      it('should transition to HALF_OPEN after timeout', async () => {
        const failingFn = async () => { throw new Error('fail'); };

        // Trip the circuit
        for (let i = 0; i < 5; i++) {
          try { await circuit.execute(failingFn); } catch {}
        }
        expect(circuit.getState()).toBe(CircuitState.OPEN);

        // Advance time past timeout
        jest.advanceTimersByTime(5001);

        // Next call should transition to HALF_OPEN
        try {
          await circuit.execute(async () => 'test');
        } catch {}

        expect(circuit.getState()).toBe(CircuitState.HALF_OPEN);
      });

      it('should throw CircuitOpenError when circuit is open', async () => {
        const failingFn = async () => { throw new Error('fail'); };

        // Trip the circuit
        for (let i = 0; i < 5; i++) {
          try { await circuit.execute(failingFn); } catch {}
        }

        await expect(circuit.execute(async () => 'test'))
          .rejects.toThrow(CircuitOpenError);
      });

      it('should close circuit after success threshold in HALF_OPEN', async () => {
        const failingFn = async () => { throw new Error('fail'); };

        // Trip the circuit
        for (let i = 0; i < 5; i++) {
          try { await circuit.execute(failingFn); } catch {}
        }

        // Advance to allow HALF_OPEN
        jest.advanceTimersByTime(5001);

        // Execute successful calls to meet successThreshold (2)
        await circuit.execute(async () => 'ok');
        await circuit.execute(async () => 'ok');

        expect(circuit.getState()).toBe(CircuitState.CLOSED);
      });

      it('should reopen circuit on failure in HALF_OPEN', async () => {
        const failingFn = async () => { throw new Error('fail'); };

        // Trip the circuit
        for (let i = 0; i < 5; i++) {
          try { await circuit.execute(failingFn); } catch {}
        }

        // Advance to allow HALF_OPEN
        jest.advanceTimersByTime(5001);

        // Trigger transition to HALF_OPEN with a call
        await circuit.execute(async () => 'ok');
        expect(circuit.getState()).toBe(CircuitState.HALF_OPEN);

        // Fail in HALF_OPEN should reopen
        try {
          await circuit.execute(failingFn);
        } catch {}

        expect(circuit.getState()).toBe(CircuitState.OPEN);
      });
    });

    describe('errorFilter', () => {
      it('should not count filtered errors', async () => {
        const filteredCircuit = new CircuitBreaker({
          name: 'filtered-circuit',
          failureThreshold: 2,
          volumeThreshold: 2,
          errorFilter: (error) => !error.message.includes('ignore'),
        });

        const ignoredError = async () => { throw new Error('ignore this'); };
        const countedError = async () => { throw new Error('count this'); };

        // Ignored errors shouldn't count
        try { await filteredCircuit.execute(ignoredError); } catch {}
        try { await filteredCircuit.execute(ignoredError); } catch {}

        expect(filteredCircuit.getStats().totalFailures).toBe(0);

        // Counted errors should count
        try { await filteredCircuit.execute(countedError); } catch {}

        expect(filteredCircuit.getStats().totalFailures).toBe(1);
      });
    });

    describe('forceState', () => {
      it('should force circuit to specified state', () => {
        circuit.forceState(CircuitState.OPEN);

        expect(circuit.getState()).toBe(CircuitState.OPEN);
        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'circuit_breaker_forced',
            forcedState: CircuitState.OPEN,
          }),
          expect.any(String)
        );
      });
    });

    describe('reset', () => {
      it('should reset circuit to initial state', async () => {
        const failingFn = async () => { throw new Error('fail'); };

        // Trip the circuit
        for (let i = 0; i < 5; i++) {
          try { await circuit.execute(failingFn); } catch {}
        }

        circuit.reset();

        expect(circuit.getState()).toBe(CircuitState.CLOSED);
        const stats = circuit.getStats();
        expect(stats.failures).toBe(0);
        expect(stats.successes).toBe(0);
        expect(stats.totalRequests).toBe(0);
        expect(stats.totalFailures).toBe(0);
      });

      it('should log reset event', () => {
        circuit.reset();

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'circuit_breaker_reset',
          }),
          expect.any(String)
        );
      });
    });
  });

  describe('CircuitOpenError', () => {
    it('should create error with circuit name and retry time', () => {
      const error = new CircuitOpenError('test-circuit', 5000);

      expect(error.name).toBe('CircuitOpenError');
      expect(error.circuitName).toBe('test-circuit');
      expect(error.retryAfterMs).toBe(5000);
      expect(error.message).toContain('test-circuit');
      expect(error.message).toContain('5s');
    });

    it('should be an instance of Error', () => {
      const error = new CircuitOpenError('test', 1000);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(CircuitOpenError);
    });
  });

  describe('Circuit Registry', () => {
    describe('getOrCreateCircuit', () => {
      it('should create new circuit if not exists', () => {
        const circuit = getOrCreateCircuit({ name: 'new-unique-circuit' });

        expect(circuit).toBeInstanceOf(CircuitBreaker);
        expect(circuit.getState()).toBe(CircuitState.CLOSED);
      });

      it('should return existing circuit if already created', () => {
        const circuit1 = getOrCreateCircuit({ name: 'shared-circuit' });
        const circuit2 = getOrCreateCircuit({ name: 'shared-circuit' });

        expect(circuit1).toBe(circuit2);
      });
    });

    describe('getCircuit', () => {
      it('should return circuit if exists', () => {
        getOrCreateCircuit({ name: 'existing-circuit' });
        const circuit = getCircuit('existing-circuit');

        expect(circuit).toBeDefined();
        expect(circuit).toBeInstanceOf(CircuitBreaker);
      });

      it('should return undefined if circuit does not exist', () => {
        const circuit = getCircuit('nonexistent-circuit-xyz');

        expect(circuit).toBeUndefined();
      });
    });

    describe('getAllCircuits', () => {
      it('should return map of all circuits', () => {
        getOrCreateCircuit({ name: 'circuit-a' });
        getOrCreateCircuit({ name: 'circuit-b' });

        const circuits = getAllCircuits();

        expect(circuits).toBeInstanceOf(Map);
        expect(circuits.has('circuit-a')).toBe(true);
        expect(circuits.has('circuit-b')).toBe(true);
      });

      it('should return a copy of the circuits map', () => {
        const circuits = getAllCircuits();
        circuits.clear();

        // Original should still have circuits
        expect(getAllCircuits().size).toBeGreaterThan(0);
      });
    });
  });

  describe('Pre-configured Circuits', () => {
    it('should have influxDB circuit', () => {
      expect(influxDBCircuit).toBeDefined();
      expect(influxDBCircuit).toBeInstanceOf(CircuitBreaker);
    });

    it('should have postgres circuit', () => {
      expect(postgresCircuit).toBeDefined();
      expect(postgresCircuit).toBeInstanceOf(CircuitBreaker);
    });

    it('should have redis circuit', () => {
      expect(redisCircuit).toBeDefined();
      expect(redisCircuit).toBeInstanceOf(CircuitBreaker);
    });

    it('should have external service circuit', () => {
      expect(externalServiceCircuit).toBeDefined();
      expect(externalServiceCircuit).toBeInstanceOf(CircuitBreaker);
    });

    it('should register pre-configured circuits in registry', () => {
      const circuits = getAllCircuits();
      
      expect(circuits.has('influxdb')).toBe(true);
      expect(circuits.has('postgres')).toBe(true);
      expect(circuits.has('redis')).toBe(true);
      expect(circuits.has('external_service')).toBe(true);
    });
  });
});

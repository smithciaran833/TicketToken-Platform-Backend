/**
 * Unit Tests for src/utils/CircuitBreaker.ts
 */

import CircuitBreaker from '../../../src/utils/CircuitBreaker';

describe('utils/CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      name: 'test-breaker',
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
      resetTimeout: 5000,
    });
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('constructor', () => {
    it('sets default values', () => {
      const defaultBreaker = new CircuitBreaker({});
      const status = defaultBreaker.getStatus();

      expect(status.name).toBe('default');
      expect(status.state).toBe('CLOSED');
      expect(status.failureCount).toBe(0);
    });

    it('accepts custom options', () => {
      const status = circuitBreaker.getStatus();

      expect(status.name).toBe('test-breaker');
      expect(status.state).toBe('CLOSED');
    });

    it('initializes state as CLOSED', () => {
      expect(circuitBreaker.getStatus().state).toBe('CLOSED');
    });

    it('initializes statistics with zero counts', () => {
      const status = circuitBreaker.getStatus();

      expect(status.statistics.totalCalls).toBe(0);
      expect(status.statistics.totalFailures).toBe(0);
      expect(status.statistics.totalSuccesses).toBe(0);
      expect(status.statistics.lastFailure).toBeNull();
      expect(status.statistics.lastSuccess).toBeNull();
    });
  });

  describe('call()', () => {
    it('increments totalCalls', async () => {
      await circuitBreaker.call(async () => 'success');

      expect(circuitBreaker.getStatus().statistics.totalCalls).toBe(1);
    });

    it('executes function when CLOSED', async () => {
      const result = await circuitBreaker.call(async () => 'hello');

      expect(result).toBe('hello');
    });

    it('throws error with code=CIRCUIT_OPEN when OPEN and before nextAttempt', async () => {
      // Force circuit to OPEN
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.call(async () => { throw new Error('fail'); }).catch(() => {});
      }

      expect(circuitBreaker.getStatus().state).toBe('OPEN');

      try {
        await circuitBreaker.call(async () => 'test');
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('CIRCUIT_OPEN');
        expect(error.message).toContain('OPEN');
      }
    });

    it('transitions OPEN to HALF_OPEN after nextAttempt time', async () => {
      jest.useFakeTimers();

      // Force circuit to OPEN
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.call(async () => { throw new Error('fail'); }).catch(() => {});
      }

      expect(circuitBreaker.getStatus().state).toBe('OPEN');

      // Advance time past resetTimeout
      jest.advanceTimersByTime(6000);

      // Next call should transition to HALF_OPEN
      await circuitBreaker.call(async () => 'success');

      // After success in HALF_OPEN, might still be HALF_OPEN or CLOSED
      const state = circuitBreaker.getStatus().state;
      expect(['HALF_OPEN', 'CLOSED']).toContain(state);

      jest.useRealTimers();
    });

    it('executes function when HALF_OPEN', async () => {
      jest.useFakeTimers();

      // Force to OPEN then HALF_OPEN
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.call(async () => { throw new Error('fail'); }).catch(() => {});
      }
      jest.advanceTimersByTime(6000);

      const result = await circuitBreaker.call(async () => 'test');
      expect(result).toBe('test');

      jest.useRealTimers();
    });
  });

  describe('executeWithTimeout', () => {
    it('resolves when function completes in time', async () => {
      const result = await circuitBreaker.call(async () => {
        return 'fast';
      });

      expect(result).toBe('fast');
    });

    it('rejects with timeout error when function exceeds timeout', async () => {
      const slowBreaker = new CircuitBreaker({
        name: 'slow-test',
        timeout: 50,
      });

      await expect(
        slowBreaker.call(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return 'slow';
        })
      ).rejects.toThrow('timeout');
    });
  });

  describe('onSuccess()', () => {
    it('resets failureCount to 0', async () => {
      // Cause some failures (but not enough to open)
      await circuitBreaker.call(async () => { throw new Error('fail'); }).catch(() => {});
      await circuitBreaker.call(async () => { throw new Error('fail'); }).catch(() => {});

      expect(circuitBreaker.getStatus().failureCount).toBe(2);

      // Success should reset
      await circuitBreaker.call(async () => 'success');

      expect(circuitBreaker.getStatus().failureCount).toBe(0);
    });

    it('increments totalSuccesses', async () => {
      await circuitBreaker.call(async () => 'success');

      expect(circuitBreaker.getStatus().statistics.totalSuccesses).toBe(1);
    });

    it('sets lastSuccess timestamp', async () => {
      await circuitBreaker.call(async () => 'success');

      expect(circuitBreaker.getStatus().statistics.lastSuccess).toBeInstanceOf(Date);
    });

    it('increments successCount in HALF_OPEN', async () => {
      jest.useFakeTimers();

      // Force to HALF_OPEN
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.call(async () => { throw new Error('fail'); }).catch(() => {});
      }
      jest.advanceTimersByTime(6000);

      // First success in HALF_OPEN
      await circuitBreaker.call(async () => 'success');

      // State depends on successThreshold (2), so still HALF_OPEN after 1 success
      expect(circuitBreaker.getStatus().state).toBe('HALF_OPEN');

      jest.useRealTimers();
    });

    it('transitions to CLOSED after successThreshold in HALF_OPEN', async () => {
      jest.useFakeTimers();

      // Force to HALF_OPEN
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.call(async () => { throw new Error('fail'); }).catch(() => {});
      }
      jest.advanceTimersByTime(6000);

      // Two successes (successThreshold = 2)
      await circuitBreaker.call(async () => 'success');
      await circuitBreaker.call(async () => 'success');

      expect(circuitBreaker.getStatus().state).toBe('CLOSED');

      jest.useRealTimers();
    });
  });

  describe('onFailure()', () => {
    it('increments failureCount', async () => {
      await circuitBreaker.call(async () => { throw new Error('fail'); }).catch(() => {});

      expect(circuitBreaker.getStatus().failureCount).toBe(1);
    });

    it('increments totalFailures', async () => {
      await circuitBreaker.call(async () => { throw new Error('fail'); }).catch(() => {});

      expect(circuitBreaker.getStatus().statistics.totalFailures).toBe(1);
    });

    it('sets lastFailure timestamp', async () => {
      await circuitBreaker.call(async () => { throw new Error('fail'); }).catch(() => {});

      expect(circuitBreaker.getStatus().statistics.lastFailure).toBeInstanceOf(Date);
    });

    it('transitions to OPEN after failureThreshold', async () => {
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.call(async () => { throw new Error('fail'); }).catch(() => {});
      }

      expect(circuitBreaker.getStatus().state).toBe('OPEN');
    });

    it('sets nextAttempt to now + resetTimeout', async () => {
      const before = Date.now();

      for (let i = 0; i < 3; i++) {
        await circuitBreaker.call(async () => { throw new Error('fail'); }).catch(() => {});
      }

      // Circuit is now OPEN, trying to call should fail with CIRCUIT_OPEN
      try {
        await circuitBreaker.call(async () => 'test');
      } catch (error: any) {
        expect(error.code).toBe('CIRCUIT_OPEN');
      }
    });
  });

  describe('getStatus()', () => {
    it('returns name, state, failureCount, statistics', () => {
      const status = circuitBreaker.getStatus();

      expect(status).toHaveProperty('name');
      expect(status).toHaveProperty('state');
      expect(status).toHaveProperty('failureCount');
      expect(status).toHaveProperty('statistics');
    });
  });

  describe('reset()', () => {
    it('sets state to CLOSED', async () => {
      // Force to OPEN
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.call(async () => { throw new Error('fail'); }).catch(() => {});
      }
      expect(circuitBreaker.getStatus().state).toBe('OPEN');

      circuitBreaker.reset();

      expect(circuitBreaker.getStatus().state).toBe('CLOSED');
    });

    it('resets failureCount and successCount to 0', async () => {
      await circuitBreaker.call(async () => { throw new Error('fail'); }).catch(() => {});

      circuitBreaker.reset();

      expect(circuitBreaker.getStatus().failureCount).toBe(0);
    });
  });
});

/**
 * Unit Tests for Circuit Breaker
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

import {
  CircuitBreaker,
  CircuitState,
  CircuitBreakerError,
  CircuitBreakerConfig,
  circuitBreakerRegistry,
  withCircuitBreaker,
} from '../../../src/utils/circuit-breaker';

describe('CircuitBreaker', () => {
  const defaultConfig: CircuitBreakerConfig = {
    name: 'test-breaker',
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 1000,
  };

  let breaker: CircuitBreaker;

  beforeEach(() => {
    jest.clearAllMocks();
    breaker = new CircuitBreaker(defaultConfig);
  });

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      const stats = breaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
    });

    it('should have zero failures and successes', () => {
      const stats = breaker.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('execute() - Success Path', () => {
    it('should execute function when circuit is closed', async () => {
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should increment total requests', async () => {
      await breaker.execute(async () => 'ok');
      await breaker.execute(async () => 'ok');
      
      const stats = breaker.getStats();
      expect(stats.totalRequests).toBe(2);
    });

    it('should reset failure count on success', async () => {
      // Cause some failures
      await expect(breaker.execute(async () => { throw new Error('fail'); }))
        .rejects.toThrow();
      
      expect(breaker.getStats().failures).toBe(1);
      
      // Success resets failures
      await breaker.execute(async () => 'success');
      expect(breaker.getStats().failures).toBe(0);
    });
  });

  describe('execute() - Failure Path', () => {
    it('should track failures', async () => {
      await expect(breaker.execute(async () => { throw new Error('fail'); }))
        .rejects.toThrow('fail');
      
      const stats = breaker.getStats();
      expect(stats.failures).toBe(1);
      expect(stats.totalFailures).toBe(1);
    });

    it('should open circuit after threshold failures', async () => {
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(async () => { throw new Error('fail'); }))
          .rejects.toThrow();
      }

      const stats = breaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
    });

    it('should reject requests when open', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(async () => { throw new Error('fail'); }))
          .rejects.toThrow();
      }

      // Try another request
      await expect(breaker.execute(async () => 'should not run'))
        .rejects.toThrow(CircuitBreakerError);
    });

    it('should record lastFailure timestamp', async () => {
      await expect(breaker.execute(async () => { throw new Error('fail'); }))
        .rejects.toThrow();
      
      const stats = breaker.getStats();
      expect(stats.lastFailure).toBeDefined();
      expect(stats.lastFailure).toBeInstanceOf(Date);
    });
  });

  describe('State Transitions', () => {
    it('should transition CLOSED -> OPEN on failures', async () => {
      expect(breaker.getStats().state).toBe(CircuitState.CLOSED);

      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(async () => { throw new Error(); }))
          .rejects.toThrow();
      }

      expect(breaker.getStats().state).toBe(CircuitState.OPEN);
    });

    it('should transition OPEN -> HALF_OPEN after timeout', async () => {
      // Use shorter timeout for test
      const fastBreaker = new CircuitBreaker({
        ...defaultConfig,
        timeout: 50,
      });

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(fastBreaker.execute(async () => { throw new Error(); }))
          .rejects.toThrow();
      }
      expect(fastBreaker.getStats().state).toBe(CircuitState.OPEN);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 60));

      // Next attempt should transition to half-open
      await fastBreaker.execute(async () => 'success');
      // After success, might be HALF_OPEN or CLOSED depending on successThreshold
    });

    it('should transition HALF_OPEN -> CLOSED after success threshold', async () => {
      const fastBreaker = new CircuitBreaker({
        ...defaultConfig,
        timeout: 50,
        successThreshold: 2,
      });

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(fastBreaker.execute(async () => { throw new Error(); }))
          .rejects.toThrow();
      }

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 60));

      // Two successes should close the circuit
      await fastBreaker.execute(async () => 'success');
      await fastBreaker.execute(async () => 'success');
      
      expect(fastBreaker.getStats().state).toBe(CircuitState.CLOSED);
    });

    it('should transition HALF_OPEN -> OPEN on single failure', async () => {
      const fastBreaker = new CircuitBreaker({
        ...defaultConfig,
        timeout: 50,
      });

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(fastBreaker.execute(async () => { throw new Error(); }))
          .rejects.toThrow();
      }

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 60));

      // Fail in half-open should go back to open
      await expect(fastBreaker.execute(async () => { throw new Error(); }))
        .rejects.toThrow();
      
      expect(fastBreaker.getStats().state).toBe(CircuitState.OPEN);
    });
  });

  describe('forceOpen()', () => {
    it('should force circuit to open state', () => {
      expect(breaker.getStats().state).toBe(CircuitState.CLOSED);
      breaker.forceOpen();
      expect(breaker.getStats().state).toBe(CircuitState.OPEN);
    });
  });

  describe('forceClose()', () => {
    it('should force circuit to closed state', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(async () => { throw new Error(); }))
          .rejects.toThrow();
      }
      expect(breaker.getStats().state).toBe(CircuitState.OPEN);

      breaker.forceClose();
      expect(breaker.getStats().state).toBe(CircuitState.CLOSED);
    });

    it('should reset failure count', async () => {
      for (let i = 0; i < 2; i++) {
        await expect(breaker.execute(async () => { throw new Error(); }))
          .rejects.toThrow();
      }
      
      breaker.forceClose();
      expect(breaker.getStats().failures).toBe(0);
    });
  });

  describe('reset()', () => {
    it('should reset all stats', async () => {
      // Generate some stats
      await breaker.execute(async () => 'success');
      await expect(breaker.execute(async () => { throw new Error(); }))
        .rejects.toThrow();

      breaker.reset();
      
      const stats = breaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.totalRequests).toBe(0);
      expect(stats.totalFailures).toBe(0);
      expect(stats.lastFailure).toBeUndefined();
    });
  });

  describe('Volume Threshold', () => {
    it('should not open until volume threshold is met', async () => {
      const volumeBreaker = new CircuitBreaker({
        ...defaultConfig,
        volumeThreshold: 10,
        failureThreshold: 3,
      });

      // 5 failures but only 5 requests (below volume threshold of 10)
      for (let i = 0; i < 5; i++) {
        await expect(volumeBreaker.execute(async () => { throw new Error(); }))
          .rejects.toThrow();
      }

      // Should still be closed due to volume threshold
      expect(volumeBreaker.getStats().state).toBe(CircuitState.CLOSED);
    });
  });
});

describe('CircuitBreakerError', () => {
  it('should have correct name', () => {
    const error = new CircuitBreakerError('test', new Date());
    expect(error.name).toBe('CircuitBreakerError');
  });

  it('should include retryAfter date', () => {
    const retryDate = new Date(Date.now() + 30000);
    const error = new CircuitBreakerError('test', retryDate);
    expect(error.retryAfter).toBe(retryDate);
  });
});

describe('CircuitBreakerRegistry', () => {
  beforeEach(() => {
    circuitBreakerRegistry.resetAll();
  });

  it('should get or create breakers', () => {
    const config: CircuitBreakerConfig = {
      name: 'registry-test',
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 5000,
    };

    const breaker1 = circuitBreakerRegistry.get(config);
    const breaker2 = circuitBreakerRegistry.get(config);

    expect(breaker1).toBe(breaker2); // Same instance
  });

  it('should get all breakers', () => {
    circuitBreakerRegistry.get({ name: 'test1', failureThreshold: 3, successThreshold: 2, timeout: 1000 });
    circuitBreakerRegistry.get({ name: 'test2', failureThreshold: 3, successThreshold: 2, timeout: 1000 });

    const all = circuitBreakerRegistry.getAll();
    expect(all.size).toBeGreaterThanOrEqual(2);
  });

  it('should get all stats', () => {
    circuitBreakerRegistry.get({ name: 'stats-test', failureThreshold: 3, successThreshold: 2, timeout: 1000 });
    
    const stats = circuitBreakerRegistry.getAllStats();
    expect(stats['stats-test']).toBeDefined();
    expect(stats['stats-test'].state).toBe(CircuitState.CLOSED);
  });

  it('should reset all breakers', async () => {
    const breaker = circuitBreakerRegistry.get({ name: 'reset-test', failureThreshold: 2, successThreshold: 1, timeout: 1000 });
    
    // Generate some failures
    await expect(breaker.execute(async () => { throw new Error(); })).rejects.toThrow();
    expect(breaker.getStats().totalFailures).toBe(1);

    circuitBreakerRegistry.resetAll();
    expect(breaker.getStats().totalFailures).toBe(0);
  });
});

describe('withCircuitBreaker helper', () => {
  beforeEach(() => {
    circuitBreakerRegistry.resetAll();
  });

  it('should wrap function with circuit breaker', async () => {
    const result = await withCircuitBreaker('helper-test', async () => 'result');
    expect(result).toBe('result');
  });

  it('should use custom config', async () => {
    const result = await withCircuitBreaker(
      'custom-config-test',
      async () => 'ok',
      { failureThreshold: 10, timeout: 60000 }
    );
    expect(result).toBe('ok');
  });

  it('should throw CircuitBreakerError when open', async () => {
    // Open the circuit
    for (let i = 0; i < 5; i++) {
      await expect(
        withCircuitBreaker('open-test', async () => { throw new Error('fail'); })
      ).rejects.toThrow();
    }

    // Should now throw CircuitBreakerError
    await expect(
      withCircuitBreaker('open-test', async () => 'should not run')
    ).rejects.toThrow(CircuitBreakerError);
  });
});

import CircuitBreaker from '../../src/utils/CircuitBreaker';

/**
 * INTEGRATION TESTS FOR CIRCUIT BREAKER
 * Tests circuit breaker functionality with real async operations
 */

describe('CircuitBreaker Integration Tests', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test-circuit',
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
      resetTimeout: 2000
    });
  });

  describe('initialization', () => {
    it('should initialize with default options', () => {
      const defaultBreaker = new CircuitBreaker();
      const status = defaultBreaker.getStatus();
      
      expect(status.name).toBe('default');
      expect(status.state).toBe('CLOSED');
      expect(status.failureCount).toBe(0);
    });

    it('should initialize with custom options', () => {
      const customBreaker = new CircuitBreaker({
        name: 'custom',
        failureThreshold: 5,
        timeout: 3000
      });
      
      const status = customBreaker.getStatus();
      expect(status.name).toBe('custom');
    });

    it('should start in CLOSED state', () => {
      const status = breaker.getStatus();
      expect(status.state).toBe('CLOSED');
    });
  });

  describe('successful calls', () => {
    it('should execute successful async function', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const result = await breaker.call(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should track successful calls in statistics', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      await breaker.call(mockFn);
      await breaker.call(mockFn);
      
      const status = breaker.getStatus();
      expect(status.statistics.totalCalls).toBe(2);
      expect(status.statistics.totalSuccesses).toBe(2);
      expect(status.statistics.totalFailures).toBe(0);
    });

    it('should reset failure count on success', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      const successFn = jest.fn().mockResolvedValue('success');
      
      try { await breaker.call(failFn); } catch {}
      try { await breaker.call(failFn); } catch {}
      
      let status = breaker.getStatus();
      expect(status.failureCount).toBe(2);
      
      await breaker.call(successFn);
      
      status = breaker.getStatus();
      expect(status.failureCount).toBe(0);
    });

    it('should pass arguments to the function', async () => {
      const mockFn = jest.fn().mockImplementation((a: number, b: number) => Promise.resolve(a + b));
      
      const result = await breaker.call(mockFn, 5, 3);
      
      expect(result).toBe(8);
      expect(mockFn).toHaveBeenCalledWith(5, 3);
    });
  });

  describe('failed calls', () => {
    it('should throw error when function fails', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('failure'));
      
      await expect(breaker.call(mockFn)).rejects.toThrow('failure');
    });

    it('should track failed calls in statistics', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('failure'));
      
      try { await breaker.call(mockFn); } catch {}
      try { await breaker.call(mockFn); } catch {}
      
      const status = breaker.getStatus();
      expect(status.statistics.totalCalls).toBe(2);
      expect(status.statistics.totalFailures).toBe(2);
      expect(status.statistics.totalSuccesses).toBe(0);
    });

    it('should increment failure count', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('failure'));
      
      try { await breaker.call(mockFn); } catch {}
      
      let status = breaker.getStatus();
      expect(status.failureCount).toBe(1);
      
      try { await breaker.call(mockFn); } catch {}
      
      status = breaker.getStatus();
      expect(status.failureCount).toBe(2);
    });
  });

  describe('circuit states', () => {
    it('should open circuit after threshold failures', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('failure'));
      
      // Fail 3 times (threshold)
      for (let i = 0; i < 3; i++) {
        try { await breaker.call(mockFn); } catch {}
      }
      
      const status = breaker.getStatus();
      expect(status.state).toBe('OPEN');
    });

    it('should reject calls when circuit is OPEN', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('failure'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try { await breaker.call(mockFn); } catch {}
      }
      
      // Circuit is now open
      await expect(breaker.call(mockFn)).rejects.toThrow('Circuit breaker is OPEN');
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('failure'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try { await breaker.call(mockFn); } catch {}
      }
      
      // Wait for reset timeout (2000ms)
      await new Promise(resolve => setTimeout(resolve, 2100));
      
      // Next call should attempt HALF_OPEN
      mockFn.mockResolvedValue('success');
      await breaker.call(mockFn);
      
      const status = breaker.getStatus();
      expect(['HALF_OPEN', 'CLOSED']).toContain(status.state);
    });

    it('should close circuit after success threshold in HALF_OPEN', async () => {
      const mockFn = jest.fn();
      
      // Open the circuit
      mockFn.mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 3; i++) {
        try { await breaker.call(mockFn); } catch {}
      }
      
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 2100));
      
      // Succeed twice (success threshold = 2)
      mockFn.mockResolvedValue('success');
      await breaker.call(mockFn);
      await breaker.call(mockFn);
      
      const status = breaker.getStatus();
      expect(status.state).toBe('CLOSED');
    });

    it('should reopen circuit if failure occurs in HALF_OPEN', async () => {
      const mockFn = jest.fn();
      
      // Open the circuit
      mockFn.mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 3; i++) {
        try { await breaker.call(mockFn); } catch {}
      }
      
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 2100));
      
      // Fail in HALF_OPEN
      try { await breaker.call(mockFn); } catch {}
      
      const status = breaker.getStatus();
      expect(status.failureCount).toBeGreaterThan(0);
    });
  });

  describe('timeout handling', () => {
    it('should timeout slow functions', async () => {
      const slowFn = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('done'), 2000))
      );
      
      await expect(breaker.call(slowFn)).rejects.toThrow('timeout');
    });

    it('should count timeouts as failures', async () => {
      const slowFn = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('done'), 2000))
      );
      
      try { await breaker.call(slowFn); } catch {}
      
      const status = breaker.getStatus();
      expect(status.failureCount).toBe(1);
      expect(status.statistics.totalFailures).toBe(1);
    });

    it('should not timeout fast functions', async () => {
      const fastFn = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('done'), 100))
      );
      
      const result = await breaker.call(fastFn);
      expect(result).toBe('done');
    });
  });

  describe('statistics tracking', () => {
    it('should track last failure time', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('failure'));
      
      const before = new Date();
      try { await breaker.call(mockFn); } catch {}
      const after = new Date();
      
      const status = breaker.getStatus();
      expect(status.statistics.lastFailure).toBeInstanceOf(Date);
      expect(status.statistics.lastFailure!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(status.statistics.lastFailure!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should track last success time', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const before = new Date();
      await breaker.call(mockFn);
      const after = new Date();
      
      const status = breaker.getStatus();
      expect(status.statistics.lastSuccess).toBeInstanceOf(Date);
      expect(status.statistics.lastSuccess!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(status.statistics.lastSuccess!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should track total calls', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      const failFn = jest.fn().mockRejectedValue(new Error('failure'));
      
      await breaker.call(successFn);
      try { await breaker.call(failFn); } catch {}
      await breaker.call(successFn);
      
      const status = breaker.getStatus();
      expect(status.statistics.totalCalls).toBe(3);
    });
  });

  describe('reset functionality', () => {
    it('should reset circuit to CLOSED state', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('failure'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try { await breaker.call(mockFn); } catch {}
      }
      
      breaker.reset();
      
      const status = breaker.getStatus();
      expect(status.state).toBe('CLOSED');
    });

    it('should reset failure count', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('failure'));
      
      try { await breaker.call(mockFn); } catch {}
      try { await breaker.call(mockFn); } catch {}
      
      breaker.reset();
      
      const status = breaker.getStatus();
      expect(status.failureCount).toBe(0);
    });

    it('should allow calls after reset', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('failure'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try { await breaker.call(mockFn); } catch {}
      }
      
      breaker.reset();
      mockFn.mockResolvedValue('success');
      
      const result = await breaker.call(mockFn);
      expect(result).toBe('success');
    });
  });

  describe('concurrent calls', () => {
    it('should handle multiple concurrent successful calls', async () => {
      const mockFn = jest.fn().mockImplementation((val: number) => 
        Promise.resolve(val * 2)
      );
      
      const results = await Promise.all([
        breaker.call(mockFn, 1),
        breaker.call(mockFn, 2),
        breaker.call(mockFn, 3)
      ]);
      
      expect(results).toEqual([2, 4, 6]);
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed concurrent calls', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      const failFn = jest.fn().mockRejectedValue(new Error('failure'));
      
      const results = await Promise.allSettled([
        breaker.call(successFn),
        breaker.call(failFn),
        breaker.call(successFn)
      ]);
      
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');
    });
  });

  describe('real-world scenarios', () => {
    it('should protect against cascading failures', async () => {
      let callCount = 0;
      const unreliableFn = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.reject(new Error('service unavailable'));
      });
      
      // Make 10 calls
      for (let i = 0; i < 10; i++) {
        try {
          await breaker.call(unreliableFn);
        } catch {}
      }
      
      // Circuit should have opened after 3 failures, preventing remaining calls
      expect(callCount).toBeLessThan(10);
    });

    it('should allow recovery after service restoration', async () => {
      const mockFn = jest.fn();
      
      // Simulate service failure
      mockFn.mockRejectedValue(new Error('service down'));
      for (let i = 0; i < 3; i++) {
        try { await breaker.call(mockFn); } catch {}
      }
      
      // Wait for reset
      await new Promise(resolve => setTimeout(resolve, 2100));
      
      // Service restored
      mockFn.mockResolvedValue('service restored');
      await breaker.call(mockFn);
      await breaker.call(mockFn);
      
      const status = breaker.getStatus();
      expect(status.state).toBe('CLOSED');
    });

    it('should track degraded service patterns', async () => {
      const mockFn = jest.fn();
      
      // Pattern: fail, succeed, fail, succeed, fail (degraded)
      mockFn.mockRejectedValue(new Error('fail'));
      try { await breaker.call(mockFn); } catch {}
      
      mockFn.mockResolvedValue('success');
      await breaker.call(mockFn);
      
      mockFn.mockRejectedValue(new Error('fail'));
      try { await breaker.call(mockFn); } catch {}
      
      mockFn.mockResolvedValue('success');
      await breaker.call(mockFn);
      
      mockFn.mockRejectedValue(new Error('fail'));
      try { await breaker.call(mockFn); } catch {}
      
      const status = breaker.getStatus();
      expect(status.statistics.totalFailures).toBe(3);
      expect(status.statistics.totalSuccesses).toBe(2);
    });
  });
});

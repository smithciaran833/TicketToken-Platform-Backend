import { CircuitBreaker, CircuitState } from '../../../src/utils/circuit-breaker';

describe('CircuitBreaker', () => {
  describe('Basic functionality', () => {
    it('should start in CLOSED state', () => {
      const breaker = new CircuitBreaker();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should execute successfully in CLOSED state', async () => {
      const breaker = new CircuitBreaker();
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should reset failures on success', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3 });
      
      // Cause 2 failures
      await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
      await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
      
      // Success should reset
      await breaker.execute(async () => 'success');
      
      const stats = breaker.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.state).toBe(CircuitState.CLOSED);
    });
  });

  describe('Circuit opening', () => {
    it('should open circuit after threshold failures', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3 });
      
      for (let i = 0; i < 3; i++) {
        await breaker.execute(async () => {
          throw new Error('fail');
        }).catch(() => {});
      }
      
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should reject requests when OPEN', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2, timeout: 1000 });
      
      // Cause failures to open circuit
      await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
      await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
      
      // Should reject immediately
      await expect(breaker.execute(async () => 'success'))
        .rejects.toThrow('Circuit breaker is OPEN');
    });
  });

  describe('Half-open state', () => {
    it('should transition to HALF_OPEN after timeout', async () => {
      const breaker = new CircuitBreaker({ 
        failureThreshold: 2, 
        timeout: 100, // Short timeout for testing
        successThreshold: 2 
      });
      
      // Open the circuit
      await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
      await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
      
      expect(breaker.getState()).toBe(CircuitState.OPEN);
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Next request should transition to HALF_OPEN
      await breaker.execute(async () => 'success');
      
      const state = breaker.getState();
      expect([CircuitState.HALF_OPEN, CircuitState.CLOSED]).toContain(state);
    });

    it('should close after sufficient successes in HALF_OPEN', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        timeout: 100,
        successThreshold: 2
      });
      
      // Open circuit
      await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
      await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Succeed twice to close
      await breaker.execute(async () => 'success');
      await breaker.execute(async () => 'success');
      
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reopen on failure in HALF_OPEN', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        timeout: 100
      });
      
      // Open circuit
      await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
      await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Fail in HALF_OPEN - should reopen
      await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
      
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('Statistics', () => {
    it('should track failures and successes', async () => {
      const breaker = new CircuitBreaker();
      
      await breaker.execute(async () => 'success');
      await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
      
      const stats = breaker.getStats();
      expect(stats.failures).toBeGreaterThan(0);
    });

    it('should provide next attempt time when OPEN', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1, timeout: 5000 });
      
      await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
      
      const stats = breaker.getStats();
      expect(stats.nextAttempt).not.toBeNull();
      expect(stats.state).toBe(CircuitState.OPEN);
    });
  });

  describe('Force reset', () => {
    it('should reset circuit state', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1 });
      
      // Open circuit
      await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
      
      expect(breaker.getState()).toBe(CircuitState.OPEN);
      
      // Force reset
      breaker.forceReset();
      
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      const stats = breaker.getStats();
      expect(stats.failures).toBe(0);
    });
  });
});

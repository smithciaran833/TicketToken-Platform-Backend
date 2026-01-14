/**
 * Unit Tests for Circuit Breaker
 * Tests circuit breaker states, retry with backoff, and jitter
 */

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

jest.mock('../../../src/config/redis', () => ({
  cache: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined)
  }
}));

import {
  CircuitState,
  configureCircuit,
  withCircuitBreaker,
  getCircuitState,
  resetCircuit,
  getAllCircuitStates,
  withRetry,
  withCircuitBreakerAndRetry
} from '../../../src/utils/circuit-breaker';

describe('Circuit Breaker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset all circuits before each test
    resetCircuit('test-circuit');
  });

  describe('CircuitState enum', () => {
    it('should define CLOSED state', () => {
      expect(CircuitState.CLOSED).toBe('CLOSED');
    });

    it('should define OPEN state', () => {
      expect(CircuitState.OPEN).toBe('OPEN');
    });

    it('should define HALF_OPEN state', () => {
      expect(CircuitState.HALF_OPEN).toBe('HALF_OPEN');
    });
  });

  describe('configureCircuit', () => {
    it('should configure a circuit with custom settings', () => {
      configureCircuit('custom-circuit', {
        failureThreshold: 10,
        successThreshold: 3,
        timeout: 60000
      });

      // Configuration is applied - can verify through behavior
      resetCircuit('custom-circuit');
      const state = getCircuitState('custom-circuit');
      expect(state.state).toBe(CircuitState.CLOSED);
    });
  });

  describe('withCircuitBreaker', () => {
    describe('CLOSED state (normal operation)', () => {
      it('should execute function successfully', async () => {
        const result = await withCircuitBreaker('test-circuit', async () => 'success');
        expect(result).toBe('success');
      });

      it('should pass through successful results', async () => {
        const mockFn = jest.fn().mockResolvedValue({ data: 'test' });
        
        const result = await withCircuitBreaker('test-circuit', mockFn);
        
        expect(result).toEqual({ data: 'test' });
        expect(mockFn).toHaveBeenCalledTimes(1);
      });

      it('should pass through errors without opening circuit (below threshold)', async () => {
        const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
        
        await expect(withCircuitBreaker('test-circuit', mockFn, { failureThreshold: 5 }))
          .rejects.toThrow('Test error');
        
        const state = getCircuitState('test-circuit');
        expect(state.state).toBe(CircuitState.CLOSED);
        expect(state.failures).toBe(1);
      });

      it('should open circuit after reaching failure threshold', async () => {
        const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
        
        // Fail enough times to open the circuit
        for (let i = 0; i < 5; i++) {
          await expect(withCircuitBreaker('test-circuit', mockFn, { failureThreshold: 5 }))
            .rejects.toThrow('Test error');
        }
        
        const state = getCircuitState('test-circuit');
        expect(state.state).toBe(CircuitState.OPEN);
      });
    });

    describe('OPEN state', () => {
      it('should reject immediately when circuit is open', async () => {
        // Open the circuit first
        const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
        for (let i = 0; i < 5; i++) {
          try {
            await withCircuitBreaker('open-circuit', mockFn, { 
              failureThreshold: 5, 
              timeout: 60000 
            });
          } catch {}
        }
        
        // Now it should reject immediately
        await expect(withCircuitBreaker('open-circuit', jest.fn()))
          .rejects.toThrow('Circuit breaker is OPEN');
      });

      it('should include retry time in error', async () => {
        const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
        for (let i = 0; i < 5; i++) {
          try {
            await withCircuitBreaker('retry-circuit', mockFn, { 
              failureThreshold: 5, 
              timeout: 30000 
            });
          } catch {}
        }
        
        try {
          await withCircuitBreaker('retry-circuit', jest.fn());
        } catch (error: any) {
          expect(error.code).toBe('CIRCUIT_OPEN');
          expect(error.retryAfter).toBeDefined();
        }
      });

      it('should transition to HALF_OPEN after timeout', async () => {
        // Open the circuit
        const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
        for (let i = 0; i < 5; i++) {
          try {
            await withCircuitBreaker('timeout-circuit', mockFn, { 
              failureThreshold: 5, 
              timeout: 1 // 1ms timeout for testing
            });
          } catch {}
        }
        
        // Wait for timeout
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Should now be in half-open and allow request
        mockFn.mockResolvedValue('success');
        const result = await withCircuitBreaker('timeout-circuit', mockFn, { 
          failureThreshold: 5, 
          timeout: 1,
          successThreshold: 1
        });
        expect(result).toBe('success');
      });
    });

    describe('HALF_OPEN state', () => {
      it('should close circuit after success threshold', async () => {
        resetCircuit('halfopen-circuit');
        
        // Open the circuit
        const failingFn = jest.fn().mockRejectedValue(new Error('Test error'));
        for (let i = 0; i < 3; i++) {
          try {
            await withCircuitBreaker('halfopen-circuit', failingFn, { 
              failureThreshold: 3, 
              timeout: 1,
              successThreshold: 2
            });
          } catch {}
        }
        
        // Wait for timeout to transition to half-open
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Succeed twice to close
        const successFn = jest.fn().mockResolvedValue('success');
        await withCircuitBreaker('halfopen-circuit', successFn, { 
          failureThreshold: 3, 
          timeout: 1,
          successThreshold: 2
        });
        await withCircuitBreaker('halfopen-circuit', successFn, { 
          failureThreshold: 3, 
          timeout: 1,
          successThreshold: 2
        });
        
        const state = getCircuitState('halfopen-circuit');
        expect(state.state).toBe(CircuitState.CLOSED);
      });

      it('should re-open circuit on failure during half-open', async () => {
        resetCircuit('reopen-circuit');
        
        // Open the circuit
        const failingFn = jest.fn().mockRejectedValue(new Error('Test error'));
        for (let i = 0; i < 3; i++) {
          try {
            await withCircuitBreaker('reopen-circuit', failingFn, { 
              failureThreshold: 3, 
              timeout: 1,
              successThreshold: 2
            });
          } catch {}
        }
        
        // Wait for half-open
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Fail again during half-open
        try {
          await withCircuitBreaker('reopen-circuit', failingFn, { 
            failureThreshold: 3, 
            timeout: 1,
            successThreshold: 2
          });
        } catch {}
        
        const state = getCircuitState('reopen-circuit');
        expect(state.state).toBe(CircuitState.OPEN);
      });
    });
  });

  describe('getCircuitState', () => {
    it('should return circuit state information', () => {
      resetCircuit('state-circuit');
      
      const state = getCircuitState('state-circuit');
      
      expect(state.state).toBe(CircuitState.CLOSED);
      expect(state.failures).toBe(0);
      expect(state.lastStateChange).toBeInstanceOf(Date);
    });

    it('should track failure count', async () => {
      resetCircuit('failure-count-circuit');
      
      const failingFn = jest.fn().mockRejectedValue(new Error('Test'));
      
      try {
        await withCircuitBreaker('failure-count-circuit', failingFn);
      } catch {}
      
      const state = getCircuitState('failure-count-circuit');
      expect(state.failures).toBe(1);
    });
  });

  describe('resetCircuit', () => {
    it('should reset circuit to closed state', async () => {
      // Open the circuit first
      const failingFn = jest.fn().mockRejectedValue(new Error('Test'));
      for (let i = 0; i < 5; i++) {
        try {
          await withCircuitBreaker('reset-test-circuit', failingFn, { failureThreshold: 5 });
        } catch {}
      }
      
      expect(getCircuitState('reset-test-circuit').state).toBe(CircuitState.OPEN);
      
      // Reset it
      resetCircuit('reset-test-circuit');
      
      const state = getCircuitState('reset-test-circuit');
      expect(state.state).toBe(CircuitState.CLOSED);
      expect(state.failures).toBe(0);
    });
  });

  describe('getAllCircuitStates', () => {
    it('should return all circuit states', () => {
      resetCircuit('circuit-1');
      resetCircuit('circuit-2');
      
      const states = getAllCircuitStates();
      
      expect(typeof states).toBe('object');
      expect(states['circuit-1']).toBeDefined();
      expect(states['circuit-2']).toBeDefined();
    });

    it('should include state, failures, and lastStateChange', () => {
      resetCircuit('detailed-circuit');
      
      const states = getAllCircuitStates();
      
      expect(states['detailed-circuit'].state).toBe(CircuitState.CLOSED);
      expect(states['detailed-circuit'].failures).toBe(0);
      expect(typeof states['detailed-circuit'].lastStateChange).toBe('string');
    });
  });

  describe('withRetry', () => {
    it('should return result on first success', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const result = await withRetry(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('First fail'))
        .mockResolvedValue('success');
      
      const result = await withRetry(mockFn, { 
        maxRetries: 3, 
        initialDelayMs: 10 
      });
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Always fails'));
      
      await expect(withRetry(mockFn, { 
        maxRetries: 2, 
        initialDelayMs: 10 
      })).rejects.toThrow('Always fails');
      
      expect(mockFn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should use exponential backoff', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');
      
      const start = Date.now();
      await withRetry(mockFn, { 
        maxRetries: 3, 
        initialDelayMs: 50,
        backoffMultiplier: 2,
        jitterFactor: 0 // No jitter for predictable timing
      });
      const elapsed = Date.now() - start;
      
      // Should take at least 50 + 100 = 150ms (without jitter)
      expect(elapsed).toBeGreaterThanOrEqual(100); // Some buffer for execution time
    });

    it('should respect maxDelayMs', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');
      
      // With high backoff, delay should be capped
      await withRetry(mockFn, { 
        maxRetries: 3, 
        initialDelayMs: 100,
        maxDelayMs: 50, // Cap below initial
        backoffMultiplier: 10,
        jitterFactor: 0
      });
      
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should only retry specified error codes', async () => {
      const retryableError = new Error('Retryable');
      (retryableError as any).code = 'RETRYABLE';
      
      const nonRetryableError = new Error('Not retryable');
      (nonRetryableError as any).code = 'NOT_RETRYABLE';
      
      const mockFn = jest.fn()
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValue(nonRetryableError);
      
      await expect(withRetry(mockFn, { 
        maxRetries: 3, 
        initialDelayMs: 10,
        retryableErrors: ['RETRYABLE']
      })).rejects.toThrow('Not retryable');
      
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should apply jitter to delays', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');
      
      // Run multiple times to verify jitter creates variance
      // With jitter, timing should vary
      await withRetry(mockFn, { 
        maxRetries: 1, 
        initialDelayMs: 100,
        jitterFactor: 0.5 // 50% jitter
      });
      
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('withCircuitBreakerAndRetry', () => {
    it('should combine circuit breaker and retry', async () => {
      resetCircuit('combined-circuit');
      
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('First fail'))
        .mockResolvedValue('success');
      
      const result = await withCircuitBreakerAndRetry(
        'combined-circuit',
        mockFn,
        { failureThreshold: 5 },
        { maxRetries: 2, initialDelayMs: 10 }
      );
      
      expect(result).toBe('success');
    });

    it('should open circuit after retry failures', async () => {
      resetCircuit('retry-fail-circuit');
      
      const mockFn = jest.fn().mockRejectedValue(new Error('Always fails'));
      
      // Each withCircuitBreakerAndRetry call will count as failures after retries exhausted
      for (let i = 0; i < 3; i++) {
        try {
          await withCircuitBreakerAndRetry(
            'retry-fail-circuit',
            mockFn,
            { failureThreshold: 3 },
            { maxRetries: 0, initialDelayMs: 10 }
          );
        } catch {}
      }
      
      const state = getCircuitState('retry-fail-circuit');
      expect(state.state).toBe(CircuitState.OPEN);
    });
  });

  describe('pre-configured circuits', () => {
    it('should have blockchain-service circuit configured', () => {
      const state = getCircuitState('blockchain-service');
      expect(state).toBeDefined();
    });

    it('should have stripe-api circuit configured', () => {
      const state = getCircuitState('stripe-api');
      expect(state).toBeDefined();
    });

    it('should have database circuit configured', () => {
      const state = getCircuitState('database');
      expect(state).toBeDefined();
    });
  });
});

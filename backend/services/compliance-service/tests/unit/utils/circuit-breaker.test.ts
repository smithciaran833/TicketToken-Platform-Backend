/**
 * Unit Tests for Circuit Breaker
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock errors
class MockExternalServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExternalServiceError';
  }
}

class MockServiceUnavailableError extends Error {
  constructor(service: string, requestId?: string) {
    super(`Service ${service} is unavailable`);
    this.name = 'ServiceUnavailableError';
  }
}

jest.mock('../../../src/errors', () => ({
  ExternalServiceError: MockExternalServiceError,
  ServiceUnavailableError: MockServiceUnavailableError
}));

describe('Circuit Breaker', () => {
  let CircuitBreaker: any;
  let CircuitState: any;
  let createCircuitBreaker: any;
  let getCircuitBreakerHealth: any;
  let ofacCircuitBreaker: any;
  let plaidCircuitBreaker: any;
  let sendgridCircuitBreaker: any;
  let taxFilingCircuitBreaker: any;
  let logger: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    const loggerModule = await import('../../../src/utils/logger');
    logger = loggerModule.logger;

    const module = await import('../../../src/utils/circuit-breaker');
    CircuitBreaker = module.CircuitBreaker;
    CircuitState = module.CircuitState;
    createCircuitBreaker = module.createCircuitBreaker;
    getCircuitBreakerHealth = module.getCircuitBreakerHealth;
    ofacCircuitBreaker = module.ofacCircuitBreaker;
    plaidCircuitBreaker = module.plaidCircuitBreaker;
    sendgridCircuitBreaker = module.sendgridCircuitBreaker;
    taxFilingCircuitBreaker = module.taxFilingCircuitBreaker;
  });

  afterEach(() => {
    jest.clearAllMocks();
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

  describe('CircuitBreaker class', () => {
    it('should start in CLOSED state', () => {
      const cb = new CircuitBreaker({ name: 'test' });
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should execute function successfully', async () => {
      const cb = new CircuitBreaker({ name: 'test' });
      const result = await cb.execute(() => Promise.resolve('success'));
      expect(result).toBe('success');
    });

    it('should propagate errors from executed function', async () => {
      const cb = new CircuitBreaker({ name: 'test' });
      await expect(cb.execute(() => Promise.reject(new Error('test error')))).rejects.toThrow('test error');
    });

    it('should open circuit after failure threshold', async () => {
      const cb = new CircuitBreaker({ 
        name: 'test', 
        failureThreshold: 3,
        requestTimeout: 1000
      });

      for (let i = 0; i < 3; i++) {
        await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
      }

      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it('should reject requests when circuit is open', async () => {
      const cb = new CircuitBreaker({ 
        name: 'test', 
        failureThreshold: 1,
        resetTimeout: 60000
      });

      await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
      
      await expect(cb.execute(() => Promise.resolve('success'))).rejects.toThrow(MockServiceUnavailableError);
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      const cb = new CircuitBreaker({ 
        name: 'test', 
        failureThreshold: 1,
        resetTimeout: 100
      });

      await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
      expect(cb.getState()).toBe(CircuitState.OPEN);

      await new Promise(resolve => setTimeout(resolve, 150));

      // Next call should transition to HALF_OPEN and attempt
      try {
        await cb.execute(() => Promise.resolve('success'));
      } catch (e) {}

      // State depends on whether call succeeded
      expect([CircuitState.HALF_OPEN, CircuitState.CLOSED]).toContain(cb.getState());
    });

    it('should close circuit after success threshold in HALF_OPEN', async () => {
      const cb = new CircuitBreaker({ 
        name: 'test', 
        failureThreshold: 1,
        resetTimeout: 50,
        successThreshold: 2
      });

      // Trip the circuit
      await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
      
      // Wait for reset
      await new Promise(resolve => setTimeout(resolve, 100));

      // Successful calls to close
      await cb.execute(() => Promise.resolve('success'));
      await cb.execute(() => Promise.resolve('success'));

      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reopen circuit on failure in HALF_OPEN', async () => {
      const cb = new CircuitBreaker({ 
        name: 'test', 
        failureThreshold: 1,
        resetTimeout: 50,
        successThreshold: 3
      });

      // Trip the circuit
      await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
      
      // Wait for reset
      await new Promise(resolve => setTimeout(resolve, 100));

      // Fail in HALF_OPEN
      await cb.execute(() => Promise.reject(new Error('fail again'))).catch(() => {});

      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it('should timeout slow requests', async () => {
      const cb = new CircuitBreaker({ 
        name: 'test', 
        requestTimeout: 50
      });

      const slowFn = () => new Promise(resolve => setTimeout(() => resolve('slow'), 200));

      await expect(cb.execute(slowFn)).rejects.toThrow('timed out');
    });

    it('should call onStateChange callback', async () => {
      const onStateChange = jest.fn();
      const cb = new CircuitBreaker({ 
        name: 'test', 
        failureThreshold: 1,
        onStateChange
      });

      await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

      expect(onStateChange).toHaveBeenCalledWith('test', CircuitState.CLOSED, CircuitState.OPEN);
    });

    it('should use custom isFailure filter', async () => {
      const cb = new CircuitBreaker({ 
        name: 'test', 
        failureThreshold: 1,
        isFailure: (error: Error) => !error.message.includes('ignore')
      });

      // This should be ignored
      await cb.execute(() => Promise.reject(new Error('ignore this'))).catch(() => {});
      expect(cb.getState()).toBe(CircuitState.CLOSED);

      // This should count
      await cb.execute(() => Promise.reject(new Error('count this'))).catch(() => {});
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it('should track statistics', async () => {
      const cb = new CircuitBreaker({ name: 'test', failureThreshold: 10 });

      await cb.execute(() => Promise.resolve('success'));
      await cb.execute(() => Promise.resolve('success'));
      await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

      const stats = cb.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.totalSuccesses).toBe(2);
      expect(stats.totalFailures).toBe(1);
    });

    it('should reset manually', async () => {
      const cb = new CircuitBreaker({ 
        name: 'test', 
        failureThreshold: 1
      });

      await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
      expect(cb.getState()).toBe(CircuitState.OPEN);

      cb.reset();
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should trip manually', () => {
      const cb = new CircuitBreaker({ name: 'test' });
      
      cb.trip();
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it('should log state transitions', async () => {
      const cb = new CircuitBreaker({ 
        name: 'test', 
        failureThreshold: 1
      });

      await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'test',
          from: CircuitState.CLOSED,
          to: CircuitState.OPEN
        }),
        'Circuit breaker state changed'
      );
    });

    it('should log when rejecting request due to open circuit', async () => {
      const cb = new CircuitBreaker({ 
        name: 'test', 
        failureThreshold: 1,
        resetTimeout: 60000
      });

      await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
      await cb.execute(() => Promise.resolve('success')).catch(() => {});

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'test',
          state: CircuitState.OPEN
        }),
        expect.stringContaining('OPEN - rejecting request')
      );
    });
  });

  describe('createCircuitBreaker', () => {
    it('should create a new circuit breaker with options', () => {
      const cb = createCircuitBreaker({
        name: 'custom',
        failureThreshold: 10,
        resetTimeout: 5000
      });

      expect(cb).toBeInstanceOf(CircuitBreaker);
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('pre-configured circuit breakers', () => {
    it('should have ofacCircuitBreaker', () => {
      expect(ofacCircuitBreaker).toBeInstanceOf(CircuitBreaker);
      ofacCircuitBreaker.reset();
    });

    it('should have plaidCircuitBreaker', () => {
      expect(plaidCircuitBreaker).toBeInstanceOf(CircuitBreaker);
      plaidCircuitBreaker.reset();
    });

    it('should have sendgridCircuitBreaker', () => {
      expect(sendgridCircuitBreaker).toBeInstanceOf(CircuitBreaker);
      sendgridCircuitBreaker.reset();
    });

    it('should have taxFilingCircuitBreaker', () => {
      expect(taxFilingCircuitBreaker).toBeInstanceOf(CircuitBreaker);
      taxFilingCircuitBreaker.reset();
    });
  });

  describe('getCircuitBreakerHealth', () => {
    beforeEach(() => {
      // Reset all breakers
      ofacCircuitBreaker.reset();
      plaidCircuitBreaker.reset();
      sendgridCircuitBreaker.reset();
      taxFilingCircuitBreaker.reset();
    });

    it('should return health for all circuit breakers', () => {
      const health = getCircuitBreakerHealth();

      expect(health).toHaveProperty('ofac');
      expect(health).toHaveProperty('plaid');
      expect(health).toHaveProperty('sendgrid');
      expect(health).toHaveProperty('taxFiling');
    });

    it('should report healthy when circuits are closed', () => {
      const health = getCircuitBreakerHealth();

      expect(health.ofac.healthy).toBe(true);
      expect(health.ofac.state).toBe(CircuitState.CLOSED);
    });

    it('should report unhealthy when circuit is open', () => {
      ofacCircuitBreaker.trip();

      const health = getCircuitBreakerHealth();

      expect(health.ofac.healthy).toBe(false);
      expect(health.ofac.state).toBe(CircuitState.OPEN);
    });

    it('should include stats in health report', () => {
      const health = getCircuitBreakerHealth();

      expect(health.ofac.stats).toHaveProperty('totalRequests');
      expect(health.ofac.stats).toHaveProperty('totalFailures');
      expect(health.ofac.stats).toHaveProperty('totalSuccesses');
    });
  });

  describe('default export', () => {
    it('should export all components', async () => {
      const module = await import('../../../src/utils/circuit-breaker');

      expect(module.default).toHaveProperty('CircuitBreaker');
      expect(module.default).toHaveProperty('CircuitState');
      expect(module.default).toHaveProperty('ofacCircuitBreaker');
      expect(module.default).toHaveProperty('plaidCircuitBreaker');
      expect(module.default).toHaveProperty('sendgridCircuitBreaker');
      expect(module.default).toHaveProperty('taxFilingCircuitBreaker');
      expect(module.default).toHaveProperty('createCircuitBreaker');
      expect(module.default).toHaveProperty('getCircuitBreakerHealth');
    });
  });
});

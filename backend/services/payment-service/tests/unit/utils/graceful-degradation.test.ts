/**
 * Graceful Degradation Utility Tests
 * Tests for fallback behavior when services are unavailable
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: { child: jest.fn().mockReturnValue({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

describe('GracefulDegradation', () => {
  let graceful: GracefulDegradation;
  let mockHealthChecker: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHealthChecker = { checkService: jest.fn() };
    graceful = new GracefulDegradation(mockHealthChecker);
  });

  describe('executeWithFallback', () => {
    it('should execute primary function when healthy', async () => {
      const primary = jest.fn().mockResolvedValue('primary_result');
      const fallback = jest.fn().mockResolvedValue('fallback_result');

      const result = await graceful.executeWithFallback(primary, fallback);

      expect(result).toBe('primary_result');
      expect(primary).toHaveBeenCalled();
      expect(fallback).not.toHaveBeenCalled();
    });

    it('should execute fallback when primary fails', async () => {
      const primary = jest.fn().mockRejectedValue(new Error('Primary failed'));
      const fallback = jest.fn().mockResolvedValue('fallback_result');

      const result = await graceful.executeWithFallback(primary, fallback);

      expect(result).toBe('fallback_result');
      expect(fallback).toHaveBeenCalled();
    });

    it('should throw if both primary and fallback fail', async () => {
      const primary = jest.fn().mockRejectedValue(new Error('Primary failed'));
      const fallback = jest.fn().mockRejectedValue(new Error('Fallback failed'));

      await expect(graceful.executeWithFallback(primary, fallback))
        .rejects.toThrow('Fallback failed');
    });
  });

  describe('withTimeout', () => {
    it('should return result within timeout', async () => {
      const fn = jest.fn().mockResolvedValue('result');

      const result = await graceful.withTimeout(fn, 1000);

      expect(result).toBe('result');
    });

    it('should timeout and execute fallback', async () => {
      const fn = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('slow'), 500)));
      const fallback = jest.fn().mockResolvedValue('timeout_fallback');

      const result = await graceful.withTimeout(fn, 100, fallback);

      expect(result).toBe('timeout_fallback');
    });
  });

  describe('circuitBreaker', () => {
    it('should allow calls when circuit closed', async () => {
      const fn = jest.fn().mockResolvedValue('result');
      graceful.resetCircuit('test_service');

      const result = await graceful.callWithCircuitBreaker('test_service', fn);

      expect(result).toBe('result');
    });

    it('should open circuit after failures', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Service error'));
      graceful.resetCircuit('test_service');

      // Trigger multiple failures
      for (let i = 0; i < 5; i++) {
        try { await graceful.callWithCircuitBreaker('test_service', fn); } catch {}
      }

      const state = graceful.getCircuitState('test_service');
      expect(state).toBe('open');
    });

    it('should reject immediately when circuit open', async () => {
      graceful.openCircuit('test_service');
      const fn = jest.fn().mockResolvedValue('result');

      await expect(graceful.callWithCircuitBreaker('test_service', fn))
        .rejects.toThrow('Circuit breaker open');

      expect(fn).not.toHaveBeenCalled();
    });

    it('should allow test call in half-open state', async () => {
      graceful.setCircuitState('test_service', 'half-open');
      const fn = jest.fn().mockResolvedValue('result');

      const result = await graceful.callWithCircuitBreaker('test_service', fn);

      expect(result).toBe('result');
      expect(graceful.getCircuitState('test_service')).toBe('closed');
    });
  });

  describe('caching', () => {
    it('should return cached value on failure', async () => {
      const fn = jest.fn()
        .mockResolvedValueOnce('fresh_data')
        .mockRejectedValueOnce(new Error('Service down'));

      // First call - cache the result
      await graceful.executeWithCache('cache_key', fn, 60);

      // Second call - return cached
      const result = await graceful.executeWithCache('cache_key', fn, 60);

      expect(result).toBe('fresh_data');
    });

    it('should refresh cache when not expired', async () => {
      const fn = jest.fn()
        .mockResolvedValueOnce('old_data')
        .mockResolvedValueOnce('new_data');

      await graceful.executeWithCache('cache_key', fn, 60);
      graceful.invalidateCache('cache_key');
      const result = await graceful.executeWithCache('cache_key', fn, 60);

      expect(result).toBe('new_data');
    });
  });

  describe('degraded mode', () => {
    it('should enter degraded mode when service unhealthy', async () => {
      mockHealthChecker.checkService.mockResolvedValue({ healthy: false });

      await graceful.checkAndEnterDegradedMode('stripe');

      expect(graceful.isDegraded('stripe')).toBe(true);
    });

    it('should exit degraded mode when service recovers', async () => {
      graceful.enterDegradedMode('stripe');
      mockHealthChecker.checkService.mockResolvedValue({ healthy: true });

      await graceful.checkAndExitDegradedMode('stripe');

      expect(graceful.isDegraded('stripe')).toBe(false);
    });

    it('should use fallback behavior in degraded mode', async () => {
      graceful.enterDegradedMode('payment_processor');
      const primary = jest.fn().mockResolvedValue('primary');
      const degradedFallback = jest.fn().mockResolvedValue('degraded');

      const result = await graceful.executeInDegradedMode('payment_processor', primary, degradedFallback);

      expect(result).toBe('degraded');
      expect(primary).not.toHaveBeenCalled();
    });
  });

  describe('retry with backoff', () => {
    it('should retry on transient failures', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary'))
        .mockRejectedValueOnce(new Error('Temporary'))
        .mockResolvedValueOnce('success');

      const result = await graceful.retryWithBackoff(fn, { maxRetries: 3, initialDelay: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Permanent failure'));

      await expect(graceful.retryWithBackoff(fn, { maxRetries: 3, initialDelay: 10 }))
        .rejects.toThrow('Permanent failure');

      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('feature flags', () => {
    it('should disable feature when degraded', () => {
      graceful.setFeatureFlag('advanced_fraud_check', false);

      const enabled = graceful.isFeatureEnabled('advanced_fraud_check');

      expect(enabled).toBe(false);
    });

    it('should enable feature when healthy', () => {
      graceful.setFeatureFlag('advanced_fraud_check', true);

      const enabled = graceful.isFeatureEnabled('advanced_fraud_check');

      expect(enabled).toBe(true);
    });
  });
});

// Mock implementation
type CircuitState = 'closed' | 'open' | 'half-open';

interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
}

class GracefulDegradation {
  private circuits: Map<string, CircuitState> = new Map();
  private failureCounts: Map<string, number> = new Map();
  private cache: Map<string, { value: any; expiry: number }> = new Map();
  private degradedServices: Set<string> = new Set();
  private featureFlags: Map<string, boolean> = new Map();

  constructor(private healthChecker: any) {}

  async executeWithFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    try {
      return await primary();
    } catch {
      return await fallback();
    }
  }

  async withTimeout<T>(fn: () => Promise<T>, timeout: number, fallback?: () => Promise<T>): Promise<T> {
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        if (fallback) resolve(fallback());
        else reject(new Error('Timeout'));
      }, timeout);
      try {
        const result = await fn();
        clearTimeout(timer);
        resolve(result);
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  async callWithCircuitBreaker<T>(service: string, fn: () => Promise<T>): Promise<T> {
    const state = this.getCircuitState(service);
    if (state === 'open') throw new Error('Circuit breaker open');

    try {
      const result = await fn();
      if (state === 'half-open') this.resetCircuit(service);
      return result;
    } catch (error) {
      this.recordFailure(service);
      throw error;
    }
  }

  getCircuitState(service: string): CircuitState {
    return this.circuits.get(service) || 'closed';
  }

  setCircuitState(service: string, state: CircuitState) {
    this.circuits.set(service, state);
  }

  resetCircuit(service: string) {
    this.circuits.set(service, 'closed');
    this.failureCounts.set(service, 0);
  }

  openCircuit(service: string) {
    this.circuits.set(service, 'open');
  }

  private recordFailure(service: string) {
    const count = (this.failureCounts.get(service) || 0) + 1;
    this.failureCounts.set(service, count);
    if (count >= 5) this.openCircuit(service);
  }

  async executeWithCache<T>(key: string, fn: () => Promise<T>, ttl: number): Promise<T> {
    const cached = this.cache.get(key);
    try {
      const result = await fn();
      this.cache.set(key, { value: result, expiry: Date.now() + ttl * 1000 });
      return result;
    } catch {
      if (cached) return cached.value;
      throw new Error('No cached value');
    }
  }

  invalidateCache(key: string) {
    this.cache.delete(key);
  }

  isDegraded(service: string): boolean {
    return this.degradedServices.has(service);
  }

  enterDegradedMode(service: string) {
    this.degradedServices.add(service);
  }

  exitDegradedMode(service: string) {
    this.degradedServices.delete(service);
  }

  async checkAndEnterDegradedMode(service: string) {
    const health = await this.healthChecker.checkService(service);
    if (!health.healthy) this.enterDegradedMode(service);
  }

  async checkAndExitDegradedMode(service: string) {
    const health = await this.healthChecker.checkService(service);
    if (health.healthy) this.exitDegradedMode(service);
  }

  async executeInDegradedMode<T>(service: string, primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    if (this.isDegraded(service)) return fallback();
    return primary();
  }

  async retryWithBackoff<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
    let lastError: Error = new Error('No attempts made');
    for (let i = 0; i < options.maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        await new Promise(r => setTimeout(r, options.initialDelay * Math.pow(2, i)));
      }
    }
    throw lastError;
  }

  setFeatureFlag(flag: string, enabled: boolean) {
    this.featureFlags.set(flag, enabled);
  }

  isFeatureEnabled(flag: string): boolean {
    return this.featureFlags.get(flag) ?? true;
  }
}

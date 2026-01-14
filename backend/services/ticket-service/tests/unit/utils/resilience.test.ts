/**
 * Unit Tests for src/utils/resilience.ts
 */

// Mock dependencies before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

jest.mock('../../../src/utils/metrics', () => ({
  registry: {
    registerMetric: jest.fn(),
  },
}));

import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  retryWithBackoff,
  cacheWithFallback,
  degradedService,
  withTimeout,
  TimeoutError,
  Bulkhead,
  isFeatureEnabled,
  setFeatureFlag,
  getAllFeatureFlags,
  removeFeatureFlag,
  getFeatureFlag,
} from '../../../src/utils/resilience';

describe('utils/resilience', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Feature Flags', () => {
    describe('isFeatureEnabled()', () => {
      it('returns false for unknown flag', () => {
        expect(isFeatureEnabled('nonexistent_flag')).toBe(false);
      });

      it('returns static value when no conditions', () => {
        setFeatureFlag({ name: 'test_flag', enabled: true });
        expect(isFeatureEnabled('test_flag')).toBe(true);

        setFeatureFlag({ name: 'test_flag', enabled: false });
        expect(isFeatureEnabled('test_flag')).toBe(false);
      });

      it('evaluates tenant condition against allowlist', () => {
        setFeatureFlag({
          name: 'tenant_flag',
          enabled: true,
          conditions: [{ type: 'tenant', value: ['tenant-1', 'tenant-2'] }],
        });

        expect(isFeatureEnabled('tenant_flag', { tenantId: 'tenant-1' })).toBe(true);
        expect(isFeatureEnabled('tenant_flag', { tenantId: 'tenant-3' })).toBe(false);
      });

      it('evaluates user condition against allowlist', () => {
        setFeatureFlag({
          name: 'user_flag',
          enabled: true,
          conditions: [{ type: 'user', value: ['user-1'] }],
        });

        expect(isFeatureEnabled('user_flag', { userId: 'user-1' })).toBe(true);
        expect(isFeatureEnabled('user_flag', { userId: 'user-2' })).toBe(false);
      });

      it('evaluates environment condition', () => {
        setFeatureFlag({
          name: 'env_flag',
          enabled: true,
          conditions: [{ type: 'environment', value: ['test', 'development'] }],
        });

        expect(isFeatureEnabled('env_flag', { environment: 'test' })).toBe(true);
        expect(isFeatureEnabled('env_flag', { environment: 'production' })).toBe(false);
      });

      it('evaluates time condition with start/end', () => {
        const now = new Date();
        const past = new Date(now.getTime() - 100000);
        const future = new Date(now.getTime() + 100000);

        setFeatureFlag({
          name: 'time_flag',
          enabled: true,
          conditions: [{ type: 'time', value: { start: past.toISOString(), end: future.toISOString() } }],
        });

        expect(isFeatureEnabled('time_flag')).toBe(true);
      });
    });

    describe('setFeatureFlag()', () => {
      it('adds/updates flag in store', () => {
        setFeatureFlag({ name: 'new_flag', enabled: true });
        expect(isFeatureEnabled('new_flag')).toBe(true);

        setFeatureFlag({ name: 'new_flag', enabled: false });
        expect(isFeatureEnabled('new_flag')).toBe(false);
      });
    });

    describe('getAllFeatureFlags()', () => {
      it('returns all flags', () => {
        const flags = getAllFeatureFlags();
        expect(Array.isArray(flags)).toBe(true);
      });
    });

    describe('removeFeatureFlag()', () => {
      it('removes flag from store', () => {
        setFeatureFlag({ name: 'to_remove', enabled: true });
        expect(isFeatureEnabled('to_remove')).toBe(true);

        removeFeatureFlag('to_remove');
        expect(isFeatureEnabled('to_remove')).toBe(false);
      });
    });

    describe('getFeatureFlag()', () => {
      it('returns flag by name', () => {
        setFeatureFlag({ name: 'get_test', enabled: true, description: 'Test flag' });
        const flag = getFeatureFlag('get_test');
        expect(flag?.name).toBe('get_test');
        expect(flag?.enabled).toBe(true);
      });

      it('returns undefined for missing flag', () => {
        expect(getFeatureFlag('nonexistent')).toBeUndefined();
      });
    });
  });

  describe('CircuitBreaker', () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
      // Disable metrics for testing
      setFeatureFlag({ name: 'circuit_breaker.metrics.enabled', enabled: false });
      setFeatureFlag({ name: 'circuit_breaker.enabled', enabled: true });
      setFeatureFlag({ name: 'circuit_breaker.fallback.enabled', enabled: true });

      breaker = new CircuitBreaker({
        name: 'test-breaker',
        failureThreshold: 3,
        resetTimeout: 1000,
        halfOpenSuccessThreshold: 2,
        timeout: 500,
      });
    });

    describe('constructor', () => {
      it('initializes state as CLOSED', () => {
        expect(breaker.getState().state).toBe('CLOSED');
      });
    });

    describe('execute()', () => {
      it('runs function when CLOSED', async () => {
        const result = await breaker.execute(async () => 'success');
        expect(result).toBe('success');
      });

      it('transitions to OPEN after failureThreshold failures', async () => {
        for (let i = 0; i < 3; i++) {
          await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
        }
        expect(breaker.getState().state).toBe('OPEN');
      });

      it('rejects and uses fallback when OPEN', async () => {
        // Force to OPEN
        for (let i = 0; i < 3; i++) {
          await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
        }

        const result = await breaker.execute(
          async () => 'primary',
          async () => 'fallback'
        );
        expect(result).toBe('fallback');
      });

      it('throws CircuitBreakerOpenError when OPEN without fallback', async () => {
        for (let i = 0; i < 3; i++) {
          await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
        }

        await expect(breaker.execute(async () => 'test')).rejects.toThrow(CircuitBreakerOpenError);
      });

      it('bypasses circuit when feature flag disabled', async () => {
        setFeatureFlag({ name: 'circuit_breaker.enabled', enabled: false });
        
        const newBreaker = new CircuitBreaker({ name: 'bypass-test' });
        const result = await newBreaker.execute(async () => 'bypassed');
        expect(result).toBe('bypassed');
      });
    });

    describe('onSuccess()', () => {
      it('resets failureCount when CLOSED', async () => {
        await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
        expect(breaker.getState().failureCount).toBe(1);

        await breaker.execute(async () => 'success');
        expect(breaker.getState().failureCount).toBe(0);
      });
    });

    describe('onFailure()', () => {
      it('increments failureCount', async () => {
        await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
        expect(breaker.getState().failureCount).toBe(1);
      });
    });

    describe('getState()', () => {
      it('returns copy of state', () => {
        const state = breaker.getState();
        expect(state).toHaveProperty('state');
        expect(state).toHaveProperty('failureCount');
        expect(state).toHaveProperty('successCount');
      });
    });

    describe('isOpen()', () => {
      it('returns correct boolean', async () => {
        expect(breaker.isOpen()).toBe(false);

        for (let i = 0; i < 3; i++) {
          await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
        }

        expect(breaker.isOpen()).toBe(true);
      });
    });

    describe('reset()', () => {
      it('transitions to CLOSED', async () => {
        for (let i = 0; i < 3; i++) {
          await breaker.execute(async () => { throw new Error('fail'); }).catch(() => {});
        }
        expect(breaker.isOpen()).toBe(true);

        breaker.reset();
        expect(breaker.getState().state).toBe('CLOSED');
      });
    });
  });

  describe('CircuitBreakerOpenError', () => {
    it('sets name to CircuitBreakerOpenError', () => {
      const error = new CircuitBreakerOpenError('test');
      expect(error.name).toBe('CircuitBreakerOpenError');
    });

    it('message includes circuit breaker name', () => {
      const error = new CircuitBreakerOpenError('my-service');
      expect(error.message).toContain('my-service');
    });
  });

  describe('retryWithBackoff', () => {
    it('returns result on first success', async () => {
      const result = await retryWithBackoff(async () => 'success');
      expect(result).toBe('success');
    });

    it('retries up to maxAttempts on failure', async () => {
      let attempts = 0;
      await expect(
        retryWithBackoff(async () => {
          attempts++;
          throw new Error('fail');
        }, { maxAttempts: 3, baseDelayMs: 10 })
      ).rejects.toThrow('fail');
      expect(attempts).toBe(3);
    });

    it('respects retryOn condition', async () => {
      let attempts = 0;
      await expect(
        retryWithBackoff(
          async () => {
            attempts++;
            throw new Error('no-retry');
          },
          {
            maxAttempts: 3,
            baseDelayMs: 10,
            retryOn: (err) => err.message !== 'no-retry',
          }
        )
      ).rejects.toThrow('no-retry');
      expect(attempts).toBe(1);
    });

    it('throws last error after all attempts fail', async () => {
      await expect(
        retryWithBackoff(async () => { throw new Error('final'); }, { maxAttempts: 2, baseDelayMs: 10 })
      ).rejects.toThrow('final');
    });
  });

  describe('cacheWithFallback', () => {
    it('returns cached value on hit', async () => {
      const result = await cacheWithFallback(
        { key: 'test', ttlSeconds: 60, fallback: async () => 'from-source' },
        async () => JSON.stringify('from-cache'),
        async () => {}
      );
      expect(result).toBe('from-cache');
    });

    it('calls fallback on cache miss', async () => {
      const result = await cacheWithFallback(
        { key: 'test', ttlSeconds: 60, fallback: async () => 'from-source' },
        async () => null,
        async () => {}
      );
      expect(result).toBe('from-source');
    });

    it('stores result in cache after fallback', async () => {
      const mockSet = jest.fn();
      await cacheWithFallback(
        { key: 'test', ttlSeconds: 60, fallback: async () => 'from-source' },
        async () => null,
        mockSet
      );
      expect(mockSet).toHaveBeenCalled();
    });
  });

  describe('DegradedServiceManager', () => {
    describe('registerService()', () => {
      it('adds service with healthy status', () => {
        degradedService.registerService('new-service');
        expect(degradedService.isServiceHealthy('new-service')).toBe(true);
      });
    });

    describe('markHealthy()', () => {
      it('sets healthy=true, degraded=false', () => {
        degradedService.markDegraded('database', 'slow queries');
        degradedService.markHealthy('database');
        expect(degradedService.isServiceHealthy('database')).toBe(true);
        expect(degradedService.isServiceDegraded('database')).toBe(false);
      });
    });

    describe('markDegraded()', () => {
      it('sets healthy=true, degraded=true', () => {
        degradedService.markDegraded('database', 'slow queries');
        expect(degradedService.isServiceHealthy('database')).toBe(true);
        expect(degradedService.isServiceDegraded('database')).toBe(true);
      });
    });

    describe('markUnhealthy()', () => {
      it('sets healthy=false', () => {
        degradedService.markUnhealthy('database', 'connection failed');
        expect(degradedService.isServiceHealthy('database')).toBe(false);
      });
    });

    describe('feature degradation', () => {
      it('enableDegradedFeature adds to set', () => {
        degradedService.enableDegradedFeature('nft-minting');
        expect(degradedService.isFeatureDegraded('nft-minting')).toBe(true);
      });

      it('disableDegradedFeature removes from set', () => {
        degradedService.enableDegradedFeature('nft-minting');
        degradedService.disableDegradedFeature('nft-minting');
        expect(degradedService.isFeatureDegraded('nft-minting')).toBe(false);
      });
    });

    describe('getOverallStatus()', () => {
      beforeEach(() => {
        // Reset services
        degradedService.markHealthy('database');
        degradedService.markHealthy('redis');
        degradedService.markHealthy('solana');
        degradedService.markHealthy('notification');
      });

      it('returns healthy=false if any service unhealthy', () => {
        degradedService.markUnhealthy('database');
        const status = degradedService.getOverallStatus();
        expect(status.healthy).toBe(false);
      });

      it('returns degraded=true if any service degraded', () => {
        degradedService.markDegraded('redis');
        const status = degradedService.getOverallStatus();
        expect(status.degraded).toBe(true);
      });

      it('includes degradedFeatures list', () => {
        degradedService.enableDegradedFeature('test-feature');
        const status = degradedService.getOverallStatus();
        expect(status.degradedFeatures).toContain('test-feature');
        degradedService.disableDegradedFeature('test-feature');
      });
    });
  });

  describe('withTimeout', () => {
    it('returns result if function completes in time', async () => {
      const result = await withTimeout(async () => 'fast', 1000);
      expect(result).toBe('fast');
    });

    it('throws TimeoutError if function exceeds timeout', async () => {
      await expect(
        withTimeout(async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return 'slow';
        }, 50)
      ).rejects.toThrow(TimeoutError);
    });

    it('uses custom error message', async () => {
      await expect(
        withTimeout(async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
        }, 50, 'Custom timeout message')
      ).rejects.toThrow('Custom timeout message');
    });
  });

  describe('Bulkhead', () => {
    it('executes immediately when under maxConcurrent', async () => {
      const bulkhead = new Bulkhead(5);
      const result = await bulkhead.execute(async () => 'done');
      expect(result).toBe('done');
    });

    it('throws when queue is full', async () => {
      const bulkhead = new Bulkhead(1, 1);

      // Start a long-running task
      const longTask = bulkhead.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        return 'long';
      });

      // Queue one more
      const queuedTask = bulkhead.execute(async () => 'queued');

      // Third should fail
      await expect(bulkhead.execute(async () => 'overflow')).rejects.toThrow('queue full');

      // Cleanup
      await Promise.race([longTask, new Promise(resolve => setTimeout(resolve, 600))]);
    });

    it('getStatus returns running and queued counts', () => {
      const bulkhead = new Bulkhead(5, 10);
      const status = bulkhead.getStatus();
      expect(status).toHaveProperty('running');
      expect(status).toHaveProperty('queued');
    });
  });
});

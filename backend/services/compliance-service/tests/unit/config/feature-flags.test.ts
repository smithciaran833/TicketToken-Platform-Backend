/**
 * Unit Tests for Feature Flags Configuration
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createMockRequest, createMockReply } from '../../setup';

// Mock dependencies before imports
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/config/redis');

describe('Feature Flags Configuration', () => {
  let logger: any;
  let mockRedisClient: any;
  let getRedisClient: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    
    // Mock logger
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    
    // Mock Redis client
    mockRedisClient = {
      set: jest.fn<any>().mockResolvedValue('OK'),
      get: jest.fn<any>().mockResolvedValue(null),
      keys: jest.fn<any>().mockResolvedValue([])
    };
    
    getRedisClient = jest.fn().mockReturnValue(mockRedisClient);
    
    // Setup mocks
    jest.doMock('../../../src/utils/logger', () => ({ logger }));
    jest.doMock('../../../src/config/redis', () => ({ getRedisClient }));
    
    // Set test env
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isFeatureEnabled', () => {
    it('should return false for unknown feature flag', async () => {
      const { isFeatureEnabled } = await import('../../../src/config/feature-flags');
      
      const result = isFeatureEnabled('UNKNOWN_FLAG');
      
      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        { flagName: 'UNKNOWN_FLAG' },
        'Unknown feature flag requested'
      );
    });

    it('should return true for enabled flag at 100% rollout', async () => {
      process.env.FEATURE_GDPR_EXPORT_V2 = 'true';
      jest.resetModules();
      
      const { isFeatureEnabled } = await import('../../../src/config/feature-flags');
      
      const result = isFeatureEnabled('GDPR_EXPORT_V2');
      
      expect(result).toBe(true);
    });

    it('should return false for disabled flag', async () => {
      process.env.FEATURE_RISK_ML_SCORING = 'false';
      jest.resetModules();
      
      const { isFeatureEnabled } = await import('../../../src/config/feature-flags');
      
      const result = isFeatureEnabled('RISK_ML_SCORING');
      
      expect(result).toBe(false);
    });

    it('should honor tenant override when set to true', async () => {
      const { isFeatureEnabled, setTenantOverride } = await import('../../../src/config/feature-flags');
      
      // Set override for specific tenant
      await setTenantOverride('RISK_ML_SCORING', 'tenant-123', true);
      
      const result = isFeatureEnabled('RISK_ML_SCORING', { tenantId: 'tenant-123' });
      
      expect(result).toBe(true);
    });

    it('should honor tenant override when set to false', async () => {
      process.env.FEATURE_GDPR_EXPORT_V2 = 'true';
      jest.resetModules();
      
      const { isFeatureEnabled, setTenantOverride } = await import('../../../src/config/feature-flags');
      
      await setTenantOverride('GDPR_EXPORT_V2', 'tenant-456', false);
      
      const result = isFeatureEnabled('GDPR_EXPORT_V2', { tenantId: 'tenant-456' });
      
      expect(result).toBe(false);
    });

    it('should use rollout percentage with consistent hashing', async () => {
      process.env.FEATURE_RISK_AUTO_FLAG = 'true';
      jest.resetModules();
      
      const { isFeatureEnabled } = await import('../../../src/config/feature-flags');
      
      // Same user should get consistent result
      const result1 = isFeatureEnabled('RISK_AUTO_FLAG', { userId: 'user-123' });
      const result2 = isFeatureEnabled('RISK_AUTO_FLAG', { userId: 'user-123' });
      
      expect(result1).toBe(result2);
    });

    it('should distribute rollout percentage across users', async () => {
      process.env.FEATURE_RISK_AUTO_FLAG = 'true';
      jest.resetModules();
      
      const { isFeatureEnabled } = await import('../../../src/config/feature-flags');
      
      // Test with multiple users - should get mix of true/false
      const results = [];
      for (let i = 0; i < 100; i++) {
        results.push(isFeatureEnabled('RISK_AUTO_FLAG', { userId: `user-${i}` }));
      }
      
      const enabledCount = results.filter(r => r).length;
      
      // With 50% rollout, expect roughly 40-60 enabled
      expect(enabledCount).toBeGreaterThan(30);
      expect(enabledCount).toBeLessThan(70);
    });
  });

  describe('getAllFeatureFlags', () => {
    it('should return all feature flags', async () => {
      const { getAllFeatureFlags } = await import('../../../src/config/feature-flags');
      
      const flags = getAllFeatureFlags();
      
      expect(flags).toHaveProperty('GDPR_EXPORT_V2');
      expect(flags).toHaveProperty('RISK_ML_SCORING');
      expect(flags).toHaveProperty('OFAC_ENHANCED_SCREENING');
    });

    it('should return a copy of flags, not reference', async () => {
      const { getAllFeatureFlags } = await import('../../../src/config/feature-flags');
      
      const flags1 = getAllFeatureFlags();
      const flags2 = getAllFeatureFlags();
      
      expect(flags1).not.toBe(flags2);
      expect(flags1).toEqual(flags2);
    });
  });

  describe('getFeatureFlag', () => {
    it('should return specific feature flag', async () => {
      const { getFeatureFlag } = await import('../../../src/config/feature-flags');
      
      const flag = getFeatureFlag('GDPR_EXPORT_V2');
      
      expect(flag).toBeDefined();
      expect(flag?.name).toBe('GDPR_EXPORT_V2');
      expect(flag?.metadata).toHaveProperty('owner');
    });

    it('should return undefined for unknown flag', async () => {
      const { getFeatureFlag } = await import('../../../src/config/feature-flags');
      
      const flag = getFeatureFlag('UNKNOWN_FLAG');
      
      expect(flag).toBeUndefined();
    });
  });

  describe('updateFeatureFlag', () => {
    it('should update feature flag in cache', async () => {
      const { updateFeatureFlag, getFeatureFlag } = await import('../../../src/config/feature-flags');
      
      await updateFeatureFlag('GDPR_EXPORT_V2', { enabled: false });
      
      const flag = getFeatureFlag('GDPR_EXPORT_V2');
      expect(flag?.enabled).toBe(false);
    });

    it('should update metadata timestamp', async () => {
      const { updateFeatureFlag, getFeatureFlag } = await import('../../../src/config/feature-flags');
      
      const beforeUpdate = Date.now();
      await updateFeatureFlag('GDPR_EXPORT_V2', { enabled: false });
      const afterUpdate = Date.now();
      
      const flag = getFeatureFlag('GDPR_EXPORT_V2');
      const updatedAt = new Date(flag!.metadata.updatedAt).getTime();
      
      expect(updatedAt).toBeGreaterThanOrEqual(beforeUpdate);
      expect(updatedAt).toBeLessThanOrEqual(afterUpdate);
    });

    it('should persist to Redis', async () => {
      const { updateFeatureFlag } = await import('../../../src/config/feature-flags');
      
      await updateFeatureFlag('GDPR_EXPORT_V2', { enabled: false });
      
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'feature:flag:GDPR_EXPORT_V2',
        expect.any(String),
        'EX',
        3600
      );
    });

    it('should handle Redis failure gracefully', async () => {
      mockRedisClient.set.mockRejectedValue(new Error('Redis unavailable'));
      
      const { updateFeatureFlag } = await import('../../../src/config/feature-flags');
      
      await expect(updateFeatureFlag('GDPR_EXPORT_V2', { enabled: false })).resolves.not.toThrow();
      
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ flagName: 'GDPR_EXPORT_V2' }),
        'Failed to persist feature flag to Redis'
      );
    });

    it('should throw for unknown flag', async () => {
      const { updateFeatureFlag } = await import('../../../src/config/feature-flags');
      
      await expect(updateFeatureFlag('UNKNOWN_FLAG', { enabled: true }))
        .rejects
        .toThrow('Feature flag UNKNOWN_FLAG not found');
    });
  });

  describe('setTenantOverride', () => {
    it('should set tenant override', async () => {
      const { setTenantOverride, getFeatureFlag } = await import('../../../src/config/feature-flags');
      
      await setTenantOverride('GDPR_EXPORT_V2', 'tenant-123', true);
      
      const flag = getFeatureFlag('GDPR_EXPORT_V2');
      expect(flag?.tenantOverrides['tenant-123']).toBe(true);
    });

    it('should update metadata timestamp', async () => {
      const { setTenantOverride, getFeatureFlag } = await import('../../../src/config/feature-flags');
      
      await setTenantOverride('GDPR_EXPORT_V2', 'tenant-123', true);
      
      const flag = getFeatureFlag('GDPR_EXPORT_V2');
      expect(flag?.metadata.updatedAt).toBeDefined();
    });

    it('should log tenant override', async () => {
      const { setTenantOverride } = await import('../../../src/config/feature-flags');
      
      await setTenantOverride('GDPR_EXPORT_V2', 'tenant-123', true);
      
      expect(logger.info).toHaveBeenCalledWith(
        { flagName: 'GDPR_EXPORT_V2', tenantId: 'tenant-123', enabled: true },
        'Tenant override set'
      );
    });

    it('should throw for unknown flag', async () => {
      const { setTenantOverride } = await import('../../../src/config/feature-flags');
      
      await expect(setTenantOverride('UNKNOWN_FLAG', 'tenant-123', true))
        .rejects
        .toThrow('Feature flag UNKNOWN_FLAG not found');
    });
  });

  describe('loadFeatureFlagsFromRedis', () => {
    it('should load flags from Redis', async () => {
      const mockFlag = {
        name: 'GDPR_EXPORT_V2',
        enabled: false,
        rolloutPercentage: 100,
        tenantOverrides: {},
        metadata: { createdAt: '2026-01-01', updatedAt: '2026-01-05', owner: 'test' }
      };
      
      mockRedisClient.keys.mockResolvedValue(['feature:flag:GDPR_EXPORT_V2']);
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockFlag));
      
      const { loadFeatureFlagsFromRedis, getFeatureFlag } = await import('../../../src/config/feature-flags');
      
      await loadFeatureFlagsFromRedis();
      
      const flag = getFeatureFlag('GDPR_EXPORT_V2');
      expect(flag?.enabled).toBe(false);
    });

    it('should log number of loaded flags', async () => {
      mockRedisClient.keys.mockResolvedValue([
        'feature:flag:FLAG1',
        'feature:flag:FLAG2'
      ]);
      mockRedisClient.get.mockResolvedValue(JSON.stringify({
        name: 'TEST',
        enabled: true,
        rolloutPercentage: 100,
        tenantOverrides: {},
        metadata: { createdAt: '2026-01-01', updatedAt: '2026-01-01', owner: 'test' }
      }));
      
      const { loadFeatureFlagsFromRedis } = await import('../../../src/config/feature-flags');
      
      await loadFeatureFlagsFromRedis();
      
      expect(logger.info).toHaveBeenCalledWith(
        { count: 2 },
        'Feature flags loaded from Redis'
      );
    });

    it('should handle Redis failure gracefully', async () => {
      mockRedisClient.keys.mockRejectedValue(new Error('Redis unavailable'));
      
      const { loadFeatureFlagsFromRedis } = await import('../../../src/config/feature-flags');
      
      await expect(loadFeatureFlagsFromRedis()).resolves.not.toThrow();
      
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Failed to load feature flags from Redis, using defaults'
      );
    });
  });

  describe('requireFeature middleware', () => {
    it('should pass through when feature is enabled', async () => {
      process.env.FEATURE_GDPR_EXPORT_V2 = 'true';
      jest.resetModules();
      
      const { requireFeature } = await import('../../../src/config/feature-flags');
      
      const request = createMockRequest();
      const reply = createMockReply();
      
      const middleware = requireFeature('GDPR_EXPORT_V2');
      await middleware(request, reply);
      
      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should return 404 when feature is disabled', async () => {
      const { requireFeature } = await import('../../../src/config/feature-flags');
      
      const request = createMockRequest();
      const reply = createMockReply();
      
      const middleware = requireFeature('RISK_ML_SCORING');
      await middleware(request, reply);
      
      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 404,
          title: 'Not Found',
          detail: 'This feature is not available'
        })
      );
    });

    it('should extract tenantId from request', async () => {
      process.env.FEATURE_GDPR_EXPORT_V2 = 'true';
      jest.resetModules();
      
      const { requireFeature, setTenantOverride } = await import('../../../src/config/feature-flags');
      
      await setTenantOverride('GDPR_EXPORT_V2', 'tenant-disabled', false);
      
      const request = createMockRequest({ tenantId: 'tenant-disabled' });
      const reply = createMockReply();
      
      const middleware = requireFeature('GDPR_EXPORT_V2');
      await middleware(request, reply);
      
      expect(reply.code).toHaveBeenCalledWith(404);
    });
  });

  describe('DEFAULT_FLAGS', () => {
    it('should load all default flags with metadata', async () => {
      const { getAllFeatureFlags } = await import('../../../src/config/feature-flags');
      
      const flags = getAllFeatureFlags();
      
      Object.values(flags).forEach(flag => {
        expect(flag.name).toBeDefined();
        expect(flag.description).toBeDefined();
        expect(flag.metadata).toHaveProperty('createdAt');
        expect(flag.metadata).toHaveProperty('updatedAt');
        expect(flag.metadata).toHaveProperty('owner');
      });
    });

    it('should parse environment variables for flags', async () => {
      process.env.FEATURE_GDPR_EXPORT_V2 = 'true';
      process.env.FEATURE_RISK_ML_SCORING = 'true';
      jest.resetModules();
      
      const { getFeatureFlag } = await import('../../../src/config/feature-flags');
      
      const flag1 = getFeatureFlag('GDPR_EXPORT_V2');
      const flag2 = getFeatureFlag('RISK_ML_SCORING');
      
      expect(flag1?.enabled).toBe(true);
      expect(flag2?.enabled).toBe(true);
    });
  });
});

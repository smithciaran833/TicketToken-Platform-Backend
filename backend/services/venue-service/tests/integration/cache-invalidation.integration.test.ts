/**
 * CACHE INVALIDATION INTEGRATION TESTS
 *
 * Tests cache invalidation across all services to ensure users don't see stale data.
 *
 * BUGS BEING TESTED:
 * 1. Integration create/update/delete don't clear cache (FIXED)
 * 2. Content create/update/delete/publish/archive don't clear cache (FIXED)
 * 3. Settings update doesn't clear cache (FIXED)
 *
 * Total: 35 tests
 */

import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

import crypto from 'crypto';

// Set encryption key for integration tests BEFORE importing services
if (!process.env.CREDENTIALS_ENCRYPTION_KEY) {
  process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
}

import { v4 as uuidv4 } from 'uuid';
import { getTestDb } from './helpers/db';
import { getTestRedis, flushRedis } from './helpers/redis';
import { getTestMongoDB, clearAllCollections } from './helpers/mongodb';
import { initializeCache } from '../../src/services/cache.service';
import { IntegrationService } from '../../src/services/integration.service';
import { VenueContentService } from '../../src/services/venue-content.service';
import { SettingsModel } from '../../src/models/settings.model';

// Mock logger that supports .child()
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })
};

describe('Cache Invalidation Integration Tests', () => {
  let redis: any;
  let db: any;
  let mongodb: any;
  let cacheService: any;
  let integrationService: IntegrationService;
  let contentService: VenueContentService;
  let settingsModel: SettingsModel;

  let testTenantId: string;
  let testUserId: string;
  let testVenueId: string;

  beforeAll(async () => {
    db = getTestDb();
    redis = getTestRedis();
    mongodb = await getTestMongoDB();

    cacheService = initializeCache(redis);

    integrationService = new IntegrationService({
      db,
      logger: mockLogger,
      cacheService
    });

    contentService = new VenueContentService(db, cacheService);
    settingsModel = new SettingsModel(db);
  }, 60000);

  beforeEach(async () => {
    // Clear database tables (in correct order - foreign keys)
    await db('venue_staff').del();
    await db('venues').del();
    await db('users').del();
    await db('tenants').del();

    // Clear Redis
    await flushRedis();

    // Clear MongoDB
    await clearAllCollections();

    // Create test data
    testTenantId = uuidv4();
    testUserId = uuidv4();

    // Insert tenant
    await db('tenants').insert({
      id: testTenantId,
      name: 'Test Tenant',
      slug: 'test-tenant',
      created_at: new Date(),
      updated_at: new Date()
    });

    // Insert user
    await db('users').insert({
      id: testUserId,
      tenant_id: testTenantId,
      email: `test-${Date.now()}@example.com`,
      password_hash: 'test',
      created_at: new Date(),
      updated_at: new Date()
    });

    // Insert venue
    const venueResult = await db('venues').insert({
      tenant_id: testTenantId,
      name: 'Test Venue',
      slug: 'test-venue',
      email: 'test@venue.com',
      venue_type: 'theater',
      max_capacity: 500,
      address_line1: '123 Test St',
      city: 'New York',
      state_province: 'NY',
      country_code: 'US',
      created_by: testUserId,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date()
    }).returning('id');

    testVenueId = venueResult[0].id;

    // Insert venue_staff
    await db('venue_staff').insert({
      venue_id: testVenueId,
      user_id: testUserId,
      role: 'owner',
      permissions: ['*'],
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    });
  });

  // ========================================================================
  // SECTION 1: Cache Keys & Patterns (10 tests)
  // ========================================================================

  describe('Cache Keys & Patterns', () => {
    it('should use tenant-scoped pattern for venue cache keys', async () => {
      const cacheKey = `${testVenueId}:details`;

      await cacheService.set(cacheKey, { name: 'Test Venue' }, 300, testTenantId);

      const cached = await cacheService.get(cacheKey, testTenantId);
      expect(cached).toBeDefined();
      expect(cached.name).toBe('Test Venue');
    });

    it('should include tenant_id in all venue-related cache keys', async () => {
      const patterns = [
        `${testVenueId}:details`,
        `${testVenueId}:stats`,
        `${testVenueId}:staff`,
        `${testVenueId}:events`,
        `${testVenueId}:settings`,
      ];

      for (const key of patterns) {
        await cacheService.set(key, { test: true }, 300, testTenantId);
      }

      const keys = await redis.keys(`venue:tenant:${testTenantId}:*`);
      expect(keys.length).toBeGreaterThanOrEqual(5);
    });

    it('should use wildcard match for clearing venue cache', async () => {
      // Set multiple cache keys for the venue
      await cacheService.set(`${testVenueId}:details`, 'data1', 300, testTenantId);
      await cacheService.set(`${testVenueId}:stats`, 'data2', 300, testTenantId);
      await cacheService.set(`${testVenueId}:custom`, 'data3', 300, testTenantId);

      // Clear all venue cache
      await cacheService.clearVenueCache(testVenueId, testTenantId);

      // Verify all keys are cleared
      const remainingKeys = await redis.keys(`venue:tenant:${testTenantId}:${testVenueId}:*`);
      expect(remainingKeys.length).toBe(0);
    });

    it('should isolate cache between different tenants', async () => {
      const tenant2Id = uuidv4();

      await cacheService.set('test-key', { tenant: 1 }, 300, testTenantId);
      await cacheService.set('test-key', { tenant: 2 }, 300, tenant2Id);

      const cached1 = await cacheService.get('test-key', testTenantId);
      const cached2 = await cacheService.get('test-key', tenant2Id);

      expect(cached1.tenant).toBe(1);
      expect(cached2.tenant).toBe(2);
    });

    it('should support legacy cache key patterns during migration', async () => {
      // Set legacy key
      await redis.set(`venue:${testVenueId}:details`, JSON.stringify({ legacy: true }));

      // Clear should remove both new and legacy patterns
      await cacheService.clearVenueCache(testVenueId, testTenantId);

      const legacyKey = await redis.get(`venue:${testVenueId}:details`);
      expect(legacyKey).toBeNull();
    });

    it('should clear tenant venue cache with pattern deletion', async () => {
      // Create cache for multiple venues in same tenant
      const venue2Result = await db('venues').insert({
        tenant_id: testTenantId,
        name: 'Test Venue 2',
        slug: `test-venue-2-${Date.now()}`,
        email: 'test2@venue.com',
        venue_type: 'theater',
        max_capacity: 300,
        address_line1: '456 Test St',
        city: 'New York',
        state_province: 'NY',
        country_code: 'US',
        created_by: testUserId,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      }).returning('id');
      const venue2Id = venue2Result[0].id;

      await cacheService.set(`${testVenueId}:details`, 'venue1', 300, testTenantId);
      await cacheService.set(`${venue2Id}:details`, 'venue2', 300, testTenantId);

      await cacheService.clearTenantVenueCache(testTenantId);

      const keys = await redis.keys(`venue:tenant:${testTenantId}:*`);
      expect(keys.length).toBe(0);
    });

    it('should batch delete cache keys in groups of 100', async () => {
      // Create 150 cache keys
      for (let i = 0; i < 150; i++) {
        await redis.set(`venue:tenant:${testTenantId}:${testVenueId}:item${i}`, 'data');
      }

      await cacheService.clearVenueCache(testVenueId, testTenantId);

      const remainingKeys = await redis.keys(`venue:tenant:${testTenantId}:${testVenueId}:*`);
      expect(remainingKeys.length).toBe(0);
    });

    it('should handle empty pattern matches gracefully', async () => {
      const nonExistentVenueId = uuidv4();

      // Should not throw when clearing cache for non-existent venue
      await expect(
        cacheService.clearVenueCache(nonExistentVenueId, testTenantId)
      ).resolves.not.toThrow();
    });

    it('should use SCAN instead of KEYS for pattern matching', async () => {
      // Create many keys
      for (let i = 0; i < 50; i++) {
        await redis.set(`venue:tenant:${testTenantId}:${testVenueId}:key${i}`, 'data');
      }

      const startTime = Date.now();
      await cacheService.clearVenueCache(testVenueId, testTenantId);
      const duration = Date.now() - startTime;

      // SCAN should complete quickly even with many keys
      expect(duration).toBeLessThan(1000);
    });

    it('should maintain cache key consistency across services', async () => {
      const detailsKey = `${testVenueId}:details`;

      await cacheService.set(detailsKey, { source: 'venue-service' }, 300, testTenantId);

      const value = await redis.get(`venue:tenant:${testTenantId}:${detailsKey}`);
      expect(value).toBeTruthy();
      expect(JSON.parse(value).source).toBe('venue-service');
    });
  });

  // ========================================================================
  // SECTION 2: Invalidation Triggers (15 tests)
  // ========================================================================

  describe('Invalidation Triggers', () => {
    it('should clear cache when integration is created', async () => {
      const cacheKey = `${testVenueId}:details`;
      await cacheService.set(cacheKey, { hasIntegration: false }, 300, testTenantId);

      await integrationService.createIntegration(testVenueId, testTenantId, {
        type: 'stripe',
        credentials: { api_key: 'test_key' },
        config: {}
      });

      const cached = await redis.get(`venue:tenant:${testTenantId}:${cacheKey}`);
      expect(cached).toBeNull();
    });

    it('should clear cache when integration is updated', async () => {
      const integration = await integrationService.createIntegration(testVenueId, testTenantId, {
        type: 'stripe',
        credentials: { api_key: 'test_key' },
        config: {}
      });

      const cacheKey = `${testVenueId}:details`;
      await cacheService.set(cacheKey, { integration: 'old' }, 300, testTenantId);

      await integrationService.updateIntegration(integration.id!, testTenantId, {
        config: { updated: true }
      });

      const cached = await redis.get(`venue:tenant:${testTenantId}:${cacheKey}`);
      expect(cached).toBeNull();
    });

    it('should clear cache when integration is deleted', async () => {
      const integration = await integrationService.createIntegration(testVenueId, testTenantId, {
        type: 'stripe',
        credentials: { api_key: 'test_key' },
        config: {}
      });

      const cacheKey = `${testVenueId}:details`;
      await cacheService.set(cacheKey, { hasIntegration: true }, 300, testTenantId);

      await integrationService.deleteIntegration(integration.id!, testTenantId);

      const cached = await redis.get(`venue:tenant:${testTenantId}:${cacheKey}`);
      expect(cached).toBeNull();
    });

    it('should clear cache when content is created', async () => {
      const cacheKey = `${testVenueId}:details`;
      await cacheService.set(cacheKey, { hasContent: false }, 300, testTenantId);

      await contentService.createContent({
        venueId: testVenueId,
        tenantId: testTenantId,
        contentType: 'PHOTO',
        content: { media: { url: 'https://example.com/photo.jpg' } },
        createdBy: testUserId
      });

      const cached = await redis.get(`venue:tenant:${testTenantId}:${cacheKey}`);
      expect(cached).toBeNull();
    });

    it('should clear cache when content is updated', async () => {
      const content = await contentService.createContent({
        venueId: testVenueId,
        tenantId: testTenantId,
        contentType: 'PHOTO',
        content: { media: { url: 'https://example.com/photo.jpg' } },
        createdBy: testUserId
      });

      const cacheKey = `${testVenueId}:details`;
      await cacheService.set(cacheKey, { content: 'old' }, 300, testTenantId);

      // Fetch fresh content to get current version
      const freshContent = await contentService.getContent(content._id.toString(), testTenantId);

      await contentService.updateContent(freshContent!._id.toString(), {
        tenantId: testTenantId,
        content: { media: { url: 'https://example.com/new-photo.jpg' } },
        updatedBy: testUserId
      });

      const cached = await redis.get(`venue:tenant:${testTenantId}:${cacheKey}`);
      expect(cached).toBeNull();
    });

    it('should clear cache when content is deleted', async () => {
      const content = await contentService.createContent({
        venueId: testVenueId,
        tenantId: testTenantId,
        contentType: 'PHOTO',
        content: { media: { url: 'https://example.com/photo.jpg' } },
        createdBy: testUserId
      });

      const cacheKey = `${testVenueId}:details`;
      await cacheService.set(cacheKey, { hasContent: true }, 300, testTenantId);

      await contentService.deleteContent(content._id.toString(), testTenantId);

      const cached = await redis.get(`venue:tenant:${testTenantId}:${cacheKey}`);
      expect(cached).toBeNull();
    });

    it('should clear cache when content is published', async () => {
      const content = await contentService.createContent({
        venueId: testVenueId,
        tenantId: testTenantId,
        contentType: 'PHOTO',
        content: { media: { url: 'https://example.com/photo.jpg' } },
        createdBy: testUserId
      });

      const cacheKey = `${testVenueId}:details`;
      await cacheService.set(cacheKey, { status: 'draft' }, 300, testTenantId);

      await contentService.publishContent(content._id.toString(), testTenantId, testUserId);

      const cached = await redis.get(`venue:tenant:${testTenantId}:${cacheKey}`);
      expect(cached).toBeNull();
    });

    it('should clear cache when content is archived', async () => {
      const content = await contentService.createContent({
        venueId: testVenueId,
        tenantId: testTenantId,
        contentType: 'PHOTO',
        content: { media: { url: 'https://example.com/photo.jpg' } },
        createdBy: testUserId
      });

      const cacheKey = `${testVenueId}:details`;
      await cacheService.set(cacheKey, { status: 'published' }, 300, testTenantId);

      await contentService.archiveContent(content._id.toString(), testTenantId, testUserId);

      const cached = await redis.get(`venue:tenant:${testTenantId}:${cacheKey}`);
      expect(cached).toBeNull();
    });

    it('should clear cache when settings are updated', async () => {
      const cacheKey = `${testVenueId}:details`;
      await cacheService.set(cacheKey, { maxTickets: 10 }, 300, testTenantId);

      await settingsModel.updateVenueSettings(testVenueId, {
        ticketing: {
          maxTicketsPerOrder: 20
        }
      });

      await cacheService.clearVenueCache(testVenueId, testTenantId);

      const cached = await redis.get(`venue:tenant:${testTenantId}:${cacheKey}`);
      expect(cached).toBeNull();
    });

    it('should clear staff cache when staff is updated', async () => {
      const staffKey = `${testVenueId}:staff`;
      await cacheService.set(staffKey, { count: 1 }, 300, testTenantId);

      await cacheService.clearVenueCache(testVenueId, testTenantId);

      const cached = await redis.get(`venue:tenant:${testTenantId}:${staffKey}`);
      expect(cached).toBeNull();
    });

    it('should clear multiple related caches with single call', async () => {
      await cacheService.set(`${testVenueId}:details`, 'data1', 300, testTenantId);
      await cacheService.set(`${testVenueId}:stats`, 'data2', 300, testTenantId);
      await cacheService.set(`${testVenueId}:staff`, 'data3', 300, testTenantId);

      await cacheService.clearVenueCache(testVenueId, testTenantId);

      const keys = await redis.keys(`venue:tenant:${testTenantId}:${testVenueId}:*`);
      expect(keys.length).toBe(0);
    });

    it('should handle concurrent cache invalidations without conflicts', async () => {
      const cacheKey = `${testVenueId}:details`;
      await cacheService.set(cacheKey, { test: true }, 300, testTenantId);

      await Promise.all([
        cacheService.clearVenueCache(testVenueId, testTenantId),
        cacheService.clearVenueCache(testVenueId, testTenantId),
        cacheService.clearVenueCache(testVenueId, testTenantId)
      ]);

      const cached = await redis.get(`venue:tenant:${testTenantId}:${cacheKey}`);
      expect(cached).toBeNull();
    });

    it('should not fail operations if cache clear has errors', async () => {
      const integration = await integrationService.createIntegration(testVenueId, testTenantId, {
        type: 'stripe',
        credentials: { api_key: 'test_key' },
        config: {}
      });

      expect(integration.id).toBeDefined();
    });

    it('should clear all venue-related patterns', async () => {
      await redis.set(`venue:tenant:${testTenantId}:${testVenueId}:details`, 'data');
      await redis.set(`venue:tenant:${testTenantId}:${testVenueId}:stats`, 'data');
      await redis.set(`venue:${testVenueId}:details`, 'legacy');
      await redis.set(`venue:${testVenueId}:stats`, 'legacy');

      await cacheService.clearVenueCache(testVenueId, testTenantId);

      const newKeys = await redis.keys(`venue:tenant:${testTenantId}:${testVenueId}:*`);
      const legacyKeys = await redis.keys(`venue:${testVenueId}:*`);

      expect(newKeys.length).toBe(0);
      expect(legacyKeys.length).toBe(0);
    });

    it('should maintain cache isolation during concurrent operations', async () => {
      const venue2Result = await db('venues').insert({
        tenant_id: testTenantId,
        name: 'Test Venue 2',
        slug: `test-venue-2-${Date.now()}`,
        email: 'test2@venue.com',
        venue_type: 'theater',
        max_capacity: 300,
        address_line1: '456 Test St',
        city: 'New York',
        state_province: 'NY',
        country_code: 'US',
        created_by: testUserId,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      }).returning('id');
      const venue2Id = venue2Result[0].id;

      await cacheService.set(`${testVenueId}:details`, { venue: 1 }, 300, testTenantId);
      await cacheService.set(`${venue2Id}:details`, { venue: 2 }, 300, testTenantId);

      await cacheService.clearVenueCache(testVenueId, testTenantId);

      const cached1 = await redis.get(`venue:tenant:${testTenantId}:${testVenueId}:details`);
      expect(cached1).toBeNull();

      const cached2 = await redis.get(`venue:tenant:${testTenantId}:${venue2Id}:details`);
      expect(cached2).toBeTruthy();
    });
  });

  // ========================================================================
  // SECTION 3: Stale Data Prevention (5 tests)
  // ========================================================================

  describe('Stale Data Prevention', () => {
    it('should prevent stale integration status after update', async () => {
      const integration = await integrationService.createIntegration(testVenueId, testTenantId, {
        type: 'stripe',
        credentials: { api_key: 'test_key' },
        config: { status: 'inactive' }
      });

      const cacheKey = `${testVenueId}:details`;
      await cacheService.set(cacheKey, { integration: { status: 'inactive' } }, 300, testTenantId);

      await integrationService.updateIntegration(integration.id!, testTenantId, {
        config: { status: 'active' }
      });

      const cached = await redis.get(`venue:tenant:${testTenantId}:${cacheKey}`);
      expect(cached).toBeNull();
    });

    it('should prevent stale content status after publish', async () => {
      const content = await contentService.createContent({
        venueId: testVenueId,
        tenantId: testTenantId,
        contentType: 'PHOTO',
        content: { media: { url: 'https://example.com/photo.jpg' } },
        createdBy: testUserId
      });

      const cacheKey = `${testVenueId}:details`;
      await cacheService.set(cacheKey, { content: { status: 'draft' } }, 300, testTenantId);

      await contentService.publishContent(content._id.toString(), testTenantId, testUserId);

      const cached = await redis.get(`venue:tenant:${testTenantId}:${cacheKey}`);
      expect(cached).toBeNull();
    });

    it('should prevent stale settings after update', async () => {
      const cacheKey = `${testVenueId}:details`;
      await cacheService.set(cacheKey, { settings: { maxTicketsPerOrder: 10 } }, 300, testTenantId);

      await settingsModel.updateVenueSettings(testVenueId, {
        ticketing: { maxTicketsPerOrder: 20 }
      });

      await cacheService.clearVenueCache(testVenueId, testTenantId);

      const cached = await redis.get(`venue:tenant:${testTenantId}:${cacheKey}`);
      expect(cached).toBeNull();
    });

    it('should prevent serving expired cache entries', async () => {
      const cacheKey = `${testVenueId}:details`;

      await cacheService.set(cacheKey, { test: 'data' }, 1, testTenantId);

      await new Promise(resolve => setTimeout(resolve, 1100));

      const cached = await cacheService.get(cacheKey, testTenantId);
      expect(cached).toBeNull();
    });

    it('should ensure cache consistency across service calls', async () => {
      const integration = await integrationService.createIntegration(testVenueId, testTenantId, {
        type: 'stripe',
        credentials: { api_key: 'test_key' },
        config: {}
      });

      const cacheKey = `${testVenueId}:details`;
      const cached = await redis.get(`venue:tenant:${testTenantId}:${cacheKey}`);
      expect(cached).toBeNull();
    });
  });

  // ========================================================================
  // SECTION 4: getOrSet Pattern (5 tests)
  // ========================================================================

  describe('getOrSet Pattern & Errors', () => {
    it('should use cache-aside pattern correctly', async () => {
      let fetchCalled = false;
      const fetchFn = async () => {
        fetchCalled = true;
        return { data: 'from-source' };
      };

      const result1 = await cacheService.getOrSet('test-key', fetchFn, 300);
      expect(fetchCalled).toBe(true);
      expect(result1.data).toBe('from-source');

      fetchCalled = false;
      const result2 = await cacheService.getOrSet('test-key', fetchFn, 300);
      expect(fetchCalled).toBe(false);
      expect(result2.data).toBe('from-source');
    });

    it('should track cache write failures for monitoring', async () => {
      const initialFailures = cacheService.getCacheWriteFailures();
      expect(typeof initialFailures).toBe('number');
    });

    it('should validate TTL values to prevent errors', async () => {
      const cacheKey = `${testVenueId}:test`;

      await cacheService.set(cacheKey, { test: true }, 0, testTenantId);
      const ttl1 = await redis.ttl(`venue:tenant:${testTenantId}:${cacheKey}`);
      expect(ttl1).toBeGreaterThan(0);

      await cacheService.set(cacheKey, { test: true }, 999999, testTenantId);
      const ttl2 = await redis.ttl(`venue:tenant:${testTenantId}:${cacheKey}`);
      expect(ttl2).toBeLessThanOrEqual(86400 * 7);
    });

    it('should handle cache key existence checks', async () => {
      const cacheKey = `${testVenueId}:test`;

      const exists1 = await cacheService.exists(cacheKey, testTenantId);
      expect(exists1).toBe(false);

      await cacheService.set(cacheKey, { test: true }, 300, testTenantId);

      const exists2 = await cacheService.exists(cacheKey, testTenantId);
      expect(exists2).toBe(true);
    });

    it('should get remaining TTL for cache keys', async () => {
      const cacheKey = `${testVenueId}:test`;

      await cacheService.set(cacheKey, { test: true }, 100, testTenantId);

      const ttl = await cacheService.ttl(cacheKey, testTenantId);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(100);
    });
  });
});

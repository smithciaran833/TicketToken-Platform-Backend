/**
 * HealthCheckService Integration Tests
 * 
 * Tests real DB and Redis connectivity checks.
 * FK Chain: tenants → users → venues
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  TEST_TENANT_ID,
  TEST_USER_ID,
  TEST_VENUE_ID,
  db,
  redis,
  createTestVenue
} from './setup';
import { HealthCheckService, HealthCheckResult } from '../../src/services/healthCheck.service';

describe('HealthCheckService Integration Tests', () => {
  let context: TestContext;
  let healthCheckService: HealthCheckService;

  beforeAll(async () => {
    context = await setupTestApp();
    // Create service with real dependencies
    healthCheckService = new HealthCheckService({
      db: db as any,
      redis: redis,
      queueService: undefined // No RabbitMQ in tests
    });
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  // ==========================================================================
  // getLiveness
  // ==========================================================================
  describe('getLiveness', () => {
    it('should return alive status', async () => {
      const result = await healthCheckService.getLiveness();

      expect(result).toBeDefined();
      expect(result.status).toBe('alive');
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).not.toBeNaN();
    });

    it('should return valid ISO timestamp', async () => {
      const result = await healthCheckService.getLiveness();

      const timestamp = new Date(result.timestamp);
      expect(timestamp.toISOString()).toBe(result.timestamp);
    });
  });

  // ==========================================================================
  // getReadiness
  // ==========================================================================
  describe('getReadiness', () => {
    it('should return healthy status when DB and Redis are connected', async () => {
      const result = await healthCheckService.getReadiness();

      expect(result).toBeDefined();
      expect(result.status).toBe('healthy');
      expect(result.service).toBe('venue-service');
      expect(result.checks.database.status).toBe('ok');
      expect(result.checks.redis.status).toBe('ok');
    });

    it('should include response times for checks', async () => {
      const result = await healthCheckService.getReadiness();

      expect(result.checks.database.responseTime).toBeDefined();
      expect(typeof result.checks.database.responseTime).toBe('number');
      expect(result.checks.database.responseTime).toBeGreaterThanOrEqual(0);

      expect(result.checks.redis.responseTime).toBeDefined();
      expect(typeof result.checks.redis.responseTime).toBe('number');
      expect(result.checks.redis.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('should include uptime', async () => {
      const result = await healthCheckService.getReadiness();

      expect(result.uptime).toBeDefined();
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should include version', async () => {
      const result = await healthCheckService.getReadiness();

      expect(result.version).toBeDefined();
      expect(typeof result.version).toBe('string');
    });

    it('should include timestamp', async () => {
      const result = await healthCheckService.getReadiness();

      expect(result.timestamp).toBeDefined();
      const timestamp = new Date(result.timestamp);
      expect(timestamp.toISOString()).toBe(result.timestamp);
    });
  });

  // ==========================================================================
  // getFullHealth
  // ==========================================================================
  describe('getFullHealth', () => {
    it('should include all readiness checks', async () => {
      const result = await healthCheckService.getFullHealth();

      expect(result.checks.database).toBeDefined();
      expect(result.checks.redis).toBeDefined();
    });

    it('should include venueQuery check', async () => {
      const result = await healthCheckService.getFullHealth();

      expect(result.checks.venueQuery).toBeDefined();
      expect(result.checks.venueQuery.status).toBe('ok');
      expect(result.checks.venueQuery.responseTime).toBeDefined();
      expect(result.checks.venueQuery.details).toBeDefined();
      expect(result.checks.venueQuery.details.venueCount).toBeDefined();
    });

    it('should count venues correctly', async () => {
      // Create additional venues
      await createTestVenue(db, { name: 'Health Check Venue 1', slug: `health-1-${Date.now()}` });
      await createTestVenue(db, { name: 'Health Check Venue 2', slug: `health-2-${Date.now()}` });

      const result = await healthCheckService.getFullHealth();

      // Should have at least 3 venues (TEST_VENUE_ID + 2 new ones)
      expect(result.checks.venueQuery.details.venueCount).toBeGreaterThanOrEqual(3);
    });

    it('should include cacheOperations check', async () => {
      const result = await healthCheckService.getFullHealth();

      expect(result.checks.cacheOperations).toBeDefined();
      expect(result.checks.cacheOperations.status).toBe('ok');
      expect(result.checks.cacheOperations.responseTime).toBeDefined();
    });

    it('should include rabbitMQ check with warning status when not configured', async () => {
      const result = await healthCheckService.getFullHealth();

      expect(result.checks.rabbitMQ).toBeDefined();
      expect(result.checks.rabbitMQ.status).toBe('warning');
      expect(result.checks.rabbitMQ.message).toContain('not configured');
      expect(result.checks.rabbitMQ.details.enabled).toBe(false);
    });

    it('should include migrations check', async () => {
      const result = await healthCheckService.getFullHealth();

      expect(result.checks.migrations).toBeDefined();
      expect(['ok', 'warning', 'error']).toContain(result.checks.migrations.status);
      expect(result.checks.migrations.responseTime).toBeDefined();
      expect(result.checks.migrations.details).toBeDefined();
    });

    it('should return healthy overall status when all critical checks pass', async () => {
      const result = await healthCheckService.getFullHealth();

      // DB and Redis are critical
      expect(result.checks.database.status).toBe('ok');
      expect(result.checks.redis.status).toBe('ok');
      expect(result.status).toBe('healthy');
    });
  });

  // ==========================================================================
  // RabbitMQ Caching
  // ==========================================================================
  describe('RabbitMQ check caching', () => {
    it('should cache RabbitMQ check results', async () => {
      // First call
      const result1 = await healthCheckService.getFullHealth();
      const rabbitCheck1 = result1.checks.rabbitMQ;

      // Second call (should use cache)
      const result2 = await healthCheckService.getFullHealth();
      const rabbitCheck2 = result2.checks.rabbitMQ;

      // Both should return same cached result
      expect(rabbitCheck1.status).toBe(rabbitCheck2.status);
      expect(rabbitCheck1.message).toBe(rabbitCheck2.message);
    });
  });

  // ==========================================================================
  // Service with QueueService
  // ==========================================================================
  describe('with mock queueService', () => {
    it('should report warning when queueService connection is closed', async () => {
      const mockQueueService = {
        connection: { closed: true },
        channel: null
      };

      const serviceWithQueue = new HealthCheckService({
        db: db as any,
        redis: redis,
        queueService: mockQueueService
      });

      const result = await serviceWithQueue.getFullHealth();

      expect(result.checks.rabbitMQ.status).toBe('warning');
      expect(result.checks.rabbitMQ.message).toContain('disconnected');
    });

    it('should report ok when queueService connection is active', async () => {
      const mockQueueService = {
        connection: { closed: false },
        channel: {}
      };

      const serviceWithQueue = new HealthCheckService({
        db: db as any,
        redis: redis,
        queueService: mockQueueService
      });

      const result = await serviceWithQueue.getFullHealth();

      expect(result.checks.rabbitMQ.status).toBe('ok');
      expect(result.checks.rabbitMQ.details.connected).toBe(true);
      expect(result.checks.rabbitMQ.details.channels).toBe(1);
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================
  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      // Create service with broken DB mock
      const brokenDb = {
        raw: jest.fn().mockRejectedValue(new Error('Connection refused')),
        migrate: {
          currentVersion: jest.fn().mockRejectedValue(new Error('Migration error')),
          list: jest.fn().mockRejectedValue(new Error('Migration error'))
        }
      };

      const brokenService = new HealthCheckService({
        db: brokenDb as any,
        redis: redis,
        queueService: undefined
      });

      const result = await brokenService.getReadiness();

      expect(result.checks.database.status).toBe('error');
      expect(result.checks.database.message).toContain('Connection refused');
      expect(result.status).toBe('unhealthy');
    });

    it('should return degraded status when Redis fails but DB works', async () => {
      // Create service with broken Redis mock
      const brokenRedis = {
        ping: jest.fn().mockRejectedValue(new Error('Redis connection refused'))
      };

      const brokenService = new HealthCheckService({
        db: db as any,
        redis: brokenRedis as any,
        queueService: undefined
      });

      const result = await brokenService.getReadiness();

      expect(result.checks.database.status).toBe('ok');
      expect(result.checks.redis.status).toBe('error');
      expect(result.checks.redis.message).toContain('Redis connection refused');
      expect(result.status).toBe('degraded');
    });
  });
});

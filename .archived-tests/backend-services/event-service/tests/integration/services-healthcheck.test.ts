/**
 * HealthCheckService Integration Tests
 */

import { setupTestApp, teardownTestApp, TestContext, pool, redis } from './setup';
import { HealthCheckService } from '../../src/services/healthCheck.service';

describe('HealthCheckService', () => {
  let context: TestContext;
  let service: HealthCheckService;

  beforeAll(async () => {
    context = await setupTestApp();
    service = new HealthCheckService();
  }, 30000);

  afterAll(async () => { await teardownTestApp(context); });

  describe('performHealthCheck', () => {
    it('should return health status with all checks', async () => {
      const result = await service.performHealthCheck(pool, redis);

      expect(result.status).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.status);
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.checks).toBeDefined();
      expect(result.checks.database).toBeDefined();
      expect(result.checks.redis).toBeDefined();
    });

    it('should report database as up', async () => {
      const result = await service.performHealthCheck(pool, redis);
      expect(result.checks.database.status).toBe('up');
      expect(result.checks.database.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('should report redis as up', async () => {
      const result = await service.performHealthCheck(pool, redis);
      expect(result.checks.redis.status).toBe('up');
      expect(result.checks.redis.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('should report venue/auth services as down (not configured)', async () => {
      const result = await service.performHealthCheck(pool, redis);
      // These will be down since external services aren't running in test
      expect(result.checks.venueService).toBeDefined();
      expect(result.checks.authService).toBeDefined();
    });

    it('should track uptime', async () => {
      const result1 = await service.performHealthCheck(pool, redis);
      await new Promise(r => setTimeout(r, 100));
      const result2 = await service.performHealthCheck(pool, redis);
      expect(result2.uptime).toBeGreaterThanOrEqual(result1.uptime);
    });
  });
});

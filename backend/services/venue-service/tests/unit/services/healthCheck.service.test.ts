/**
 * Unit tests for src/services/healthCheck.service.ts
 * Tests health check endpoints for Kubernetes probes
 */

import { HealthCheckService, HealthCheckResult } from '../../../src/services/healthCheck.service';
import { createRedisMock } from '../../__mocks__/redis.mock';
import { createKnexMock } from '../../__mocks__/knex.mock';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock config
jest.mock('../../../src/config/index', () => ({
  getConfig: jest.fn(() => ({
    rabbitmq: {
      host: 'localhost',
    },
  })),
}));

describe('services/healthCheck.service', () => {
  let healthCheckService: HealthCheckService;
  let mockRedis: ReturnType<typeof createRedisMock>;
  let mockDb: ReturnType<typeof createKnexMock>;
  let mockQueueService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = createRedisMock();
    mockDb = createKnexMock();
    mockQueueService = null; // Default to no queue service

    healthCheckService = new HealthCheckService({
      db: mockDb as any,
      redis: mockRedis as any,
      queueService: mockQueueService,
    });
  });

  describe('getLiveness()', () => {
    it('should return alive status', async () => {
      const result = await healthCheckService.getLiveness();

      expect(result.status).toBe('alive');
      expect(result.timestamp).toBeDefined();
    });

    it('should return ISO timestamp', async () => {
      const result = await healthCheckService.getLiveness();

      const timestamp = new Date(result.timestamp);
      expect(timestamp.toISOString()).toBe(result.timestamp);
    });

    it('should always return alive regardless of dependencies', async () => {
      // Even with failing dependencies, liveness should return alive
      mockDb.raw.mockRejectedValue(new Error('DB error'));
      
      const result = await healthCheckService.getLiveness();

      expect(result.status).toBe('alive');
    });
  });

  describe('getReadiness()', () => {
    it('should return healthy when all checks pass', async () => {
      mockDb.raw.mockResolvedValue([{ '?column?': 1 }]);
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.getReadiness();

      expect(result.status).toBe('healthy');
      expect(result.service).toBe('venue-service');
      expect(result.checks.database.status).toBe('ok');
      expect(result.checks.redis.status).toBe('ok');
    });

    it('should return unhealthy when database fails', async () => {
      mockDb.raw.mockRejectedValue(new Error('Connection refused'));
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.getReadiness();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.database.status).toBe('error');
      expect(result.checks.database.message).toContain('Connection refused');
      expect(result.checks.redis.status).toBe('ok');
    });

    it('should return degraded when Redis fails', async () => {
      mockDb.raw.mockResolvedValue([{ '?column?': 1 }]);
      mockRedis.ping.mockRejectedValue(new Error('Redis error'));

      const result = await healthCheckService.getReadiness();

      expect(result.status).toBe('degraded');
      expect(result.checks.database.status).toBe('ok');
      expect(result.checks.redis.status).toBe('error');
    });

    it('should include response times', async () => {
      mockDb.raw.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve([{ '?column?': 1 }]), 10))
      );
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.getReadiness();

      expect(result.checks.database.responseTime).toBeGreaterThanOrEqual(0);
      expect(result.checks.redis.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('should include uptime', async () => {
      mockDb.raw.mockResolvedValue([{ '?column?': 1 }]);
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.getReadiness();

      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should include version', async () => {
      mockDb.raw.mockResolvedValue([{ '?column?': 1 }]);
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.getReadiness();

      expect(result.version).toBeDefined();
    });
  });

  describe('getFullHealth()', () => {
    beforeEach(() => {
      // Set up default successful responses
      mockDb.raw.mockResolvedValue([{ '?column?': 1 }]);
      mockRedis.ping.mockResolvedValue('PONG');
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue('ok');
      mockRedis.del.mockResolvedValue(1);
      mockDb._mockChain.first.mockResolvedValue({ count: 100 });
      mockDb.migrate = {
        currentVersion: jest.fn().mockResolvedValue(['20240101000000']),
        list: jest.fn().mockResolvedValue([[], []]),
      };
    });

    it('should include all readiness checks plus business checks', async () => {
      const result = await healthCheckService.getFullHealth();

      expect(result.checks.database).toBeDefined();
      expect(result.checks.redis).toBeDefined();
      expect(result.checks.venueQuery).toBeDefined();
      expect(result.checks.cacheOperations).toBeDefined();
      expect(result.checks.rabbitMQ).toBeDefined();
      expect(result.checks.migrations).toBeDefined();
    });

    it('should test venue query functionality', async () => {
      const result = await healthCheckService.getFullHealth();

      expect(result.checks.venueQuery.status).toBe('ok');
      expect(result.checks.venueQuery.details?.venueCount).toBeDefined();
    });

    it('should handle venue query failure', async () => {
      mockDb._mockChain.first.mockRejectedValue(new Error('Query failed'));

      const result = await healthCheckService.getFullHealth();

      expect(result.checks.venueQuery.status).toBe('error');
      expect(result.checks.venueQuery.message).toContain('Query failed');
    });

    it('should test cache operations', async () => {
      const result = await healthCheckService.getFullHealth();

      expect(result.checks.cacheOperations.status).toBe('ok');
      expect(mockRedis.set).toHaveBeenCalled();
      expect(mockRedis.get).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should handle cache operation failure', async () => {
      mockRedis.set.mockRejectedValue(new Error('Cache error'));

      const result = await healthCheckService.getFullHealth();

      expect(result.checks.cacheOperations.status).toBe('error');
    });

    it('should return warning for cache value mismatch', async () => {
      mockRedis.get.mockResolvedValue('unexpected_value');

      const result = await healthCheckService.getFullHealth();

      expect(result.checks.cacheOperations.status).toBe('warning');
    });
  });

  describe('RabbitMQ checks', () => {
    beforeEach(() => {
      mockDb.raw.mockResolvedValue([{ '?column?': 1 }]);
      mockRedis.ping.mockResolvedValue('PONG');
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue('ok');
      mockRedis.del.mockResolvedValue(1);
      mockDb._mockChain.first.mockResolvedValue({ count: 100 });
      mockDb.migrate = {
        currentVersion: jest.fn().mockResolvedValue(['20240101000000']),
        list: jest.fn().mockResolvedValue([[], []]),
      };
    });

    it('should report warning when queueService not configured', async () => {
      healthCheckService = new HealthCheckService({
        db: mockDb as any,
        redis: mockRedis as any,
        queueService: undefined,
      });

      const result = await healthCheckService.getFullHealth();

      expect(result.checks.rabbitMQ.status).toBe('warning');
      expect(result.checks.rabbitMQ.details?.enabled).toBe(false);
    });

    it('should report ok when queueService is connected', async () => {
      mockQueueService = {
        connection: { closed: false },
        channel: {},
      };
      healthCheckService = new HealthCheckService({
        db: mockDb as any,
        redis: mockRedis as any,
        queueService: mockQueueService,
      });

      const result = await healthCheckService.getFullHealth();

      expect(result.checks.rabbitMQ.status).toBe('ok');
      expect(result.checks.rabbitMQ.details?.connected).toBe(true);
    });

    it('should report warning when connection is closed', async () => {
      mockQueueService = {
        connection: { closed: true },
      };
      healthCheckService = new HealthCheckService({
        db: mockDb as any,
        redis: mockRedis as any,
        queueService: mockQueueService,
      });

      const result = await healthCheckService.getFullHealth();

      expect(result.checks.rabbitMQ.status).toBe('warning');
      expect(result.checks.rabbitMQ.details?.connected).toBe(false);
    });

    it('should cache RabbitMQ check results', async () => {
      mockQueueService = {
        connection: { closed: false },
        channel: {},
      };
      healthCheckService = new HealthCheckService({
        db: mockDb as any,
        redis: mockRedis as any,
        queueService: mockQueueService,
      });

      // First call
      const result1 = await healthCheckService.getFullHealth();
      expect(result1.checks.rabbitMQ.status).toBe('ok');

      // Second call should use cache
      const result2 = await healthCheckService.getFullHealth();
      expect(result2.checks.rabbitMQ.status).toBe('ok');
    });
  });

  describe('Migration checks', () => {
    beforeEach(() => {
      mockDb.raw.mockResolvedValue([{ '?column?': 1 }]);
      mockRedis.ping.mockResolvedValue('PONG');
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue('ok');
      mockRedis.del.mockResolvedValue(1);
      mockDb._mockChain.first.mockResolvedValue({ count: 100 });
    });

    it('should report ok when migrations are up to date', async () => {
      mockDb.migrate = {
        currentVersion: jest.fn().mockResolvedValue(['20240101000000']),
        list: jest.fn().mockResolvedValue([[], []]), // No pending migrations
      };

      const result = await healthCheckService.getFullHealth();

      expect(result.checks.migrations.status).toBe('ok');
      expect(result.checks.migrations.details?.upToDate).toBe(true);
    });

    it('should report warning when there are pending migrations', async () => {
      mockDb.migrate = {
        currentVersion: jest.fn().mockResolvedValue(['20240101000000']),
        list: jest.fn().mockResolvedValue([[], [
          { name: '20240201000000_add_new_column' },
          { name: '20240301000000_add_index' },
        ]]),
      };

      const result = await healthCheckService.getFullHealth();

      expect(result.checks.migrations.status).toBe('warning');
      expect(result.checks.migrations.details?.pendingCount).toBe(2);
    });

    it('should report error when migration check fails', async () => {
      mockDb.migrate = {
        currentVersion: jest.fn().mockRejectedValue(new Error('Migration table not found')),
        list: jest.fn().mockResolvedValue([[], []]),
      };

      const result = await healthCheckService.getFullHealth();

      expect(result.checks.migrations.status).toBe('error');
      expect(result.checks.migrations.message).toContain('Migration check failed');
    });
  });

  describe('Edge cases', () => {
    it('should handle simultaneous failures gracefully', async () => {
      mockDb.raw.mockRejectedValue(new Error('DB down'));
      mockRedis.ping.mockRejectedValue(new Error('Redis down'));

      const result = await healthCheckService.getReadiness();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.database.status).toBe('error');
      expect(result.checks.redis.status).toBe('error');
    });

    it('should handle slow database response', async () => {
      mockDb.raw.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve([{ '?column?': 1 }]), 100))
      );
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.getReadiness();

      expect(result.status).toBe('healthy');
      expect(result.checks.database.responseTime).toBeGreaterThanOrEqual(100);
    });

    it('should include service name in response', async () => {
      mockDb.raw.mockResolvedValue([{ '?column?': 1 }]);
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.getReadiness();

      expect(result.service).toBe('venue-service');
    });
  });
});

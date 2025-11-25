import { HealthCheckService } from '../../../src/services/healthCheck.service';
import { logger } from '../../../src/utils/logger';
import { Knex } from 'knex';
import Redis from 'ioredis';

// =============================================================================
// MOCKS
// =============================================================================

jest.mock('../../../src/utils/logger');

describe('HealthCheckService', () => {
  let healthCheckService: HealthCheckService;
  let mockDb: any;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database with proper Knex query builder chain
    const mockQueryBuilder = {
      count: jest.fn().mockReturnThis(),
      first: jest.fn(),
    };

    mockDb = Object.assign(
      jest.fn().mockReturnValue(mockQueryBuilder),
      {
        raw: jest.fn(),
        _mockQueryBuilder: mockQueryBuilder, // Store reference for tests
      }
    );

    // Mock Redis
    mockRedis = {
      ping: jest.fn(),
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
    } as any;

    // Create service instance
    healthCheckService = new HealthCheckService({
      db: mockDb as any,
      redis: mockRedis,
    });
  });

  // =============================================================================
  // constructor() - 2 test cases
  // =============================================================================

  describe('constructor()', () => {
    it('should initialize with dependencies', () => {
      expect(healthCheckService).toBeDefined();
      expect((healthCheckService as any).db).toBe(mockDb);
      expect((healthCheckService as any).redis).toBe(mockRedis);
    });

    it('should set start time', () => {
      const startTime = (healthCheckService as any).startTime;
      expect(startTime).toBeInstanceOf(Date);
    });
  });

  // =============================================================================
  // getLiveness() - 2 test cases
  // =============================================================================

  describe('getLiveness()', () => {
    it('should return alive status', async () => {
      const result = await healthCheckService.getLiveness();

      expect(result.status).toBe('alive');
      expect(result.timestamp).toBeDefined();
    });

    it('should return current timestamp', async () => {
      const result = await healthCheckService.getLiveness();

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });
  });

  // =============================================================================
  // getReadiness() - 12 test cases
  // =============================================================================

  describe('getReadiness()', () => {
    it('should return healthy when all checks pass', async () => {
      mockDb.raw.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.getReadiness();

      expect(result.status).toBe('healthy');
      expect(result.checks.database.status).toBe('ok');
      expect(result.checks.redis.status).toBe('ok');
    });

    it('should check database connectivity', async () => {
      mockDb.raw.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      mockRedis.ping.mockResolvedValue('PONG');

      await healthCheckService.getReadiness();

      expect(mockDb.raw).toHaveBeenCalledWith('SELECT 1');
    });

    it('should check Redis connectivity', async () => {
      mockDb.raw.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      mockRedis.ping.mockResolvedValue('PONG');

      await healthCheckService.getReadiness();

      expect(mockRedis.ping).toHaveBeenCalled();
    });

    it('should return unhealthy when database fails', async () => {
      mockDb.raw.mockRejectedValue(new Error('Database connection failed'));
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.getReadiness();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.database.status).toBe('error');
      expect(result.checks.database.message).toBe('Database connection failed');
    });

    it('should return degraded when Redis fails', async () => {
      mockDb.raw.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      mockRedis.ping.mockRejectedValue(new Error('Redis connection failed'));

      const result = await healthCheckService.getReadiness();

      expect(result.status).toBe('degraded');
      expect(result.checks.redis.status).toBe('error');
      expect(result.checks.redis.message).toBe('Redis connection failed');
    });

    it('should include response times for database', async () => {
      mockDb.raw.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.getReadiness();

      expect(result.checks.database.responseTime).toBeDefined();
      expect(typeof result.checks.database.responseTime).toBe('number');
    });

    it('should include response times for Redis', async () => {
      mockDb.raw.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.getReadiness();

      expect(result.checks.redis.responseTime).toBeDefined();
      expect(typeof result.checks.redis.responseTime).toBe('number');
    });

    it('should include service metadata', async () => {
      mockDb.raw.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.getReadiness();

      expect(result.service).toBe('venue-service');
      expect(result.version).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should include uptime', async () => {
      mockDb.raw.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      mockRedis.ping.mockResolvedValue('PONG');

      // Wait a bit to ensure uptime > 0
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await healthCheckService.getReadiness();

      expect(result.uptime).toBeGreaterThan(0);
      expect(typeof result.uptime).toBe('number');
    });

    it('should use version from environment or default', async () => {
      mockDb.raw.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.getReadiness();

      expect(result.version).toBe('1.0.0');
    });

    it('should handle both database and Redis failures', async () => {
      mockDb.raw.mockRejectedValue(new Error('DB failed'));
      mockRedis.ping.mockRejectedValue(new Error('Redis failed'));

      const result = await healthCheckService.getReadiness();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.database.status).toBe('error');
      expect(result.checks.redis.status).toBe('error');
    });

    it('should return timestamp in ISO format', async () => {
      mockDb.raw.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.getReadiness();

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  // =============================================================================
  // getFullHealth() - 10 test cases
  // =============================================================================

  describe('getFullHealth()', () => {
    beforeEach(() => {
      mockDb.raw.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      mockRedis.ping.mockResolvedValue('PONG');
    });

    it('should include all readiness checks', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({ count: 5 });
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue('ok');
      mockRedis.del.mockResolvedValue(1);

      const result = await healthCheckService.getFullHealth();

      expect(result.checks.database).toBeDefined();
      expect(result.checks.redis).toBeDefined();
    });

    it('should check venue query capability', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({ count: 10 });
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue('ok');
      mockRedis.del.mockResolvedValue(1);

      const result = await healthCheckService.getFullHealth();

      expect(result.checks.venueQuery).toBeDefined();
      expect(result.checks.venueQuery.status).toBe('ok');
      expect(result.checks.venueQuery.details?.venueCount).toBe(10);
    });

    it('should check cache operations', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({ count: 5 });
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue('ok');
      mockRedis.del.mockResolvedValue(1);

      const result = await healthCheckService.getFullHealth();

      expect(result.checks.cacheOperations).toBeDefined();
      expect(result.checks.cacheOperations.status).toBe('ok');
    });

    it('should perform set, get, and delete on cache', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({ count: 0 });
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue('ok');
      mockRedis.del.mockResolvedValue(1);

      await healthCheckService.getFullHealth();

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('health:check:'),
        'ok',
        'EX',
        10
      );
      expect(mockRedis.get).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should include response times for business checks', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({ count: 0 });
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue('ok');
      mockRedis.del.mockResolvedValue(1);

      const result = await healthCheckService.getFullHealth();

      expect(result.checks.venueQuery.responseTime).toBeDefined();
      expect(result.checks.cacheOperations.responseTime).toBeDefined();
    });

    it('should handle venue query failures', async () => {
      mockDb._mockQueryBuilder.first.mockRejectedValue(new Error('Query failed'));
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue('ok');
      mockRedis.del.mockResolvedValue(1);

      const result = await healthCheckService.getFullHealth();

      expect(result.checks.venueQuery.status).toBe('error');
      expect(result.checks.venueQuery.message).toBe('Query failed');
    });

    it('should handle cache operation failures', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({ count: 0 });
      mockRedis.set.mockRejectedValue(new Error('Cache failed'));

      const result = await healthCheckService.getFullHealth();

      expect(result.checks.cacheOperations.status).toBe('error');
      expect(result.checks.cacheOperations.message).toBe('Cache failed');
    });

    it('should mark cache as warning if value mismatch', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({ count: 0 });
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue('wrong-value');
      mockRedis.del.mockResolvedValue(1);

      const result = await healthCheckService.getFullHealth();

      expect(result.checks.cacheOperations.status).toBe('warning');
    });

    it('should include venue count in details', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({ count: 42 });
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue('ok');
      mockRedis.del.mockResolvedValue(1);

      const result = await healthCheckService.getFullHealth();

      expect(result.checks.venueQuery.details?.venueCount).toBe(42);
    });

    it('should handle null venue count gracefully', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue('ok');
      mockRedis.del.mockResolvedValue(1);

      const result = await healthCheckService.getFullHealth();

      expect(result.checks.venueQuery.details?.venueCount).toBe(0);
    });
  });
});

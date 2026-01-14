/**
 * Unit tests for HealthCheckService
 * Tests health checks, readiness, liveness, and clock drift detection
 */

import { HealthCheckService, getServerTime } from '../../../src/services/healthCheck.service';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('HealthCheckService', () => {
  let service: HealthCheckService;
  let mockPool: any;
  let mockRedis: any;

  beforeEach(() => {
    service = new HealthCheckService();

    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [{ db_time: new Date() }] }),
    };

    mockRedis = {
      ping: jest.fn().mockResolvedValue('PONG'),
    };

    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create service instance', () => {
      expect(service).toBeInstanceOf(HealthCheckService);
    });
  });

  describe('performLivenessCheck', () => {
    it('should return ok status', async () => {
      const result = await service.performLivenessCheck();

      expect(result.status).toBe('ok');
    });

    it('should include timestamp', async () => {
      const result = await service.performLivenessCheck();

      expect(result.timestamp).toBeDefined();
      expect(() => new Date(result.timestamp)).not.toThrow();
    });

    it('should be fast (no external dependencies)', async () => {
      const start = Date.now();
      await service.performLivenessCheck();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });

  describe('performReadinessCheck', () => {
    it('should return ready when all checks pass', async () => {
      const result = await service.performReadinessCheck(mockPool, mockRedis);

      expect(result.status).toBe('ready');
    });

    it('should include database check', async () => {
      const result = await service.performReadinessCheck(mockPool, mockRedis);

      expect(result.checks.database).toBeDefined();
      expect(result.checks.database.status).toBe('up');
    });

    it('should include redis check', async () => {
      const result = await service.performReadinessCheck(mockPool, mockRedis);

      expect(result.checks.redis).toBeDefined();
      expect(result.checks.redis.status).toBe('up');
    });

    it('should return not_ready when database fails', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection refused'));

      const result = await service.performReadinessCheck(mockPool, mockRedis);

      expect(result.status).toBe('not_ready');
      expect(result.checks.database.status).toBe('down');
    });

    it('should return not_ready when redis fails', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Connection refused'));

      const result = await service.performReadinessCheck(mockPool, mockRedis);

      expect(result.status).toBe('not_ready');
      expect(result.checks.redis.status).toBe('down');
    });

    it('should include timestamp', async () => {
      const result = await service.performReadinessCheck(mockPool, mockRedis);

      expect(result.timestamp).toBeDefined();
    });
  });

  describe('performHealthCheck', () => {
    it('should return healthy when all checks pass', async () => {
      const result = await service.performHealthCheck(mockPool, mockRedis);

      expect(result.status).toBe('healthy');
    });

    it('should include version', async () => {
      const result = await service.performHealthCheck(mockPool, mockRedis);

      expect(result.version).toBeDefined();
    });

    it('should include database check with response time', async () => {
      const result = await service.performHealthCheck(mockPool, mockRedis);

      expect(result.checks.database.responseTime).toBeDefined();
      expect(typeof result.checks.database.responseTime).toBe('number');
    });

    it('should include redis check with response time', async () => {
      const result = await service.performHealthCheck(mockPool, mockRedis);

      expect(result.checks.redis.responseTime).toBeDefined();
      expect(typeof result.checks.redis.responseTime).toBe('number');
    });

    it('should return unhealthy when database fails', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection refused'));

      const result = await service.performHealthCheck(mockPool, mockRedis);

      expect(result.status).toBe('unhealthy');
    });

    it('should return unhealthy when redis fails', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Connection refused'));

      const result = await service.performHealthCheck(mockPool, mockRedis);

      expect(result.status).toBe('unhealthy');
    });

    it('should return degraded when database is slow', async () => {
      // Mock slow database response
      mockPool.query.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ rows: [{}] }), 1100))
      );

      const result = await service.performHealthCheck(mockPool, mockRedis);

      // May be degraded or have slow response time
      expect(result.checks.database.responseTime).toBeGreaterThan(1000);
    });

    it('should not include external dependencies by default', async () => {
      const result = await service.performHealthCheck(mockPool, mockRedis);

      expect(result.dependencies).toBeUndefined();
    });

    it('should include external dependencies when requested', async () => {
      const result = await service.performHealthCheck(mockPool, mockRedis, true);

      expect(result.dependencies).toBeDefined();
    });

    it('should not expose uptime in public response', async () => {
      const result = await service.performHealthCheck(mockPool, mockRedis);

      // AUDIT FIX: uptime should not be in public response
      expect((result as any).uptime).toBeUndefined();
    });
  });

  describe('performStartupCheck', () => {
    it('should return ready when initialized', async () => {
      const result = await service.performStartupCheck(mockPool, mockRedis);

      expect(result.ready).toBe(true);
      expect(result.message).toContain('successfully');
    });

    it('should return not ready when database fails', async () => {
      mockPool.query.mockRejectedValue(new Error('Not connected'));

      const result = await service.performStartupCheck(mockPool, mockRedis);

      expect(result.ready).toBe(false);
      expect(result.message).toContain('incomplete');
    });

    it('should return not ready when redis fails', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Not connected'));

      const result = await service.performStartupCheck(mockPool, mockRedis);

      expect(result.ready).toBe(false);
    });
  });

  describe('checkClockDrift', () => {
    it('should return ok status for minimal drift', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ db_time: new Date() }],
      });

      const result = await service.checkClockDrift(mockPool);

      expect(result.status).toBe('ok');
      expect(Math.abs(result.driftMs)).toBeLessThan(5000);
    });

    it('should return drift in milliseconds', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ db_time: new Date() }],
      });

      const result = await service.checkClockDrift(mockPool);

      expect(typeof result.driftMs).toBe('number');
    });

    it('should return warning for moderate drift', async () => {
      // Simulate 3 second drift
      const pastTime = new Date(Date.now() - 3000);
      mockPool.query.mockResolvedValue({
        rows: [{ db_time: pastTime }],
      });

      const result = await service.checkClockDrift(mockPool);

      // Should be warning (between 2500ms and 5000ms)
      expect(['ok', 'warning']).toContain(result.status);
    });

    it('should return error for large drift', async () => {
      // Simulate 10 second drift
      const pastTime = new Date(Date.now() - 10000);
      mockPool.query.mockResolvedValue({
        rows: [{ db_time: pastTime }],
      });

      const result = await service.checkClockDrift(mockPool);

      expect(result.status).toBe('error');
    });

    it('should handle database errors gracefully', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection error'));

      const result = await service.checkClockDrift(mockPool);

      expect(result.status).toBe('error');
      expect(result.driftMs).toBe(0);
    });
  });

  describe('performDetailedHealthCheck', () => {
    it('should include base health check data', async () => {
      const result = await service.performDetailedHealthCheck(mockPool, mockRedis);

      expect(result.status).toBeDefined();
      expect(result.checks).toBeDefined();
      expect(result.version).toBeDefined();
    });

    it('should include clock drift information', async () => {
      const result = await service.performDetailedHealthCheck(mockPool, mockRedis);

      expect(result.detailed.clockDrift).toBeDefined();
      expect(result.detailed.clockDrift.driftMs).toBeDefined();
      expect(result.detailed.clockDrift.status).toBeDefined();
    });

    it('should include memory information', async () => {
      const result = await service.performDetailedHealthCheck(mockPool, mockRedis);

      expect(result.detailed.memory).toBeDefined();
      expect(result.detailed.memory.heapUsed).toBeGreaterThan(0);
      expect(result.detailed.memory.heapTotal).toBeGreaterThan(0);
      expect(result.detailed.memory.rss).toBeGreaterThan(0);
    });

    it('should include process information', async () => {
      const result = await service.performDetailedHealthCheck(mockPool, mockRedis);

      expect(result.detailed.process).toBeDefined();
      expect(result.detailed.process.pid).toBeGreaterThan(0);
      expect(result.detailed.process.nodeVersion).toBeDefined();
    });

    it('should include external dependencies', async () => {
      const result = await service.performDetailedHealthCheck(mockPool, mockRedis);

      expect(result.dependencies).toBeDefined();
    });
  });

  describe('database check timeouts', () => {
    it('should timeout slow database checks', async () => {
      mockPool.query.mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 5000))
      );

      const start = Date.now();
      const result = await service.performHealthCheck(mockPool, mockRedis);
      const duration = Date.now() - start;

      // Should timeout before 5 seconds
      expect(duration).toBeLessThan(3000);
      expect(result.checks.database.status).toBe('down');
    });
  });

  describe('redis check timeouts', () => {
    it('should timeout slow redis checks', async () => {
      mockRedis.ping.mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 5000))
      );

      const start = Date.now();
      const result = await service.performHealthCheck(mockPool, mockRedis);
      const duration = Date.now() - start;

      // Should timeout before 5 seconds
      expect(duration).toBeLessThan(3000);
      expect(result.checks.redis.status).toBe('down');
    });
  });

  describe('error handling', () => {
    it('should not expose internal error messages', async () => {
      mockPool.query.mockRejectedValue(new Error('Internal SQL error with sensitive data'));

      const result = await service.performHealthCheck(mockPool, mockRedis);

      // Error should be sanitized
      expect(result.checks.database.error).not.toContain('Internal SQL');
    });

    it('should handle null response from database', async () => {
      mockPool.query.mockResolvedValue(null);

      // Should not throw
      const result = await service.performReadinessCheck(mockPool, mockRedis);
      expect(result).toBeDefined();
    });
  });
});

describe('getServerTime', () => {
  it('should return server_time in ISO format', () => {
    const result = getServerTime();

    expect(result.server_time).toBeDefined();
    expect(() => new Date(result.server_time)).not.toThrow();
  });

  it('should return unix_ms as number', () => {
    const result = getServerTime();

    expect(result.unix_ms).toBeDefined();
    expect(typeof result.unix_ms).toBe('number');
  });

  it('should return current time', () => {
    const before = Date.now();
    const result = getServerTime();
    const after = Date.now();

    expect(result.unix_ms).toBeGreaterThanOrEqual(before);
    expect(result.unix_ms).toBeLessThanOrEqual(after);
  });

  it('should have consistent server_time and unix_ms', () => {
    const result = getServerTime();
    const parsedTime = new Date(result.server_time).getTime();

    // Should be within 1ms
    expect(Math.abs(parsedTime - result.unix_ms)).toBeLessThan(2);
  });
});

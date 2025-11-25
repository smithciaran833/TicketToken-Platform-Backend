import { MonitoringService } from '../../../src/services/monitoring.service';

// Mock dependencies
jest.mock('../../../src/config/database', () => ({
  db: {
    raw: jest.fn(),
  },
  pool: {
    totalCount: 10,
    idleCount: 5,
    waitingCount: 0,
  },
}));

jest.mock('../../../src/config/redis', () => ({
  redis: {
    ping: jest.fn(),
    info: jest.fn(),
  },
}));

import { db, pool } from '../../../src/config/database';
import { redis } from '../../../src/config/redis';

describe('MonitoringService', () => {
  let service: MonitoringService;
  let mockDb: jest.Mocked<typeof db>;
  let mockRedis: jest.Mocked<typeof redis>;

  beforeEach(() => {
    mockDb = db as jest.Mocked<typeof db>;
    mockRedis = redis as jest.Mocked<typeof redis>;
    service = new MonitoringService();
    jest.clearAllMocks();
  });

  describe('performHealthCheck', () => {
    it('should return healthy status when all checks pass', async () => {
      mockDb.raw.mockResolvedValue({});
      mockRedis.ping.mockResolvedValue('PONG');
      mockRedis.info.mockResolvedValue('connected_clients:5');

      const result = await service.performHealthCheck();

      expect(result.status).toBe('healthy');
      expect(result.service).toBe('auth-service');
      expect(result.checks.database.status).toBe('ok');
      expect(result.checks.redis.status).toBe('ok');
      expect(result.checks.memory.status).toBe('ok');
    });

    it('should return unhealthy status when database fails', async () => {
      mockDb.raw.mockRejectedValue(new Error('Database connection failed'));
      mockRedis.ping.mockResolvedValue('PONG');
      mockRedis.info.mockResolvedValue('connected_clients:5');

      const result = await service.performHealthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.database.status).toBe('error');
      expect(result.checks.database.error).toBe('Database connection failed');
    });

    it('should return unhealthy status when redis fails', async () => {
      mockDb.raw.mockResolvedValue({});
      mockRedis.ping.mockRejectedValue(new Error('Redis connection failed'));

      const result = await service.performHealthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.redis.status).toBe('error');
      expect(result.checks.redis.error).toBe('Redis connection failed');
    });

    it('should include timestamp and uptime', async () => {
      mockDb.raw.mockResolvedValue({});
      mockRedis.ping.mockResolvedValue('PONG');
      mockRedis.info.mockResolvedValue('connected_clients:5');

      const result = await service.performHealthCheck();

      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should include version information', async () => {
      mockDb.raw.mockResolvedValue({});
      mockRedis.ping.mockResolvedValue('PONG');
      mockRedis.info.mockResolvedValue('connected_clients:5');

      const result = await service.performHealthCheck();

      expect(result.version).toBeDefined();
      expect(typeof result.version).toBe('string');
    });
  });

  describe('checkDatabase', () => {
    it('should return ok status with latency', async () => {
      mockDb.raw.mockResolvedValue({});

      const result = await service['checkDatabase']();

      expect(result.status).toBe('ok');
      expect(result.latency).toBeDefined();
      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(mockDb.raw).toHaveBeenCalledWith('SELECT 1');
    });

    it('should include connection pool details', async () => {
      mockDb.raw.mockResolvedValue({});

      const result = await service['checkDatabase']();

      expect(result.details).toEqual({
        totalConnections: 10,
        idleConnections: 5,
        waitingConnections: 0,
      });
    });

    it('should return error status on failure', async () => {
      mockDb.raw.mockRejectedValue(new Error('Connection timeout'));

      const result = await service['checkDatabase']();

      expect(result.status).toBe('error');
      expect(result.error).toBe('Connection timeout');
      expect(result.latency).toBeUndefined();
    });
  });

  describe('checkRedis', () => {
    it('should return ok status with latency', async () => {
      mockRedis.ping.mockResolvedValue('PONG');
      mockRedis.info.mockResolvedValue('connected_clients:5\nother_stat:10');

      const result = await service['checkRedis']();

      expect(result.status).toBe('ok');
      expect(result.latency).toBeDefined();
      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(mockRedis.ping).toHaveBeenCalled();
    });

    it('should parse connected clients from info', async () => {
      mockRedis.ping.mockResolvedValue('PONG');
      mockRedis.info.mockResolvedValue('connected_clients:42\nother:data');

      const result = await service['checkRedis']();

      expect(result.details.connectedClients).toBe(42);
    });

    it('should handle missing connected clients info', async () => {
      mockRedis.ping.mockResolvedValue('PONG');
      mockRedis.info.mockResolvedValue('some_stat:123');

      const result = await service['checkRedis']();

      expect(result.details.connectedClients).toBeUndefined();
    });

    it('should return error status on failure', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Redis unavailable'));

      const result = await service['checkRedis']();

      expect(result.status).toBe('error');
      expect(result.error).toBe('Redis unavailable');
      expect(result.latency).toBeUndefined();
    });
  });

  describe('checkMemory', () => {
    it('should return ok status when memory usage is normal', () => {
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: 100 * 1024 * 1024, // 100 MB
        heapTotal: 200 * 1024 * 1024, // 200 MB
        rss: 150 * 1024 * 1024, // 150 MB
        external: 0,
        arrayBuffers: 0,
      });

      const result = service['checkMemory']();

      expect(result.status).toBe('ok');
      expect(result.details.heapUsedMB).toBe(100);
      expect(result.details.heapTotalMB).toBe(200);
      expect(result.details.rssMB).toBe(150);
      expect(result.details.heapUsagePercent).toBe(50);
    });

    it('should return error status when heap usage exceeds 500MB', () => {
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: 600 * 1024 * 1024, // 600 MB
        heapTotal: 1000 * 1024 * 1024,
        rss: 800 * 1024 * 1024,
        external: 0,
        arrayBuffers: 0,
      });

      const result = service['checkMemory']();

      expect(result.status).toBe('error');
      expect(result.details.heapUsedMB).toBe(600);
    });

    it('should calculate heap usage percentage correctly', () => {
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: 75 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        rss: 90 * 1024 * 1024,
        external: 0,
        arrayBuffers: 0,
      });

      const result = service['checkMemory']();

      expect(result.details.heapUsagePercent).toBe(75);
    });
  });

  describe('getMetrics', () => {
    it('should return Prometheus-formatted metrics', () => {
      const metrics = service.getMetrics();

      expect(metrics).toContain('auth_service_uptime_seconds');
      expect(metrics).toContain('auth_service_memory_heap_used_bytes');
      expect(metrics).toContain('auth_service_db_pool_total');
      expect(metrics).toContain('auth_service_db_pool_idle');
      expect(metrics).toContain('auth_service_db_pool_waiting');
    });

    it('should include HELP and TYPE annotations', () => {
      const metrics = service.getMetrics();

      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
      expect(metrics).toContain('gauge');
    });

    it('should include actual metric values', () => {
      const metrics = service.getMetrics();

      expect(metrics).toMatch(/auth_service_uptime_seconds \d+/);
      expect(metrics).toMatch(/auth_service_memory_heap_used_bytes \d+/);
      expect(metrics).toMatch(/auth_service_db_pool_total \d+/);
    });
  });
});

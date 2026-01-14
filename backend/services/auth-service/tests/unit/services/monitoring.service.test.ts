// Mocks
const mockDb = {
  raw: jest.fn(),
};

const mockRedis = {
  ping: jest.fn(),
  info: jest.fn(),
};

const mockPool = {
  totalCount: 10,
  idleCount: 5,
  waitingCount: 0,
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
  pool: mockPool,
}));

jest.mock('../../../src/config/redis', () => ({
  getRedis: jest.fn(() => mockRedis),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

import { MonitoringService, markStartupComplete, markStartupFailed } from '../../../src/services/monitoring.service';

describe('MonitoringService', () => {
  let service: MonitoringService;
  let memoryUsageSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MonitoringService();
    
    // Default successful mocks
    mockDb.raw.mockResolvedValue(true);
    mockRedis.ping.mockResolvedValue('PONG');
    mockRedis.info.mockResolvedValue('connected_clients:5\n');

    // Mock low memory by default
    memoryUsageSpy = jest.spyOn(process, 'memoryUsage').mockReturnValue({
      heapUsed: 50 * 1024 * 1024,
      heapTotal: 200 * 1024 * 1024,
      rss: 150 * 1024 * 1024,
      external: 10 * 1024 * 1024,
      arrayBuffers: 5 * 1024 * 1024,
    });
  });

  afterEach(() => {
    memoryUsageSpy.mockRestore();
  });

  describe('performHealthCheck', () => {
    it('should return healthy status when all checks pass', async () => {
      const result = await service.performHealthCheck();

      expect(result.status).toBe('healthy');
      expect(result.service).toBe('auth-service');
      expect(result.checks.database.status).toBe('ok');
      expect(result.checks.redis.status).toBe('ok');
      expect(result.checks.memory.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy status when database fails', async () => {
      mockDb.raw.mockRejectedValue(new Error('Database connection failed'));

      const result = await service.performHealthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.database.status).toBe('error');
      expect(result.checks.database.error).toBe('Database connection failed');
    });

    it('should return unhealthy status when redis fails', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Redis connection failed'));

      const result = await service.performHealthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.redis.status).toBe('error');
      expect(result.checks.redis.error).toBe('Redis connection failed');
    });

    it('should include latency in check results', async () => {
      const result = await service.performHealthCheck();

      expect(result.checks.database.latency).toBeDefined();
      expect(result.checks.database.latency).toBeGreaterThanOrEqual(0);
      expect(result.checks.redis.latency).toBeDefined();
      expect(result.checks.redis.latency).toBeGreaterThanOrEqual(0);
    });

    it('should include database pool details', async () => {
      const result = await service.performHealthCheck();

      expect(result.checks.database.details).toEqual({
        totalConnections: 10,
        idleConnections: 5,
        waitingConnections: 0,
      });
    });

    it('should include redis client details', async () => {
      const result = await service.performHealthCheck();

      expect(result.checks.redis.details).toEqual({
        connectedClients: 5,
      });
    });

    it('should handle redis info failure gracefully', async () => {
      mockRedis.info.mockRejectedValue(new Error('Info failed'));

      const result = await service.performHealthCheck();

      expect(result.checks.redis.status).toBe('ok');
      expect(result.checks.redis.details.connectedClients).toBeUndefined();
    });

    it('should handle non-Error exceptions in database check', async () => {
      mockDb.raw.mockRejectedValue('String error');

      const result = await service.performHealthCheck();

      expect(result.checks.database.status).toBe('error');
      expect(result.checks.database.error).toBe('Unknown error');
    });

    it('should handle non-Error exceptions in redis check', async () => {
      mockRedis.ping.mockRejectedValue('String error');

      const result = await service.performHealthCheck();

      expect(result.checks.redis.status).toBe('error');
      expect(result.checks.redis.error).toBe('Unknown error');
    });

    it('should return version from env or default', async () => {
      const result = await service.performHealthCheck();

      expect(result.version).toBeDefined();
    });
  });

  describe('checkMemory', () => {
    it('should return ok for normal memory usage', async () => {
      const result = await service.performHealthCheck();

      expect(result.checks.memory.status).toBe('ok');
      expect(result.checks.memory.details).toHaveProperty('heapUsedMB');
      expect(result.checks.memory.details).toHaveProperty('heapTotalMB');
      expect(result.checks.memory.details).toHaveProperty('rssMB');
      expect(result.checks.memory.details).toHaveProperty('heapUsagePercent');
    });

    it('should return error when heap usage exceeds 500MB', async () => {
      memoryUsageSpy.mockReturnValue({
        heapUsed: 600 * 1024 * 1024,
        heapTotal: 1024 * 1024 * 1024,
        rss: 800 * 1024 * 1024,
        external: 0,
        arrayBuffers: 0,
      });

      const result = await service.performHealthCheck();

      expect(result.checks.memory.status).toBe('error');
    });

    it('should return error when heap usage exceeds 90%', async () => {
      memoryUsageSpy.mockReturnValue({
        heapUsed: 95 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        rss: 150 * 1024 * 1024,
        external: 0,
        arrayBuffers: 0,
      });

      const result = await service.performHealthCheck();

      expect(result.checks.memory.status).toBe('error');
    });
  });

  describe('getMetrics', () => {
    it('should return Prometheus-formatted metrics', () => {
      const metrics = service.getMetrics();

      expect(metrics).toContain('auth_service_uptime_seconds');
      expect(metrics).toContain('auth_service_memory_heap_used_bytes');
      expect(metrics).toContain('auth_service_memory_rss_bytes');
      expect(metrics).toContain('auth_service_db_pool_total');
      expect(metrics).toContain('auth_service_db_pool_idle');
      expect(metrics).toContain('auth_service_db_pool_waiting');
      expect(metrics).toContain('auth_service_startup_complete');
    });

    it('should include HELP and TYPE annotations', () => {
      const metrics = service.getMetrics();

      expect(metrics).toContain('# HELP auth_service_uptime_seconds');
      expect(metrics).toContain('# TYPE auth_service_uptime_seconds gauge');
    });

    it('should include pool counts from mock', () => {
      const metrics = service.getMetrics();

      expect(metrics).toContain('auth_service_db_pool_total 10');
      expect(metrics).toContain('auth_service_db_pool_idle 5');
      expect(metrics).toContain('auth_service_db_pool_waiting 0');
    });
  });
});

describe('Startup state functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('markStartupComplete should log info', () => {
    markStartupComplete();
    expect(mockLogger.info).toHaveBeenCalledWith('Startup marked complete');
  });

  it('markStartupFailed should log error', () => {
    markStartupFailed('Test error');
    expect(mockLogger.error).toHaveBeenCalledWith('Startup marked failed', { error: 'Test error' });
  });
});

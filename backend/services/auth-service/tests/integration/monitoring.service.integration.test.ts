import { testPool, testRedis, cleanupAll, closeConnections } from './setup';
import { MonitoringService, markStartupComplete } from '../../src/services/monitoring.service';

// Override the database and redis imports to use test instances
jest.mock('../../src/config/database', () => {
  const knex = require('knex')({
    client: 'pg',
    connection: {
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '5432'),
      database: process.env.TEST_DB_NAME || 'tickettoken_test',
      user: process.env.TEST_DB_USER || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'postgres',
    },
  });
  return {
    db: knex,
    pool: require('./setup').testPool,
  };
});

jest.mock('../../src/config/redis', () => ({
  getRedis: () => require('./setup').testRedis,
  initRedis: jest.fn(),
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('MonitoringService Integration Tests', () => {
  let monitoringService: MonitoringService;

  beforeAll(async () => {
    monitoringService = new MonitoringService();
  });

  afterAll(async () => {
    await closeConnections();
  });

  describe('performHealthCheck', () => {
    it('should return a valid health check result', async () => {
      const result = await monitoringService.performHealthCheck();

      expect(result.status).toMatch(/^(healthy|degraded|unhealthy)$/);
      expect(result.service).toBe('auth-service');
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeGreaterThan(0);
      expect(result.checks).toBeDefined();
    });

    it('should include database check results', async () => {
      const result = await monitoringService.performHealthCheck();

      expect(result.checks.database).toBeDefined();
      expect(result.checks.database.status).toMatch(/^(ok|error)$/);
      expect(result.checks.database.latency).toBeGreaterThanOrEqual(0);
    });

    it('should include database pool details when healthy', async () => {
      const result = await monitoringService.performHealthCheck();

      if (result.checks.database.status === 'ok') {
        expect(result.checks.database.details).toBeDefined();
        expect(result.checks.database.details).toHaveProperty('totalConnections');
        expect(result.checks.database.details).toHaveProperty('idleConnections');
        expect(result.checks.database.details).toHaveProperty('waitingConnections');
      }
    });

    it('should include redis check results', async () => {
      const result = await monitoringService.performHealthCheck();

      expect(result.checks.redis).toBeDefined();
      expect(result.checks.redis.status).toMatch(/^(ok|error)$/);
      expect(result.checks.redis.latency).toBeGreaterThanOrEqual(0);
    });

    it('should include memory check results', async () => {
      const result = await monitoringService.performHealthCheck();

      expect(result.checks.memory).toBeDefined();
      expect(result.checks.memory.status).toMatch(/^(ok|error)$/);
      expect(result.checks.memory.details).toBeDefined();
      expect(result.checks.memory.details.heapUsedMB).toBeGreaterThan(0);
      expect(result.checks.memory.details.heapTotalMB).toBeGreaterThan(0);
      expect(result.checks.memory.details.rssMB).toBeGreaterThan(0);
      expect(typeof result.checks.memory.details.heapUsagePercent).toBe('number');
    });

    it('should return unhealthy when any check fails', async () => {
      const result = await monitoringService.performHealthCheck();

      const hasError = Object.values(result.checks).some(check => check.status === 'error');

      if (hasError) {
        expect(result.status).toBe('unhealthy');
      } else {
        expect(result.status).toBe('healthy');
      }
    });
  });

  describe('getMetrics', () => {
    it('should return Prometheus-formatted metrics', () => {
      const metrics = monitoringService.getMetrics();

      expect(metrics).toContain('# HELP auth_service_uptime_seconds');
      expect(metrics).toContain('# TYPE auth_service_uptime_seconds gauge');
      expect(metrics).toContain('auth_service_uptime_seconds');
    });

    it('should include memory metrics', () => {
      const metrics = monitoringService.getMetrics();

      expect(metrics).toContain('auth_service_memory_heap_used_bytes');
      expect(metrics).toContain('auth_service_memory_rss_bytes');
    });

    it('should include database pool metrics', () => {
      const metrics = monitoringService.getMetrics();

      expect(metrics).toContain('auth_service_db_pool_total');
      expect(metrics).toContain('auth_service_db_pool_idle');
      expect(metrics).toContain('auth_service_db_pool_waiting');
    });

    it('should include startup status metric', () => {
      const metrics = monitoringService.getMetrics();

      expect(metrics).toContain('auth_service_startup_complete');
    });

    it('should return numeric values for metrics', () => {
      const metrics = monitoringService.getMetrics();

      // Check that uptime has a numeric value
      const uptimeMatch = metrics.match(/auth_service_uptime_seconds\s+(\d+\.?\d*)/);
      expect(uptimeMatch).not.toBeNull();
      expect(parseFloat(uptimeMatch![1])).toBeGreaterThan(0);
    });
  });

  describe('markStartupComplete', () => {
    it('should update startup status in metrics', () => {
      markStartupComplete();

      const metrics = monitoringService.getMetrics();
      expect(metrics).toContain('auth_service_startup_complete 1');
    });
  });
});

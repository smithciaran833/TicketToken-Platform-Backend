/**
 * Health Routes Unit Tests
 */

import Fastify, { FastifyInstance } from 'fastify';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockDbRaw = jest.fn();
const mockGetDb = jest.fn(() => ({
  raw: mockDbRaw,
}));

jest.mock('../../../src/config/database', () => ({
  getDb: mockGetDb,
}));

const mockCheckRedisHealth = jest.fn();
jest.mock('../../../src/config/redis', () => ({
  checkRedisHealth: mockCheckRedisHealth,
}));

jest.mock('../../../src/utils/metrics', () => ({
  getPrometheusMetrics: jest.fn().mockReturnValue('# HELP analytics_up Service up\nanalytics_up 1\n'),
  getMetricsStatus: jest.fn().mockReturnValue({
    requestsTotal: 100,
    errorsTotal: 2,
  }),
}));

jest.mock('../../../src/utils/circuit-breaker', () => ({
  getAllCircuits: jest.fn().mockReturnValue(new Map()),
  CircuitState: {
    OPEN: 'OPEN',
    CLOSED: 'CLOSED',
    HALF_OPEN: 'HALF_OPEN',
  },
}));

import { registerHealthRoutes } from '../../../src/routes/health.routes';
import { getPrometheusMetrics } from '../../../src/utils/metrics';

describe('Health Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await registerHealthRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset to healthy defaults before each test
    mockDbRaw.mockResolvedValue([{ result: 1 }]);
    mockCheckRedisHealth.mockResolvedValue({
      healthy: true,
      latencyMs: 5,
    });
    
    // Mock InfluxDB fetch to succeed by default
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
    });
  });

  describe('GET /live', () => {
    it('should return 200 with ok status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/live',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
    });

    it('should respond quickly (< 50ms)', async () => {
      const start = Date.now();
      await app.inject({
        method: 'GET',
        url: '/live',
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });
  });

  describe('GET /livez', () => {
    it('should return 200 with ok status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/livez',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
    });
  });

  describe('GET /ready', () => {
    it('should return 200 when all dependencies are healthy', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ready).toBe(true);
      expect(body.checks).toBeDefined();
      expect(body.checks.postgres).toBe('up');
      expect(body.checks.redis).toBe('up');
    });

    it('should return 503 when postgres is down', async () => {
      mockDbRaw.mockRejectedValue(new Error('Connection failed'));

      const response = await app.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.ready).toBe(false);
      expect(body.checks.postgres).toBe('down');
    });

    it('should return 503 when redis is down', async () => {
      mockCheckRedisHealth.mockResolvedValue({
        healthy: false,
        latencyMs: 0,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.ready).toBe(false);
      expect(body.checks.redis).toBe('down');
    });
  });

  describe('GET /readyz', () => {
    it('should return 200 when ready', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/readyz',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /health', () => {
    it('should return comprehensive health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBeDefined();
      expect(body.timestamp).toBeDefined();
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(body.version).toBeDefined();
      expect(body.service).toBe('analytics-service');
      expect(body.checks).toBeDefined();
    });

    it('should include all dependency checks', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      expect(body.checks.postgres).toBeDefined();
      expect(body.checks.redis).toBeDefined();
      expect(body.checks.influxdb).toBeDefined();
      expect(body.checks.circuitBreakers).toBeDefined();
    });

    it('should return healthy when all systems are up', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.checks.postgres.status).toBe('up');
      expect(body.checks.redis.status).toBe('up');
    });

    it('should include latency metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      expect(body.checks.postgres.latencyMs).toBeGreaterThanOrEqual(0);
      expect(body.checks.redis.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return degraded when influxdb is down', async () => {
      // Mock fetch to fail
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      expect(body.status).toBe('degraded');
    });

    it('should return unhealthy when postgres is down', async () => {
      mockDbRaw.mockRejectedValue(new Error('DB down'));

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('unhealthy');
    });
  });

  describe('GET /healthz', () => {
    it('should be alias for /health', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/healthz',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.service).toBe('analytics-service');
    });
  });

  describe('GET /metrics', () => {
    it('should return prometheus metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.body).toContain('# HELP');
      expect(response.body).toContain('analytics_up');
    });

    it('should call getPrometheusMetrics', async () => {
      await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(getPrometheusMetrics).toHaveBeenCalled();
    });
  });

  describe('GET /_status', () => {
    it('should return internal status information', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/_status',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.service).toBe('analytics-service');
      expect(body.environment).toBeDefined();
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(body.memory).toBeDefined();
    });

    it('should include memory usage', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/_status',
      });

      const body = JSON.parse(response.body);
      expect(body.memory.heapUsed).toBeDefined();
      expect(body.memory.heapTotal).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should handle concurrent health checks', async () => {
      const requests = Array.from({ length: 10 }, () =>
        app.inject({
          method: 'GET',
          url: '/health',
        })
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.statusCode).toBe(200);
      });
    });

    it('should complete health check within SLA (< 1000ms)', async () => {
      const start = Date.now();
      await app.inject({
        method: 'GET',
        url: '/health',
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockDbRaw.mockRejectedValue(new Error('Timeout'));

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBeDefined();
      const body = JSON.parse(response.body);
      expect(body.checks.postgres.status).toBe('down');
    });

    it('should handle redis errors gracefully', async () => {
      mockCheckRedisHealth.mockRejectedValue(new Error('Connection failed'));

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBeDefined();
    });
  });
});

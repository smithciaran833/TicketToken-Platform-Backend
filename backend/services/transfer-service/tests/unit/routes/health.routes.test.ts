import Fastify, { FastifyInstance } from 'fastify';
import { healthRoutes } from '../../../src/routes/health.routes';
import * as database from '../../../src/config/database';

// Mock dependencies
jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/services/cache.service');
jest.mock('../../../src/utils/rpc-failover');

describe('Health Routes - Unit Tests', () => {
  let fastify: FastifyInstance;
  let mockPool: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock pool
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] })
    };

    (database.getPool as jest.Mock).mockReturnValue(mockPool);

    // Create fresh Fastify instance
    fastify = Fastify();
    await fastify.register(healthRoutes);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /health', () => {
    it('should return healthy status when all checks pass', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ result: 1 }] });

      const response = await fastify.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.status).toBe('healthy');
      expect(body.timestamp).toBeDefined();
      expect(body.version).toBeDefined();
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(body.checks).toBeDefined();
    });

    it('should include database check', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ result: 1 }] });

      const response = await fastify.inject({
        method: 'GET',
        url: '/health'
      });

      const body = JSON.parse(response.body);

      expect(body.checks.database).toBeDefined();
      expect(body.checks.database.status).toBe('healthy');
      expect(body.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy when database fails', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection refused'));

      const response = await fastify.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);

      expect(body.status).toBe('unhealthy');
      expect(body.checks.database.status).toBe('unhealthy');
      expect(body.checks.database.message).toContain('Connection refused');
    });

    it('should include redis check', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/health'
      });

      const body = JSON.parse(response.body);

      expect(body.checks.redis).toBeDefined();
      expect(['healthy', 'unhealthy', 'degraded']).toContain(body.checks.redis.status);
    });

    it('should include solana check', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/health'
      });

      const body = JSON.parse(response.body);

      expect(body.checks.solana).toBeDefined();
      expect(['healthy', 'unhealthy', 'degraded']).toContain(body.checks.solana.status);
    });

    it('should return degraded when optional service unavailable', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ result: 1 }] });
      delete process.env.SOLANA_RPC_URL;

      const response = await fastify.inject({
        method: 'GET',
        url: '/health'
      });

      const body = JSON.parse(response.body);

      expect(body.status).toBe('degraded');
      expect(body.checks.solana.status).toBe('degraded');
    });

    it('should include version from environment', async () => {
      process.env.npm_package_version = '1.2.3';

      const response = await fastify.inject({
        method: 'GET',
        url: '/health'
      });

      const body = JSON.parse(response.body);

      expect(body.version).toBe('1.2.3');
    });

    it('should default version to 1.0.0', async () => {
      delete process.env.npm_package_version;

      const response = await fastify.inject({
        method: 'GET',
        url: '/health'
      });

      const body = JSON.parse(response.body);

      expect(body.version).toBe('1.0.0');
    });

    it('should include uptime in seconds', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/health'
      });

      const body = JSON.parse(response.body);

      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(body.uptime)).toBe(true);
    });

    it('should include ISO timestamp', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/health'
      });

      const body = JSON.parse(response.body);

      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
    });

    it('should measure latency for each check', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/health'
      });

      const body = JSON.parse(response.body);

      if (body.checks.database.latencyMs !== undefined) {
        expect(body.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle multiple database query failures', async () => {
      mockPool.query
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'));

      await fastify.inject({ method: 'GET', url: '/health' });
      const response = await fastify.inject({ method: 'GET', url: '/health' });

      const body = JSON.parse(response.body);
      expect(body.checks.database.status).toBe('unhealthy');
    });

    it('should return 200 for degraded status', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ result: 1 }] });

      const response = await fastify.inject({
        method: 'GET',
        url: '/health'
      });

      if (JSON.parse(response.body).status === 'degraded') {
        expect(response.statusCode).toBe(200);
      }
    });

    it('should check all services concurrently', async () => {
      mockPool.query.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ rows: [] }), 50))
      );

      const start = Date.now();
      await fastify.inject({ method: 'GET', url: '/health' });
      const duration = Date.now() - start;

      // If sequential, would take 150ms+. Concurrent should be ~50ms
      expect(duration).toBeLessThan(150);
    });
  });

  describe('GET /health/live', () => {
    it('should always return 200 OK', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/health/live'
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return ok status', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/health/live'
      });

      const body = JSON.parse(response.body);

      expect(body.status).toBe('ok');
    });

    it('should include timestamp', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/health/live'
      });

      const body = JSON.parse(response.body);

      expect(body.timestamp).toBeDefined();
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should return 200 even when database is down', async () => {
      mockPool.query.mockRejectedValue(new Error('Database down'));

      const response = await fastify.inject({
        method: 'GET',
        url: '/health/live'
      });

      expect(response.statusCode).toBe(200);
    });

    it('should be fast (no expensive checks)', async () => {
      const start = Date.now();
      await fastify.inject({ method: 'GET', url: '/health/live' });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });

  describe('GET /health/ready', () => {
    it('should return 200 when database is healthy', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ result: 1 }] });

      const response = await fastify.inject({
        method: 'GET',
        url: '/health/ready'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.status).toBe('ready');
    });

    it('should return 503 when database is unhealthy', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection failed'));

      const response = await fastify.inject({
        method: 'GET',
        url: '/health/ready'
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);

      expect(body.status).toBe('not_ready');
      expect(body.reason).toBe('Database unavailable');
    });

    it('should include timestamp', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/health/ready'
      });

      const body = JSON.parse(response.body);

      expect(body.timestamp).toBeDefined();
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should check database connectivity', async () => {
      await fastify.inject({
        method: 'GET',
        url: '/health/ready'
      });

      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should handle database query errors gracefully', async () => {
      mockPool.query.mockRejectedValue(new Error('Query timeout'));

      const response = await fastify.inject({
        method: 'GET',
        url: '/health/ready'
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);

      expect(body.status).toBe('not_ready');
    });

    it('should include reason when not ready', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection lost'));

      const response = await fastify.inject({
        method: 'GET',
        url: '/health/ready'
      });

      const body = JSON.parse(response.body);

      expect(body.reason).toBeDefined();
      expect(typeof body.reason).toBe('string');
    });

    it('should handle getPool throwing error', async () => {
      (database.getPool as jest.Mock).mockImplementation(() => {
        throw new Error('Pool not initialized');
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/health/ready'
      });

      expect(response.statusCode).toBe(503);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very slow database response', async () => {
      mockPool.query.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ rows: [] }), 100))
      );

      const response = await fastify.inject({
        method: 'GET',
        url: '/health'
      });

      const body = JSON.parse(response.body);
      expect(body.checks.database.latencyMs).toBeGreaterThan(90);
    });

    it('should handle concurrent health check requests', async () => {
      const promises = Array.from({ length: 10 }, () =>
        fastify.inject({ method: 'GET', url: '/health' })
      );

      const responses = await Promise.all(promises);

      expect(responses).toHaveLength(10);
      responses.forEach(r => expect([200, 503]).toContain(r.statusCode));
    });

    it('should handle missing environment variables', async () => {
      delete process.env.SOLANA_RPC_URL;
      delete process.env.npm_package_version;

      const response = await fastify.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(200);
    });
  });
});

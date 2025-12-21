/**
 * Health Routes Integration Tests
 * 
 * Two health endpoints:
 * - /health (app.ts) - Simple static health check
 * - /api/v1/health (health.routes.ts) - Comprehensive health check with DB/Redis
 * - /api/v1/metrics - Prometheus metrics
 */

import { setupTestApp, teardownTestApp, TestContext } from './setup';

describe('Health Routes', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestApp();
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  // ==========================================================================
  // GET /health (simple - from app.ts)
  // ==========================================================================
  describe('GET /health (simple)', () => {
    it('should return healthy status', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('healthy');
      expect(body.service).toBe('event-service');
    });

    it('should not require authentication', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).not.toBe(401);
    });
  });

  // ==========================================================================
  // GET /api/v1/health (comprehensive - from health.routes.ts)
  // ==========================================================================
  describe('GET /api/v1/health (comprehensive)', () => {
    it('should return health status with checks', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      expect([200, 503]).toContain(response.statusCode);
      const body = response.json();
      expect(body.status).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(body.status);
    });

    it('should include timestamp', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      const body = response.json();
      expect(body.timestamp).toBeDefined();
    });

    it('should not require authentication', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      expect(response.statusCode).not.toBe(401);
    });

    it('should return 200 when services are healthy', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      if (response.statusCode === 200) {
        const body = response.json();
        expect(['healthy', 'degraded']).toContain(body.status);
      }
    });
  });

  // ==========================================================================
  // GET /api/v1/metrics
  // ==========================================================================
  describe('GET /api/v1/metrics', () => {
    it('should return prometheus metrics', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/metrics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
    });

    it('should not require authentication', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/metrics',
      });

      expect(response.statusCode).not.toBe(401);
    });

    it('should include process metrics', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/metrics',
      });

      const body = response.payload;
      expect(body).toContain('process_');
    });

    it('should return valid prometheus format', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/metrics',
      });

      const body = response.payload;
      expect(body).toContain('# HELP');
      expect(body).toContain('# TYPE');
    });
  });

  // ==========================================================================
  // Resilience
  // ==========================================================================
  describe('Health endpoint resilience', () => {
    it('should handle rapid successive health checks', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          context.app.inject({ method: 'GET', url: '/health' })
        );
      }

      const responses = await Promise.all(promises);
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });
    });

    it('should handle rapid successive metrics requests', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          context.app.inject({ method: 'GET', url: '/api/v1/metrics' })
        );
      }

      const responses = await Promise.all(promises);
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });
    });
  });
});

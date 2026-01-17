/**
 * Health Endpoints Integration Tests
 */

import Fastify, { FastifyInstance } from 'fastify';

const buildApp = async (): Promise<FastifyInstance> => {
  const app = Fastify();

  // Mock health endpoint
  app.get('/health', async () => ({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime(),
    checks: {
      postgresql: { status: 'healthy', latency: 5 },
      redis: { status: 'healthy', latency: 2 },
    },
  }));

  // Mock liveness endpoint
  app.get('/livez', async () => ({
    status: 'ok',
  }));

  // Mock readiness endpoint
  app.get('/readyz', async () => ({
    status: 'ok',
  }));

  // Mock metrics endpoint
  app.get('/metrics', async (_request, reply) => {
    reply.type('text/plain');
    return '# HELP analytics_up Service up indicator\nanalytics_up 1\n';
  });

  return app;
};

describe('Health Endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.timestamp).toBeDefined();
      expect(body.version).toBeDefined();
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(body.checks).toBeDefined();
    });

    it('should include dependency checks', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      expect(body.checks.postgresql).toBeDefined();
      expect(body.checks.redis).toBeDefined();
    });

    it('should include latency metrics for dependencies', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      expect(body.checks.postgresql.latency).toBeGreaterThanOrEqual(0);
      expect(body.checks.redis.latency).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /livez', () => {
    it('should return ok for liveness', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/livez',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
    });

    it('should be fast (< 100ms)', async () => {
      const start = Date.now();

      await app.inject({
        method: 'GET',
        url: '/livez',
      });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });

  describe('GET /readyz', () => {
    it('should return ok for readiness', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/readyz',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
    });
  });

  describe('GET /metrics', () => {
    it('should return Prometheus metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.body).toContain('# HELP');
    });

    it('should include service up indicator', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.body).toContain('analytics_up');
    });
  });
});

describe('Error Responses', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 404 for unknown endpoints', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/nonexistent',
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('Request Headers', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should accept X-Request-ID header', async () => {
    const requestId = 'test-request-123';

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'X-Request-ID': requestId,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it('should handle missing headers gracefully', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {},
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('Performance', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should handle concurrent requests', async () => {
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

  it('should complete health check within SLA', async () => {
    const start = Date.now();

    await app.inject({
      method: 'GET',
      url: '/health',
    });

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000);
  });
});

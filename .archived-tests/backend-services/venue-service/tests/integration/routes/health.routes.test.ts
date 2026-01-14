/**
 * Health Routes Integration Tests
 * 
 * Tests HTTP endpoints for health checks.
 * Uses app.inject() for in-process HTTP testing.
 * FK Chain: tenants → users → venues (from setup)
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  db
} from '../setup';

describe('Health Routes Integration Tests', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestApp();
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  // ==========================================================================
  // GET /health/live
  // ==========================================================================
  describe('GET /health/live', () => {
    it('should return 200 with alive status', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health/live'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('alive');
      expect(body.timestamp).toBeDefined();
    });

    it('should return valid ISO timestamp', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health/live'
      });

      const body = JSON.parse(response.payload);
      const timestamp = new Date(body.timestamp);
      expect(timestamp.toISOString()).toBe(body.timestamp);
    });
  });

  // ==========================================================================
  // GET /health/ready
  // ==========================================================================
  describe('GET /health/ready', () => {
    it('should return 200 when healthy', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health/ready'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('healthy');
    });

    it('should include database check', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health/ready'
      });

      const body = JSON.parse(response.payload);
      expect(body.checks.database).toBeDefined();
      expect(body.checks.database.status).toBe('ok');
      expect(body.checks.database.responseTime).toBeDefined();
    });

    it('should include redis check', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health/ready'
      });

      const body = JSON.parse(response.payload);
      expect(body.checks.redis).toBeDefined();
      expect(body.checks.redis.status).toBe('ok');
      expect(body.checks.redis.responseTime).toBeDefined();
    });

    it('should include service metadata', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health/ready'
      });

      const body = JSON.parse(response.payload);
      expect(body.service).toBe('venue-service');
      expect(body.version).toBeDefined();
      expect(body.uptime).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });
  });

  // ==========================================================================
  // GET /health/full
  // ==========================================================================
  describe('GET /health/full', () => {
    it('should return 200 when healthy', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health/full'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(['healthy', 'degraded']).toContain(body.status);
    });

    it('should include all basic checks', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health/full'
      });

      const body = JSON.parse(response.payload);
      expect(body.checks.database).toBeDefined();
      expect(body.checks.redis).toBeDefined();
    });

    it('should include business logic checks', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health/full'
      });

      const body = JSON.parse(response.payload);
      expect(body.checks.venueQuery).toBeDefined();
      expect(body.checks.cacheOperations).toBeDefined();
    });

    it('should include venueQuery with count', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health/full'
      });

      const body = JSON.parse(response.payload);
      expect(body.checks.venueQuery.status).toBe('ok');
      expect(body.checks.venueQuery.details).toBeDefined();
      expect(body.checks.venueQuery.details.venueCount).toBeDefined();
    });

    it('should include rabbitMQ check', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health/full'
      });

      const body = JSON.parse(response.payload);
      expect(body.checks.rabbitMQ).toBeDefined();
      // Will be warning since no RabbitMQ in test environment
      expect(body.checks.rabbitMQ.status).toBe('warning');
    });

    it('should include migrations check', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health/full'
      });

      const body = JSON.parse(response.payload);
      expect(body.checks.migrations).toBeDefined();
      expect(['ok', 'warning', 'error']).toContain(body.checks.migrations.status);
    });
  });

  // ==========================================================================
  // GET /health (backward compatibility)
  // ==========================================================================
  describe('GET /health', () => {
    it('should return 200 when healthy', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('ok');
    });

    it('should include service info', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health'
      });

      const body = JSON.parse(response.payload);
      expect(body.service).toBe('venue-service');
      expect(body.version).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });

    it('should include database check', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health'
      });

      const body = JSON.parse(response.payload);
      expect(body.checks.database).toBe('ok');
    });

    it('should include redis check', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health'
      });

      const body = JSON.parse(response.payload);
      expect(body.checks.redis).toBe('ok');
    });

    it('should return valid ISO timestamp', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health'
      });

      const body = JSON.parse(response.payload);
      const timestamp = new Date(body.timestamp);
      expect(timestamp.toISOString()).toBe(body.timestamp);
    });
  });

  // ==========================================================================
  // HTTP Status Codes
  // ==========================================================================
  describe('HTTP Status Codes', () => {
    it('should return 200 for healthy status on /health/ready', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health/ready'
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 200 for healthy/degraded status on /health/full', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health/full'
      });

      // Should be 200 for both healthy and degraded
      expect(response.statusCode).toBe(200);
    });
  });
});

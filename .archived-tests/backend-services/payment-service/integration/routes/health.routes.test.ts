/**
 * Health Routes Integration Tests
 */

import Fastify, { FastifyInstance } from 'fastify';
import healthRoutes from '../../../src/routes/health.routes';

describe('Health Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(healthRoutes);
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
      expect(body.service).toBe('payment-service');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('GET /health/db', () => {
    it('should return database health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/db',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.database).toBe('connected');
      expect(body.responseTime).toBeDefined();
      expect(body.service).toBe('payment-service');
    });
  });

  describe('GET /health/redis', () => {
    it('should return redis health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/redis',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.redis).toBe('connected');
      expect(body.responseTime).toBeDefined();
      expect(body.service).toBe('payment-service');
    });
  });

  describe('GET /health/stripe', () => {
    it('should return stripe health status or not_configured', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/stripe',
      });

      const body = JSON.parse(response.body);
      expect(body.service).toBe('payment-service');
      
      // Either healthy (if real key) or not_configured/error (if test key)
      expect(['healthy', 'error', 'not_configured']).toContain(body.status);
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness status with all checks', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready',
      });

      const body = JSON.parse(response.body);
      expect(body.service).toBe('payment-service');
      expect(body.checks).toBeDefined();
      expect(body.checks.database).toBeDefined();
      expect(body.checks.redis).toBeDefined();
      expect(body.checks.stripe).toBeDefined();

      if (body.checks.database && body.checks.redis) {
        expect(response.statusCode).toBe(200);
        expect(body.status).toBe('ready');
      } else {
        expect(response.statusCode).toBe(503);
        expect(body.status).toBe('not_ready');
      }
    });
  });
});

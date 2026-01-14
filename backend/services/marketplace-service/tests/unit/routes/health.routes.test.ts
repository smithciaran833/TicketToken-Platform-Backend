/**
 * Unit Tests for Health Routes
 * Tests health check endpoints including liveness, readiness, and deep health
 */

import Fastify, { FastifyInstance } from 'fastify';
import healthRoutes from '../../../src/routes/health.routes';

// Mock dependencies
jest.mock('../../../src/config/database', () => ({
  __esModule: true,
  default: {
    raw: jest.fn(),
  },
}));

jest.mock('../../../src/config/redis', () => ({
  cache: {
    get: jest.fn(),
  },
}));

jest.mock('../../../src/utils/circuit-breaker', () => ({
  getAllCircuitStates: jest.fn().mockReturnValue({
    'blockchain-service': { state: 'CLOSED', failures: 0 },
    'stripe-service': { state: 'CLOSED', failures: 0 },
  }),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

describe('Health Routes', () => {
  let fastify: FastifyInstance;
  const knex = require('../../../src/config/database').default;
  const { cache } = require('../../../src/config/redis');

  beforeEach(async () => {
    jest.clearAllMocks();
    fastify = Fastify();
    await fastify.register(healthRoutes);
    await fastify.ready();

    // Default healthy mocks
    knex.raw.mockResolvedValue({ rows: [{ health: 1 }] });
    cache.get.mockResolvedValue(null);
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /live', () => {
    it('should return alive status', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/live',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('alive');
      expect(body).toHaveProperty('timestamp');
    });
  });

  describe('GET /ready', () => {
    it('should return healthy when all dependencies are up', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body).toHaveProperty('dependencies');
      expect(body.dependencies.database.status).toBe('healthy');
      expect(body.dependencies.redis.status).toBe('healthy');
    });

    it('should return 503 when database is unhealthy', async () => {
      knex.raw.mockRejectedValue(new Error('Connection refused'));

      const response = await fastify.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('unhealthy');
      expect(body.dependencies.database.status).toBe('unhealthy');
    });

    it('should return 503 when redis is unhealthy', async () => {
      cache.get.mockRejectedValue(new Error('Connection refused'));

      const response = await fastify.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('unhealthy');
      expect(body.dependencies.redis.status).toBe('unhealthy');
    });
  });

  describe('GET /health', () => {
    it('should return detailed health with all dependencies', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body).toHaveProperty('version');
      expect(body).toHaveProperty('uptime');
      expect(body).toHaveProperty('dependencies');
      expect(body).toHaveProperty('circuitBreakers');
    });

    it('should include circuit breaker states', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      expect(body.circuitBreakers).toHaveProperty('blockchain-service');
      expect(body.circuitBreakers['blockchain-service'].state).toBe('CLOSED');
    });
  });

  describe('GET /metrics', () => {
    it('should return Prometheus-formatted metrics', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.body).toContain('marketplace_uptime_seconds');
      expect(response.body).toContain('marketplace_health_status');
      expect(response.body).toContain('marketplace_circuit_breaker_status');
    });

    it('should report healthy database status as 1', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.body).toContain('marketplace_health_status{dependency="database"} 1');
    });

    it('should report unhealthy database status as 0', async () => {
      knex.raw.mockRejectedValue(new Error('Connection refused'));

      const response = await fastify.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.body).toContain('marketplace_health_status{dependency="database"} 0');
    });
  });
});

/**
 * Unit tests for health.routes.ts
 * Tests route registration, inline handlers, and health check behavior
 * Note: This route file has NO authentication (critical for K8s probes)
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import healthRoutes from '../../../src/routes/health.routes';

// Mock dependencies
jest.mock('../../../src/utils/metrics', () => ({
  register: {
    metrics: jest.fn().mockResolvedValue('# HELP metric\n# TYPE metric counter\nmetric 1')
  }
}));

jest.mock('../../../src/services/healthCheck.service', () => ({
  HealthCheckService: jest.fn().mockImplementation(() => ({
    performReadinessCheck: jest.fn().mockResolvedValue({ status: 'ready', timestamp: new Date().toISOString() }),
    performStartupCheck: jest.fn().mockResolvedValue({ ready: true, message: 'Service initialized' }),
    performHealthCheck: jest.fn().mockResolvedValue({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: { database: { status: 'ok' }, redis: { status: 'ok' } }
    })
  }))
}));

jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    getPool: jest.fn().mockReturnValue({})
  }
}));

jest.mock('../../../src/config/redis', () => ({
  getRedis: jest.fn().mockReturnValue({})
}));

import { register } from '../../../src/utils/metrics';
import { HealthCheckService } from '../../../src/services/healthCheck.service';
import { DatabaseService } from '../../../src/services/databaseService';
import { getRedis } from '../../../src/config/redis';

describe('Health Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(healthRoutes);
    await app.ready();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Route Registration', () => {
    it('should register GET /health/live route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/health/live');
    });

    it('should register GET /health/ready route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/health/ready');
    });

    it('should register GET /health/startup route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/health/startup');
    });

    it('should register GET /health route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/health');
    });

    it('should register GET /metrics route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/metrics');
    });

    it('should register GET /health/dependencies route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/health/dependencies');
    });
  });

  describe('GET /health/live (Liveness Probe)', () => {
    it('should return 200 OK immediately', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/live'
      });

      expect(response.statusCode).toBe(200);
    });

    it('should not require authentication', async () => {
      // This is a critical security requirement for K8s probes
      const response = await app.inject({
        method: 'GET',
        url: '/health/live'
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return status ok', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/live'
      });

      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
    });

    it('should return timestamp', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/live'
      });

      const body = JSON.parse(response.body);
      expect(body.timestamp).toBeDefined();
      expect(typeof body.timestamp).toBe('number');
    });

    it('should return service name', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/live'
      });

      const body = JSON.parse(response.body);
      expect(body.service).toBe('event-service');
    });

    it('should NOT call any external dependencies', async () => {
      await app.inject({
        method: 'GET',
        url: '/health/live'
      });

      // Liveness should NOT check DB or Redis
      expect(DatabaseService.getPool).not.toHaveBeenCalled();
      expect(getRedis).not.toHaveBeenCalled();
    });
  });

  describe('GET /health/ready (Readiness Probe)', () => {
    it('should return 200 when ready', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready'
      });

      expect(response.statusCode).toBe(200);
    });

    it('should call database pool', async () => {
      await app.inject({
        method: 'GET',
        url: '/health/ready'
      });

      expect(DatabaseService.getPool).toHaveBeenCalled();
    });

    it('should call redis', async () => {
      await app.inject({
        method: 'GET',
        url: '/health/ready'
      });

      expect(getRedis).toHaveBeenCalled();
    });

    it('should return 503 when not ready', async () => {
      const mockHealthService = {
        performReadinessCheck: jest.fn().mockResolvedValue({ status: 'not_ready' })
      };
      (HealthCheckService as jest.Mock).mockImplementation(() => mockHealthService);
      
      // Re-register routes with updated mock
      const testApp = Fastify();
      await testApp.register(healthRoutes);
      await testApp.ready();

      const response = await testApp.inject({
        method: 'GET',
        url: '/health/ready'
      });

      expect(response.statusCode).toBe(503);
      await testApp.close();
    });

    it('should not require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready'
      });

      // Should work without auth headers
      expect([200, 503]).toContain(response.statusCode);
    });
  });

  describe('GET /health/startup (Startup Probe)', () => {
    it('should return 200 when initialized', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/startup'
      });

      expect(response.statusCode).toBe(200);
    });

    it('should call database pool', async () => {
      await app.inject({
        method: 'GET',
        url: '/health/startup'
      });

      expect(DatabaseService.getPool).toHaveBeenCalled();
    });

    it('should return ready status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/startup'
      });

      const body = JSON.parse(response.body);
      expect(body.ready).toBe(true);
    });

    it('should return 503 when not initialized', async () => {
      const mockHealthService = {
        performReadinessCheck: jest.fn(),
        performStartupCheck: jest.fn().mockResolvedValue({ ready: false, message: 'Not initialized' }),
        performHealthCheck: jest.fn()
      };
      (HealthCheckService as jest.Mock).mockImplementation(() => mockHealthService);
      
      const testApp = Fastify();
      await testApp.register(healthRoutes);
      await testApp.ready();

      const response = await testApp.inject({
        method: 'GET',
        url: '/health/startup'
      });

      expect(response.statusCode).toBe(503);
      await testApp.close();
    });
  });

  describe('GET /health (Comprehensive Health Check)', () => {
    it('should return 200 when healthy', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
    });

    it('should include checks object', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      const body = JSON.parse(response.body);
      expect(body.checks).toBeDefined();
    });

    it('should accept include_deps query parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health?include_deps=true'
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 200 for degraded status', async () => {
      const mockHealthService = {
        performReadinessCheck: jest.fn(),
        performStartupCheck: jest.fn(),
        performHealthCheck: jest.fn().mockResolvedValue({ status: 'degraded', checks: {} })
      };
      (HealthCheckService as jest.Mock).mockImplementation(() => mockHealthService);
      
      const testApp = Fastify();
      await testApp.register(healthRoutes);
      await testApp.ready();

      const response = await testApp.inject({
        method: 'GET',
        url: '/health'
      });

      // Degraded should return 200 (not 503)
      expect(response.statusCode).toBe(200);
      await testApp.close();
    });

    it('should return 503 for unhealthy status', async () => {
      const mockHealthService = {
        performReadinessCheck: jest.fn(),
        performStartupCheck: jest.fn(),
        performHealthCheck: jest.fn().mockResolvedValue({ status: 'unhealthy', checks: {} })
      };
      (HealthCheckService as jest.Mock).mockImplementation(() => mockHealthService);
      
      const testApp = Fastify();
      await testApp.register(healthRoutes);
      await testApp.ready();

      const response = await testApp.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(503);
      await testApp.close();
    });
  });

  describe('GET /metrics (Prometheus)', () => {
    it('should return 200', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics'
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return text/plain content type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics'
      });

      expect(response.headers['content-type']).toContain('text/plain');
    });

    it('should call register.metrics()', async () => {
      await app.inject({
        method: 'GET',
        url: '/metrics'
      });

      expect(register.metrics).toHaveBeenCalled();
    });

    it('should return prometheus format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics'
      });

      expect(response.body).toContain('# HELP');
      expect(response.body).toContain('# TYPE');
    });
  });

  describe('GET /health/dependencies', () => {
    it('should return 200', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/dependencies'
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return timestamp', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/dependencies'
      });

      const body = JSON.parse(response.body);
      expect(body.timestamp).toBeDefined();
    });

    it('should return local dependencies', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/dependencies'
      });

      const body = JSON.parse(response.body);
      expect(body.local).toBeDefined();
    });

    it('should return external dependencies', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/dependencies'
      });

      const body = JSON.parse(response.body);
      expect(body.external).toBeDefined();
    });
  });

  describe('No Authentication (Critical)', () => {
    it('GET /health/live should work without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/live',
        headers: {} // No auth headers
      });

      expect(response.statusCode).toBe(200);
    });

    it('GET /health/ready should work without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready',
        headers: {}
      });

      expect([200, 503]).toContain(response.statusCode);
    });

    it('GET /health/startup should work without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/startup',
        headers: {}
      });

      expect([200, 503]).toContain(response.statusCode);
    });

    it('GET /health should work without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {}
      });

      expect([200, 503]).toContain(response.statusCode);
    });

    it('GET /metrics should work without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
        headers: {}
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Error Handling', () => {
    it('should return 503 when readiness check throws', async () => {
      const mockHealthService = {
        performReadinessCheck: jest.fn().mockRejectedValue(new Error('DB connection failed')),
        performStartupCheck: jest.fn(),
        performHealthCheck: jest.fn()
      };
      (HealthCheckService as jest.Mock).mockImplementation(() => mockHealthService);
      
      const testApp = Fastify();
      await testApp.register(healthRoutes);
      await testApp.ready();

      const response = await testApp.inject({
        method: 'GET',
        url: '/health/ready'
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('not_ready');
      await testApp.close();
    });

    it('should return 503 when startup check throws', async () => {
      const mockHealthService = {
        performReadinessCheck: jest.fn(),
        performStartupCheck: jest.fn().mockRejectedValue(new Error('Init failed')),
        performHealthCheck: jest.fn()
      };
      (HealthCheckService as jest.Mock).mockImplementation(() => mockHealthService);
      
      const testApp = Fastify();
      await testApp.register(healthRoutes);
      await testApp.ready();

      const response = await testApp.inject({
        method: 'GET',
        url: '/health/startup'
      });

      expect(response.statusCode).toBe(503);
      await testApp.close();
    });

    it('should return 503 when health check throws', async () => {
      const mockHealthService = {
        performReadinessCheck: jest.fn(),
        performStartupCheck: jest.fn(),
        performHealthCheck: jest.fn().mockRejectedValue(new Error('Health check failed'))
      };
      (HealthCheckService as jest.Mock).mockImplementation(() => mockHealthService);
      
      const testApp = Fastify();
      await testApp.register(healthRoutes);
      await testApp.ready();

      const response = await testApp.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(503);
      await testApp.close();
    });
  });
});

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import healthRoutes from '../../src/routes/health.routes';

// Mock dependencies
jest.mock('../../src/config/database');
jest.mock('../../src/providers/provider-factory');

const mockDb = require('../../src/config/database');
const mockProviderFactory = require('../../src/providers/provider-factory');

describe('Health Check Integration Tests', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    app = Fastify();
    await app.register(healthRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /health - Basic Health Check', () => {
    it('should return OK when service is running', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.service).toBe('notification-service');
    });

    it('should respond quickly', async () => {
      const startTime = Date.now();
      
      await app.inject({
        method: 'GET',
        url: '/health'
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should respond within 100ms
    });

    it('should not require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health'
        // No auth headers
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle multiple concurrent health checks', async () => {
      const requests = Array(10).fill(null).map(() =>
        app.inject({
          method: 'GET',
          url: '/health'
        })
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.status).toBe('ok');
      });
    });

    it('should return consistent response structure', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('service');
      expect(typeof body.status).toBe('string');
      expect(typeof body.service).toBe('string');
    });
  });

  describe('GET /health/db - Database Health Check', () => {
    it('should return OK when database is connected', async () => {
      mockDb.db = {
        raw: jest.fn().mockResolvedValue([{ result: 1 }])
      };

      const response = await app.inject({
        method: 'GET',
        url: '/health/db'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.database).toBe('connected');
      expect(body.service).toBe('notification-service');
      expect(mockDb.db.raw).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return 503 when database is disconnected', async () => {
      mockDb.db = {
        raw: jest.fn().mockRejectedValue(new Error('Connection refused'))
      };

      const response = await app.inject({
        method: 'GET',
        url: '/health/db'
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('error');
      expect(body.database).toBe('disconnected');
      expect(body.error).toBe('Connection refused');
      expect(body.service).toBe('notification-service');
    });

    it('should handle database timeout errors', async () => {
      mockDb.db = {
        raw: jest.fn().mockRejectedValue(new Error('Query timeout'))
      };

      const response = await app.inject({
        method: 'GET',
        url: '/health/db'
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('error');
      expect(body.error).toContain('timeout');
    });

    it('should handle database connection pool exhaustion', async () => {
      mockDb.db = {
        raw: jest.fn().mockRejectedValue(new Error('Pool exhausted'))
      };

      const response = await app.inject({
        method: 'GET',
        url: '/health/db'
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('error');
      expect(body.error).toContain('Pool exhausted');
    });

    it('should handle authentication errors', async () => {
      mockDb.db = {
        raw: jest.fn().mockRejectedValue(new Error('Authentication failed'))
      };

      const response = await app.inject({
        method: 'GET',
        url: '/health/db'
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('error');
      expect(body.error).toContain('Authentication failed');
    });

    it('should verify database connection on each check', async () => {
      mockDb.db = {
        raw: jest.fn()
          .mockResolvedValueOnce([{ result: 1 }])
          .mockRejectedValueOnce(new Error('Connection lost'))
      };

      // First check - success
      const response1 = await app.inject({
        method: 'GET',
        url: '/health/db'
      });
      expect(response1.statusCode).toBe(200);

      // Second check - failure
      const response2 = await app.inject({
        method: 'GET',
        url: '/health/db'
      });
      expect(response2.statusCode).toBe(503);
    });
  });

  describe('GET /health/providers - Provider Health Check', () => {
    it('should return OK when all providers are operational', async () => {
      mockProviderFactory.ProviderFactory = {
        getProvidersStatus: jest.fn().mockResolvedValue({
          email: {
            provider: 'sendgrid',
            status: 'operational',
            initialized: true
          },
          sms: {
            provider: 'twilio',
            status: 'operational',
            initialized: true
          }
        }),
        verifyProviders: jest.fn().mockResolvedValue(true)
      };

      const response = await app.inject({
        method: 'GET',
        url: '/health/providers'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.providers).toBeDefined();
      expect(body.providers.email.status).toBe('operational');
      expect(body.providers.sms.status).toBe('operational');
      expect(body.service).toBe('notification-service');
    });

    it('should return degraded status when some providers are unavailable', async () => {
      mockProviderFactory.ProviderFactory = {
        getProvidersStatus: jest.fn().mockResolvedValue({
          email: {
            provider: 'sendgrid',
            status: 'operational',
            initialized: true
          },
          sms: {
            provider: 'twilio',
            status: 'degraded',
            initialized: true,
            error: 'Rate limit exceeded'
          }
        }),
        verifyProviders: jest.fn().mockResolvedValue(false)
      };

      const response = await app.inject({
        method: 'GET',
        url: '/health/providers'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('degraded');
      expect(body.providers.email.status).toBe('operational');
      expect(body.providers.sms.status).toBe('degraded');
    });

    it('should return 503 when provider status check fails', async () => {
      mockProviderFactory.ProviderFactory = {
        getProvidersStatus: jest.fn().mockRejectedValue(new Error('Provider check failed')),
        verifyProviders: jest.fn().mockRejectedValue(new Error('Verification failed'))
      };

      const response = await app.inject({
        method: 'GET',
        url: '/health/providers'
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('error');
      expect(body.error).toBe('Provider check failed');
    });

    it('should handle email provider unavailable', async () => {
      mockProviderFactory.ProviderFactory = {
        getProvidersStatus: jest.fn().mockResolvedValue({
          email: {
            provider: 'sendgrid',
            status: 'error',
            initialized: false,
            error: 'API key invalid'
          },
          sms: {
            provider: 'twilio',
            status: 'operational',
            initialized: true
          }
        }),
        verifyProviders: jest.fn().mockResolvedValue(false)
      };

      const response = await app.inject({
        method: 'GET',
        url: '/health/providers'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('degraded');
      expect(body.providers.email.status).toBe('error');
      expect(body.providers.email.error).toBe('API key invalid');
    });

    it('should handle SMS provider unavailable', async () => {
      mockProviderFactory.ProviderFactory = {
        getProvidersStatus: jest.fn().mockResolvedValue({
          email: {
            provider: 'sendgrid',
            status: 'operational',
            initialized: true
          },
          sms: {
            provider: 'twilio',
            status: 'error',
            initialized: false,
            error: 'Invalid credentials'
          }
        }),
        verifyProviders: jest.fn().mockResolvedValue(false)
      };

      const response = await app.inject({
        method: 'GET',
        url: '/health/providers'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('degraded');
      expect(body.providers.sms.status).toBe('error');
      expect(body.providers.sms.error).toBe('Invalid credentials');
    });

    it('should handle all providers unavailable', async () => {
      mockProviderFactory.ProviderFactory = {
        getProvidersStatus: jest.fn().mockResolvedValue({
          email: {
            provider: 'sendgrid',
            status: 'error',
            initialized: false,
            error: 'Service unavailable'
          },
          sms: {
            provider: 'twilio',
            status: 'error',
            initialized: false,
            error: 'Service unavailable'
          }
        }),
        verifyProviders: jest.fn().mockResolvedValue(false)
      };

      const response = await app.inject({
        method: 'GET',
        url: '/health/providers'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('degraded');
      expect(body.providers.email.status).toBe('error');
      expect(body.providers.sms.status).toBe('error');
    });
  });

  describe('Health Check Error Scenarios', () => {
    it('should handle database and providers both failing', async () => {
      mockDb.db = {
        raw: jest.fn().mockRejectedValue(new Error('Database down'))
      };

      mockProviderFactory.ProviderFactory = {
        getProvidersStatus: jest.fn().mockRejectedValue(new Error('Providers unavailable')),
        verifyProviders: jest.fn().mockRejectedValue(new Error('Verification failed'))
      };

      const dbResponse = await app.inject({
        method: 'GET',
        url: '/health/db'
      });

      const providersResponse = await app.inject({
        method: 'GET',
        url: '/health/providers'
      });

      expect(dbResponse.statusCode).toBe(503);
      expect(providersResponse.statusCode).toBe(503);
    });

    it('should maintain basic health check even when subsystems fail', async () => {
      mockDb.db = {
        raw: jest.fn().mockRejectedValue(new Error('Database down'))
      };

      // Basic health should still work
      const healthResponse = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(healthResponse.statusCode).toBe(200);
    });

    it('should handle intermittent failures', async () => {
      let callCount = 0;
      mockDb.db = {
        raw: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount % 2 === 0) {
            return Promise.resolve([{ result: 1 }]);
          }
          return Promise.reject(new Error('Intermittent failure'));
        })
      };

      const response1 = await app.inject({
        method: 'GET',
        url: '/health/db'
      });
      expect(response1.statusCode).toBe(503);

      const response2 = await app.inject({
        method: 'GET',
        url: '/health/db'
      });
      expect(response2.statusCode).toBe(200);
    });

    it('should handle slow database responses', async () => {
      mockDb.db = {
        raw: jest.fn().mockImplementation(() =>
          new Promise(resolve => setTimeout(() => resolve([{ result: 1 }]), 100))
        )
      };

      const startTime = Date.now();
      const response = await app.inject({
        method: 'GET',
        url: '/health/db'
      });
      const duration = Date.now() - startTime;

      expect(response.statusCode).toBe(200);
      expect(duration).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Health Check Response Format', () => {
    it('should return consistent JSON format for all endpoints', async () => {
      mockDb.db = {
        raw: jest.fn().mockResolvedValue([{ result: 1 }])
      };

      mockProviderFactory.ProviderFactory = {
        getProvidersStatus: jest.fn().mockResolvedValue({}),
        verifyProviders: jest.fn().mockResolvedValue(true)
      };

      const healthResponse = await app.inject({
        method: 'GET',
        url: '/health'
      });

      const dbResponse = await app.inject({
        method: 'GET',
        url: '/health/db'
      });

      const providersResponse = await app.inject({
        method: 'GET',
        url: '/health/providers'
      });

      // All should return valid JSON
      expect(() => JSON.parse(healthResponse.body)).not.toThrow();
      expect(() => JSON.parse(dbResponse.body)).not.toThrow();
      expect(() => JSON.parse(providersResponse.body)).not.toThrow();

      // All should have status field
      expect(JSON.parse(healthResponse.body)).toHaveProperty('status');
      expect(JSON.parse(dbResponse.body)).toHaveProperty('status');
      expect(JSON.parse(providersResponse.body)).toHaveProperty('status');

      // All should have service field
      expect(JSON.parse(healthResponse.body)).toHaveProperty('service');
      expect(JSON.parse(dbResponse.body)).toHaveProperty('service');
      expect(JSON.parse(providersResponse.body)).toHaveProperty('service');
    });

    it('should include service name in all responses', async () => {
      mockDb.db = {
        raw: jest.fn().mockResolvedValue([{ result: 1 }])
      };

      const healthResponse = await app.inject({
        method: 'GET',
        url: '/health'
      });

      const dbResponse = await app.inject({
        method: 'GET',
        url: '/health/db'
      });

      const healthBody = JSON.parse(healthResponse.body);
      const dbBody = JSON.parse(dbResponse.body);

      expect(healthBody.service).toBe('notification-service');
      expect(dbBody.service).toBe('notification-service');
    });
  });

  describe('Health Check for Monitoring Systems', () => {
    it('should support Kubernetes liveness probe', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      // Should return 200 OK for liveness
      expect(response.statusCode).toBe(200);
    });

    it('should support Kubernetes readiness probe', async () => {
      mockDb.db = {
        raw: jest.fn().mockResolvedValue([{ result: 1 }])
      };

      mockProviderFactory.ProviderFactory = {
        getProvidersStatus: jest.fn().mockResolvedValue({
          email: { status: 'operational' },
          sms: { status: 'operational' }
        }),
        verifyProviders: jest.fn().mockResolvedValue(true)
      };

      const dbResponse = await app.inject({
        method: 'GET',
        url: '/health/db'
      });

      const providersResponse = await app.inject({
        method: 'GET',
        url: '/health/providers'
      });

      // Both should be healthy for readiness
      expect(dbResponse.statusCode).toBe(200);
      expect(providersResponse.statusCode).toBe(200);
    });

    it('should provide detailed status for monitoring dashboards', async () => {
      mockProviderFactory.ProviderFactory = {
        getProvidersStatus: jest.fn().mockResolvedValue({
          email: {
            provider: 'sendgrid',
            status: 'operational',
            initialized: true,
            lastCheck: new Date().toISOString()
          },
          sms: {
            provider: 'twilio',
            status: 'operational',
            initialized: true,
            lastCheck: new Date().toISOString()
          }
        }),
        verifyProviders: jest.fn().mockResolvedValue(true)
      };

      const response = await app.inject({
        method: 'GET',
        url: '/health/providers'
      });

      const body = JSON.parse(response.body);
      expect(body.providers).toBeDefined();
      expect(body.providers.email).toBeDefined();
      expect(body.providers.sms).toBeDefined();
    });
  });
});

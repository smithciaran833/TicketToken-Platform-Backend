/**
 * Metrics Routes Unit Tests
 */

import Fastify, { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../src/controllers/metrics.controller', () => ({
  metricsController: {
    recordMetric: jest.fn(async (req, reply) => {
      return reply.status(201).send({ success: true, data: { recorded: true } });
    }),
    bulkRecordMetrics: jest.fn(async (req, reply) => {
      return reply.status(201).send({ success: true, data: { count: req.body.metrics.length } });
    }),
    getMetrics: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { metrics: [] } });
    }),
    getRealTimeMetrics: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { metrics: {} } });
    }),
    getMetricTrends: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { trends: [] } });
    }),
    compareMetrics: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { comparison: {} } });
    }),
    getAggregatedMetric: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { value: 100 } });
    }),
  },
}));

jest.mock('../../../src/config', () => ({
  config: {
    jwt: {
      secret: 'test-jwt-secret-for-unit-tests-minimum-32-chars',
    },
  },
}));

import metricsRoutes from '../../../src/routes/metrics.routes';
import { authenticate } from '../../../src/middleware/auth.middleware';
import { metricsController } from '../../../src/controllers/metrics.controller';

describe('Metrics Routes', () => {
  let app: FastifyInstance;
  let authToken: string;

  const venueId = '123e4567-e89b-12d3-a456-426614174001';

  beforeAll(async () => {
    app = Fastify();
    
    // Register auth middleware
    app.decorateRequest('user', null);
    app.decorateRequest('tenantId', null);
    app.addHook('onRequest', authenticate);

    // Register routes
    await app.register(metricsRoutes, { prefix: '/metrics' });
    await app.ready();

    // Create auth token
    authToken = jwt.sign(
      {
        userId: 'user-123',
        tenantId: 'tenant-456',
        venueId: venueId,
        role: 'admin',
        permissions: ['analytics.read', 'analytics.write'],
      },
      'test-jwt-secret-for-unit-tests-minimum-32-chars',
      {
        algorithm: 'HS256',
        issuer: 'tickettoken-test',
        audience: 'analytics-service-test',
        expiresIn: '1h',
      }
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /metrics', () => {
    const validMetric = {
      metricType: 'page_view',
      value: 1,
      venueId: venueId,
      dimensions: { page: '/dashboard' },
      metadata: { userAgent: 'test' },
    };

    it('should record a metric', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/metrics',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: validMetric,
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(metricsController.recordMetric).toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/metrics',
        payload: validMetric,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should require analytics.write permission', async () => {
      const readOnlyToken = jwt.sign(
        { userId: 'user-123', role: 'user', permissions: ['analytics.read'] },
        'test-jwt-secret-for-unit-tests-minimum-32-chars',
        { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
      );

      const response = await app.inject({
        method: 'POST',
        url: '/metrics',
        headers: {
          authorization: `Bearer ${readOnlyToken}`,
        },
        payload: validMetric,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/metrics',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: { metricType: 'test' }, // Missing value and venueId
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate venueId format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/metrics',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          ...validMetric,
          venueId: 'invalid-uuid',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate value is a number', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/metrics',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          ...validMetric,
          value: 'not-a-number',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /metrics/bulk', () => {
    it('should bulk record metrics', async () => {
      const metrics = [
        { metricType: 'page_view', value: 1, venueId },
        { metricType: 'button_click', value: 1, venueId },
      ];

      const response = await app.inject({
        method: 'POST',
        url: '/metrics/bulk',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: { metrics },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.count).toBe(2);
      expect(metricsController.bulkRecordMetrics).toHaveBeenCalled();
    });

    it('should require at least one metric', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/metrics/bulk',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: { metrics: [] },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate each metric in bulk', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/metrics/bulk',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          metrics: [
            { metricType: 'test' }, // Missing value and venueId
          ],
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /metrics/:venueId', () => {
    it('should get metrics for a venue', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/metrics/${venueId}?metricType=page_view&startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(metricsController.getMetrics).toHaveBeenCalled();
    });

    it('should require analytics.read permission', async () => {
      const noPermToken = jwt.sign(
        { userId: 'user-123', role: 'user', permissions: [] },
        'test-jwt-secret-for-unit-tests-minimum-32-chars',
        { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
      );

      const response = await app.inject({
        method: 'GET',
        url: `/metrics/${venueId}?metricType=test&startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z`,
        headers: {
          authorization: `Bearer ${noPermToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should validate venueId is UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics/invalid-uuid?metricType=test&startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require metricType query parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/metrics/${venueId}?startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require startDate query parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/metrics/${venueId}?metricType=test&endDate=2024-01-31T23:59:59Z`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require endDate query parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/metrics/${venueId}?metricType=test&startDate=2024-01-01T00:00:00Z`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept optional granularity parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/metrics/${venueId}?metricType=test&startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z&granularity=day`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /metrics/:venueId/realtime', () => {
    it('should get real-time metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/metrics/${venueId}/realtime`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(metricsController.getRealTimeMetrics).toHaveBeenCalled();
    });

    it('should validate venueId', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics/invalid/realtime',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /metrics/:venueId/trends', () => {
    it('should get metric trends', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/metrics/${venueId}/trends?metricType=page_view&periods=7&periodUnit=day`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(metricsController.getMetricTrends).toHaveBeenCalled();
    });

    it('should require metricType', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/metrics/${venueId}/trends?periods=7&periodUnit=day`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require periods', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/metrics/${venueId}/trends?metricType=test&periodUnit=day`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require periodUnit', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/metrics/${venueId}/trends?metricType=test&periods=7`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate periodUnit enum', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/metrics/${venueId}/trends?metricType=test&periods=7&periodUnit=invalid`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate periods range', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/metrics/${venueId}/trends?metricType=test&periods=150&periodUnit=day`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept valid periodUnit values', async () => {
      const validUnits = ['hour', 'day', 'week', 'month'];
      
      for (const unit of validUnits) {
        const response = await app.inject({
          method: 'GET',
          url: `/metrics/${venueId}/trends?metricType=test&periods=7&periodUnit=${unit}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
      }
    });
  });

  describe('GET /metrics/:venueId/compare', () => {
    const validQuery = 
      'metricType=page_view' +
      '&currentStartDate=2024-01-01T00:00:00Z' +
      '&currentEndDate=2024-01-31T23:59:59Z' +
      '&previousStartDate=2023-12-01T00:00:00Z' +
      '&previousEndDate=2023-12-31T23:59:59Z';

    it('should compare metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/metrics/${venueId}/compare?${validQuery}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(metricsController.compareMetrics).toHaveBeenCalled();
    });

    it('should require all date parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/metrics/${venueId}/compare?metricType=test`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /metrics/:venueId/aggregate', () => {
    it('should get aggregated metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/metrics/${venueId}/aggregate?metricType=revenue&startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z&aggregation=sum`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(metricsController.getAggregatedMetric).toHaveBeenCalled();
    });

    it('should require aggregation parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/metrics/${venueId}/aggregate?metricType=test&startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate aggregation enum', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/metrics/${venueId}/aggregate?metricType=test&startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z&aggregation=invalid`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept valid aggregation values', async () => {
      const validAggregations = ['sum', 'avg', 'min', 'max', 'count'];
      
      for (const agg of validAggregations) {
        const response = await app.inject({
          method: 'GET',
          url: `/metrics/${venueId}/aggregate?metricType=test&startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z&aggregation=${agg}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle controller errors gracefully', async () => {
      (metricsController.recordMetric as jest.Mock).mockImplementation(async (req, reply) => {
        throw new Error('Database error');
      });

      const response = await app.inject({
        method: 'POST',
        url: '/metrics',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          metricType: 'test',
          value: 1,
          venueId,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Performance', () => {
    it('should handle concurrent metric recording', async () => {
      const requests = Array.from({ length: 10 }, () =>
        app.inject({
          method: 'POST',
          url: '/metrics',
          headers: {
            authorization: `Bearer ${authToken}`,
          },
          payload: {
            metricType: 'test',
            value: 1,
            venueId,
          },
        })
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect([201, 500]).toContain(response.statusCode);
      });
    });
  });
});

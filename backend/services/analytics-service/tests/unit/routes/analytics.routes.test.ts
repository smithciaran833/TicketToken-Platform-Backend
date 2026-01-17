/**
 * Analytics Routes Unit Tests
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

jest.mock('../../../src/controllers/analytics.controller', () => ({
  analyticsController: {
    getRevenueSummary: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { revenue: 10000 } });
    }),
    getRevenueByChannel: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { channels: [] } });
    }),
    getRevenueProjections: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { projections: [] } });
    }),
    getCustomerLifetimeValue: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { ltv: 500 } });
    }),
    getCustomerSegments: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { segments: [] } });
    }),
    getChurnRiskAnalysis: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { riskScore: 0.3 } });
    }),
    getSalesMetrics: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { metrics: {} } });
    }),
    getSalesTrends: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { trends: [] } });
    }),
    getEventPerformance: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { performance: {} } });
    }),
    getTopPerformingEvents: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { events: [] } });
    }),
    getRealtimeSummary: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { summary: {} } });
    }),
    getConversionFunnel: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { funnel: [] } });
    }),
    executeCustomQuery: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { results: [] } });
    }),
    getDashboardData: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { dashboard: {} } });
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

import analyticsRoutes from '../../../src/routes/analytics.routes';
import { authenticate } from '../../../src/middleware/auth.middleware';
import { analyticsController } from '../../../src/controllers/analytics.controller';

describe('Analytics Routes', () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    app = Fastify();
    
    // Register auth middleware
    app.decorateRequest('user', null);
    app.decorateRequest('tenantId', null);
    app.addHook('onRequest', authenticate);

    // Register routes
    await app.register(analyticsRoutes, { prefix: '/analytics' });
    await app.ready();

    // Create auth token
    authToken = jwt.sign(
      {
        userId: 'user-123',
        tenantId: 'tenant-456',
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

  describe('Revenue Endpoints', () => {
    const dateParams = 'startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z';

    describe('GET /analytics/revenue/summary', () => {
      it('should get revenue summary', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/analytics/revenue/summary?${dateParams}`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(analyticsController.getRevenueSummary).toHaveBeenCalled();
      });

      it('should require startDate and endDate', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/analytics/revenue/summary',
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(400);
      });

      it('should validate date format', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/analytics/revenue/summary?startDate=invalid&endDate=invalid',
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(400);
      });

      it('should require authentication', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/analytics/revenue/summary?${dateParams}`,
        });

        expect(response.statusCode).toBe(401);
      });

      it('should require analytics.read permission', async () => {
        const noPermToken = jwt.sign(
          { userId: 'user-123', role: 'user', permissions: [] },
          'test-jwt-secret-for-unit-tests-minimum-32-chars',
          { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
        );

        const response = await app.inject({
          method: 'GET',
          url: `/analytics/revenue/summary?${dateParams}`,
          headers: { authorization: `Bearer ${noPermToken}` },
        });

        expect(response.statusCode).toBe(403);
      });
    });

    describe('GET /analytics/revenue/by-channel', () => {
      it('should get revenue by channel', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/analytics/revenue/by-channel?${dateParams}`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(analyticsController.getRevenueByChannel).toHaveBeenCalled();
      });
    });

    describe('GET /analytics/revenue/projections', () => {
      it('should get revenue projections', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/analytics/revenue/projections?days=30',
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(analyticsController.getRevenueProjections).toHaveBeenCalled();
      });

      it('should validate days range', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/analytics/revenue/projections?days=500',
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(400);
      });
    });
  });

  describe('Customer Endpoints', () => {
    describe('GET /analytics/customers/lifetime-value', () => {
      it('should get customer lifetime value', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/analytics/customers/lifetime-value',
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(analyticsController.getCustomerLifetimeValue).toHaveBeenCalled();
      });
    });

    describe('GET /analytics/customers/segments', () => {
      it('should get customer segments', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/analytics/customers/segments',
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(analyticsController.getCustomerSegments).toHaveBeenCalled();
      });
    });

    describe('GET /analytics/customers/churn-risk', () => {
      it('should get churn risk analysis', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/analytics/customers/churn-risk?threshold=90',
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(analyticsController.getChurnRiskAnalysis).toHaveBeenCalled();
      });

      it('should validate threshold range', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/analytics/customers/churn-risk?threshold=400',
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(400);
      });
    });
  });

  describe('Sales Endpoints', () => {
    const dateParams = 'startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z';

    describe('GET /analytics/sales/metrics', () => {
      it('should get sales metrics', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/analytics/sales/metrics?${dateParams}`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(analyticsController.getSalesMetrics).toHaveBeenCalled();
      });

      it('should accept granularity parameter', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/analytics/sales/metrics?${dateParams}&granularity=day`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
      });

      it('should validate granularity enum', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/analytics/sales/metrics?${dateParams}&granularity=invalid`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('GET /analytics/sales/trends', () => {
      it('should get sales trends', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/analytics/sales/trends?${dateParams}`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(analyticsController.getSalesTrends).toHaveBeenCalled();
      });
    });
  });

  describe('Event Endpoints', () => {
    const dateParams = 'startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z';

    describe('GET /analytics/events/performance', () => {
      it('should get event performance', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/analytics/events/performance?${dateParams}`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(analyticsController.getEventPerformance).toHaveBeenCalled();
      });
    });

    describe('GET /analytics/events/top-performing', () => {
      it('should get top performing events', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/analytics/events/top-performing?${dateParams}`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(analyticsController.getTopPerformingEvents).toHaveBeenCalled();
      });

      it('should accept limit parameter', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/analytics/events/top-performing?${dateParams}&limit=5`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
      });

      it('should validate limit range', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/analytics/events/top-performing?${dateParams}&limit=200`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(400);
      });
    });
  });

  describe('GET /analytics/realtime/summary', () => {
    it('should get realtime summary', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/realtime/summary',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(analyticsController.getRealtimeSummary).toHaveBeenCalled();
    });
  });

  describe('GET /analytics/conversions/funnel', () => {
    it('should get conversion funnel', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/conversions/funnel?startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(analyticsController.getConversionFunnel).toHaveBeenCalled();
    });
  });

  describe('POST /analytics/query', () => {
    const validQuery = {
      metrics: ['revenue', 'ticketSales'],
      timeRange: {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-31T23:59:59Z',
      },
    };

    it('should execute custom query', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/analytics/query',
        headers: { authorization: `Bearer ${authToken}` },
        payload: validQuery,
      });

      expect(response.statusCode).toBe(200);
      expect(analyticsController.executeCustomQuery).toHaveBeenCalled();
    });

    it('should require analytics.read and analytics.write permissions', async () => {
      const readOnlyToken = jwt.sign(
        { userId: 'user-123', role: 'user', permissions: ['analytics.read'] },
        'test-jwt-secret-for-unit-tests-minimum-32-chars',
        { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
      );

      const response = await app.inject({
        method: 'POST',
        url: '/analytics/query',
        headers: { authorization: `Bearer ${readOnlyToken}` },
        payload: validQuery,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should validate metrics array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/analytics/query',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          metrics: [],
          timeRange: validQuery.timeRange,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate metrics enum values', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/analytics/query',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          metrics: ['invalidMetric'],
          timeRange: validQuery.timeRange,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require timeRange', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/analytics/query',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { metrics: ['revenue'] },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /analytics/dashboard', () => {
    it('should get dashboard data', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/dashboard',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(analyticsController.getDashboardData).toHaveBeenCalled();
    });

    it('should accept period parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/dashboard?period=30d',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should validate period enum', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/dashboard?period=invalid',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});

/**
 * Insights Routes Unit Tests
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

jest.mock('../../../src/controllers/insights.controller', () => ({
  insightsController: {
    getInsights: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { insights: [] } });
    }),
    getCustomerInsights: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { insights: [] } });
    }),
    getInsight: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { insight: { id: req.params.insightId } } });
    }),
    dismissInsight: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { dismissed: true } });
    }),
    takeAction: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { actionTaken: true } });
    }),
    getInsightStats: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { stats: {} } });
    }),
    refreshInsights: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { refreshed: true } });
    }),
  },
}));

jest.mock('../../../src/controllers/customer-insights.controller', () => ({
  customerInsightsController: {
    getCustomerProfile: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { profile: {} } });
    }),
    getCustomerPreferences: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { preferences: [] } });
    }),
    getVenueCustomerSegments: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { segments: [] } });
    }),
    getVenueCustomerList: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { customers: [] } });
    }),
    getCohortAnalysis: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { cohorts: [] } });
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

import insightsRoutes from '../../../src/routes/insights.routes';
import { authenticate } from '../../../src/middleware/auth.middleware';
import { insightsController } from '../../../src/controllers/insights.controller';
import { customerInsightsController } from '../../../src/controllers/customer-insights.controller';

describe('Insights Routes', () => {
  let app: FastifyInstance;
  let authToken: string;

  const venueId = '123e4567-e89b-12d3-a456-426614174001';
  const customerId = 'customer-123';
  const insightId = '123e4567-e89b-12d3-a456-426614174002';
  const userId = 'user-123';

  beforeAll(async () => {
    app = Fastify();
    
    app.decorateRequest('user', null);
    app.decorateRequest('tenantId', null);
    app.addHook('onRequest', authenticate);

    await app.register(insightsRoutes, { prefix: '/insights' });
    await app.ready();

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

  describe('AI Insights Routes', () => {
    describe('GET /insights/venue/:venueId', () => {
      it('should get insights for a venue', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/insights/venue/${venueId}`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(insightsController.getInsights).toHaveBeenCalled();
      });

      it('should accept filter parameters', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/insights/venue/${venueId}?type=revenue&priority=high&actionable=true`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
      });

      it('should validate priority enum', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/insights/venue/${venueId}?priority=invalid`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(400);
      });

      it('should accept pagination', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/insights/venue/${venueId}?page=1&limit=20`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
      });

      it('should validate venueId format', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/insights/venue/invalid-uuid',
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('GET /insights/venue/:venueId/customers/:customerId', () => {
      it('should get customer insights', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/insights/venue/${venueId}/customers/${customerId}`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(insightsController.getCustomerInsights).toHaveBeenCalled();
      });

      it('should validate venueId format', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/insights/venue/invalid-uuid/customers/${customerId}`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('GET /insights/:insightId', () => {
      it('should get a specific insight', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/insights/${insightId}`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(insightsController.getInsight).toHaveBeenCalled();
      });

      it('should validate insightId format', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/insights/invalid-uuid',
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('POST /insights/:insightId/dismiss', () => {
      it('should dismiss an insight', async () => {
        const response = await app.inject({
          method: 'POST',
          url: `/insights/${insightId}/dismiss`,
          headers: { authorization: `Bearer ${authToken}` },
          payload: {
            reason: 'Not relevant',
          },
        });

        expect(response.statusCode).toBe(200);
        expect(insightsController.dismissInsight).toHaveBeenCalled();
      });

      it('should require analytics.write permission', async () => {
        const readOnlyToken = jwt.sign(
          { userId: 'user-123', role: 'user', permissions: ['analytics.read'] },
          'test-jwt-secret-for-unit-tests-minimum-32-chars',
          { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
        );

        const response = await app.inject({
          method: 'POST',
          url: `/insights/${insightId}/dismiss`,
          headers: { authorization: `Bearer ${readOnlyToken}` },
          payload: {},
        });

        expect(response.statusCode).toBe(403);
      });

      it('should allow dismissal without reason', async () => {
        const response = await app.inject({
          method: 'POST',
          url: `/insights/${insightId}/dismiss`,
          headers: { authorization: `Bearer ${authToken}` },
          payload: {},
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('POST /insights/:insightId/action', () => {
      it('should take action on an insight', async () => {
        const response = await app.inject({
          method: 'POST',
          url: `/insights/${insightId}/action`,
          headers: { authorization: `Bearer ${authToken}` },
          payload: {
            action: 'create_campaign',
            parameters: { budget: 1000 },
          },
        });

        expect(response.statusCode).toBe(200);
        expect(insightsController.takeAction).toHaveBeenCalled();
      });

      it('should require action field', async () => {
        const response = await app.inject({
          method: 'POST',
          url: `/insights/${insightId}/action`,
          headers: { authorization: `Bearer ${authToken}` },
          payload: {},
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('GET /insights/venue/:venueId/stats', () => {
      it('should get insight statistics', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/insights/venue/${venueId}/stats`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(insightsController.getInsightStats).toHaveBeenCalled();
      });
    });

    describe('POST /insights/venue/:venueId/refresh', () => {
      it('should refresh insights', async () => {
        const response = await app.inject({
          method: 'POST',
          url: `/insights/venue/${venueId}/refresh`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(insightsController.refreshInsights).toHaveBeenCalled();
      });
    });
  });

  describe('Customer Insights Routes', () => {
    describe('GET /insights/customers/:userId/profile', () => {
      it('should get customer profile', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/insights/customers/${userId}/profile`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(customerInsightsController.getCustomerProfile).toHaveBeenCalled();
      });
    });

    describe('GET /insights/customers/:userId/preferences', () => {
      it('should get customer preferences', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/insights/customers/${userId}/preferences`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(customerInsightsController.getCustomerPreferences).toHaveBeenCalled();
      });
    });

    describe('GET /insights/venue/:venueId/customer-segments', () => {
      it('should get venue customer segments', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/insights/venue/${venueId}/customer-segments`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(customerInsightsController.getVenueCustomerSegments).toHaveBeenCalled();
      });
    });

    describe('GET /insights/venue/:venueId/customer-list', () => {
      it('should get venue customer list', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/insights/venue/${venueId}/customer-list`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(customerInsightsController.getVenueCustomerList).toHaveBeenCalled();
      });
    });

    describe('GET /insights/venue/:venueId/cohort-analysis', () => {
      it('should get cohort analysis', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/insights/venue/${venueId}/cohort-analysis`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
        expect(customerInsightsController.getCohortAnalysis).toHaveBeenCalled();
      });
    });
  });
});

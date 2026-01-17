/**
 * Customer Routes Unit Tests
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

jest.mock('../../../src/controllers/customer.controller', () => ({
  customerController: {
    getCustomerSegments: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { segments: [] } });
    }),
    getCustomerProfile: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { profile: { id: req.params.customerId } } });
    }),
    getCustomerInsights: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { insights: {} } });
    }),
    getCustomerJourney: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { journey: [] } });
    }),
    getRFMAnalysis: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { rfm: {} } });
    }),
    getCustomerLifetimeValue: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { clv: 500 } });
    }),
    searchCustomers: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { customers: [] } });
    }),
    getSegmentAnalysis: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { analysis: {} } });
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

import customerRoutes from '../../../src/routes/customer.routes';
import { authenticate } from '../../../src/middleware/auth.middleware';
import { customerController } from '../../../src/controllers/customer.controller';

describe('Customer Routes', () => {
  let app: FastifyInstance;
  let authToken: string;

  const venueId = '123e4567-e89b-12d3-a456-426614174001';
  const customerId = 'customer-123';

  beforeAll(async () => {
    app = Fastify();
    
    app.decorateRequest('user', null);
    app.decorateRequest('tenantId', null);
    app.addHook('onRequest', authenticate);

    await app.register(customerRoutes, { prefix: '/customers' });
    await app.ready();

    authToken = jwt.sign(
      {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'admin',
        permissions: ['analytics.read'],
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

  describe('GET /customers/venue/:venueId/segments', () => {
    it('should get customer segments', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/customers/venue/${venueId}/segments`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(customerController.getCustomerSegments).toHaveBeenCalled();
    });

    it('should validate venueId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/customers/venue/invalid-uuid/segments',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/customers/venue/${venueId}/segments`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /customers/venue/:venueId/:customerId', () => {
    it('should get customer profile', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/customers/venue/${venueId}/${customerId}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(customerController.getCustomerProfile).toHaveBeenCalled();
    });

    it('should validate venueId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/customers/venue/invalid-uuid/${customerId}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /customers/venue/:venueId/:customerId/insights', () => {
    it('should get customer insights', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/customers/venue/${venueId}/${customerId}/insights`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(customerController.getCustomerInsights).toHaveBeenCalled();
    });
  });

  describe('GET /customers/venue/:venueId/:customerId/journey', () => {
    it('should get customer journey', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/customers/venue/${venueId}/${customerId}/journey`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(customerController.getCustomerJourney).toHaveBeenCalled();
    });

    it('should accept date range parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/customers/venue/${venueId}/${customerId}/journey?startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /customers/venue/:venueId/:customerId/rfm', () => {
    it('should get RFM analysis', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/customers/venue/${venueId}/${customerId}/rfm`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(customerController.getRFMAnalysis).toHaveBeenCalled();
    });
  });

  describe('GET /customers/venue/:venueId/:customerId/clv', () => {
    it('should get customer lifetime value', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/customers/venue/${venueId}/${customerId}/clv`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(customerController.getCustomerLifetimeValue).toHaveBeenCalled();
    });
  });

  describe('GET /customers/venue/:venueId/search', () => {
    it('should search customers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/customers/venue/${venueId}/search?q=john`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(customerController.searchCustomers).toHaveBeenCalled();
    });

    it('should require query parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/customers/venue/${venueId}/search`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept optional parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/customers/venue/${venueId}/search?q=john&segment=vip&page=1&limit=20`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should validate limit range', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/customers/venue/${venueId}/search?q=john&limit=200`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /customers/venue/:venueId/segments/:segment/analysis', () => {
    it('should get segment analysis', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/customers/venue/${venueId}/segments/vip/analysis`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(customerController.getSegmentAnalysis).toHaveBeenCalled();
    });

    it('should validate venueId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/customers/venue/invalid-uuid/segments/vip/analysis',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});

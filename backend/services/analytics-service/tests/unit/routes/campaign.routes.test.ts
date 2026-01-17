/**
 * Campaign Routes Unit Tests
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

jest.mock('../../../src/controllers/campaign.controller', () => ({
  campaignController: {
    getCampaigns: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { campaigns: [] } });
    }),
    getCampaign: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { campaign: { id: req.params.campaignId } } });
    }),
    getCampaignPerformance: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { performance: {} } });
    }),
    getCampaignAttribution: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { attribution: {} } });
    }),
    getChannelPerformance: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { channels: [] } });
    }),
    trackTouchpoint: jest.fn(async (req, reply) => {
      return reply.status(201).send({ success: true, data: { tracked: true } });
    }),
    getCampaignROI: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { roi: 2.5 } });
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

import campaignRoutes from '../../../src/routes/campaign.routes';
import { authenticate } from '../../../src/middleware/auth.middleware';
import { campaignController } from '../../../src/controllers/campaign.controller';

describe('Campaign Routes', () => {
  let app: FastifyInstance;
  let authToken: string;

  const venueId = '123e4567-e89b-12d3-a456-426614174001';
  const campaignId = '123e4567-e89b-12d3-a456-426614174002';

  beforeAll(async () => {
    app = Fastify();
    
    app.decorateRequest('user', null);
    app.decorateRequest('tenantId', null);
    app.addHook('onRequest', authenticate);

    await app.register(campaignRoutes, { prefix: '/campaigns' });
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

  describe('GET /campaigns/venue/:venueId', () => {
    it('should get campaigns for a venue', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/campaigns/venue/${venueId}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(campaignController.getCampaigns).toHaveBeenCalled();
    });

    it('should accept status query parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/campaigns/venue/${venueId}?status=active`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should validate status enum', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/campaigns/venue/${venueId}?status=invalid`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept pagination parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/campaigns/venue/${venueId}?page=1&limit=20`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should validate venueId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/campaigns/venue/invalid-uuid',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/campaigns/venue/${venueId}`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /campaigns/:campaignId', () => {
    it('should get campaign details', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/campaigns/${campaignId}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(campaignController.getCampaign).toHaveBeenCalled();
    });

    it('should validate campaignId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/campaigns/invalid-uuid',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /campaigns/:campaignId/performance', () => {
    it('should get campaign performance', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/campaigns/${campaignId}/performance`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(campaignController.getCampaignPerformance).toHaveBeenCalled();
    });

    it('should accept date range parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/campaigns/${campaignId}/performance?startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /campaigns/:campaignId/attribution', () => {
    it('should get campaign attribution', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/campaigns/${campaignId}/attribution`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(campaignController.getCampaignAttribution).toHaveBeenCalled();
    });

    it('should accept model parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/campaigns/${campaignId}/attribution?model=last_touch`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should validate model enum', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/campaigns/${campaignId}/attribution?model=invalid`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept all valid attribution models', async () => {
      const models = ['first_touch', 'last_touch', 'linear', 'time_decay', 'data_driven'];
      
      for (const model of models) {
        const response = await app.inject({
          method: 'GET',
          url: `/campaigns/${campaignId}/attribution?model=${model}`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
      }
    });
  });

  describe('GET /campaigns/venue/:venueId/channels', () => {
    it('should get channel performance', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/campaigns/venue/${venueId}/channels?startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(campaignController.getChannelPerformance).toHaveBeenCalled();
    });

    it('should require startDate and endDate', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/campaigns/venue/${venueId}/channels`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /campaigns/touchpoint', () => {
    const validTouchpoint = {
      venueId,
      customerId: 'customer-123',
      channel: 'email',
      action: 'click',
      value: 100,
      campaign: 'summer-sale',
      metadata: { source: 'newsletter' },
    };

    it('should track a touchpoint', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/campaigns/touchpoint',
        headers: { authorization: `Bearer ${authToken}` },
        payload: validTouchpoint,
      });

      expect(response.statusCode).toBe(201);
      expect(campaignController.trackTouchpoint).toHaveBeenCalled();
    });

    it('should require analytics.write permission', async () => {
      const readOnlyToken = jwt.sign(
        { userId: 'user-123', role: 'user', permissions: ['analytics.read'] },
        'test-jwt-secret-for-unit-tests-minimum-32-chars',
        { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
      );

      const response = await app.inject({
        method: 'POST',
        url: '/campaigns/touchpoint',
        headers: { authorization: `Bearer ${readOnlyToken}` },
        payload: validTouchpoint,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/campaigns/touchpoint',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { channel: 'email' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate venueId format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/campaigns/touchpoint',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          ...validTouchpoint,
          venueId: 'invalid-uuid',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /campaigns/:campaignId/roi', () => {
    it('should get campaign ROI', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/campaigns/${campaignId}/roi`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(campaignController.getCampaignROI).toHaveBeenCalled();
    });
  });
});

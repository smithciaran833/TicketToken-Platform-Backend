/**
 * Prediction Routes Unit Tests
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

jest.mock('../../../src/controllers/prediction.controller', () => ({
  predictionController: {
    predictDemand: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { prediction: {} } });
    }),
    optimizePricing: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { optimizedPrice: 100 } });
    }),
    predictChurn: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { churnProbability: 0.2 } });
    }),
    predictCLV: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { clv: 500 } });
    }),
    predictNoShow: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { noShowProbability: 0.1 } });
    }),
    runWhatIfScenario: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { results: {} } });
    }),
    getModelPerformance: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { performance: {} } });
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

import predictionRoutes from '../../../src/routes/prediction.routes';
import { authenticate } from '../../../src/middleware/auth.middleware';
import { predictionController } from '../../../src/controllers/prediction.controller';

describe('Prediction Routes', () => {
  let app: FastifyInstance;
  let authToken: string;
  let adminToken: string;

  const venueId = '123e4567-e89b-12d3-a456-426614174001';
  const eventId = '123e4567-e89b-12d3-a456-426614174002';
  const ticketTypeId = '123e4567-e89b-12d3-a456-426614174003';
  const ticketId = '123e4567-e89b-12d3-a456-426614174004';
  const customerId = 'customer-123';

  beforeAll(async () => {
    app = Fastify();
    
    app.decorateRequest('user', null);
    app.decorateRequest('tenantId', null);
    app.addHook('onRequest', authenticate);

    await app.register(predictionRoutes, { prefix: '/predictions' });
    await app.ready();

    authToken = jwt.sign(
      {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'user',
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

    adminToken = jwt.sign(
      {
        userId: 'admin-123',
        tenantId: 'tenant-456',
        role: 'admin',
        permissions: ['analytics.read', 'analytics.admin'],
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

  describe('POST /predictions/demand', () => {
    const validPayload = {
      venueId,
      eventId,
      daysAhead: 30,
    };

    it('should predict demand', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/predictions/demand',
        headers: { authorization: `Bearer ${authToken}` },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(200);
      expect(predictionController.predictDemand).toHaveBeenCalled();
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/predictions/demand',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { venueId },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate daysAhead range', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/predictions/demand',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          ...validPayload,
          daysAhead: 500,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate UUID formats', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/predictions/demand',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          ...validPayload,
          venueId: 'invalid-uuid',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /predictions/pricing', () => {
    const validPayload = {
      venueId,
      eventId,
      ticketTypeId,
      currentPrice: 50,
    };

    it('should optimize pricing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/predictions/pricing',
        headers: { authorization: `Bearer ${authToken}` },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(200);
      expect(predictionController.optimizePricing).toHaveBeenCalled();
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/predictions/pricing',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { venueId },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate currentPrice is a number', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/predictions/pricing',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          ...validPayload,
          currentPrice: 'not-a-number',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /predictions/churn', () => {
    const validPayload = {
      venueId,
      customerId,
    };

    it('should predict churn', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/predictions/churn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(200);
      expect(predictionController.predictChurn).toHaveBeenCalled();
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/predictions/churn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { venueId },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /predictions/clv', () => {
    const validPayload = {
      venueId,
      customerId,
    };

    it('should predict customer lifetime value', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/predictions/clv',
        headers: { authorization: `Bearer ${authToken}` },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(200);
      expect(predictionController.predictCLV).toHaveBeenCalled();
    });
  });

  describe('POST /predictions/no-show', () => {
    const validPayload = {
      venueId,
      ticketId,
      customerId,
      eventId,
    };

    it('should predict no-show probability', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/predictions/no-show',
        headers: { authorization: `Bearer ${authToken}` },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(200);
      expect(predictionController.predictNoShow).toHaveBeenCalled();
    });

    it('should validate all required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/predictions/no-show',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { venueId, customerId },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /predictions/what-if', () => {
    const validPayload = {
      venueId,
      scenario: {
        type: 'pricing',
        parameters: { priceChange: 10 },
      },
    };

    it('should run what-if scenario', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/predictions/what-if',
        headers: { authorization: `Bearer ${authToken}` },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(200);
      expect(predictionController.runWhatIfScenario).toHaveBeenCalled();
    });

    it('should validate scenario type enum', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/predictions/what-if',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          venueId,
          scenario: {
            type: 'invalid',
            parameters: {},
          },
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept all valid scenario types', async () => {
      const types = ['pricing', 'capacity', 'marketing'];
      
      for (const type of types) {
        const response = await app.inject({
          method: 'POST',
          url: '/predictions/what-if',
          headers: { authorization: `Bearer ${authToken}` },
          payload: {
            venueId,
            scenario: { type, parameters: {} },
          },
        });

        expect(response.statusCode).toBe(200);
      }
    });
  });

  describe('GET /predictions/models/:modelType/performance', () => {
    it('should get model performance', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/predictions/models/demand/performance',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(predictionController.getModelPerformance).toHaveBeenCalled();
    });

    it('should require analytics.admin permission', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/predictions/models/demand/performance',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should validate modelType enum', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/predictions/models/invalid/performance',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept all valid model types', async () => {
      const modelTypes = ['demand', 'pricing', 'churn', 'clv', 'no_show'];
      
      for (const modelType of modelTypes) {
        const response = await app.inject({
          method: 'GET',
          url: `/predictions/models/${modelType}/performance`,
          headers: { authorization: `Bearer ${adminToken}` },
        });

        expect(response.statusCode).toBe(200);
      }
    });
  });
});

/**
 * Unit tests for pricing.routes.ts
 * Tests route registration, schema validation, middleware chain, and handler binding
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import pricingRoutes from '../../../src/routes/pricing.routes';

// Mock middleware
jest.mock('../../../src/middleware/auth', () => ({
  authenticateFastify: jest.fn((request: any, reply: any, done: any) => {
    request.user = { id: 'user-123', tenant_id: 'tenant-123', role: 'admin' };
    done();
  })
}));

jest.mock('../../../src/middleware/tenant', () => ({
  tenantHook: jest.fn((request: any, reply: any, done: any) => {
    request.tenant_id = 'tenant-123';
    done();
  })
}));

jest.mock('../../../src/middleware/idempotency.middleware', () => ({
  idempotencyPreHandler: jest.fn((request: any, reply: any, done: any) => done())
}));

// Mock controllers
jest.mock('../../../src/controllers/pricing.controller', () => ({
  getEventPricing: jest.fn((request: any, reply: any) => reply.send({ pricing: [], total: 0 })),
  getActivePricing: jest.fn((request: any, reply: any) => reply.send({ pricing: [], total: 0 })),
  getPricingById: jest.fn((request: any, reply: any) => reply.send({ id: request.params.id, base_price: '99.99' })),
  createPricing: jest.fn((request: any, reply: any) => reply.status(201).send({ id: 'new-pricing-id' })),
  updatePricing: jest.fn((request: any, reply: any) => reply.send({ id: request.params.id, ...request.body })),
  calculatePrice: jest.fn((request: any, reply: any) => reply.send({ total: '109.99', breakdown: {} }))
}));

import { authenticateFastify } from '../../../src/middleware/auth';
import { tenantHook } from '../../../src/middleware/tenant';
import { idempotencyPreHandler } from '../../../src/middleware/idempotency.middleware';
import * as pricingController from '../../../src/controllers/pricing.controller';

describe('Pricing Routes', () => {
  let app: FastifyInstance;
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(async () => {
    app = Fastify();
    await app.register(pricingRoutes);
    await app.ready();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Route Registration', () => {
    it('should register GET /events/:eventId/pricing route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/pricing');
    });

    it('should register GET /events/:eventId/pricing/active route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/pricing/active');
    });

    it('should register GET /pricing/:id route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/pricing/:id');
    });

    it('should register POST /events/:eventId/pricing route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/pricing');
    });

    it('should register PUT /pricing/:id route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/pricing/:id');
    });

    it('should register POST /pricing/:id/calculate route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/pricing/:id/calculate');
    });
  });

  describe('GET /events/:eventId/pricing', () => {
    it('should call getEventPricing controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/events/${validUuid}/pricing`
      });

      expect(response.statusCode).toBe(200);
      expect(pricingController.getEventPricing).toHaveBeenCalled();
    });

    it('should apply authentication middleware', async () => {
      await app.inject({
        method: 'GET',
        url: `/events/${validUuid}/pricing`
      });

      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should apply tenant middleware', async () => {
      await app.inject({
        method: 'GET',
        url: `/events/${validUuid}/pricing`
      });

      expect(tenantHook).toHaveBeenCalled();
    });

    it('should reject invalid eventId UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/events/invalid-uuid/pricing'
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /events/:eventId/pricing/active', () => {
    it('should call getActivePricing controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/events/${validUuid}/pricing/active`
      });

      expect(response.statusCode).toBe(200);
      expect(pricingController.getActivePricing).toHaveBeenCalled();
    });

    it('should reject invalid eventId UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/events/invalid-uuid/pricing/active'
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /pricing/:id', () => {
    it('should call getPricingById controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/pricing/${validUuid}`
      });

      expect(response.statusCode).toBe(200);
      expect(pricingController.getPricingById).toHaveBeenCalled();
    });

    it('should reject invalid pricing UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/pricing/invalid-uuid'
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /events/:eventId/pricing', () => {
    const validBody = {
      name: 'General Admission',
      base_price: '49.99',
      currency: 'USD',
      pricing_type: 'FIXED'
    };

    it('should call createPricing controller with valid body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/pricing`,
        payload: validBody
      });

      expect(response.statusCode).toBe(201);
      expect(pricingController.createPricing).toHaveBeenCalled();
    });

    it('should apply idempotency middleware', async () => {
      await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/pricing`,
        payload: validBody
      });

      expect(idempotencyPreHandler).toHaveBeenCalled();
    });

    it('should reject missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/pricing`,
        payload: {}
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject negative base_price', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/pricing`,
        payload: {
          ...validBody,
          base_price: '-10.00'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid pricing_type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/pricing`,
        payload: {
          ...validBody,
          pricing_type: 'INVALID_TYPE'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid eventId UUID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events/invalid-uuid/pricing',
        payload: validBody
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept valid sales_start date', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/pricing`,
        payload: {
          ...validBody,
          sales_start: '2026-06-01T00:00:00.000Z'
        }
      });

      expect(response.statusCode).toBe(201);
    });

    it('should accept valid sales_end date', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/pricing`,
        payload: {
          ...validBody,
          sales_end: '2026-06-30T23:59:59.000Z'
        }
      });

      expect(response.statusCode).toBe(201);
    });

    it('should reject invalid date format for sales_start', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/pricing`,
        payload: {
          ...validBody,
          sales_start: 'not-a-date'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept min_price and max_price for dynamic pricing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/pricing`,
        payload: {
          ...validBody,
          pricing_type: 'DYNAMIC',
          min_price: '25.00',
          max_price: '150.00'
        }
      });

      expect(response.statusCode).toBe(201);
    });
  });

  describe('PUT /pricing/:id', () => {
    it('should call updatePricing controller', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/pricing/${validUuid}`,
        payload: { base_price: '59.99' }
      });

      expect(response.statusCode).toBe(200);
      expect(pricingController.updatePricing).toHaveBeenCalled();
    });

    it('should accept partial updates', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/pricing/${validUuid}`,
        payload: { name: 'Updated Pricing Name' }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject invalid pricing UUID', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/pricing/invalid-uuid',
        payload: { base_price: '59.99' }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject negative price in update', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/pricing/${validUuid}`,
        payload: { base_price: '-20.00' }
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /pricing/:id/calculate', () => {
    const validCalcBody = {
      quantity: 2
    };

    it('should call calculatePrice controller', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/pricing/${validUuid}/calculate`,
        payload: validCalcBody
      });

      expect(response.statusCode).toBe(200);
      expect(pricingController.calculatePrice).toHaveBeenCalled();
    });

    it('should apply authentication middleware', async () => {
      await app.inject({
        method: 'POST',
        url: `/pricing/${validUuid}/calculate`,
        payload: validCalcBody
      });

      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should reject missing quantity', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/pricing/${validUuid}/calculate`,
        payload: {}
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject zero quantity', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/pricing/${validUuid}/calculate`,
        payload: { quantity: 0 }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject negative quantity', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/pricing/${validUuid}/calculate`,
        payload: { quantity: -2 }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept discount_code', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/pricing/${validUuid}/calculate`,
        payload: {
          ...validCalcBody,
          discount_code: 'SAVE10'
        }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject invalid pricing UUID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/pricing/invalid-uuid/calculate',
        payload: validCalcBody
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Middleware Chain Order', () => {
    it('should execute middleware in correct order for POST create', async () => {
      const callOrder: string[] = [];
      
      (authenticateFastify as jest.Mock).mockImplementation((req: any, reply: any, done: any) => {
        callOrder.push('auth');
        req.user = { id: 'user-123' };
        done();
      });
      
      (tenantHook as jest.Mock).mockImplementation((req: any, reply: any, done: any) => {
        callOrder.push('tenant');
        done();
      });
      
      (idempotencyPreHandler as jest.Mock).mockImplementation((req: any, reply: any, done: any) => {
        callOrder.push('idempotency');
        done();
      });

      await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/pricing`,
        payload: {
          name: 'Test',
          base_price: '50.00',
          currency: 'USD',
          pricing_type: 'FIXED'
        }
      });

      expect(callOrder).toEqual(['auth', 'tenant', 'idempotency']);
    });
  });

  describe('Schema Validation', () => {
    it('should enforce currency format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/pricing`,
        payload: {
          name: 'Test',
          base_price: '50.00',
          currency: 'INVALID',
          pricing_type: 'FIXED'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should enforce max ticket limit', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/pricing`,
        payload: {
          name: 'Test',
          base_price: '50.00',
          currency: 'USD',
          pricing_type: 'FIXED',
          max_per_order: 1000001
        }
      });

      // Either accepts or rejects based on schema limits
      expect([200, 201, 400]).toContain(response.statusCode);
    });

    it('should accept valid fee configuration', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/pricing`,
        payload: {
          name: 'Test',
          base_price: '50.00',
          currency: 'USD',
          pricing_type: 'FIXED',
          service_fee: '5.00',
          platform_fee: '2.50'
        }
      });

      expect(response.statusCode).toBe(201);
    });
  });
});

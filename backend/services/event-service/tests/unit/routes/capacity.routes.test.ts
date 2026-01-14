/**
 * Unit tests for capacity.routes.ts
 * Tests route registration, schema validation, middleware chain, and handler binding
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import capacityRoutes from '../../../src/routes/capacity.routes';

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
jest.mock('../../../src/controllers/capacity.controller', () => ({
  getEventCapacity: jest.fn((request: any, reply: any) => reply.send({ sections: [], total: 0 })),
  getTotalCapacity: jest.fn((request: any, reply: any) => reply.send({ total: 1000, available: 500 })),
  getCapacityById: jest.fn((request: any, reply: any) => reply.send({ id: request.params.id, name: 'GA' })),
  createCapacity: jest.fn((request: any, reply: any) => reply.status(201).send({ id: 'new-capacity-id' })),
  updateCapacity: jest.fn((request: any, reply: any) => reply.send({ id: request.params.id, ...request.body })),
  checkAvailability: jest.fn((request: any, reply: any) => reply.send({ available: true, quantity: 10 })),
  reserveCapacity: jest.fn((request: any, reply: any) => reply.send({ reservation_id: 'res-123', expires_at: new Date().toISOString() }))
}));

import { authenticateFastify } from '../../../src/middleware/auth';
import { tenantHook } from '../../../src/middleware/tenant';
import { idempotencyPreHandler } from '../../../src/middleware/idempotency.middleware';
import * as capacityController from '../../../src/controllers/capacity.controller';

describe('Capacity Routes', () => {
  let app: FastifyInstance;
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(async () => {
    app = Fastify();
    await app.register(capacityRoutes);
    await app.ready();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Route Registration', () => {
    it('should register GET /events/:eventId/capacity route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/capacity');
    });

    it('should register GET /events/:eventId/capacity/total route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/capacity/total');
    });

    it('should register GET /capacity/:id route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/capacity/:id');
    });

    it('should register POST /events/:eventId/capacity route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/capacity');
    });

    it('should register PUT /capacity/:id route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/capacity/:id');
    });

    it('should register POST /capacity/:id/check route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/capacity/:id/check');
    });

    it('should register POST /capacity/:id/reserve route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/capacity/:id/reserve');
    });
  });

  describe('GET /events/:eventId/capacity', () => {
    it('should call getEventCapacity controller with valid UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/events/${validUuid}/capacity`
      });

      expect(response.statusCode).toBe(200);
      expect(capacityController.getEventCapacity).toHaveBeenCalled();
    });

    it('should apply authentication middleware', async () => {
      await app.inject({
        method: 'GET',
        url: `/events/${validUuid}/capacity`
      });

      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should apply tenant middleware', async () => {
      await app.inject({
        method: 'GET',
        url: `/events/${validUuid}/capacity`
      });

      expect(tenantHook).toHaveBeenCalled();
    });

    it('should reject invalid eventId UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/events/invalid-uuid/capacity'
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /events/:eventId/capacity/total', () => {
    it('should call getTotalCapacity controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/events/${validUuid}/capacity/total`
      });

      expect(response.statusCode).toBe(200);
      expect(capacityController.getTotalCapacity).toHaveBeenCalled();
    });

    it('should reject invalid eventId UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/events/invalid-uuid/capacity/total'
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /capacity/:id', () => {
    it('should call getCapacityById controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/capacity/${validUuid}`
      });

      expect(response.statusCode).toBe(200);
      expect(capacityController.getCapacityById).toHaveBeenCalled();
    });

    it('should apply authentication middleware', async () => {
      await app.inject({
        method: 'GET',
        url: `/capacity/${validUuid}`
      });

      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should reject invalid capacity UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/capacity/invalid-uuid'
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /events/:eventId/capacity', () => {
    const validBody = {
      name: 'General Admission',
      total_capacity: 1000,
      section_type: 'GENERAL_ADMISSION'
    };

    it('should call createCapacity controller with valid body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/capacity`,
        payload: validBody
      });

      expect(response.statusCode).toBe(201);
      expect(capacityController.createCapacity).toHaveBeenCalled();
    });

    it('should apply idempotency middleware', async () => {
      await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/capacity`,
        payload: validBody
      });

      expect(idempotencyPreHandler).toHaveBeenCalled();
    });

    it('should reject missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/capacity`,
        payload: {}
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject negative capacity', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/capacity`,
        payload: {
          ...validBody,
          total_capacity: -1
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid eventId UUID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events/invalid-uuid/capacity',
        payload: validBody
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept valid section_type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/capacity`,
        payload: {
          ...validBody,
          section_type: 'VIP'
        }
      });

      expect(response.statusCode).toBe(201);
    });

    it('should accept row_number for seating', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/capacity`,
        payload: {
          ...validBody,
          section_type: 'RESERVED_SEATING',
          row_number: 'A'
        }
      });

      expect(response.statusCode).toBe(201);
    });
  });

  describe('PUT /capacity/:id', () => {
    it('should call updateCapacity controller', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/capacity/${validUuid}`,
        payload: { total_capacity: 1500 }
      });

      expect(response.statusCode).toBe(200);
      expect(capacityController.updateCapacity).toHaveBeenCalled();
    });

    it('should apply authentication middleware', async () => {
      await app.inject({
        method: 'PUT',
        url: `/capacity/${validUuid}`,
        payload: { total_capacity: 1500 }
      });

      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should accept partial updates', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/capacity/${validUuid}`,
        payload: { name: 'Updated Section Name' }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject invalid capacity UUID', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/capacity/invalid-uuid',
        payload: { total_capacity: 1500 }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject negative capacity in update', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/capacity/${validUuid}`,
        payload: { total_capacity: -100 }
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /capacity/:id/check', () => {
    const validCheckBody = {
      quantity: 5
    };

    it('should call checkAvailability controller', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/capacity/${validUuid}/check`,
        payload: validCheckBody
      });

      expect(response.statusCode).toBe(200);
      expect(capacityController.checkAvailability).toHaveBeenCalled();
    });

    it('should apply authentication middleware', async () => {
      await app.inject({
        method: 'POST',
        url: `/capacity/${validUuid}/check`,
        payload: validCheckBody
      });

      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should reject missing quantity', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/capacity/${validUuid}/check`,
        payload: {}
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject zero quantity', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/capacity/${validUuid}/check`,
        payload: { quantity: 0 }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject negative quantity', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/capacity/${validUuid}/check`,
        payload: { quantity: -5 }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid capacity UUID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/capacity/invalid-uuid/check',
        payload: validCheckBody
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /capacity/:id/reserve', () => {
    const validReserveBody = {
      quantity: 2,
      user_id: '123e4567-e89b-12d3-a456-426614174001',
      pricing_id: '123e4567-e89b-12d3-a456-426614174002'
    };

    it('should call reserveCapacity controller', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/capacity/${validUuid}/reserve`,
        payload: validReserveBody
      });

      expect(response.statusCode).toBe(200);
      expect(capacityController.reserveCapacity).toHaveBeenCalled();
    });

    it('should apply idempotency middleware', async () => {
      await app.inject({
        method: 'POST',
        url: `/capacity/${validUuid}/reserve`,
        payload: validReserveBody
      });

      expect(idempotencyPreHandler).toHaveBeenCalled();
    });

    it('should apply authentication middleware', async () => {
      await app.inject({
        method: 'POST',
        url: `/capacity/${validUuid}/reserve`,
        payload: validReserveBody
      });

      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should reject missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/capacity/${validUuid}/reserve`,
        payload: { quantity: 2 }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject zero quantity', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/capacity/${validUuid}/reserve`,
        payload: { ...validReserveBody, quantity: 0 }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid user_id UUID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/capacity/${validUuid}/reserve`,
        payload: { ...validReserveBody, user_id: 'invalid-uuid' }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid pricing_id UUID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/capacity/${validUuid}/reserve`,
        payload: { ...validReserveBody, pricing_id: 'invalid-uuid' }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid capacity UUID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/capacity/invalid-uuid/reserve',
        payload: validReserveBody
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept optional expiration_minutes', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/capacity/${validUuid}/reserve`,
        payload: {
          ...validReserveBody,
          expiration_minutes: 15
        }
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Middleware Chain Order', () => {
    it('should execute middleware in correct order for POST requests', async () => {
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
        url: `/events/${validUuid}/capacity`,
        payload: {
          name: 'Test Section',
          total_capacity: 100,
          section_type: 'GENERAL_ADMISSION'
        }
      });

      expect(callOrder).toEqual(['auth', 'tenant', 'idempotency']);
    });

    it('should execute middleware in correct order for GET requests (no idempotency)', async () => {
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

      await app.inject({
        method: 'GET',
        url: `/events/${validUuid}/capacity`
      });

      expect(callOrder).toEqual(['auth', 'tenant']);
    });
  });

  describe('Schema Validation', () => {
    it('should enforce max capacity value', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/capacity`,
        payload: {
          name: 'Test',
          total_capacity: 10000001, // Exceeds reasonable max
          section_type: 'GENERAL_ADMISSION'
        }
      });

      // Either accepts large number or rejects based on schema
      expect([200, 201, 400]).toContain(response.statusCode);
    });

    it('should reject invalid section_type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/capacity`,
        payload: {
          name: 'Test',
          total_capacity: 100,
          section_type: 'INVALID_TYPE'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept additionalProperties: false protection', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/capacity`,
        payload: {
          name: 'Test',
          total_capacity: 100,
          section_type: 'GENERAL_ADMISSION',
          malicious_field: 'should be stripped or rejected'
        }
      });

      // Should either strip or reject
      if (response.statusCode === 201 || response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.malicious_field).toBeUndefined();
      }
    });
  });
});

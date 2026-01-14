/**
 * Unit tests for tickets.routes.ts
 * Tests route registration, middleware chain, and handler binding
 * Note: This route file has NO validation schemas defined
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import ticketsRoutes from '../../../src/routes/tickets.routes';

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

// Mock controllers
jest.mock('../../../src/controllers/tickets.controller', () => ({
  getTicketTypes: jest.fn((request: any, reply: any) => reply.send({ ticketTypes: [], total: 0 })),
  createTicketType: jest.fn((request: any, reply: any) => reply.status(201).send({ id: 'new-type-id' })),
  updateTicketType: jest.fn((request: any, reply: any) => reply.send({ id: request.params.typeId, ...request.body }))
}));

import { authenticateFastify } from '../../../src/middleware/auth';
import { tenantHook } from '../../../src/middleware/tenant';
import * as ticketsController from '../../../src/controllers/tickets.controller';

describe('Tickets Routes', () => {
  let app: FastifyInstance;
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';
  const validTypeId = '123e4567-e89b-12d3-a456-426614174001';

  beforeEach(async () => {
    app = Fastify();
    await app.register(ticketsRoutes);
    await app.ready();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Route Registration', () => {
    it('should register GET /events/:id/ticket-types route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:id/ticket-types');
    });

    it('should register POST /events/:id/ticket-types route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:id/ticket-types');
    });

    it('should register PUT /events/:id/ticket-types/:typeId route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:id/ticket-types/:typeId');
    });
  });

  describe('GET /events/:id/ticket-types', () => {
    it('should call getTicketTypes controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/events/${validUuid}/ticket-types`
      });

      expect(response.statusCode).toBe(200);
      expect(ticketsController.getTicketTypes).toHaveBeenCalled();
    });

    it('should apply authentication middleware', async () => {
      await app.inject({
        method: 'GET',
        url: `/events/${validUuid}/ticket-types`
      });

      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should apply tenant middleware', async () => {
      await app.inject({
        method: 'GET',
        url: `/events/${validUuid}/ticket-types`
      });

      expect(tenantHook).toHaveBeenCalled();
    });

    it('should accept any event id (no schema validation)', async () => {
      // Note: This route has no schema validation, so invalid UUIDs are accepted
      const response = await app.inject({
        method: 'GET',
        url: '/events/any-string/ticket-types'
      });

      // Without schema validation, the request will go through to the controller
      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /events/:id/ticket-types', () => {
    const validBody = {
      name: 'VIP Ticket',
      description: 'VIP access to the event',
      price: 199.99,
      quantity: 100
    };

    it('should call createTicketType controller', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/ticket-types`,
        payload: validBody
      });

      expect(response.statusCode).toBe(201);
      expect(ticketsController.createTicketType).toHaveBeenCalled();
    });

    it('should apply authentication middleware', async () => {
      await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/ticket-types`,
        payload: validBody
      });

      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should apply tenant middleware', async () => {
      await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/ticket-types`,
        payload: validBody
      });

      expect(tenantHook).toHaveBeenCalled();
    });

    it('should accept any body (no schema validation)', async () => {
      // Note: This route has no body validation schema
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/ticket-types`,
        payload: {}
      });

      // Without schema validation, empty body is accepted
      expect(response.statusCode).toBe(201);
    });

    it('should accept additional properties (no schema protection)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/ticket-types`,
        payload: {
          ...validBody,
          unknown_field: 'should be passed to controller'
        }
      });

      expect(response.statusCode).toBe(201);
    });
  });

  describe('PUT /events/:id/ticket-types/:typeId', () => {
    const updateBody = {
      name: 'Updated VIP Ticket',
      price: 249.99
    };

    it('should call updateTicketType controller', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/events/${validUuid}/ticket-types/${validTypeId}`,
        payload: updateBody
      });

      expect(response.statusCode).toBe(200);
      expect(ticketsController.updateTicketType).toHaveBeenCalled();
    });

    it('should apply authentication middleware', async () => {
      await app.inject({
        method: 'PUT',
        url: `/events/${validUuid}/ticket-types/${validTypeId}`,
        payload: updateBody
      });

      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should apply tenant middleware', async () => {
      await app.inject({
        method: 'PUT',
        url: `/events/${validUuid}/ticket-types/${validTypeId}`,
        payload: updateBody
      });

      expect(tenantHook).toHaveBeenCalled();
    });

    it('should accept partial updates', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/events/${validUuid}/ticket-types/${validTypeId}`,
        payload: { name: 'New Name Only' }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept any typeId (no schema validation)', async () => {
      // Note: This route has no param validation schema
      const response = await app.inject({
        method: 'PUT',
        url: `/events/${validUuid}/ticket-types/any-string`,
        payload: updateBody
      });

      // Without schema validation, any string is accepted
      expect(response.statusCode).toBe(200);
    });
  });

  describe('Middleware Chain Order', () => {
    it('should execute middleware in correct order: auth -> tenant', async () => {
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
        url: `/events/${validUuid}/ticket-types`
      });

      expect(callOrder).toEqual(['auth', 'tenant']);
    });
  });

  describe('Missing Schema Validation (Security Gap)', () => {
    it('should pass through without params validation', async () => {
      // This test documents the lack of param validation
      const response = await app.inject({
        method: 'GET',
        url: '/events/invalid-uuid-format/ticket-types'
      });

      // Without schema, controller is called with any value
      expect(response.statusCode).toBe(200);
      expect(ticketsController.getTicketTypes).toHaveBeenCalled();
    });

    it('should pass through without body validation', async () => {
      // This test documents the lack of body validation
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/ticket-types`,
        payload: {
          // Malicious or invalid data could be passed
          __proto__: { isAdmin: true },
          price: 'not-a-number'
        }
      });

      expect(response.statusCode).toBe(201);
    });
  });
});

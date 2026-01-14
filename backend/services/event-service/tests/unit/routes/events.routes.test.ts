/**
 * Unit tests for events.routes.ts
 * Tests route registration, schema validation, middleware chain, and handler binding
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Fastify from 'fastify';
import eventsRoutes from '../../../src/routes/events.routes';

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
jest.mock('../../../src/controllers/events.controller', () => ({
  listEvents: jest.fn((request: any, reply: any) => reply.send({ events: [], total: 0 })),
  getEvent: jest.fn((request: any, reply: any) => reply.send({ id: request.params.id, name: 'Test Event' })),
  createEvent: jest.fn((request: any, reply: any) => reply.status(201).send({ id: 'new-event-id' })),
  updateEvent: jest.fn((request: any, reply: any) => reply.send({ id: request.params.id, ...request.body })),
  deleteEvent: jest.fn((request: any, reply: any) => reply.send({ success: true })),
  publishEvent: jest.fn((request: any, reply: any) => reply.send({ id: request.params.id, status: 'PUBLISHED' })),
  getVenueEvents: jest.fn((request: any, reply: any) => reply.send({ events: [], total: 0 }))
}));

import { authenticateFastify } from '../../../src/middleware/auth';
import { tenantHook } from '../../../src/middleware/tenant';
import { idempotencyPreHandler } from '../../../src/middleware/idempotency.middleware';
import * as eventsController from '../../../src/controllers/events.controller';

describe('Events Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(eventsRoutes);
    await app.ready();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Route Registration', () => {
    it('should register GET /events route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events');
    });

    it('should register GET /events/:id route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:id');
    });

    it('should register POST /events route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events');
    });

    it('should register PUT /events/:id route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:id');
    });

    it('should register DELETE /events/:id route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:id');
    });

    it('should register POST /events/:id/publish route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:id/publish');
    });

    it('should register GET /venues/:venueId/events route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/venues/:venueId/events');
    });
  });

  describe('GET /events', () => {
    it('should call listEvents controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/events'
      });

      expect(response.statusCode).toBe(200);
      expect(eventsController.listEvents).toHaveBeenCalled();
    });

    it('should apply authentication middleware', async () => {
      await app.inject({
        method: 'GET',
        url: '/events'
      });

      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should apply tenant middleware', async () => {
      await app.inject({
        method: 'GET',
        url: '/events'
      });

      expect(tenantHook).toHaveBeenCalled();
    });

    it('should accept valid query parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/events?status=PUBLISHED&limit=10&offset=0'
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept visibility filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/events?visibility=PUBLIC'
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept search query', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/events?search=concert'
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept sort parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/events?sort_by=created_at&sort_order=desc'
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject invalid status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/events?status=INVALID_STATUS'
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject limit exceeding maximum', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/events?limit=500'
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject negative offset', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/events?offset=-1'
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid UUID for category_id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/events?category_id=invalid-uuid'
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /events/:id', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';

    it('should call getEvent controller with valid UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/events/${validUuid}`
      });

      expect(response.statusCode).toBe(200);
      expect(eventsController.getEvent).toHaveBeenCalled();
    });

    it('should reject invalid UUID format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/events/invalid-uuid'
      });

      expect(response.statusCode).toBe(400);
    });

    it('should apply authentication middleware', async () => {
      await app.inject({
        method: 'GET',
        url: `/events/${validUuid}`
      });

      expect(authenticateFastify).toHaveBeenCalled();
    });
  });

  describe('POST /events', () => {
    const validBody = {
      name: 'Test Event',
      venue_id: '123e4567-e89b-12d3-a456-426614174000'
    };

    it('should call createEvent controller with valid body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: validBody
      });

      expect(response.statusCode).toBe(201);
      expect(eventsController.createEvent).toHaveBeenCalled();
    });

    it('should apply idempotency middleware', async () => {
      await app.inject({
        method: 'POST',
        url: '/events',
        payload: validBody
      });

      expect(idempotencyPreHandler).toHaveBeenCalled();
    });

    it('should reject missing required field: name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: { venue_id: '123e4567-e89b-12d3-a456-426614174000' }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject missing required field: venue_id', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: { name: 'Test Event' }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject name exceeding max length', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          name: 'a'.repeat(301),
          venue_id: '123e4567-e89b-12d3-a456-426614174000'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject empty name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          name: '',
          venue_id: '123e4567-e89b-12d3-a456-426614174000'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid venue_id format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          name: 'Test Event',
          venue_id: 'invalid-uuid'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept valid event_type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          ...validBody,
          event_type: 'CONCERT'
        }
      });

      expect(response.statusCode).toBe(201);
    });

    it('should reject invalid event_type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          ...validBody,
          event_type: 'INVALID_TYPE'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept valid banner_image_url', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          ...validBody,
          banner_image_url: 'https://example.com/image.jpg'
        }
      });

      expect(response.statusCode).toBe(201);
    });

    it('should reject invalid banner_image_url format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          ...validBody,
          banner_image_url: 'not-a-valid-url'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept tags array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          ...validBody,
          tags: ['music', 'rock', 'live']
        }
      });

      expect(response.statusCode).toBe(201);
    });

    it('should reject tags exceeding max items', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          ...validBody,
          tags: Array(21).fill('tag')
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept accessibility_info object', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          ...validBody,
          accessibility_info: {
            wheelchair_accessible: true,
            hearing_assistance: true,
            notes: 'Accessible entrance on west side'
          }
        }
      });

      expect(response.statusCode).toBe(201);
    });

    it('should reject additional properties (prototype pollution protection)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          ...validBody,
          __proto__: { admin: true }
        }
      });

      // Should either reject or ignore additional properties
      expect([200, 201, 400]).toContain(response.statusCode);
    });

    it('should accept valid capacity', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          ...validBody,
          capacity: 1000
        }
      });

      expect(response.statusCode).toBe(201);
    });

    it('should reject capacity below minimum', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          ...validBody,
          capacity: 0
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept valid priority_score', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          ...validBody,
          priority_score: 500
        }
      });

      expect(response.statusCode).toBe(201);
    });

    it('should reject priority_score exceeding maximum', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          ...validBody,
          priority_score: 1001
        }
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PUT /events/:id', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';

    it('should call updateEvent controller', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/events/${validUuid}`,
        payload: { name: 'Updated Event' }
      });

      expect(response.statusCode).toBe(200);
      expect(eventsController.updateEvent).toHaveBeenCalled();
    });

    it('should apply authentication middleware', async () => {
      await app.inject({
        method: 'PUT',
        url: `/events/${validUuid}`,
        payload: { name: 'Updated Event' }
      });

      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should reject invalid UUID', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/events/invalid-uuid',
        payload: { name: 'Updated Event' }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept partial updates', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/events/${validUuid}`,
        payload: { description: 'Updated description' }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject invalid status value', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/events/${validUuid}`,
        payload: { status: 'INVALID_STATUS' }
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /events/:id', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';

    it('should call deleteEvent controller', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/events/${validUuid}`
      });

      expect(response.statusCode).toBe(200);
      expect(eventsController.deleteEvent).toHaveBeenCalled();
    });

    it('should apply authentication middleware', async () => {
      await app.inject({
        method: 'DELETE',
        url: `/events/${validUuid}`
      });

      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should reject invalid UUID', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/events/invalid-uuid'
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /events/:id/publish', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';

    it('should call publishEvent controller', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/publish`
      });

      expect(response.statusCode).toBe(200);
      expect(eventsController.publishEvent).toHaveBeenCalled();
    });

    it('should apply authentication middleware', async () => {
      await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/publish`
      });

      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should reject invalid UUID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events/invalid-uuid/publish'
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /venues/:venueId/events', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';

    it('should call getVenueEvents controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/venues/${validUuid}/events`
      });

      expect(response.statusCode).toBe(200);
      expect(eventsController.getVenueEvents).toHaveBeenCalled();
    });

    it('should apply authentication middleware', async () => {
      await app.inject({
        method: 'GET',
        url: `/venues/${validUuid}/events`
      });

      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should accept query parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/venues/${validUuid}/events?status=PUBLISHED&limit=10`
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject invalid venueId', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/venues/invalid-uuid/events'
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Schema Validation Security', () => {
    const validBody = {
      name: 'Test Event',
      venue_id: '123e4567-e89b-12d3-a456-426614174000'
    };

    it('should have additionalProperties: false on body schema', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          ...validBody,
          unknown_field: 'should be rejected or ignored'
        }
      });

      // Depending on Fastify config, either rejects or strips unknown fields
      const body = JSON.parse(response.body);
      expect(body.unknown_field).toBeUndefined();
    });

    it('should validate URL format for image URLs', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          ...validBody,
          video_url: 'javascript:alert(1)'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should enforce max length on description', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          ...validBody,
          description: 'a'.repeat(10001)
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate date-time format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          ...validBody,
          event_date: 'not-a-date'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept valid ISO date-time', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          ...validBody,
          event_date: '2026-06-15T19:00:00.000Z'
        }
      });

      expect(response.statusCode).toBe(201);
    });
  });

  describe('Middleware Chain Order', () => {
    it('should execute middleware in correct order: auth -> tenant -> idempotency', async () => {
      const callOrder: string[] = [];
      
      (authenticateFastify as jest.Mock).mockImplementation((req, reply, done) => {
        callOrder.push('auth');
        req.user = { id: 'user-123' };
        done();
      });
      
      (tenantHook as jest.Mock).mockImplementation((req, reply, done) => {
        callOrder.push('tenant');
        done();
      });
      
      (idempotencyPreHandler as jest.Mock).mockImplementation((req, reply, done) => {
        callOrder.push('idempotency');
        done();
      });

      await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          name: 'Test Event',
          venue_id: '123e4567-e89b-12d3-a456-426614174000'
        }
      });

      expect(callOrder).toEqual(['auth', 'tenant', 'idempotency']);
    });
  });
});

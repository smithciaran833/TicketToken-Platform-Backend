/**
 * Unit tests for event-content.routes.ts
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import eventContentRoutes from '../../../src/routes/event-content.routes';

jest.mock('../../../src/middleware/auth', () => ({
  authenticateFastify: jest.fn((req: any, reply: any, done: any) => {
    req.user = { id: 'user-123', tenant_id: 'tenant-123' };
    done();
  })
}));

jest.mock('../../../src/middleware/tenant', () => ({
  tenantHook: jest.fn((req: any, reply: any, done: any) => {
    req.tenant_id = 'tenant-123';
    done();
  })
}));

jest.mock('../../../src/controllers/event-content.controller', () => ({
  getEventContent: jest.fn((req: any, reply: any) => reply.send({ content: [] })),
  createEventContent: jest.fn((req: any, reply: any) => reply.status(201).send({ id: 'content-1' })),
  updateEventContent: jest.fn((req: any, reply: any) => reply.send({ id: req.params.contentId })),
  deleteEventContent: jest.fn((req: any, reply: any) => reply.status(204).send()),
  getEventGallery: jest.fn((req: any, reply: any) => reply.send({ images: [] })),
  addGalleryImage: jest.fn((req: any, reply: any) => reply.status(201).send({ id: 'image-1' }))
}));

import { authenticateFastify } from '../../../src/middleware/auth';
import { tenantHook } from '../../../src/middleware/tenant';
import * as contentController from '../../../src/controllers/event-content.controller';

describe('Event Content Routes', () => {
  let app: FastifyInstance;
  const eventId = '123e4567-e89b-12d3-a456-426614174000';
  const contentId = '123e4567-e89b-12d3-a456-426614174001';

  beforeEach(async () => {
    app = Fastify();
    await app.register(eventContentRoutes);
    await app.ready();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Route Registration', () => {
    it('should register GET /events/:eventId/content', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/content');
    });

    it('should register POST /events/:eventId/content', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/content');
    });

    it('should register PUT /events/:eventId/content/:contentId', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/content/:contentId');
    });

    it('should register DELETE /events/:eventId/content/:contentId', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/content/:contentId');
    });

    it('should register GET /events/:eventId/gallery', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/gallery');
    });

    it('should register POST /events/:eventId/gallery', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/gallery');
    });
  });

  describe('GET /events/:eventId/content', () => {
    it('should call getEventContent controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/events/${eventId}/content`
      });

      expect(response.statusCode).toBe(200);
      expect(contentController.getEventContent).toHaveBeenCalled();
    });

    it('should apply auth middleware', async () => {
      await app.inject({ method: 'GET', url: `/events/${eventId}/content` });
      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should apply tenant middleware', async () => {
      await app.inject({ method: 'GET', url: `/events/${eventId}/content` });
      expect(tenantHook).toHaveBeenCalled();
    });
  });

  describe('POST /events/:eventId/content', () => {
    it('should call createEventContent controller', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${eventId}/content`,
        payload: { content_type: 'IMAGE', url: 'https://example.com/image.jpg' }
      });

      expect(response.statusCode).toBe(201);
      expect(contentController.createEventContent).toHaveBeenCalled();
    });
  });

  describe('PUT /events/:eventId/content/:contentId', () => {
    it('should call updateEventContent controller', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/events/${eventId}/content/${contentId}`,
        payload: { title: 'Updated Title' }
      });

      expect(response.statusCode).toBe(200);
      expect(contentController.updateEventContent).toHaveBeenCalled();
    });
  });

  describe('DELETE /events/:eventId/content/:contentId', () => {
    it('should call deleteEventContent controller', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/events/${eventId}/content/${contentId}`
      });

      expect(response.statusCode).toBe(204);
      expect(contentController.deleteEventContent).toHaveBeenCalled();
    });
  });

  describe('GET /events/:eventId/gallery', () => {
    it('should call getEventGallery controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/events/${eventId}/gallery`
      });

      expect(response.statusCode).toBe(200);
      expect(contentController.getEventGallery).toHaveBeenCalled();
    });
  });

  describe('POST /events/:eventId/gallery', () => {
    it('should call addGalleryImage controller', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${eventId}/gallery`,
        payload: { url: 'https://example.com/new-image.jpg' }
      });

      expect(response.statusCode).toBe(201);
      expect(contentController.addGalleryImage).toHaveBeenCalled();
    });
  });
});

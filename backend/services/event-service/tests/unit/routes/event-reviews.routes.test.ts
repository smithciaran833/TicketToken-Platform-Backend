/**
 * Unit tests for event-reviews.routes.ts
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import eventReviewsRoutes from '../../../src/routes/event-reviews.routes';

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

jest.mock('../../../src/controllers/event-reviews.controller', () => ({
  getEventReviews: jest.fn((req: any, reply: any) => reply.send({ reviews: [], total: 0 })),
  createEventReview: jest.fn((req: any, reply: any) => reply.status(201).send({ id: 'review-1' })),
  updateEventReview: jest.fn((req: any, reply: any) => reply.send({ id: req.params.reviewId })),
  deleteEventReview: jest.fn((req: any, reply: any) => reply.status(204).send()),
  getEventRatingSummary: jest.fn((req: any, reply: any) => reply.send({ average: 4.5, count: 100 }))
}));

import { authenticateFastify } from '../../../src/middleware/auth';
import { tenantHook } from '../../../src/middleware/tenant';
import * as reviewsController from '../../../src/controllers/event-reviews.controller';

describe('Event Reviews Routes', () => {
  let app: FastifyInstance;
  const eventId = '123e4567-e89b-12d3-a456-426614174000';
  const reviewId = '123e4567-e89b-12d3-a456-426614174001';

  beforeEach(async () => {
    app = Fastify();
    await app.register(eventReviewsRoutes);
    await app.ready();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Route Registration', () => {
    it('should register GET /events/:eventId/reviews', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/reviews');
    });

    it('should register POST /events/:eventId/reviews', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/reviews');
    });

    it('should register PUT /events/:eventId/reviews/:reviewId', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/reviews/:reviewId');
    });

    it('should register DELETE /events/:eventId/reviews/:reviewId', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/reviews/:reviewId');
    });

    it('should register GET /events/:eventId/reviews/summary', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/reviews/summary');
    });
  });

  describe('GET /events/:eventId/reviews', () => {
    it('should call getEventReviews controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/events/${eventId}/reviews`
      });

      expect(response.statusCode).toBe(200);
      expect(reviewsController.getEventReviews).toHaveBeenCalled();
    });

    it('should apply auth middleware', async () => {
      await app.inject({ method: 'GET', url: `/events/${eventId}/reviews` });
      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should apply tenant middleware', async () => {
      await app.inject({ method: 'GET', url: `/events/${eventId}/reviews` });
      expect(tenantHook).toHaveBeenCalled();
    });

    it('should accept pagination query params', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/events/${eventId}/reviews?page=1&limit=20`
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /events/:eventId/reviews', () => {
    it('should call createEventReview controller', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${eventId}/reviews`,
        payload: { rating: 5, comment: 'Great event!' }
      });

      expect(response.statusCode).toBe(201);
      expect(reviewsController.createEventReview).toHaveBeenCalled();
    });
  });

  describe('PUT /events/:eventId/reviews/:reviewId', () => {
    it('should call updateEventReview controller', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/events/${eventId}/reviews/${reviewId}`,
        payload: { rating: 4 }
      });

      expect(response.statusCode).toBe(200);
      expect(reviewsController.updateEventReview).toHaveBeenCalled();
    });
  });

  describe('DELETE /events/:eventId/reviews/:reviewId', () => {
    it('should call deleteEventReview controller', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/events/${eventId}/reviews/${reviewId}`
      });

      expect(response.statusCode).toBe(204);
      expect(reviewsController.deleteEventReview).toHaveBeenCalled();
    });
  });

  describe('GET /events/:eventId/reviews/summary', () => {
    it('should call getEventRatingSummary controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/events/${eventId}/reviews/summary`
      });

      expect(response.statusCode).toBe(200);
      expect(reviewsController.getEventRatingSummary).toHaveBeenCalled();
    });
  });
});

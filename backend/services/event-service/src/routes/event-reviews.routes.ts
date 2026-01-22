import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { EventReviewsController } from '../controllers/event-reviews.controller';
import { getRedis } from '../config/redis';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';

// Schemas for validation
const eventIdParamSchema = {
  type: 'object',
  required: ['eventId'],
  properties: {
    eventId: { type: 'string', format: 'uuid' }
  },
  additionalProperties: false
};

const reviewIdParamSchema = {
  type: 'object',
  required: ['eventId', 'reviewId'],
  properties: {
    eventId: { type: 'string', format: 'uuid' },
    reviewId: { type: 'string', format: 'uuid' }
  },
  additionalProperties: false
};

const createReviewBodySchema = {
  type: 'object',
  required: ['rating', 'title'],
  properties: {
    rating: { type: 'number', minimum: 1, maximum: 5 },
    title: { type: 'string', maxLength: 200 },
    comment: { type: 'string', maxLength: 2000 }
  },
  additionalProperties: false
};

const updateReviewBodySchema = {
  type: 'object',
  properties: {
    rating: { type: 'number', minimum: 1, maximum: 5 },
    title: { type: 'string', maxLength: 200 },
    comment: { type: 'string', maxLength: 2000 }
  },
  additionalProperties: false
};

const submitRatingBodySchema = {
  type: 'object',
  required: ['rating'],
  properties: {
    rating: { type: 'number', minimum: 1, maximum: 5 }
  },
  additionalProperties: false
};

export default async function eventReviewsRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  const redis = getRedis();
  const controller = new EventReviewsController(redis);

  // Reviews
  fastify.post('/:eventId/reviews', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: eventIdParamSchema,
      body: createReviewBodySchema
    }
  }, controller.createReview);

  fastify.get('/:eventId/reviews', {
    schema: {
      params: eventIdParamSchema
    }
  }, controller.getReviews);

  fastify.get('/:eventId/reviews/:reviewId', {
    schema: {
      params: reviewIdParamSchema
    }
  }, controller.getReview);

  fastify.put('/:eventId/reviews/:reviewId', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: reviewIdParamSchema,
      body: updateReviewBodySchema
    }
  }, controller.updateReview);

  fastify.delete('/:eventId/reviews/:reviewId', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: reviewIdParamSchema
    }
  }, controller.deleteReview);

  // Review actions
  fastify.post('/:eventId/reviews/:reviewId/helpful', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: reviewIdParamSchema
    }
  }, controller.markHelpful);

  fastify.post('/:eventId/reviews/:reviewId/report', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: reviewIdParamSchema
    }
  }, controller.reportReview);

  // Ratings
  fastify.post('/:eventId/ratings', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: eventIdParamSchema,
      body: submitRatingBodySchema
    }
  }, controller.submitRating);

  fastify.get('/:eventId/ratings/summary', {
    schema: {
      params: eventIdParamSchema
    }
  }, controller.getRatingSummary);

  fastify.get('/:eventId/ratings/me', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: eventIdParamSchema
    }
  }, controller.getUserRating);
}

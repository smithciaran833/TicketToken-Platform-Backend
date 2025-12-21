import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { EventReviewsController } from '../controllers/event-reviews.controller';
import { getRedis } from '../config/redis';

export default async function eventReviewsRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  const redis = getRedis();
  const controller = new EventReviewsController(redis);

  // Reviews
  fastify.post('/:eventId/reviews', controller.createReview);
  fastify.get('/:eventId/reviews', controller.getReviews);
  fastify.get('/:eventId/reviews/:reviewId', controller.getReview);
  fastify.put('/:eventId/reviews/:reviewId', controller.updateReview);
  fastify.delete('/:eventId/reviews/:reviewId', controller.deleteReview);

  // Review actions
  fastify.post('/:eventId/reviews/:reviewId/helpful', controller.markHelpful);
  fastify.post('/:eventId/reviews/:reviewId/report', controller.reportReview);

  // Ratings
  fastify.post('/:eventId/ratings', controller.submitRating);
  fastify.get('/:eventId/ratings/summary', controller.getRatingSummary);
  fastify.get('/:eventId/ratings/me', controller.getUserRating);
}

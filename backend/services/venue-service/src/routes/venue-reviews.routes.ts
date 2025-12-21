import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { VenueReviewsController } from '../controllers/venue-reviews.controller';
import { getRedis } from '../config/redis';

export default async function venueReviewsRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  const redis = getRedis();
  const controller = new VenueReviewsController(redis);

  // Reviews
  fastify.post('/:venueId/reviews', controller.createReview);
  fastify.get('/:venueId/reviews', controller.getReviews);
  fastify.get('/:venueId/reviews/:reviewId', controller.getReview);
  fastify.put('/:venueId/reviews/:reviewId', controller.updateReview);
  fastify.delete('/:venueId/reviews/:reviewId', controller.deleteReview);

  // Review actions
  fastify.post('/:venueId/reviews/:reviewId/helpful', controller.markHelpful);
  fastify.post('/:venueId/reviews/:reviewId/report', controller.reportReview);

  // Ratings
  fastify.post('/:venueId/ratings', controller.submitRating);
  fastify.get('/:venueId/ratings/summary', controller.getRatingSummary);
  fastify.get('/:venueId/ratings/me', controller.getUserRating);
}

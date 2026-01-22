import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { VenueReviewsController } from '../controllers/venue-reviews.controller';
import { authenticate } from '../middleware/auth.middleware';
import { addTenantContext } from '../middleware/tenant.middleware';
import { getRedis } from '../config/redis';

export default async function venueReviewsRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  const redis = getRedis();
  const controller = new VenueReviewsController(redis);

  // SECURITY FIX: Rate limiting middleware using Redis
  const createSimpleRateLimiter = (max: number, windowMs: number) => {
    return async (request: any, reply: any) => {
      const key = request.user?.id || request.ip;
      const redisKey = `rate_limit:venue_reviews:${key}:${Date.now() - (Date.now() % windowMs)}`;
      
      try {
        const current = await redis.incr(redisKey);
        if (current === 1) {
          await redis.expire(redisKey, Math.ceil(windowMs / 1000));
        }
        
        reply.header('X-RateLimit-Limit', max.toString());
        reply.header('X-RateLimit-Remaining', Math.max(0, max - current).toString());
        
        if (current > max) {
          reply.header('Retry-After', Math.ceil(windowMs / 1000).toString());
          return reply.status(429).send({ 
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Try again in ${Math.ceil(windowMs / 1000)} seconds`
          });
        }
      } catch (error) {
        // Fail open if Redis is unavailable
        fastify.log.warn({ error }, 'Rate limit check failed, allowing request');
      }
    };
  };

  const rateLimiter = createSimpleRateLimiter(100, 60000); // 100 requests per minute
  const writeRateLimiter = createSimpleRateLimiter(10, 60000); // 10 writes per minute (stricter for spam prevention)

  // SECURITY FIX: Reviews - require authentication + tenant + strict rate limiting
  fastify.post('/:venueId/reviews', {
    preHandler: [authenticate, addTenantContext, writeRateLimiter]
  }, controller.createReview);

  // SECURITY FIX: Public read with rate limiting
  fastify.get('/:venueId/reviews', {
    preHandler: [rateLimiter]
  }, controller.getReviews);

  // SECURITY FIX: Public read with rate limiting
  fastify.get('/:venueId/reviews/:reviewId', {
    preHandler: [rateLimiter]
  }, controller.getReview);

  // SECURITY FIX: Update requires authentication + tenant + rate limiting
  fastify.put('/:venueId/reviews/:reviewId', {
    preHandler: [authenticate, addTenantContext, writeRateLimiter]
  }, controller.updateReview);

  // SECURITY FIX: Delete requires authentication + tenant + rate limiting
  fastify.delete('/:venueId/reviews/:reviewId', {
    preHandler: [authenticate, addTenantContext, writeRateLimiter]
  }, controller.deleteReview);

  // SECURITY FIX: Review actions - require authentication to prevent vote manipulation
  fastify.post('/:venueId/reviews/:reviewId/helpful', {
    preHandler: [authenticate, addTenantContext, writeRateLimiter]
  }, controller.markHelpful);

  fastify.post('/:venueId/reviews/:reviewId/report', {
    preHandler: [authenticate, addTenantContext, writeRateLimiter]
  }, controller.reportReview);

  // SECURITY FIX: Ratings - require authentication to prevent rating manipulation
  fastify.post('/:venueId/ratings', {
    preHandler: [authenticate, addTenantContext, writeRateLimiter]
  }, controller.submitRating);

  // SECURITY FIX: Public read with rate limiting
  fastify.get('/:venueId/ratings/summary', {
    preHandler: [rateLimiter]
  }, controller.getRatingSummary);

  // SECURITY FIX: "Me" endpoint requires authentication to determine user
  fastify.get('/:venueId/ratings/me', {
    preHandler: [authenticate, rateLimiter]
  }, controller.getUserRating);
}

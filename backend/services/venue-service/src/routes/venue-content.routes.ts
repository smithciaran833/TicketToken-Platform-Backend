import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { VenueContentController } from '../controllers/venue-content.controller';
import { authenticate } from '../middleware/auth.middleware';
import { addTenantContext } from '../middleware/tenant.middleware';
import { getRedis } from '../config/redis';

export default async function venueContentRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
) {
  const controller = new VenueContentController();
  const redis = getRedis();

  // SECURITY FIX: Simple rate limiting middleware using Redis
  const createSimpleRateLimiter = (max: number, windowMs: number) => {
    return async (request: any, reply: any) => {
      const key = request.user?.id || request.ip;
      const redisKey = `rate_limit:venue_content:${key}:${Date.now() - (Date.now() % windowMs)}`;

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
  const writeRateLimiter = createSimpleRateLimiter(20, 60000); // 20 writes per minute

  // SECURITY FIX: Content CRUD - write operations require authentication + tenant + rate limiting
  fastify.post('/:venueId/content', {
    preHandler: [authenticate, addTenantContext, writeRateLimiter]
  }, controller.createContent);

  // SECURITY FIX: Content read requires auth + tenant (controller uses getTenantId)
  fastify.get('/:venueId/content', {
    preHandler: [authenticate, addTenantContext, rateLimiter]
  }, controller.getVenueContent);

  // SECURITY FIX: Content read requires auth + tenant (controller uses getTenantId)
  fastify.get('/:venueId/content/:contentId', {
    preHandler: [authenticate, addTenantContext, rateLimiter]
  }, controller.getContent);

  // SECURITY FIX: Write operation requires authentication + tenant + rate limiting
  fastify.put('/:venueId/content/:contentId', {
    preHandler: [authenticate, addTenantContext, writeRateLimiter]
  }, controller.updateContent);

  // SECURITY FIX: Delete requires authentication + tenant + rate limiting
  fastify.delete('/:venueId/content/:contentId', {
    preHandler: [authenticate, addTenantContext, writeRateLimiter]
  }, controller.deleteContent);

  // SECURITY FIX: Content actions - require authentication + tenant + rate limiting
  fastify.post('/:venueId/content/:contentId/publish', {
    preHandler: [authenticate, addTenantContext, writeRateLimiter]
  }, controller.publishContent);

  fastify.post('/:venueId/content/:contentId/archive', {
    preHandler: [authenticate, addTenantContext, writeRateLimiter]
  }, controller.archiveContent);

  // SECURITY FIX: Seating chart read requires auth + tenant (controller uses getTenantId)
  fastify.get('/:venueId/seating-chart', {
    preHandler: [authenticate, addTenantContext, rateLimiter]
  }, controller.getSeatingChart);

  fastify.put('/:venueId/seating-chart', {
    preHandler: [authenticate, addTenantContext, writeRateLimiter]
  }, controller.updateSeatingChart);

  // SECURITY FIX: Photos read requires auth + tenant (controller uses getTenantId)
  fastify.get('/:venueId/photos', {
    preHandler: [authenticate, addTenantContext, rateLimiter]
  }, controller.getPhotos);

  fastify.post('/:venueId/photos', {
    preHandler: [authenticate, addTenantContext, writeRateLimiter]
  }, controller.addPhoto);

  // SECURITY FIX: Venue info reads require auth + tenant (controller uses getTenantId)
  fastify.get('/:venueId/amenities', {
    preHandler: [authenticate, addTenantContext, rateLimiter]
  }, controller.getAmenities);

  fastify.get('/:venueId/accessibility', {
    preHandler: [authenticate, addTenantContext, rateLimiter]
  }, controller.getAccessibility);

  fastify.get('/:venueId/parking', {
    preHandler: [authenticate, addTenantContext, rateLimiter]
  }, controller.getParkingInfo);

  fastify.get('/:venueId/policies', {
    preHandler: [authenticate, addTenantContext, rateLimiter]
  }, controller.getPolicies);
}
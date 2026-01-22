import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import * as venueStripeController from '../controllers/venue-stripe.controller';
import { authenticate, requireVenueAccess } from '../middleware/auth.middleware';
import { addTenantContext } from '../middleware/tenant.middleware';
import { validate } from '../middleware/validation.middleware';
import { stripeConnectSchema, stripeRefreshSchema } from '../schemas/venue.schema';
import { getRedis } from '../config/redis';

// Extend FastifyRequest to include rawBody
declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

export default async function venueStripeRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  const redis = getRedis();

  // SECURITY FIX: Rate limiting middleware using Redis
  const createSimpleRateLimiter = (max: number, windowMs: number) => {
    return async (request: any, reply: any) => {
      const key = request.user?.id || request.ip;
      const redisKey = `rate_limit:stripe:${key}:${Date.now() - (Date.now() % windowMs)}`;
      
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

  /**
   * POST /api/venues/:venueId/stripe/connect
   * Initiate Stripe Connect onboarding for a venue
   * 
   * Body: { email, returnUrl, refreshUrl }
   * Auth: Venue owner or platform admin
   * SECURITY FIX: Added tenant context, validation, and rate limiting
   */
  fastify.post<{ Params: { venueId: string } }>('/:venueId/stripe/connect', {
    preHandler: [authenticate, addTenantContext, validate(stripeConnectSchema), writeRateLimiter]
  }, venueStripeController.initiateConnect as any);

  /**
   * GET /api/venues/:venueId/stripe/status
   * Get Stripe Connect onboarding status for a venue
   * 
   * Auth: Venue owner or platform admin
   * SECURITY FIX: Added tenant context and rate limiting
   */
  fastify.get<{ Params: { venueId: string } }>('/:venueId/stripe/status', {
    preHandler: [authenticate, addTenantContext, rateLimiter]
  }, venueStripeController.getConnectStatus as any);

  /**
   * POST /api/venues/:venueId/stripe/refresh
   * Refresh Stripe Connect onboarding link
   * 
   * Body: { returnUrl, refreshUrl }
   * Auth: Venue owner or platform admin
   * SECURITY FIX: Added tenant context, validation, and rate limiting
   */
  fastify.post<{ Params: { venueId: string } }>('/:venueId/stripe/refresh', {
    preHandler: [authenticate, addTenantContext, validate(stripeRefreshSchema), writeRateLimiter]
  }, venueStripeController.refreshConnect as any);
}

/**
 * Webhook routes - registered separately at root level
 * SECURITY FIX (SEC-EXT2): Must receive raw body for Stripe signature verification
 */
export async function venueStripeWebhookRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  const redis = getRedis();

  // SECURITY FIX: Webhook rate limiter (IP-based, higher limit for Stripe)
  const webhookRateLimiter = async (request: any, reply: any) => {
    const key = request.ip;
    const redisKey = `rate_limit:webhook:${key}:${Date.now() - (Date.now() % 60000)}`;
    
    try {
      const current = await redis.incr(redisKey);
      if (current === 1) {
        await redis.expire(redisKey, 60);
      }
      
      reply.header('X-RateLimit-Limit', '1000');
      reply.header('X-RateLimit-Remaining', Math.max(0, 1000 - current).toString());
      
      if (current > 1000) {
        reply.header('Retry-After', '60');
        return reply.status(429).send({ 
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Try again in 60 seconds'
        });
      }
    } catch (error) {
      // Fail open if Redis is unavailable
      fastify.log.warn({ error }, 'Webhook rate limit check failed, allowing request');
    }
  };

  /**
   * POST /api/webhooks/stripe/venue-connect
   * Webhook endpoint for Stripe account updates
   * 
   * No auth - signature verification in controller
   * SECURITY FIX: Added IP-based rate limiting for webhooks
   * 
   * SECURITY FIX (SEC-EXT2): Configure raw body parsing for this route
   * Stripe webhook signature verification requires the raw request body
   * before any JSON parsing occurs.
   */
  // SECURITY FIX (SEC-EXT2): Webhook needs raw body for signature verification
  // The route configuration tells our custom body parser to preserve raw body
  fastify.post('/webhooks/stripe/venue-connect', {
    preHandler: [webhookRateLimiter],
    // Body must be Buffer/string for Stripe verification, not parsed JSON
    schema: {
      // Skip body validation - we need raw bytes for signature
      body: {},
    },
  }, venueStripeController.handleWebhook);
}

/**
 * SECURITY FIX (SEC-EXT2): Add raw body parser plugin for webhook routes
 * This ensures the webhook receives unparsed body for signature verification
 */
export function configureRawBodyForWebhooks(fastify: FastifyInstance): void {
  // Add content type parser for raw body (preserves original for signature)
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    async (req: FastifyRequest, body: Buffer) => {
      // Store raw body for webhook signature verification
      req.rawBody = body;
      
      // Check if this is a webhook route that needs raw body
      if (req.url?.includes('/webhooks/stripe')) {
        return body; // Return raw buffer for webhook signature verification
      }
      
      // For other routes, parse as JSON
      try {
        return JSON.parse(body.toString('utf-8'));
      } catch (err) {
        throw new Error('Invalid JSON payload');
      }
    }
  );
}

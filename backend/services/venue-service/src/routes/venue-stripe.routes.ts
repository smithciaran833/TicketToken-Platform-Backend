import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import * as venueStripeController from '../controllers/venue-stripe.controller';
import { authenticate, requireVenueAccess } from '../middleware/auth.middleware';

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
  /**
   * POST /api/venues/:venueId/stripe/connect
   * Initiate Stripe Connect onboarding for a venue
   * 
   * Body: { email, returnUrl, refreshUrl }
   * Auth: Venue owner or platform admin
   */
  fastify.post<{ Params: { venueId: string } }>('/:venueId/stripe/connect', {
    preHandler: [authenticate, requireVenueAccess]
  }, venueStripeController.initiateConnect as any);

  /**
   * GET /api/venues/:venueId/stripe/status
   * Get Stripe Connect onboarding status for a venue
   * 
   * Auth: Venue owner or platform admin
   */
  fastify.get<{ Params: { venueId: string } }>('/:venueId/stripe/status', {
    preHandler: [authenticate, requireVenueAccess]
  }, venueStripeController.getConnectStatus as any);

  /**
   * POST /api/venues/:venueId/stripe/refresh
   * Refresh Stripe Connect onboarding link
   * 
   * Body: { returnUrl, refreshUrl }
   * Auth: Venue owner or platform admin
   */
  fastify.post<{ Params: { venueId: string } }>('/:venueId/stripe/refresh', {
    preHandler: [authenticate, requireVenueAccess]
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
  /**
   * POST /api/webhooks/stripe/venue-connect
   * Webhook endpoint for Stripe account updates
   * 
   * No auth - signature verification in controller
   * 
   * SECURITY FIX (SEC-EXT2): Configure raw body parsing for this route
   * Stripe webhook signature verification requires the raw request body
   * before any JSON parsing occurs.
   */
  // SECURITY FIX (SEC-EXT2): Webhook needs raw body for signature verification
  // The route configuration tells our custom body parser to preserve raw body
  fastify.post('/webhooks/stripe/venue-connect', {
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

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import * as venueStripeController from '../controllers/venue-stripe.controller';

export default async function venueStripeRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  /**
   * POST /api/venues/:venueId/stripe/connect
   * Initiate Stripe Connect onboarding for a venue
   * 
   * Body: { email, returnUrl, refreshUrl }
   * Auth: Venue owner or platform admin (TODO: add auth middleware)
   */
  fastify.post('/:venueId/stripe/connect', venueStripeController.initiateConnect);

  /**
   * GET /api/venues/:venueId/stripe/status
   * Get Stripe Connect onboarding status for a venue
   * 
   * Auth: Venue owner or platform admin (TODO: add auth middleware)
   */
  fastify.get('/:venueId/stripe/status', venueStripeController.getConnectStatus);

  /**
   * POST /api/venues/:venueId/stripe/refresh
   * Refresh Stripe Connect onboarding link
   * 
   * Body: { returnUrl, refreshUrl }
   * Auth: Venue owner or platform admin (TODO: add auth middleware)
   */
  fastify.post('/:venueId/stripe/refresh', venueStripeController.refreshConnect);
}

/**
 * Webhook routes - registered separately at root level
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
   */
  fastify.post('/webhooks/stripe/venue-connect', venueStripeController.handleWebhook);
}

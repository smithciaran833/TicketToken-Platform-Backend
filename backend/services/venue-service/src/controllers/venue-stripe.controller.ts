import { FastifyRequest, FastifyReply } from 'fastify';
import { venueStripeOnboardingService } from '../services/venue-stripe-onboarding.service';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'VenueStripeController' });

interface VenueParams {
  venueId: string;
}

interface ConnectBody {
  email: string;
  returnUrl: string;
  refreshUrl: string;
}

interface RefreshBody {
  returnUrl: string;
  refreshUrl: string;
}

/**
 * Initiate Stripe Connect onboarding for a venue
 */
export async function initiateConnect(
  req: FastifyRequest<{ Params: VenueParams; Body: ConnectBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { venueId } = req.params;
    const { email, returnUrl, refreshUrl } = req.body;

    // Validate inputs
    if (!email || !returnUrl || !refreshUrl) {
      return reply.status(400).send({
        error: 'Missing required fields: email, returnUrl, refreshUrl',
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return reply.status(400).send({
        error: 'Invalid email format',
      });
    }

    // Validate URLs are HTTPS (except localhost for development)
    const validateUrl = (url: string): boolean => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.hostname === 'localhost';
      } catch {
        return false;
      }
    };

    if (!validateUrl(returnUrl) || !validateUrl(refreshUrl)) {
      return reply.status(400).send({
        error: 'URLs must use HTTPS protocol (or localhost for development)',
      });
    }

    const result = await venueStripeOnboardingService.createConnectAccountAndOnboardingLink(
      venueId,
      email,
      returnUrl,
      refreshUrl
    );

    log.info('Venue Stripe Connect initiated', { venueId, accountId: result.accountId });

    return reply.status(200).send({
      success: true,
      data: result,
    });
  } catch (error: any) {
    log.error('Failed to initiate venue Stripe Connect', {
      venueId: req.params.venueId,
      error: error.message,
    });
    return reply.status(500).send({
      error: 'Failed to initiate Stripe Connect onboarding',
      message: error.message,
    });
  }
}

/**
 * Get Stripe Connect status for a venue
 */
export async function getConnectStatus(
  req: FastifyRequest<{ Params: VenueParams }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { venueId } = req.params;

    const status = await venueStripeOnboardingService.getAccountStatus(venueId);

    log.info('Retrieved venue Stripe Connect status', { venueId, status: status.status });

    return reply.status(200).send({
      success: true,
      data: status,
    });
  } catch (error: any) {
    log.error('Failed to get venue Stripe Connect status', {
      venueId: req.params.venueId,
      error: error.message,
    });
    return reply.status(500).send({
      error: 'Failed to retrieve Stripe Connect status',
      message: error.message,
    });
  }
}

/**
 * Refresh Stripe Connect onboarding link for a venue
 */
export async function refreshConnect(
  req: FastifyRequest<{ Params: VenueParams; Body: RefreshBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { venueId } = req.params;
    const { returnUrl, refreshUrl } = req.body;

    // Validate inputs
    if (!returnUrl || !refreshUrl) {
      return reply.status(400).send({
        error: 'Missing required fields: returnUrl, refreshUrl',
      });
    }

    const onboardingUrl = await venueStripeOnboardingService.refreshOnboardingLink(
      venueId,
      returnUrl,
      refreshUrl
    );

    log.info('Refreshed venue Stripe Connect link', { venueId });

    return reply.status(200).send({
      success: true,
      data: {
        onboardingUrl,
      },
    });
  } catch (error: any) {
    log.error('Failed to refresh venue Stripe Connect link', {
      venueId: req.params.venueId,
      error: error.message,
    });
    return reply.status(500).send({
      error: 'Failed to refresh onboarding link',
      message: error.message,
    });
  }
}

/**
 * Handle Stripe webhook for venue Connect account updates
 */
export async function handleWebhook(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const sig = req.headers['stripe-signature'];

    if (!sig) {
      return reply.status(400).send({
        error: 'Missing stripe-signature header',
      });
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_VENUE;
    if (!webhookSecret) {
      log.error('STRIPE_WEBHOOK_SECRET_VENUE not configured');
      return reply.status(500).send({
        error: 'Webhook secret not configured',
      });
    }

    // Verify webhook signature
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        webhookSecret
      );
    } catch (err: any) {
      log.error('Webhook signature verification failed', { error: err.message });
      return reply.status(400).send({
        error: 'Invalid signature',
      });
    }

    // Handle the event
    if (event.type === 'account.updated') {
      await venueStripeOnboardingService.handleAccountUpdated(event.data.object);
      log.info('Processed account.updated webhook for venue', {
        accountId: event.data.object.id,
      });
    }

    return reply.status(200).send({ received: true });
  } catch (error: any) {
    log.error('Failed to process venue webhook', { error: error.message });
    return reply.status(500).send({
      error: 'Failed to process webhook',
      message: error.message,
    });
  }
}

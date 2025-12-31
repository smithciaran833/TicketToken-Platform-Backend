import { FastifyRequest, FastifyReply } from 'fastify';
import { venueStripeOnboardingService, createStripeClient, STRIPE_API_VERSION } from '../services/venue-stripe-onboarding.service';
import { logger } from '../utils/logger';
import { db } from '../config/database';

const log = logger.child({ component: 'VenueStripeController' });

// SECURITY FIX (ST8): Use centralized Stripe client with locked API version
const stripe = createStripeClient();

// SECURITY FIX (WH2-WH3): Webhook deduplication helper
async function isWebhookProcessed(eventId: string): Promise<boolean> {
  try {
    const existing = await db('webhook_events')
      .where('event_id', eventId)
      .first();
    return !!existing;
  } catch (error) {
    // Table might not exist yet, allow processing
    log.warn('webhook_events table check failed, allowing processing', { eventId });
    return false;
  }
}

async function markWebhookProcessed(eventId: string, eventType: string, tenantId?: string): Promise<void> {
  try {
    await db('webhook_events').insert({
      event_id: eventId,
      event_type: eventType,
      tenant_id: tenantId || null,
      processed_at: new Date(),
    }).onConflict('event_id').ignore();
  } catch (error) {
    // Log but don't fail - deduplication is best effort
    log.warn('Failed to record webhook event', { eventId, eventType });
  }
}

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

    // SECURITY FIX (ST8): Use centralized Stripe client (already initialized above)
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body as string | Buffer,
        sig as string,
        webhookSecret
      );
    } catch (err: any) {
      log.error('Webhook signature verification failed', { error: err.message });
      return reply.status(400).send({
        error: 'Invalid signature',
      });
    }

    // SECURITY FIX (WH2-WH3): Check for duplicate webhook events
    const eventId = event.id;
    if (await isWebhookProcessed(eventId)) {
      log.info('Webhook event already processed, skipping', { eventId, eventType: event.type });
      return reply.status(200).send({ received: true, duplicate: true });
    }

    // SECURITY FIX (AE7): Validate tenant context from webhook metadata
    const venueId = event.data.object?.metadata?.venue_id;
    const tenantId = event.data.object?.metadata?.tenant_id;
    
    if (event.type === 'account.updated') {
      // Validate venue_id exists in metadata for account events
      if (!venueId) {
        log.warn({
          eventId,
          accountId: event.data.object.id,
          eventType: event.type,
        }, 'Webhook event missing venue_id in metadata - security warning');
        // Don't process events without proper venue context
        return reply.status(200).send({ 
          received: true, 
          processed: false, 
          reason: 'Missing venue_id in metadata' 
        });
      }

      // Validate venue exists and belongs to expected tenant (if tenant_id provided)
      if (tenantId) {
        try {
          const venue = await db('venues')
            .where({ id: venueId, tenant_id: tenantId })
            .first();
          
          if (!venue) {
            log.error({
              eventId,
              venueId,
              tenantId,
              eventType: event.type,
            }, 'Webhook tenant validation failed - venue not found or tenant mismatch');
            return reply.status(200).send({ 
              received: true, 
              processed: false, 
              reason: 'Tenant validation failed' 
            });
          }
        } catch (dbError: any) {
          log.error({ error: dbError.message, eventId }, 'Webhook tenant validation DB error');
        }
      }

      await venueStripeOnboardingService.handleAccountUpdated(event.data.object);
      log.info('Processed account.updated webhook for venue', {
        eventId,
        accountId: event.data.object.id,
        venueId,
        tenantId,
      });
    }

    // Mark event as processed with tenant context
    await markWebhookProcessed(eventId, event.type, tenantId || venueId);

    return reply.status(200).send({ received: true });
  } catch (error: any) {
    // SECURITY FIX (ST2): Return 200 on processing errors after logging
    // This prevents webhook retries for non-retryable errors and doesn't
    // expose internal state. Stripe will keep retrying 4xx/5xx responses.
    log.error('Failed to process venue webhook', { 
      error: error.message,
      stack: error.stack,
    });
    
    // Return 200 so Stripe doesn't retry - we've logged the error for investigation
    return reply.status(200).send({ 
      received: true,
      processed: false,
      error: 'Internal processing error - logged for investigation',
    });
  }
}

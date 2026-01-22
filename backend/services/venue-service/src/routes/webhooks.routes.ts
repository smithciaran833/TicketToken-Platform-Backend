import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { db } from '../config/database';
import { getRedis } from '../config/redis';
import { createWebhookService } from '../services/webhook.service';

const log = logger.child({ component: 'WebhooksRoutes' });

/**
 * Webhook routes for external service callbacks
 * - Plaid webhooks for bank verification
 * - Stripe Identity webhooks for identity verification
 */
export async function webhooksRoutes(fastify: FastifyInstance) {
  const redis = getRedis();
  const webhookService = createWebhookService(db, redis);

  /**
   * POST /api/webhooks/plaid
   * Handle Plaid webhooks for bank verification
   */
  fastify.post('/plaid', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as any;

      log.info({
        webhookType: body.webhook_type,
        webhookCode: body.webhook_code,
        itemId: body.item_id
      }, 'Received Plaid webhook');

      // Validate webhook structure
      if (!body.webhook_type || !body.webhook_code) {
        log.warn('Invalid Plaid webhook: missing required fields');
        return reply.status(400).send({ error: 'Invalid webhook payload' });
      }

      // Find the verification record to get tenant context
      const verification = await db('external_verifications')
        .where({ provider: 'plaid' })
        .whereRaw("metadata->>'itemId' = ?", [body.item_id])
        .first();

      if (!verification) {
        log.warn({ itemId: body.item_id }, 'Plaid webhook: no matching verification found');
        // Return 200 to prevent retries for unknown items
        return reply.status(200).send({ received: true, processed: false });
      }

      const tenantId = verification.tenant_id;

      // Process webhook with deduplication
      const result = await webhookService.processWebhook({
        eventId: `plaid_${body.webhook_type}_${body.webhook_code}_${body.item_id}_${Date.now()}`,
        eventType: `plaid.${body.webhook_type}.${body.webhook_code}`,
        payload: body,
        tenantId,
        source: 'plaid',
        sourceIp: request.ip,
        processor: async (payload) => {
          const { PlaidAdapter } = await import('../integrations/verification-adapters');
          const adapter = new PlaidAdapter();
          await adapter.handleWebhook(
            payload.webhook_type,
            payload.webhook_code,
            payload.item_id,
            tenantId
          );
        },
      });

      if (result.duplicate) {
        log.info({ itemId: body.item_id }, 'Plaid webhook already processed');
      }

      return reply.status(200).send({ received: true, processed: !result.duplicate });
    } catch (error: any) {
      log.error({ error: error.message }, 'Failed to process Plaid webhook');
      // Return 200 to prevent excessive retries
      return reply.status(200).send({ received: true, error: 'Processing failed' });
    }
  });

  /**
   * POST /api/webhooks/stripe/identity
   * Handle Stripe Identity webhooks for identity verification
   */
  fastify.post('/stripe/identity', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sig = request.headers['stripe-signature'];

      if (!sig) {
        return reply.status(400).send({ error: 'Missing stripe-signature header' });
      }

      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_IDENTITY;
      if (!webhookSecret) {
        log.error('STRIPE_WEBHOOK_SECRET_IDENTITY not configured');
        return reply.status(500).send({ error: 'Webhook secret not configured' });
      }

      // Import Stripe
      const Stripe = require('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2023-10-16',
      });

      let event;
      try {
        event = stripe.webhooks.constructEvent(
          request.rawBody as Buffer,
          sig as string,
          webhookSecret
        );
      } catch (err: any) {
        log.error({ error: err.message }, 'Stripe Identity webhook signature verification failed');
        return reply.status(400).send({ error: 'Invalid signature' });
      }

      log.info({ eventId: event.id, eventType: event.type }, 'Received Stripe Identity webhook');

      // Extract venue and tenant from metadata
      const session = event.data.object;
      const venueId = session.metadata?.venue_id;
      const tenantId = session.metadata?.tenant_id;

      if (!venueId || !tenantId) {
        log.warn({ eventId: event.id }, 'Stripe Identity webhook missing venue_id or tenant_id');
        return reply.status(200).send({ received: true, processed: false });
      }

      // Convert headers object to string record
      const headersRecord: Record<string, string> = {};
      for (const [key, value] of Object.entries(request.headers)) {
        if (typeof value === 'string') {
          headersRecord[key] = value;
        } else if (Array.isArray(value)) {
          headersRecord[key] = value.join(', ');
        }
      }

      // Process webhook with deduplication
      const result = await webhookService.processWebhook({
        eventId: event.id,
        eventType: event.type,
        payload: event,
        tenantId,
        source: 'stripe_identity',
        sourceIp: request.ip,
        headers: headersRecord,
        processor: async (payload) => {
          await processStripeIdentityEvent(payload, venueId, tenantId);
        },
      });

      if (result.duplicate) {
        log.info({ eventId: event.id }, 'Stripe Identity webhook already processed');
      }

      return reply.status(200).send({ received: true, processed: !result.duplicate });
    } catch (error: any) {
      log.error({ error: error.message }, 'Failed to process Stripe Identity webhook');
      return reply.status(200).send({ received: true, error: 'Processing failed' });
    }
  });
}

/**
 * Process Stripe Identity verification events
 */
async function processStripeIdentityEvent(event: any, venueId: string, tenantId: string): Promise<void> {
  const session = event.data.object;
  const eventType = event.type;

  log.info({ eventType, venueId, tenantId, sessionId: session.id }, 'Processing Stripe Identity event');

  let newStatus: string;
  let completedAt: Date | null = null;

  switch (eventType) {
    case 'identity.verification_session.verified':
      newStatus = 'verified';
      completedAt = new Date();
      break;
    case 'identity.verification_session.requires_input':
      newStatus = 'pending';
      break;
    case 'identity.verification_session.canceled':
      newStatus = 'failed';
      break;
    default:
      log.info({ eventType }, 'Unhandled Stripe Identity event type');
      return;
  }

  // Update external_verifications record
  const updated = await db('external_verifications')
    .where({
      venue_id: venueId,
      tenant_id: tenantId,
      provider: 'stripe_identity',
      external_id: session.id,
    })
    .update({
      status: newStatus,
      completed_at: completedAt,
      updated_at: new Date(),
      metadata: JSON.stringify({
        lastVerificationReport: session.last_verification_report,
        verifiedOutputs: session.verified_outputs,
      }),
    });

  if (updated === 0) {
    log.warn({ sessionId: session.id, venueId, tenantId }, 'No matching verification record found');
  } else {
    log.info({ sessionId: session.id, venueId, tenantId, newStatus }, 'Updated verification status');
  }

  // If verified, check if venue can now be marked as verified
  if (newStatus === 'verified') {
    const { VerificationService } = await import('../services/verification.service');
    const verificationService = new VerificationService();

    try {
      await verificationService.verifyVenue(venueId, tenantId);
      log.info({ venueId, tenantId }, 'Triggered venue verification check after identity verification');
    } catch (error: any) {
      log.warn({ error: error.message, venueId }, 'Venue verification check failed');
    }
  }
}

export default webhooksRoutes;

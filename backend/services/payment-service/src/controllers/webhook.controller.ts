import { FastifyRequest, FastifyReply } from 'fastify';
import Stripe from 'stripe';
import * as crypto from 'crypto';
import { db } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import { RedisService } from '../services/redisService';

const log = logger.child({ component: 'WebhookController' });

export class WebhookController {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: '2023-10-16'
    });
  }

  async handleStripeWebhook(request: FastifyRequest, reply: FastifyReply) {
    const sig = request.headers['stripe-signature'] as string;
    let event: Stripe.Event;

    // 1. Verify webhook signature
    // CRITICAL: Fastify provides rawBody when content type parser is configured
    const rawBody = (request as any).rawBody || request.body;
    
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        sig,
        config.stripe.webhookSecret
      );
    } catch (err) {
      log.warn('Invalid webhook signature', { err: err instanceof Error ? err.message : 'Unknown' });
      return reply.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }

    // 2. Deduplicate by event ID using Redis
    const eventKey = `webhook:stripe:${event.id}`;

    try {
      const exists = await RedisService.get(eventKey);

      if (exists) {
        const cachedData = JSON.parse(exists);
        log.info('Duplicate webhook ignored', {
          eventId: event.id,
          type: event.type,
          processedAt: cachedData.processedAt
        });

        // Return 200 to prevent Stripe from retrying
        return reply.send({ received: true, duplicate: true });
      }

      // 3. Mark as processing (TTL = 7 days, matches Stripe's retry window)
      await RedisService.set(
        eventKey,
        JSON.stringify({
          processedAt: new Date().toISOString(),
          type: event.type,
          status: 'processing'
        }),
        604800  // 7 days in seconds
      );

      // 4. Store in database inbox for async processing
      try {
        await db('webhook_inbox').insert({
          webhook_id: event.id,
          source: 'stripe',
          event_type: event.type,
          payload: event,
          signature: sig,
          tenant_id: (event.data.object as any).metadata?.tenant_id || '00000000-0000-0000-0000-000000000000',
          created_at: new Date()
        }).onConflict('webhook_id').ignore();

        log.info('Webhook stored for processing', {
          eventId: event.id,
          type: event.type
        });

      } catch (dbErr) {
        log.error('Failed to store webhook in database', { err: dbErr, eventId: event.id });
        // Continue - Redis deduplication is primary defense
      }

      // 5. Process webhook immediately (inline processing)
      await this.processWebhookEvent(event);

      // 6. Update Redis to mark as completed
      await RedisService.set(
        eventKey,
        JSON.stringify({
          processedAt: new Date().toISOString(),
          type: event.type,
          status: 'completed'
        }),
        604800  // Keep for 7 days
      );

      return reply.send({ received: true });

    } catch (err) {
      log.error('Webhook processing failed', {
        err,
        eventId: event.id,
        type: event.type
      });

      // Delete Redis key to allow Stripe to retry
      await RedisService.del(eventKey).catch(delErr => {
        log.error('Failed to delete webhook key', { err: delErr });
      });

      return reply.status(500).send({ error: 'Processing failed' });
    }
  }

  private async processWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSuccess(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await this.handlePaymentFailure(event.data.object as Stripe.PaymentIntent);
        break;

      case 'charge.refunded':
        await this.handleRefund(event.data.object as Stripe.Charge);
        break;

      case 'payment_intent.canceled':
        await this.handlePaymentCanceled(event.data.object as Stripe.PaymentIntent);
        break;

      default:
        log.info('Unhandled webhook event type', { type: event.type });
    }
  }

  private async handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    log.info('Processing payment success', {
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount
    });

    // Update transaction status in database (using payment_transactions not transactions)
    await db('payment_transactions')
      .where({ stripe_intent_id: paymentIntent.id })
      .update({
        status: 'completed',
        updated_at: new Date()
      });
  }

  private async handlePaymentFailure(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    log.info('Processing payment failure', {
      paymentIntentId: paymentIntent.id
    });

    await db('payment_transactions')
      .where({ stripe_intent_id: paymentIntent.id })
      .update({
        status: 'failed',
        updated_at: new Date()
      });
  }

  private async handleRefund(charge: Stripe.Charge): Promise<void> {
    log.info('Processing refund', {
      chargeId: charge.id,
      refunded: charge.refunded
    });

    // Implementation depends on your refund tracking
    // This is a placeholder
  }

  private async handlePaymentCanceled(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    log.info('Processing payment cancellation', {
      paymentIntentId: paymentIntent.id
    });

    await db('payment_transactions')
      .where({ stripe_intent_id: paymentIntent.id })
      .update({
        status: 'canceled',
        updated_at: new Date()
      });
  }

  async handleSquareWebhook(request: FastifyRequest, reply: FastifyReply) {
    const signature = request.headers['x-square-signature'] as string;

    try {
      // Verify Square signature
      const body = JSON.stringify(request.body);
      const hash = crypto
        .createHmac('sha256', process.env.SQUARE_WEBHOOK_SECRET || "")
        .update(body)
        .digest('base64');

      if (hash !== signature) {
        throw new Error('Invalid signature');
      }

      const event = request.body as any;
      const eventKey = `webhook:square:${event.event_id || event.id}`;

      // Deduplicate
      const exists = await RedisService.get(eventKey);
      if (exists) {
        log.info('Duplicate Square webhook ignored', { eventId: event.event_id });
        return reply.send({ received: true, duplicate: true });
      }

      // Mark as processed (7 day TTL)
      await RedisService.set(
        eventKey,
        JSON.stringify({
          processedAt: new Date().toISOString(),
          type: event.type
        }),
        604800
      );

      // Store in inbox
      await db('webhook_inbox')
        .insert({
          webhook_id: event.event_id || event.id,
          source: 'square',
          event_type: event.type,
          payload: event,
          signature: signature,
          tenant_id: event.merchant_id || '00000000-0000-0000-0000-000000000000',
          created_at: new Date()
        })
        .onConflict('webhook_id')
        .ignore();

      log.info('Square webhook stored', { eventId: event.event_id });

      return reply.status(200).send({ received: true });
    } catch (error) {
      log.error('Square webhook error', { err: error });
      return reply.status(500).send({ error: 'Processing failed' });
    }
  }
}

export const webhookController = new WebhookController();

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
      log.warn({ err: err instanceof Error ? err.message : 'Unknown' }, 'Invalid webhook signature');
      return reply.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }

    // 2. Deduplicate by event ID using Redis
    const eventKey = `webhook:stripe:${event.id}`;

    try {
      const exists = await RedisService.get(eventKey);

      if (exists) {
        const cachedData = JSON.parse(exists);
        log.info({
          eventId: event.id,
          type: event.type,
          processedAt: cachedData.processedAt
        }, 'Duplicate webhook ignored');

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

        log.info({
          eventId: event.id,
          type: event.type
        }, 'Webhook stored for processing');

      } catch (dbErr) {
        log.error({ err: dbErr, eventId: event.id }, 'Failed to store webhook in database');
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
      log.error({
        err,
        eventId: event.id,
        type: event.type
      }, 'Webhook processing failed');

      // CRITICAL FIX: Queue for internal retry instead of telling Stripe to retry
      // Returning 500 causes Stripe to retry indefinitely, leading to duplicate processing
      try {
        // Update Redis to mark as failed for internal retry
        await RedisService.set(
          eventKey,
          JSON.stringify({
            processedAt: new Date().toISOString(),
            type: event.type,
            status: 'failed',
            error: err instanceof Error ? err.message : 'Unknown error',
            retryCount: 1
          }),
          86400  // Keep for 24 hours for internal retry
        );

        // Queue for internal async retry processing
        await db('webhook_inbox')
          .where({ webhook_id: event.id })
          .update({
            status: 'failed',
            error: err instanceof Error ? err.message : 'Unknown error',
            retry_count: db.raw('retry_count + 1'),
            updated_at: new Date()
          });
      } catch (queueErr) {
        log.error({ err: queueErr, eventId: event.id }, 'Failed to queue webhook for retry');
      }

      // CRITICAL: Always return 200 to Stripe to prevent infinite retries
      // We handle retries internally via our own queue
      return reply.status(200).send({
        received: true,
        processed: false,
        queued_for_retry: true
      });
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
        log.info({ type: event.type }, 'Unhandled webhook event type');
    }
  }

  private async handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    log.info({
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount
    }, 'Processing payment success');

    // Update transaction status in database (using payment_transactions not transactions)
    await db('payment_transactions')
      .where({ stripe_intent_id: paymentIntent.id })
      .update({
        status: 'completed',
        updated_at: new Date()
      });
  }

  private async handlePaymentFailure(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    log.info({
      paymentIntentId: paymentIntent.id
    }, 'Processing payment failure');

    await db('payment_transactions')
      .where({ stripe_intent_id: paymentIntent.id })
      .update({
        status: 'failed',
        updated_at: new Date()
      });
  }

  private async handleRefund(charge: Stripe.Charge): Promise<void> {
    log.info({
      chargeId: charge.id,
      refunded: charge.refunded,
      amountRefunded: charge.amount_refunded
    }, 'Processing refund');

    try {
      // Get payment intent ID from the charge
      const paymentIntentId = typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id;

      if (!paymentIntentId) {
        log.warn({ chargeId: charge.id }, 'Refund webhook missing payment_intent');
        return;
      }

      // Find the original transaction
      const transaction = await db('payment_transactions')
        .where('stripe_payment_intent_id', paymentIntentId)
        .first('id', 'user_id', 'tenant_id', 'amount');

      if (!transaction) {
        log.warn({ paymentIntentId, chargeId: charge.id }, 'Refund for unknown transaction');
        return;
      }

      // Process each refund in the charge (Stripe includes all refunds on the charge)
      const refunds = charge.refunds?.data || [];
      for (const refund of refunds) {
        // Check if this refund already exists (idempotency)
        const existing = await db('payment_refunds')
          .where('stripe_refund_id', refund.id)
          .first('id');

        if (existing) {
          log.debug({ refundId: refund.id }, 'Refund already processed');
          continue;
        }

        // Create refund record
        await db('payment_refunds').insert({
          tenant_id: transaction.tenant_id,
          transaction_id: transaction.id,
          user_id: transaction.user_id,
          amount: refund.amount,
          currency: refund.currency,
          status: refund.status,
          reason: refund.reason || 'requested_by_customer',
          stripe_refund_id: refund.id,
          created_at: new Date(),
          updated_at: new Date()
        });

        log.info({
          refundId: refund.id,
          transactionId: transaction.id,
          amount: refund.amount
        }, 'Refund recorded from webhook');
      }

      // Update transaction status based on refund amount
      const newStatus = charge.amount_refunded >= charge.amount ? 'refunded' : 'partially_refunded';
      await db('payment_transactions')
        .where('id', transaction.id)
        .update({
          status: newStatus,
          updated_at: new Date()
        });

    } catch (error) {
      log.error({ error, chargeId: charge.id }, 'Error processing refund webhook');
      throw error;
    }
  }

  private async handlePaymentCanceled(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    log.info({
      paymentIntentId: paymentIntent.id
    }, 'Processing payment cancellation');

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
        log.info({ eventId: event.event_id }, 'Duplicate Square webhook ignored');
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

      log.info({ eventId: event.event_id }, 'Square webhook stored');

      return reply.status(200).send({ received: true });
    } catch (error) {
      log.error({ err: error }, 'Square webhook error');
      return reply.status(500).send({ error: 'Processing failed' });
    }
  }
}

export const webhookController = new WebhookController();

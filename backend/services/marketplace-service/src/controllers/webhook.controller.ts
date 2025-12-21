import { FastifyRequest, FastifyReply } from 'fastify';
import { transferService } from '../services/transfer.service';
import { transferModel } from '../models/transfer.model';
import { stripePaymentService } from '../services/stripe-payment.service';
import { logger } from '../utils/logger';
import Stripe from 'stripe';

const log = logger.child({ component: 'WebhookController' });

interface PaymentCompletedBody {
  paymentIntentId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  currency: string;
  transferDestination?: string;
}

export class WebhookController {
  private processedEvents = new Set<string>(); // Simple in-memory idempotency check
  private readonly IDEMPOTENCY_TTL = 3600000; // 1 hour

  /**
   * Handle Stripe payment_intent.succeeded webhook
   * This is the official Stripe webhook that triggers the split payment flow
   */
  async handleStripeWebhook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const signature = request.headers['stripe-signature'];
    
    if (!signature || typeof signature !== 'string') {
      log.error('Missing Stripe signature header');
      return reply.status(400).send({ error: 'Missing stripe-signature header' });
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      log.error('STRIPE_WEBHOOK_SECRET not configured');
      return reply.status(500).send({ error: 'Webhook secret not configured' });
    }

    let event: Stripe.Event;

    try {
      // Verify webhook signature
      event = stripePaymentService.verifyWebhookSignature(
        request.body as string | Buffer,
        signature,
        webhookSecret
      );
    } catch (err: any) {
      log.error('Webhook signature verification failed', { error: err.message });
      return reply.status(400).send({ error: 'Invalid signature' });
    }

    // Idempotency check - don't process the same event twice
    if (this.processedEvents.has(event.id)) {
      log.info('Event already processed (idempotency check)', { eventId: event.id });
      return reply.send({ received: true, status: 'already_processed' });
    }

    log.info('Received Stripe webhook', {
      eventType: event.type,
      eventId: event.id,
    });

    try {
      // Handle payment_intent.succeeded event
      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        
        // Look up transfer by PaymentIntent ID
        const transfer = await transferModel.findByStripePaymentIntentId(paymentIntent.id);
        
        if (!transfer) {
          log.warn('Transfer not found for payment intent', {
            paymentIntentId: paymentIntent.id,
          });
          return reply.status(404).send({ error: 'Transfer not found' });
        }

        // Check if already completed
        if (transfer.status === 'completed') {
          log.info('Transfer already completed', {
            transferId: transfer.id,
            paymentIntentId: paymentIntent.id,
          });
          return reply.send({ received: true, status: 'already_completed' });
        }

        // Execute the split payment transfers
        await transferService.completeFiatTransfer(transfer.id);

        // Mark event as processed
        this.processedEvents.add(event.id);
        setTimeout(() => this.processedEvents.delete(event.id), this.IDEMPOTENCY_TTL);

        log.info('Payment completed via Stripe webhook', {
          transferId: transfer.id,
          paymentIntentId: paymentIntent.id,
          eventId: event.id,
        });

        return reply.send({ received: true, transferId: transfer.id });
      }

      // Log unhandled event types
      log.info('Unhandled webhook event type', { eventType: event.type });
      return reply.send({ received: true, status: 'unhandled_event_type' });

    } catch (error: any) {
      log.error('Failed to process Stripe webhook', {
        eventId: event.id,
        eventType: event.type,
        error: error.message,
      });
      return reply.status(500).send({ error: error.message });
    }
  }

  /**
   * Handle custom payment completion webhook (legacy)
   * This is the old custom webhook endpoint, kept for backward compatibility
   */
  async handlePaymentCompleted(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = request.body as PaymentCompletedBody;
    
    log.info('Received custom payment completion webhook', {
      paymentIntentId: body.paymentIntentId,
      listingId: body.listingId
    });

    try {
      const transfer = await transferModel.findByStripePaymentIntentId(body.paymentIntentId);
      
      if (!transfer) {
        log.error('Transfer not found for payment intent', { paymentIntentId: body.paymentIntentId });
        return reply.status(404).send({ error: 'Transfer not found' });
      }

      await transferService.completeFiatTransfer(transfer.id, body.transferDestination);

      log.info('Fiat transfer completed via custom webhook', {
        transferId: transfer.id,
        listingId: body.listingId
      });

      return reply.send({ success: true, transferId: transfer.id });
    } catch (error: any) {
      log.error('Failed to complete fiat transfer', {
        paymentIntentId: body.paymentIntentId,
        error: error.message
      });
      return reply.status(500).send({ error: error.message });
    }
  }
}

export const webhookController = new WebhookController();

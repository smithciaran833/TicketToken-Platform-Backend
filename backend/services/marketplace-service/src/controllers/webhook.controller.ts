import { FastifyRequest, FastifyReply } from 'fastify';
import { transferService } from '../services/transfer.service';
import { transferModel } from '../models/transfer.model';
import { stripePaymentService } from '../services/stripe-payment.service';
import { logger } from '../utils/logger';
import { cache } from '../config/redis';
import Stripe from 'stripe';

const log = logger.child({ component: 'WebhookController' });

/**
 * Webhook Controller for Marketplace Service
 * 
 * Issues Fixed:
 * - IDP-3: Webhook dedup in-memory → Moved to Redis for persistence across restarts
 * - WH-H1: In-memory idempotency → Redis-backed with proper TTL
 */

interface PaymentCompletedBody {
  paymentIntentId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  currency: string;
  transferDestination?: string;
}

// AUDIT FIX IDP-3 + FIX #6/#7: Redis key prefix for webhook deduplication
const WEBHOOK_DEDUP_PREFIX = 'marketplace:webhook:processed:';
const WEBHOOK_DEDUP_TTL_SECONDS = 3600; // 1 hour

export class WebhookController {
  /**
   * FIX #6/#7: Atomic idempotency check using Redis SETNX
   * Uses SET with NX (only set if not exists) and EX (expiry) for atomic operation
   * Returns true if this is a NEW event (not processed before)
   * Returns false if event was already processed
   */
  private async tryAcquireEventLock(eventId: string): Promise<boolean> {
    const key = `${WEBHOOK_DEDUP_PREFIX}${eventId}`;
    
    try {
      // Use Redis SET with NX (only if not exists) and EX (expiry) for atomic operation
      // This is the standard Redis pattern for distributed locks/idempotency
      const result = await cache.setNX(key, 'processing', WEBHOOK_DEDUP_TTL_SECONDS);
      
      if (result) {
        log.debug('Acquired event lock', { eventId });
        return true; // New event, lock acquired
      } else {
        log.debug('Event lock already exists', { eventId });
        return false; // Already processed or being processed
      }
    } catch (error: any) {
      // FIX #7: If Redis is unavailable, we log and FAIL OPEN (allow processing)
      // This is safer than blocking all webhooks, but we log loudly
      log.error('Redis SETNX failed - ALLOWING processing (potential duplicate risk)', {
        eventId,
        error: error.message
      });
      // Return true to allow processing but log the risk
      return true;
    }
  }

  /**
   * Mark event as successfully processed (update lock value)
   */
  private async markEventProcessed(eventId: string): Promise<void> {
    const key = `${WEBHOOK_DEDUP_PREFIX}${eventId}`;
    
    try {
      // Update the value to indicate completed processing
      await cache.set(key, 'completed', WEBHOOK_DEDUP_TTL_SECONDS);
    } catch (error: any) {
      log.warn('Failed to update event status to completed', { 
        eventId, 
        error: error.message 
      });
      // Non-critical - lock is already in place
    }
  }

  /**
   * Release lock on failure (allows retry)
   */
  private async releaseEventLock(eventId: string): Promise<void> {
    const key = `${WEBHOOK_DEDUP_PREFIX}${eventId}`;
    
    try {
      await cache.del(key);
      log.debug('Released event lock for retry', { eventId });
    } catch (error: any) {
      log.warn('Failed to release event lock', { 
        eventId, 
        error: error.message 
      });
    }
  }

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

    // FIX #6/#7: Atomic idempotency check using Redis SETNX
    const lockAcquired = await this.tryAcquireEventLock(event.id);
    if (!lockAcquired) {
      log.info('Event already processed or in progress (idempotency check)', { eventId: event.id });
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

        // AUDIT FIX IDP-3: Mark event as processed in Redis
        await this.markEventProcessed(event.id);

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

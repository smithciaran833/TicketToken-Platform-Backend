import Stripe from 'stripe';
import { Pool } from 'pg';
import { StateTransitionService } from '../services/state-machine/transitions';
import { PaymentState } from '../services/state-machine/payment-state-machine';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const log = logger.child({ component: 'StripeWebhookHandler' });

// =============================================================================
// CONFIGURATION
// =============================================================================

const WEBHOOK_CONFIG = {
  // BJ-3: Max retry limit for webhook processing
  maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES || '5', 10),
  
  // WH-7: Outbound rate limiting
  outboundRateLimit: {
    maxRequestsPerMinute: parseInt(process.env.OUTBOUND_RATE_LIMIT || '60', 10),
    windowMs: 60000,
  },
  
  // ST-5: Stripe rate limit handling
  stripeRateLimitRetryMs: parseInt(process.env.STRIPE_RATE_LIMIT_RETRY_MS || '2000', 10),
};

// =============================================================================
// USER-FRIENDLY ERROR MESSAGES (ST-7)
// =============================================================================

const CARD_DECLINE_MESSAGES: Record<string, string> = {
  'insufficient_funds': 'Your card has insufficient funds. Please use a different payment method.',
  'lost_card': 'This card cannot be used. Please contact your bank or use a different card.',
  'stolen_card': 'This card cannot be used. Please contact your bank or use a different card.',
  'expired_card': 'Your card has expired. Please update your card details.',
  'incorrect_cvc': 'The security code (CVV/CVC) is incorrect. Please check and try again.',
  'incorrect_number': 'The card number is incorrect. Please check and try again.',
  'processing_error': 'A processing error occurred. Please try again.',
  'card_declined': 'Your card was declined. Please try a different payment method.',
  'card_not_supported': 'This card type is not supported. Please use a different card.',
  'currency_not_supported': 'This currency is not supported by your card. Please use a different card.',
  'do_not_honor': 'Your bank declined this transaction. Please contact them or use a different card.',
  'generic_decline': 'Your card was declined. Please try a different payment method.',
};

function getUserFriendlyDeclineMessage(declineCode: string | undefined): string {
  if (!declineCode) {
    return 'Your card was declined. Please try a different payment method.';
  }
  return CARD_DECLINE_MESSAGES[declineCode] || CARD_DECLINE_MESSAGES['generic_decline'];
}

// =============================================================================
// OUTBOUND RATE LIMITER (WH-7)
// =============================================================================

class OutboundRateLimiter {
  private requestCounts: Map<string, { count: number; resetAt: number }> = new Map();

  async checkLimit(destination: string): Promise<boolean> {
    const now = Date.now();
    const entry = this.requestCounts.get(destination);
    
    if (!entry || now > entry.resetAt) {
      // Reset or create new entry
      this.requestCounts.set(destination, {
        count: 1,
        resetAt: now + WEBHOOK_CONFIG.outboundRateLimit.windowMs,
      });
      return true;
    }
    
    if (entry.count >= WEBHOOK_CONFIG.outboundRateLimit.maxRequestsPerMinute) {
      log.warn({
        destination,
        count: entry.count,
        limit: WEBHOOK_CONFIG.outboundRateLimit.maxRequestsPerMinute,
      }, 'Outbound rate limit exceeded');
      return false;
    }
    
    entry.count++;
    return true;
  }
}

const outboundRateLimiter = new OutboundRateLimiter();

// =============================================================================
// WEBHOOK HANDLER
// =============================================================================

export class StripeWebhookHandler {
  private stripe: Stripe;
  private db: Pool;
  private stateService: StateTransitionService;

  constructor(stripe: Stripe, db: Pool) {
    this.stripe = stripe;
    this.db = db;
    this.stateService = new StateTransitionService(db);
  }

  /**
   * WH-10: MEDIUM FIX - Handle webhook with immediate 200 response
   * Queue for async processing to prevent Stripe timeouts
   */
  async handleWebhook(payload: string, signature: string): Promise<{
    success: boolean;
    eventId?: string;
    message?: string;
  }> {
    let event: Stripe.Event;
    const correlationId = uuidv4();

    try {
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err) {
      log.error({ correlationId, error: err }, 'Webhook signature verification failed');
      throw new Error(`Webhook signature verification failed: ${err}`);
    }

    // Log idempotency key (event.id is Stripe's idempotency key)
    log.info({
      webhookId: event.id,
      eventType: event.type,
      correlationId,
      idempotencyKey: event.id, // MEDIUM FIX: Log idempotency key
      livemode: event.livemode,
    }, 'Webhook received');

    // Check for duplicate (idempotency)
    const existingWebhook = await this.db.query(
      'SELECT id, processed, attempts FROM webhook_inbox WHERE webhook_id = $1',
      [event.id]
    );

    if (existingWebhook.rows.length > 0) {
      const existing = existingWebhook.rows[0];
      
      // BJ-3: Check if max retries exceeded
      if (existing.attempts >= WEBHOOK_CONFIG.maxRetries) {
        log.warn({
          webhookId: event.id,
          attempts: existing.attempts,
          maxRetries: WEBHOOK_CONFIG.maxRetries,
        }, 'Webhook max retries exceeded - skipping');
        return { success: true, eventId: event.id, message: 'Max retries exceeded' };
      }
      
      if (existing.processed) {
        log.info({
          webhookId: event.id,
          idempotencyKey: event.id,
        }, 'Webhook already processed (idempotent)');
        return { success: true, eventId: event.id, message: 'Already processed' };
      }
    }

    // WH-10: Queue for async processing and return immediately
    await this.queueWebhookForProcessing(event, correlationId);

    return { 
      success: true, 
      eventId: event.id,
      message: 'Webhook queued for processing',
    };
  }

  /**
   * WH-10: Queue webhook for async processing
   */
  private async queueWebhookForProcessing(
    event: Stripe.Event,
    correlationId: string
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO webhook_inbox (
        webhook_id, provider, event_type, payload, processed, 
        correlation_id, attempts, created_at
      )
       VALUES ($1, $2, $3, $4, false, $5, 0, NOW())
       ON CONFLICT (webhook_id) DO UPDATE SET
         attempts = webhook_inbox.attempts + 1,
         last_attempt_at = NOW()`,
      [event.id, 'stripe', event.type, JSON.stringify(event), correlationId]
    );

    log.info({
      webhookId: event.id,
      eventType: event.type,
      correlationId,
    }, 'Webhook queued for async processing');
  }

  /**
   * Process webhook from queue (called by background job)
   */
  async processQueuedWebhook(webhookId: string): Promise<void> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');
      
      // Lock the webhook record
      const result = await client.query(
        `SELECT * FROM webhook_inbox 
         WHERE webhook_id = $1 AND processed = false
         FOR UPDATE SKIP LOCKED`,
        [webhookId]
      );
      
      if (result.rows.length === 0) {
        await client.query('COMMIT');
        return;
      }
      
      const webhookRecord = result.rows[0];
      const event = JSON.parse(webhookRecord.payload) as Stripe.Event;
      
      // BJ-3: Check max retries
      if (webhookRecord.attempts >= WEBHOOK_CONFIG.maxRetries) {
        await client.query(
          `UPDATE webhook_inbox 
           SET processed = true, 
               error = 'Max retries exceeded',
               processed_at = NOW()
           WHERE webhook_id = $1`,
          [webhookId]
        );
        await client.query('COMMIT');
        log.error({ webhookId, attempts: webhookRecord.attempts }, 'Webhook failed - max retries');
        return;
      }
      
      // Update attempt count
      await client.query(
        `UPDATE webhook_inbox 
         SET attempts = attempts + 1, last_attempt_at = NOW()
         WHERE webhook_id = $1`,
        [webhookId]
      );
      
      try {
        // Process the event
        await this.processEvent(event, webhookRecord.correlation_id);
        
        // Mark as processed
        await client.query(
          `UPDATE webhook_inbox 
           SET processed = true, processed_at = NOW()
           WHERE webhook_id = $1`,
          [webhookId]
        );
        
        log.info({
          webhookId,
          eventType: event.type,
          correlationId: webhookRecord.correlation_id,
        }, 'Webhook processed successfully');
      } catch (error: any) {
        // ST-5: Handle Stripe rate limit errors
        if (this.isStripeRateLimitError(error)) {
          log.warn({
            webhookId,
            retryAfterMs: WEBHOOK_CONFIG.stripeRateLimitRetryMs,
          }, 'Stripe rate limit hit - scheduling retry');
          
          await client.query(
            `UPDATE webhook_inbox 
             SET process_after = NOW() + INTERVAL '${WEBHOOK_CONFIG.stripeRateLimitRetryMs} milliseconds',
                 last_error = 'Stripe rate limit'
             WHERE webhook_id = $1`,
            [webhookId]
          );
        } else {
          await client.query(
            `UPDATE webhook_inbox 
             SET last_error = $2
             WHERE webhook_id = $1`,
            [webhookId, error.message]
          );
          throw error;
        }
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * ST-5: Check if error is a Stripe rate limit error
   */
  private isStripeRateLimitError(error: any): boolean {
    return error.type === 'StripeRateLimitError' || 
           error.statusCode === 429 ||
           (error.message && error.message.includes('rate limit'));
  }

  private async processEvent(event: Stripe.Event, correlationId?: string): Promise<void> {
    // Handle Connect account events
    if (event.type === 'account.updated') {
      await this.handleAccountUpdated(event);
      return;
    }

    const eventMap: Record<string, string> = {
      'payment_intent.succeeded': 'complete',
      'payment_intent.payment_failed': 'fail',
      'payment_intent.processing': 'process',
      'payment_intent.canceled': 'cancel',
      'charge.refunded': 'refund'
    };

    const stateEvent = eventMap[event.type];
    if (!stateEvent) {
      log.info({ eventType: event.type }, 'Unhandled event type');
      return;
    }

    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    // ST-7: Log user-friendly message for failed payments
    if (event.type === 'payment_intent.payment_failed') {
      const charge = paymentIntent.last_payment_error;
      const declineCode = charge?.decline_code;
      const userMessage = getUserFriendlyDeclineMessage(declineCode);
      
      log.info({
        paymentIntentId: paymentIntent.id,
        declineCode,
        userMessage,
        correlationId,
      }, 'Payment failed with user-friendly message');
      
      // Store the user-friendly message for later retrieval
      await this.db.query(
        `UPDATE payment_transactions 
         SET decline_message = $2, decline_code = $3
         WHERE stripe_payment_intent_id = $1`,
        [paymentIntent.id, userMessage, declineCode]
      );
    }

    // Handle marketplace payments
    if (event.type === 'payment_intent.succeeded' && paymentIntent.metadata?.listing_id) {
      await this.handleMarketplacePayment(paymentIntent, correlationId);
    }

    // Get current payment state from database
    const payment = await this.db.query(
      'SELECT id, status, order_id FROM payment_transactions WHERE stripe_payment_intent_id = $1',
      [paymentIntent.id]
    );

    if (payment.rows.length === 0) {
      log.warn({
        intentId: paymentIntent.id,
        isMarketplace: !!paymentIntent.metadata?.listing_id
      }, 'Payment not found for intent (may be marketplace payment)');
      return;
    }

    const currentState = payment.rows[0].state as PaymentState;

    await this.stateService.handlePaymentEvent(stateEvent, currentState, {
      paymentId: payment.rows[0].id,
      orderId: payment.rows[0].order_id,
      provider: 'stripe',
      amount: paymentIntent.amount,
      metadata: paymentIntent.metadata
    });
  }

  /**
   * Handle Stripe Connect account.updated webhook
   * Updates seller status when they complete onboarding
   */
  private async handleAccountUpdated(event: Stripe.Event): Promise<void> {
    const account = event.data.object as Stripe.Account;

    log.info({
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted
    }, 'Processing Connect account update');

    // Determine status based on account state
    let status = 'pending';
    if (account.charges_enabled && account.payouts_enabled) {
      status = 'enabled';
    } else if (account.requirements?.disabled_reason) {
      status = 'disabled';
    } else if (account.requirements?.eventually_due?.length || account.requirements?.currently_due?.length) {
      status = 'restricted';
    }

    // Update user record in auth database
    try {
      const result = await this.db.query(
        `UPDATE users SET
          stripe_connect_status = $1,
          stripe_connect_charges_enabled = $2,
          stripe_connect_payouts_enabled = $3,
          stripe_connect_details_submitted = $4,
          stripe_connect_capabilities = $5,
          stripe_connect_country = $6,
          stripe_connect_onboarded_at = CASE
            WHEN $2 = true AND $3 = true AND stripe_connect_onboarded_at IS NULL
            THEN NOW()
            ELSE stripe_connect_onboarded_at
          END,
          updated_at = NOW()
        WHERE stripe_connect_account_id = $7`,
        [
          status,
          account.charges_enabled || false,
          account.payouts_enabled || false,
          account.details_submitted || false,
          JSON.stringify(account.capabilities || {}),
          account.country || null,
          account.id
        ]
      );

      if (result.rowCount === 0) {
        log.warn({ accountId: account.id }, 'No user found with this Stripe Connect account ID');
      } else {
        log.info({ accountId: account.id, status }, 'Updated seller Connect status');
      }
    } catch (error: any) {
      log.error({ accountId: account.id, error: error.message }, 'Failed to update seller Connect status');
      throw error;
    }
  }

  /**
   * Handle marketplace payment completion
   * Notifies marketplace-service to complete the transfer
   * WH-7: Includes outbound rate limiting
   */
  private async handleMarketplacePayment(
    paymentIntent: Stripe.PaymentIntent, 
    correlationId?: string
  ): Promise<void> {
    const marketplaceUrl = process.env.MARKETPLACE_SERVICE_URL || 'http://localhost:3004';
    
    // WH-7: Check outbound rate limit
    const canSend = await outboundRateLimiter.checkLimit(marketplaceUrl);
    if (!canSend) {
      log.warn({
        paymentIntentId: paymentIntent.id,
        destination: marketplaceUrl,
      }, 'Outbound rate limit exceeded - queuing for retry');
      throw new Error('Outbound rate limit exceeded');
    }

    const payload = {
      paymentIntentId: paymentIntent.id,
      listingId: paymentIntent.metadata?.listing_id,
      buyerId: paymentIntent.metadata?.buyer_id,
      sellerId: paymentIntent.metadata?.seller_id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      transferDestination: paymentIntent.transfer_data?.destination as string | undefined,
      correlationId, // Pass correlation ID for tracing
    };

    log.info({
      ...payload,
      destination: marketplaceUrl,
    }, 'Marketplace payment completed, notifying marketplace-service');
    
    try {
      const response = await fetch(`${marketplaceUrl}/webhooks/payment-completed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Service': 'payment-service',
          'X-Correlation-ID': correlationId || uuidv4(),
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error({
          status: response.status,
          error: errorText,
          paymentIntentId: paymentIntent.id,
          correlationId,
        }, 'Marketplace-service returned error');
        throw new Error(`Marketplace notification failed: ${response.status} ${errorText}`);
      }

      const result = await response.json() as { transferId?: string };
      log.info({
        paymentIntentId: paymentIntent.id,
        transferId: result.transferId,
        correlationId,
      }, 'Marketplace-service notified successfully');
    } catch (error: any) {
      log.error({
        paymentIntentId: paymentIntent.id,
        error: error.message,
        correlationId,
      }, 'Failed to notify marketplace-service');
      // Don't throw - we don't want to fail the webhook processing
      // The marketplace can reconcile via polling if needed
    }
  }

  /**
   * ST-7: Get user-friendly decline message for a payment
   */
  async getDeclineMessage(paymentIntentId: string): Promise<string | null> {
    const result = await this.db.query(
      'SELECT decline_message FROM payment_transactions WHERE stripe_payment_intent_id = $1',
      [paymentIntentId]
    );
    return result.rows[0]?.decline_message || null;
  }
}

// Export helper function
export { getUserFriendlyDeclineMessage };

import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import { PaymentIntegration } from '../services/PaymentIntegration';
import logger from '../utils/logger';
import crypto from 'crypto';
import {
  webhookIdempotencyMiddleware,
  markWebhookProcessed
} from '../middleware/webhook-idempotency';

// =============================================================================
// TYPES
// =============================================================================

interface WebhookPaymentBody {
  id?: string;           // Event ID for idempotency
  orderId: string;
  tickets: Array<{
    id: string;
    eventName: string;
    venue: string;
    eventDate: string;
    tier: string;
    seatNumber: string;
    price: number;
  }>;
  eventId: string;
  userId: string;
  tenantId: string;      // Required for multi-tenancy
}

interface StripeWebhookBody {
  id: string;           // Stripe event ID
  type: string;
  data: {
    object: any;
  };
}

// =============================================================================
// RATE LIMIT CONFIGURATION
// =============================================================================

// Webhook rate limit - generous to handle bursts
const WEBHOOK_RATE_LIMIT = {
  config: {
    rateLimit: {
      max: 100,
      timeWindow: '1 minute'
    }
  }
};

// =============================================================================
// SIGNATURE VALIDATION
// =============================================================================

/**
 * Validate webhook signature using HMAC-SHA256
 * Similar to internal service auth but for webhooks
 */
function validateWebhookSignature(request: FastifyRequest): boolean {
  try {
    const signature = request.headers['x-webhook-signature'] as string | undefined;
    const timestamp = request.headers['x-webhook-timestamp'] as string | undefined;

    if (!signature || !timestamp) {
      logger.warn('Webhook missing signature or timestamp headers');
      return false;
    }

    // Get webhook secret from environment
    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) {
      logger.error('WEBHOOK_SECRET not configured');
      return false;
    }

    // Check timestamp is within 5 minutes (replay attack protection)
    const requestTime = parseInt(timestamp);
    const now = Date.now();
    if (Math.abs(now - requestTime) > 5 * 60 * 1000) {
      logger.warn('Webhook timestamp expired', {
        timeDiff: Math.abs(now - requestTime)
      });
      return false;
    }

    // Calculate expected signature (timestamp + body)
    const body = JSON.stringify(request.body);
    const payload = `${timestamp}:${body}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    logger.error('Webhook signature validation error', {
      error: (error as Error).message
    });
    return false;
  }
}

/**
 * Validate Stripe webhook signature
 */
function validateStripeSignature(request: FastifyRequest): boolean {
  try {
    const signature = request.headers['stripe-signature'] as string | undefined;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!signature || !webhookSecret) {
      logger.warn('Stripe webhook missing signature or secret');
      return false;
    }

    // Parse Stripe signature header
    const sigParts = signature.split(',').reduce((acc, part) => {
      const [key, value] = part.split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    const timestamp = sigParts['t'];
    const expectedSig = sigParts['v1'];

    if (!timestamp || !expectedSig) {
      logger.warn('Invalid Stripe signature format');
      return false;
    }

    // Check timestamp is within 5 minutes
    const timestampNum = parseInt(timestamp, 10);
    const tolerance = 300; // 5 minutes in seconds
    const now = Math.floor(Date.now() / 1000);
    
    if (now - timestampNum > tolerance) {
      logger.warn('Stripe webhook timestamp too old');
      return false;
    }

    // Calculate expected signature
    const body = JSON.stringify(request.body);
    const payload = `${timestamp}.${body}`;
    const computedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(expectedSig),
      Buffer.from(computedSig)
    );
  } catch (error) {
    logger.error('Stripe signature validation error', {
      error: (error as Error).message
    });
    return false;
  }
}

// =============================================================================
// ROUTES
// =============================================================================

export default async function webhookRoutes(
  fastify: FastifyInstance,
  options: any
): Promise<void> {

  // =========================================================================
  // Payment complete webhook (from payment service)
  // =========================================================================
  fastify.post<{ Body: WebhookPaymentBody }>(
    '/webhook/payment-complete',
    {
      ...WEBHOOK_RATE_LIMIT,
      preHandler: [webhookIdempotencyMiddleware]
    } as RouteShorthandOptions,
    async (request: FastifyRequest<{ Body: WebhookPaymentBody }>, reply: FastifyReply) => {
      const orderData = request.body;
      const eventId = (request as any).webhookEventId || orderData.id || `payment-${orderData.orderId}`;

      try {
        // Validate webhook signature
        const isValid = validateWebhookSignature(request);
        if (!isValid) {
          logger.warn('Invalid webhook signature', {
            orderId: orderData.orderId,
            ip: request.ip
          });
          return reply.code(401).send({
            success: false,
            error: 'Invalid webhook signature'
          });
        }

        logger.info(`📥 Received payment webhook for order ${orderData.orderId}`, {
          eventId,
          orderId: orderData.orderId,
          ticketCount: orderData.tickets?.length || 0,
          userId: orderData.userId
        });

        // Trigger minting
        const jobs = await PaymentIntegration.onPaymentComplete(orderData);

        // Mark webhook as processed AFTER successful processing
        await markWebhookProcessed(eventId, {
          type: 'payment-complete',
          timestamp: new Date().toISOString()
        });

        logger.info(`✅ Payment webhook processed successfully`, {
          eventId,
          orderId: orderData.orderId,
          jobsCreated: jobs.length
        });

        return reply.send({
          success: true,
          message: `Minting initiated for ${jobs.length} tickets`,
          jobIds: jobs.map(j => j.id),
          eventId
        });

      } catch (error) {
        // Don't mark as processed on failure - allow retry
        logger.error('Webhook processing failed:', {
          eventId,
          orderId: orderData.orderId,
          error: (error as Error).message
        });
        return reply.code(500).send({
          success: false,
          error: (error as Error).message
        });
      }
    }
  );

  // =========================================================================
  // Stripe webhook (for payment events)
  // =========================================================================
  fastify.post<{ Body: StripeWebhookBody }>(
    '/webhook/stripe',
    {
      ...WEBHOOK_RATE_LIMIT,
      preHandler: [webhookIdempotencyMiddleware]
    } as RouteShorthandOptions,
    async (request: FastifyRequest<{ Body: StripeWebhookBody }>, reply: FastifyReply) => {
      const event = request.body;
      const eventId = event.id;

      try {
        // Validate Stripe signature
        const isValid = validateStripeSignature(request);
        if (!isValid) {
          logger.warn('Invalid Stripe webhook signature', {
            eventId,
            eventType: event.type
          });
          return reply.code(401).send({
            success: false,
            error: 'Invalid signature'
          });
        }

        logger.info(`📥 Received Stripe webhook`, {
          eventId,
          eventType: event.type
        });

        // Handle specific Stripe events
        switch (event.type) {
          case 'payment_intent.succeeded':
            // Handle successful payment
            logger.info('Payment intent succeeded', {
              eventId,
              paymentIntentId: event.data.object.id
            });
            // Process payment and trigger minting if needed
            break;

          case 'payment_intent.payment_failed':
            // Handle failed payment
            logger.warn('Payment intent failed', {
              eventId,
              paymentIntentId: event.data.object.id,
              error: event.data.object.last_payment_error?.message
            });
            break;

          case 'checkout.session.completed':
            // Handle checkout completion
            logger.info('Checkout session completed', {
              eventId,
              sessionId: event.data.object.id
            });
            break;

          default:
            logger.debug('Unhandled Stripe event type', {
              eventId,
              eventType: event.type
            });
        }

        // Mark as processed after successful handling
        await markWebhookProcessed(eventId, {
          type: event.type,
          timestamp: new Date().toISOString()
        });

        return reply.send({
          success: true,
          received: true,
          eventId
        });

      } catch (error) {
        // Don't mark as processed on failure
        logger.error('Stripe webhook processing failed', {
          eventId,
          eventType: event.type,
          error: (error as Error).message
        });
        return reply.code(500).send({
          success: false,
          error: (error as Error).message
        });
      }
    }
  );

  // =========================================================================
  // Generic webhook health check
  // =========================================================================
  fastify.get('/webhook/health', async (request, reply) => {
    return reply.send({
      status: 'ok',
      message: 'Webhook endpoints are available'
    });
  });
}

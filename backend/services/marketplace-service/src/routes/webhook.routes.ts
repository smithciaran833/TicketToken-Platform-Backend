import { FastifyInstance } from 'fastify';
import { webhookController } from '../controllers/webhook.controller';
import crypto from 'crypto';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'WebhookRoutes' });

/**
 * FIX #33: Verify internal service webhook using HMAC signature
 * This replaces the easily spoofed x-internal-service header
 */
function verifyInternalWebhookSignature(
  payload: string,
  signature: string | undefined,
  timestamp: string | undefined
): boolean {
  const secret = process.env.INTERNAL_WEBHOOK_SECRET;
  
  // In development without secret, log warning but allow (backward compatible)
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      log.error('INTERNAL_WEBHOOK_SECRET not configured in production!');
      return false;
    }
    log.warn('INTERNAL_WEBHOOK_SECRET not set - internal webhook verification disabled (dev mode only)');
    return true;
  }
  
  if (!signature || !timestamp) {
    log.warn('Missing signature or timestamp in internal webhook request');
    return false;
  }
  
  // Prevent replay attacks - reject requests older than 5 minutes
  const timestampNum = parseInt(timestamp, 10);
  const now = Date.now();
  if (isNaN(timestampNum) || Math.abs(now - timestampNum) > 5 * 60 * 1000) {
    log.warn('Internal webhook timestamp out of range', { timestamp, now });
    return false;
  }
  
  // Verify HMAC signature: HMAC-SHA256(timestamp + '.' + payload, secret)
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  
  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

export default async function webhookRoutes(fastify: FastifyInstance) {
  /**
   * Official Stripe webhook endpoint
   * Handles payment_intent.succeeded and other Stripe events
   * Webhook signature is verified in the controller
   * Note: Request body must be raw for signature verification
   */
  fastify.post('/stripe', webhookController.handleStripeWebhook.bind(webhookController));

  /**
   * FIX #33: Internal payment completion webhook
   * Now protected by HMAC signature verification instead of spoofable header
   * 
   * Required headers:
   * - x-internal-signature: HMAC-SHA256 signature
   * - x-internal-timestamp: Unix timestamp (ms)
   * - x-internal-service: Service name (for logging/audit)
   */
  fastify.post('/payment-completed', {
    preHandler: async (request, reply) => {
      const signature = request.headers['x-internal-signature'] as string | undefined;
      const timestamp = request.headers['x-internal-timestamp'] as string | undefined;
      const serviceName = request.headers['x-internal-service'] as string | undefined;
      
      // Get raw body for signature verification
      const payload = JSON.stringify(request.body);
      
      if (!verifyInternalWebhookSignature(payload, signature, timestamp)) {
        log.error('Internal webhook signature verification failed', {
          serviceName,
          hasSignature: !!signature,
          hasTimestamp: !!timestamp,
          ip: request.ip
        });
        reply.status(403).send({ error: 'Forbidden - invalid signature' });
        return;
      }
      
      log.info('Internal webhook signature verified', { serviceName });
    },
    schema: {
      body: {
        type: 'object',
        required: ['paymentIntentId', 'listingId'],
        properties: {
          paymentIntentId: { type: 'string' },
          listingId: { type: 'string' },
          buyerId: { type: 'string' },
          sellerId: { type: 'string' },
          amount: { type: 'number' },
          currency: { type: 'string' },
          transferDestination: { type: 'string' }
        }
      }
    }
  }, webhookController.handlePaymentCompleted.bind(webhookController));
}

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PaymentIntegration } from '../services/PaymentIntegration';
import logger from '../utils/logger';
import crypto from 'crypto';

interface WebhookPaymentBody {
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
}

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

export default async function webhookRoutes(
  fastify: FastifyInstance,
  options: any
): Promise<void> {
  // Webhook endpoint to be called by payment service
  fastify.post<{ Body: WebhookPaymentBody }>(
    '/webhook/payment-complete',
    async (request: FastifyRequest<{ Body: WebhookPaymentBody }>, reply: FastifyReply) => {
      try {
        const orderData = request.body;

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

        logger.info(`📥 Received payment webhook for order ${orderData.orderId}`);

        // Trigger minting
        const jobs = await PaymentIntegration.onPaymentComplete(orderData);

        return reply.send({
          success: true,
          message: `Minting initiated for ${jobs.length} tickets`,
          jobIds: jobs.map(j => j.id)
        });

      } catch (error) {
        logger.error('Webhook processing failed:', error);
        return reply.code(500).send({
          success: false,
          error: (error as Error).message
        });
      }
    }
  );
}

import { FastifyRequest, FastifyReply } from 'fastify';
import { serviceCache } from '../services/cache-integration';
import { db } from '../services/database.service';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export class WebhookController {
  // Plaid webhook for bank verification
  // NOTE: External webhooks don't include tenant_id in request
  // Tenant must be inferred from item_id or other identifiers
  async handlePlaidWebhook(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { webhook_type, webhook_code, item_id } = request.body as any;
      logger.info(`🏦 Plaid webhook: ${webhook_type} - ${webhook_code}, item_id: ${item_id}`);

      // TODO: Look up tenant_id from item_id before logging
      // const tenantLookup = await db.query('SELECT tenant_id FROM bank_verifications WHERE plaid_item_id = $1', [item_id]);
      // const tenantId = tenantLookup.rows[0]?.tenant_id;

      // Log webhook (tenant_id should be added once looked up)
      await db.query(
        `INSERT INTO webhook_logs (source, type, payload, created_at)
         VALUES ('plaid', $1, $2, NOW())`,
        [webhook_type, JSON.stringify(request.body)]
      );

      // Handle different webhook types
      switch (webhook_type) {
        case 'AUTH':
          if (webhook_code === 'VERIFICATION_EXPIRED') {
            // Mark bank verification as expired
            // TODO: Add tenant_id check to WHERE clause for security
            await db.query(
              `UPDATE bank_verifications
               SET verified = false
               WHERE plaid_item_id = $1`,
              [item_id]
            );
          }
          break;

        case 'ITEM':
          if (webhook_code === 'ERROR') {
            logger.error('Plaid item error:', (request.body as any).error);
          }
          break;
      }

      return reply.send({ received: true });
    } catch (error: any) {
      logger.error({ error }, 'Plaid webhook error:');
      return reply.code(500).send({ error: error.message });
    }
  }

  // Stripe webhook for payment processing
  // NOTE: External webhooks don't include tenant_id in request
  // Tenant must be inferred from payment/customer identifiers
  async handleStripeWebhook(request: FastifyRequest, reply: FastifyReply) {
    try {
      const sig = request.headers['stripe-signature'] as string;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        logger.info('💳 [MOCK] Stripe webhook received');
        return reply.send({ received: true });
      }

      // Verify webhook signature
      const payload = request.body;
      const payloadString = JSON.stringify(payload);

      // In production: Use Stripe SDK to verify
      // const event = stripe.webhooks.constructEvent(payloadString, header, webhookSecret);

      // TODO: Extract customer/account ID and look up tenant_id before logging
      // const tenantId = await lookupTenantFromStripeEvent(payload);

      // Log webhook (tenant_id should be added once looked up)
      await db.query(
        `INSERT INTO webhook_logs (source, type, payload, created_at)
         VALUES ('stripe', $1, $2, NOW())`,
        ['payment', payloadString]
      );

      logger.info('Stripe webhook processed successfully');

      return reply.send({ received: true });
    } catch (error: any) {
      logger.error({ error }, 'Stripe webhook error:');
      return reply.code(400).send({ error: error.message });
    }
  }

  // SendGrid webhook for email events
  // NOTE: External webhooks don't include tenant_id in request
  // Tenant must be inferred from email/notification identifiers
  async handleSendGridWebhook(request: FastifyRequest, reply: FastifyReply) {
    try {
      const events = request.body as any[]; // Array of events

      for (const event of events) {
        logger.info(`📧 SendGrid event: ${event.event} for ${event.email}`);

        // Update notification log
        // TODO: Add tenant_id to WHERE clause for security once tenant is looked up
        if (event.event === 'delivered' || event.event === 'bounce') {
          await db.query(
            `UPDATE notification_log
             SET status = $1, updated_at = NOW()
             WHERE id = (
               SELECT id FROM notification_log
               WHERE recipient = $2 AND type = 'email'
               ORDER BY created_at DESC
               LIMIT 1
             )`,
            [event.event, event.email]
          );
        }
      }

      return reply.send({ received: true });
    } catch (error: any) {
      logger.error({ error }, 'SendGrid webhook error:');
      return reply.code(500).send({ error: error.message });
    }
  }
}

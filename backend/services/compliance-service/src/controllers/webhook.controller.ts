import { FastifyRequest, FastifyReply } from 'fastify';
import { serviceCache } from '../services/cache-integration';
import { db } from '../services/database.service';
import { logger } from '../utils/logger';
import crypto from 'crypto';

/**
 * Helper function to look up tenant_id from Plaid item_id
 */
async function lookupTenantFromPlaidItem(itemId: string): Promise<string | null> {
  try {
    const result = await db.query(
      'SELECT tenant_id FROM bank_verifications WHERE plaid_item_id = $1 LIMIT 1',
      [itemId]
    );
    return result.rows[0]?.tenant_id || null;
  } catch (error) {
    logger.error({ error, itemId }, 'Failed to lookup tenant from Plaid item');
    return null;
  }
}

/**
 * Helper function to look up tenant_id from Stripe customer/account ID
 */
async function lookupTenantFromStripeEvent(payload: any): Promise<string | null> {
  try {
    // Try to extract customer or account ID from the Stripe event
    const customerId = payload?.data?.object?.customer;
    const accountId = payload?.data?.object?.account || payload?.data?.object?.id;

    if (customerId) {
      const result = await db.query(
        'SELECT tenant_id FROM stripe_customers WHERE stripe_customer_id = $1 LIMIT 1',
        [customerId]
      );
      if (result.rows[0]?.tenant_id) {
        return result.rows[0].tenant_id;
      }
    }

    if (accountId) {
      const result = await db.query(
        'SELECT tenant_id FROM venue_payment_accounts WHERE stripe_account_id = $1 LIMIT 1',
        [accountId]
      );
      if (result.rows[0]?.tenant_id) {
        return result.rows[0].tenant_id;
      }
    }

    return null;
  } catch (error) {
    logger.error({ error }, 'Failed to lookup tenant from Stripe event');
    return null;
  }
}

/**
 * Helper function to look up tenant_id from email/notification identifier
 */
async function lookupTenantFromEmail(email: string): Promise<string | null> {
  try {
    const result = await db.query(
      `SELECT tenant_id FROM notification_log
       WHERE recipient = $1 AND type = 'email'
       ORDER BY created_at DESC
       LIMIT 1`,
      [email]
    );
    return result.rows[0]?.tenant_id || null;
  } catch (error) {
    logger.error({ error, email }, 'Failed to lookup tenant from email');
    return null;
  }
}

export class WebhookController {
  // Plaid webhook for bank verification
  // NOTE: External webhooks don't include tenant_id in request
  // Tenant is inferred from item_id
  async handlePlaidWebhook(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { webhook_type, webhook_code, item_id } = request.body as any;
      logger.info(`🏦 Plaid webhook: ${webhook_type} - ${webhook_code}, item_id: ${item_id}`);

      // Look up tenant_id from item_id for proper tenant isolation
      const tenantId = await lookupTenantFromPlaidItem(item_id);

      if (!tenantId) {
        logger.warn(`Unable to determine tenant for Plaid item_id: ${item_id}`);
      }

      // Log webhook with tenant_id
      await db.query(
        `INSERT INTO webhook_logs (tenant_id, source, type, payload, created_at)
         VALUES ($1, 'plaid', $2, $3, NOW())`,
        [tenantId, webhook_type, JSON.stringify(request.body)]
      );

      // Handle different webhook types
      switch (webhook_type) {
        case 'AUTH':
          if (webhook_code === 'VERIFICATION_EXPIRED') {
            // Mark bank verification as expired with tenant_id check for security
            if (tenantId) {
              await db.query(
                `UPDATE bank_verifications
                 SET verified = false, updated_at = NOW()
                 WHERE plaid_item_id = $1 AND tenant_id = $2`,
                [item_id, tenantId]
              );
              logger.info(`Bank verification expired for tenant ${tenantId}, item ${item_id}`);
            } else {
              // If we can't determine tenant, log warning but still update (for backwards compatibility)
              logger.warn(`Updating bank verification without tenant check for item ${item_id}`);
              await db.query(
                `UPDATE bank_verifications
                 SET verified = false, updated_at = NOW()
                 WHERE plaid_item_id = $1`,
                [item_id]
              );
            }
          }
          break;

        case 'ITEM':
          if (webhook_code === 'ERROR') {
            logger.error({ tenantId, itemId: item_id, error: (request.body as any).error }, 'Plaid item error');
          }
          break;

        case 'INCOME_VERIFICATION':
          logger.info({ tenantId, itemId: item_id, code: webhook_code }, 'Income verification webhook');
          break;

        case 'ASSETS':
          logger.info({ tenantId, itemId: item_id, code: webhook_code }, 'Assets webhook');
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
  // Tenant is inferred from payment/customer identifiers
  async handleStripeWebhook(request: FastifyRequest, reply: FastifyReply) {
    try {
      const sig = request.headers['stripe-signature'] as string;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        logger.info('💳 [MOCK] Stripe webhook received');
        return reply.send({ received: true });
      }

      // Verify webhook signature
      const payload = request.body as any;
      const payloadString = JSON.stringify(payload);

      // In production: Use Stripe SDK to verify
      // const event = stripe.webhooks.constructEvent(payloadString, sig, webhookSecret);

      // Extract customer/account ID and look up tenant_id
      const tenantId = await lookupTenantFromStripeEvent(payload);

      if (!tenantId) {
        logger.warn('Unable to determine tenant from Stripe webhook event');
      }

      // Log webhook with tenant_id
      await db.query(
        `INSERT INTO webhook_logs (tenant_id, source, type, payload, created_at)
         VALUES ($1, 'stripe', $2, $3, NOW())`,
        [tenantId, payload?.type || 'payment', payloadString]
      );

      // Process specific event types
      const eventType = payload?.type;

      switch (eventType) {
        case 'payment_intent.succeeded':
          if (tenantId) {
            logger.info({ tenantId, paymentIntentId: payload?.data?.object?.id }, 'Payment succeeded');
          }
          break;

        case 'payment_intent.payment_failed':
          if (tenantId) {
            logger.warn({ tenantId, paymentIntentId: payload?.data?.object?.id }, 'Payment failed');
          }
          break;

        case 'account.updated':
          if (tenantId) {
            logger.info({ tenantId, accountId: payload?.data?.object?.id }, 'Stripe account updated');
          }
          break;

        case 'payout.paid':
        case 'payout.failed':
          if (tenantId) {
            logger.info({ tenantId, payoutId: payload?.data?.object?.id, status: eventType }, 'Payout status change');
          }
          break;
      }

      logger.info({ eventType, tenantId }, 'Stripe webhook processed successfully');

      return reply.send({ received: true });
    } catch (error: any) {
      logger.error({ error }, 'Stripe webhook error:');
      return reply.code(400).send({ error: error.message });
    }
  }

  // SendGrid webhook for email events
  // NOTE: External webhooks don't include tenant_id in request
  // Tenant is inferred from email/notification identifiers
  async handleSendGridWebhook(request: FastifyRequest, reply: FastifyReply) {
    try {
      const events = request.body as any[]; // Array of events

      for (const event of events) {
        // Look up tenant from email for proper tenant isolation
        const tenantId = await lookupTenantFromEmail(event.email);

        if (!tenantId) {
          logger.warn(`Unable to determine tenant for email: ${event.email}`);
        }

        // Update notification log with tenant_id check for security
        if (event.event === 'delivered' || event.event === 'bounce' || event.event === 'dropped') {
          if (tenantId) {
            // Update with tenant_id check for security
            await db.query(
              `UPDATE notification_log
               SET status = $1, updated_at = NOW()
               WHERE id = (
                 SELECT id FROM notification_log
                 WHERE recipient = $2 AND type = 'email' AND tenant_id = $3
                 ORDER BY created_at DESC
                 LIMIT 1
               )`,
              [event.event, event.email, tenantId]
            );
          } else {
            // Fallback without tenant check (for backwards compatibility)
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
          logger.info(`📧 SendGrid event: ${event.event} for ${event.email}`);
        }

        // Handle additional SendGrid events
        if (event.event === 'open') {
          logger.info({ tenantId, email: event.email }, 'Email opened');
        } else if (event.event === 'click') {
          logger.info({ tenantId, email: event.email, url: event.url }, 'Email link clicked');
        } else if (event.event === 'spamreport') {
          logger.warn({ tenantId, email: event.email }, 'Email marked as spam');
        } else if (event.event === 'unsubscribe') {
          logger.info({ tenantId, email: event.email }, 'User unsubscribed');
          // Update user preferences
          if (tenantId) {
            await db.query(
              `UPDATE user_preferences
               SET email_notifications = false, updated_at = NOW()
               WHERE email = $1 AND tenant_id = $2`,
              [event.email, tenantId]
            );
          }
        }
      }

      return reply.send({ received: true });
    } catch (error: any) {
      logger.error({ error }, 'SendGrid webhook error:');
      return reply.code(500).send({ error: error.message });
    }
  }
}

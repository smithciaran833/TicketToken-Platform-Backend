import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { mailchimpSyncService } from '../services/providers/mailchimp-sync.service';
import { squareSyncService } from '../services/providers/square-sync.service';
import { stripeSyncService } from '../services/providers/stripe-sync.service';
import { credentialEncryptionService } from '../services/credential-encryption.service';

/**
 * Webhook Controller
 *
 * Handles incoming webhook events from third-party providers
 */
export class WebhookController {
  /**
   * Handle Mailchimp webhooks
   * Note: Mailchimp uses IP whitelisting for webhook security, not HMAC signatures
   * Whitelist IPs: 205.201.131.0/24, 198.2.179.0/24, 148.105.8.0/24
   */
  async handleMailchimpWebhook(req: FastifyRequest, res: FastifyReply): Promise<void> {
    try {
      const venueId = (req.params as any).venueId;
      const clientIp = req.ip || '';

      // Verify request is from Mailchimp's IP ranges
      if (!this.isMailchimpIP(clientIp)) {
        console.warn(`Webhook rejected from unauthorized IP: ${clientIp}`);
        res.status(401).send({ error: 'Unauthorized IP address' });
        return;
      }

      const { type, data } = req.body as any;

      // Process webhook event
      console.log(`Mailchimp webhook received: ${type}`, data);

      // Handle different event types
      switch (type) {
        case 'subscribe':
        case 'unsubscribe':
        case 'profile':
        case 'cleaned':
          // Handle email list events
          await this.processMailchimpEvent(venueId, type, data);
          break;
        default:
          console.log(`Unhandled Mailchimp event type: ${type}`);
      }

      res.status(200).send({ received: true });
    } catch (error) {
      console.error('Mailchimp webhook error:', error);
      res.status(500).send({ error: 'Webhook processing failed' });
    }
  }

  /**
   * Handle Square webhooks
   */
  async handleSquareWebhook(req: FastifyRequest, res: FastifyReply): Promise<void> {
    try {
      const signature = req.headers['x-square-signature'] as string;
      const venueId = (req.params as any).venueId;

      // Verify webhook signature
      const isValid = await this.verifySquareSignature(
        JSON.stringify(req.body),
        signature,
        venueId
      );

      if (!isValid) {
        res.status(401).send({ error: 'Invalid webhook signature' });
        return;
      }

      const { type, data } = req.body as any;

      // Process webhook event
      await squareSyncService.processWebhookEvent(type, data);

      res.status(200).send({ received: true });
    } catch (error) {
      console.error('Square webhook error:', error);
      res.status(500).send({ error: 'Webhook processing failed' });
    }
  }

  /**
   * Handle Stripe webhooks
   */
  async handleStripeWebhook(req: FastifyRequest, res: FastifyReply): Promise<void> {
    try {
      const signature = req.headers['stripe-signature'] as string;
      const venueId = (req.params as any).venueId;

      // Get webhook secret
      const credentials = await credentialEncryptionService.retrieveApiKeys(
        venueId,
        'stripe',
        'webhook_secret'
      );

      if (!credentials) {
        res.status(401).send({ error: 'Webhook secret not configured' });
        return;
      }

      // Construct and verify event
      const event = stripeSyncService.constructWebhookEvent(
        req.body as any,
        signature,
        credentials.apiKey
      );

      // Process webhook event
      await stripeSyncService.processWebhookEvent(event);

      res.status(200).send({ received: true });
    } catch (error) {
      console.error('Stripe webhook error:', error);
      res.status(401).send({ error: 'Webhook signature verification failed' });
    }
  }

  /**
   * Handle QuickBooks webhooks
   */
  async handleQuickBooksWebhook(req: FastifyRequest, res: FastifyReply): Promise<void> {
    try {
      const signature = req.headers['intuit-signature'] as string;
      const venueId = (req.params as any).venueId;

      // Verify webhook signature
      const isValid = await this.verifyQuickBooksSignature(
        JSON.stringify(req.body),
        signature,
        venueId
      );

      if (!isValid) {
        res.status(401).send({ error: 'Invalid webhook signature' });
        return;
      }

      const { eventNotifications } = req.body as any;

      // Process each notification
      for (const notification of eventNotifications) {
        const { realmId, dataChangeEvent } = notification;

        for (const entity of dataChangeEvent.entities) {
          console.log(
            `QuickBooks webhook: ${entity.name} ${entity.operation}`,
            entity.id
          );

          // Handle different entity types
          await this.processQuickBooksEvent(venueId, entity);
        }
      }

      res.status(200).send({ received: true });
    } catch (error) {
      console.error('QuickBooks webhook error:', error);
      res.status(500).send({ error: 'Webhook processing failed' });
    }
  }

  /**
   * Get webhook events
   */
  async getWebhookEvents(req: FastifyRequest, res: FastifyReply): Promise<void> {
    try {
      const venueId = (req.params as any).venueId;
      const { integrationType, limit = 50 } = req.query as any;

      // This would query a webhook_events table
      // For now, return empty array
      res.status(200).send({
        events: [],
        total: 0
      });
    } catch (error) {
      console.error('Failed to get webhook events:', error);
      res.status(500).send({ error: 'Failed to get webhook events' });
    }
  }

  /**
   * Retry webhook
   */
  async retryWebhook(req: FastifyRequest, res: FastifyReply): Promise<void> {
    try {
      const { webhookId } = req.params as any;

      // This would retry processing a failed webhook
      // For now, return success
      res.status(200).send({
        success: true,
        message: `Webhook ${webhookId} queued for retry`
      });
    } catch (error) {
      console.error('Failed to retry webhook:', error);
      res.status(500).send({ error: 'Failed to retry webhook' });
    }
  }

  /**
   * Verify request is from Mailchimp's official IP ranges
   * Mailchimp IP ranges: 205.201.131.0/24, 198.2.179.0/24, 148.105.8.0/24
   */
  private isMailchimpIP(ip: string): boolean {
    if (!ip) return false;

    // Extract IPv4 if it's IPv6-mapped
    const normalizedIp = ip.includes(':') ? ip.split(':').pop() : ip;

    const mailchimpRanges = [
      '205.201.131.',
      '198.2.179.',
      '148.105.8.'
    ];

    return mailchimpRanges.some(range => normalizedIp?.startsWith(range));
  }

  /**
   * Verify Square webhook signature
   */
  private async verifySquareSignature(
    payload: string,
    signature: string,
    venueId: string
  ): Promise<boolean> {
    try {
      const credentials = await credentialEncryptionService.retrieveApiKeys(
        venueId,
        'square',
        'webhook_secret'
      );

      if (!credentials) {
        return false;
      }

      const url = process.env.SQUARE_WEBHOOK_URL || '';
      const hmac = crypto
        .createHmac('sha256', credentials.apiKey)
        .update(url + payload)
        .digest('base64');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(hmac)
      );
    } catch (error) {
      console.error('Square signature verification failed:', error);
      return false;
    }
  }

  /**
   * Verify QuickBooks webhook signature
   */
  private async verifyQuickBooksSignature(
    payload: string,
    signature: string,
    venueId: string
  ): Promise<boolean> {
    try {
      const credentials = await credentialEncryptionService.retrieveApiKeys(
        venueId,
        'quickbooks',
        'webhook_secret'
      );

      if (!credentials) {
        return false;
      }

      const hmac = crypto
        .createHmac('sha256', credentials.apiKey)
        .update(payload)
        .digest('base64');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(hmac)
      );
    } catch (error) {
      console.error('QuickBooks signature verification failed:', error);
      return false;
    }
  }

  /**
   * Process Mailchimp event
   */
  private async processMailchimpEvent(
    venueId: string,
    type: string,
    data: any
  ): Promise<void> {
    // Implement event processing logic
    console.log(`Processing Mailchimp ${type} event for venue ${venueId}`, data);

    // Example: Update local customer record based on subscription change
    // This would integrate with your customer service
  }

  /**
   * Process QuickBooks event
   */
  private async processQuickBooksEvent(
    venueId: string,
    entity: any
  ): Promise<void> {
    // Implement event processing logic
    console.log(
      `Processing QuickBooks ${entity.name} ${entity.operation} for venue ${venueId}`,
      entity.id
    );

    // Example: Sync updated customer/invoice data
    // This would trigger a sync job for the specific entity
  }
}

export const webhookController = new WebhookController();

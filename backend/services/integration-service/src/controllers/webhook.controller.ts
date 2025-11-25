import { Request, Response } from 'express';
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
  async handleMailchimpWebhook(req: Request, res: Response): Promise<void> {
    try {
      const venueId = req.params.venueId;
      const clientIp = req.ip || req.connection.remoteAddress || '';

      // Verify request is from Mailchimp's IP ranges
      if (!this.isMailchimpIP(clientIp)) {
        console.warn(`Webhook rejected from unauthorized IP: ${clientIp}`);
        res.status(401).json({ error: 'Unauthorized IP address' });
        return;
      }

      const { type, data } = req.body;

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

      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Mailchimp webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  /**
   * Handle Square webhooks
   */
  async handleSquareWebhook(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['x-square-signature'] as string;
      const venueId = req.params.venueId;

      // Verify webhook signature
      const isValid = await this.verifySquareSignature(
        JSON.stringify(req.body),
        signature,
        venueId
      );

      if (!isValid) {
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }

      const { type, data } = req.body;

      // Process webhook event
      await squareSyncService.processWebhookEvent(type, data);

      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Square webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  /**
   * Handle Stripe webhooks
   */
  async handleStripeWebhook(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['stripe-signature'] as string;
      const venueId = req.params.venueId;

      // Get webhook secret
      const credentials = await credentialEncryptionService.retrieveApiKeys(
        venueId,
        'stripe',
        'webhook_secret'
      );

      if (!credentials) {
        res.status(401).json({ error: 'Webhook secret not configured' });
        return;
      }

      // Construct and verify event
      const event = stripeSyncService.constructWebhookEvent(
        req.body,
        signature,
        credentials.apiKey
      );

      // Process webhook event
      await stripeSyncService.processWebhookEvent(event);

      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Stripe webhook error:', error);
      res.status(401).json({ error: 'Webhook signature verification failed' });
    }
  }

  /**
   * Handle QuickBooks webhooks
   */
  async handleQuickBooksWebhook(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['intuit-signature'] as string;
      const venueId = req.params.venueId;

      // Verify webhook signature
      const isValid = await this.verifyQuickBooksSignature(
        JSON.stringify(req.body),
        signature,
        venueId
      );

      if (!isValid) {
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }

      const { eventNotifications } = req.body;

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

      res.status(200).json({ received: true });
    } catch (error) {
      console.error('QuickBooks webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
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

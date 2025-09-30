import { Request, Response } from 'express';
import { db } from '../config/database';
import { logger } from '../config/logger';
import * as crypto from 'crypto';

export class WebhookController {
  // Webhook secrets for external providers
  private readonly SENDGRID_WEBHOOK_KEY = process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY || '';
  private readonly TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
  
  async handleSendGridWebhook(req: Request, res: Response): Promise<void> {
    try {
      // Verify SendGrid webhook signature
      if (!this.verifySendGridSignature(req)) {
        logger.warn('Invalid SendGrid webhook signature', {
          ip: req.ip,
          userAgent: req.headers['user-agent']
        });
        res.status(401).send('Unauthorized');
        return;
      }

      const events = req.body;
      for (const event of events) {
        if (event.sg_message_id) {
          await this.updateNotificationStatus(
            event.sg_message_id,
            this.mapSendGridStatus(event.event),
            event
          );
        }
      }
      res.status(200).send('OK');
    } catch (error) {
      logger.error('SendGrid webhook error', error);
      res.status(500).send('Error processing webhook');
    }
  }
  
  async handleTwilioWebhook(req: Request, res: Response): Promise<void> {
    try {
      // Verify Twilio webhook signature
      if (!this.verifyTwilioSignature(req)) {
        logger.warn('Invalid Twilio webhook signature', {
          ip: req.ip,
          userAgent: req.headers['user-agent']
        });
        res.status(401).send('Unauthorized');
        return;
      }

      const { MessageSid, MessageStatus, ErrorCode } = req.body;
      await this.updateNotificationStatus(
        MessageSid,
        this.mapTwilioStatus(MessageStatus),
        { errorCode: ErrorCode }
      );
      res.status(200).send('OK');
    } catch (error) {
      logger.error('Twilio webhook error', error);
      res.status(500).send('Error processing webhook');
    }
  }

  private verifySendGridSignature(req: Request): boolean {
    // SendGrid Event Webhook uses the Event Webhook Signing Key
    const signature = req.headers['x-twilio-email-event-webhook-signature'] as string;
    const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'] as string;
    
    if (!signature || !timestamp || !this.SENDGRID_WEBHOOK_KEY) {
      logger.warn('Missing SendGrid webhook verification components', {
        hasSignature: !!signature,
        hasTimestamp: !!timestamp,
        hasKey: !!this.SENDGRID_WEBHOOK_KEY
      });
      return false;
    }

    // Check timestamp is recent (within 5 minutes)
    const currentTime = Math.floor(Date.now() / 1000);
    const webhookTime = parseInt(timestamp);
    if (Math.abs(currentTime - webhookTime) > 300) {
      logger.warn('SendGrid webhook timestamp too old', {
        webhookTime,
        currentTime,
        diff: Math.abs(currentTime - webhookTime)
      });
      return false;
    }

    // Compute signature using SendGrid's method
    const payload = timestamp + JSON.stringify(req.body) + this.SENDGRID_WEBHOOK_KEY;
    const expectedSignature = crypto
      .createHmac('sha256', this.SENDGRID_WEBHOOK_KEY)
      .update(payload)
      .digest('base64');

    // Compare signatures using timing-safe comparison
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (err) {
      logger.error('Signature comparison error', err);
      return false;
    }
  }

  private verifyTwilioSignature(req: Request): boolean {
    const twilioSignature = req.headers['x-twilio-signature'] as string;
    
    if (!twilioSignature || !this.TWILIO_AUTH_TOKEN) {
      logger.warn('Missing Twilio webhook verification components', {
        hasSignature: !!twilioSignature,
        hasToken: !!this.TWILIO_AUTH_TOKEN
      });
      return false;
    }

    // Build the full URL (Twilio requires the exact URL)
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const fullUrl = `${protocol}://${req.get('host')}${req.originalUrl}`;
    
    // Sort the POST parameters alphabetically and concatenate
    const params = Object.keys(req.body)
      .sort()
      .reduce((acc, key) => {
        return acc + key + req.body[key];
      }, '');

    // Create the signature string
    const signatureString = fullUrl + params;
    
    // Compute expected signature
    const expectedSignature = crypto
      .createHmac('sha1', this.TWILIO_AUTH_TOKEN)
      .update(signatureString)
      .digest('base64');

    // Compare signatures using timing-safe comparison
    try {
      return crypto.timingSafeEqual(
        Buffer.from(twilioSignature),
        Buffer.from(expectedSignature)
      );
    } catch (err) {
      logger.error('Signature comparison error', err);
      return false;
    }
  }

  // Generic webhook handler for other providers with HMAC verification
  async handleGenericWebhook(req: Request, res: Response): Promise<void> {
    try {
      const provider = req.params.provider;
      const signature = req.headers['x-webhook-signature'] as string;
      const timestamp = req.headers['x-webhook-timestamp'] as string;
      
      // Get provider-specific secret
      const webhookSecret = process.env[`${provider.toUpperCase()}_WEBHOOK_SECRET`];
      
      if (!webhookSecret) {
        logger.error(`No webhook secret configured for provider: ${provider}`);
        res.status(500).send('Provider not configured');
        return;
      }

      // Verify signature
      if (!this.verifyGenericSignature(req, webhookSecret)) {
        logger.warn(`Invalid webhook signature for provider: ${provider}`, {
          ip: req.ip,
          userAgent: req.headers['user-agent']
        });
        res.status(401).send('Unauthorized');
        return;
      }

      // Process webhook based on provider
      await this.processGenericWebhook(provider, req.body);
      res.status(200).send('OK');
    } catch (error) {
      logger.error('Generic webhook error', error);
      res.status(500).send('Error processing webhook');
    }
  }

  private verifyGenericSignature(req: Request, secret: string): boolean {
    const signature = req.headers['x-webhook-signature'] as string;
    const timestamp = req.headers['x-webhook-timestamp'] as string;
    
    if (!signature || !timestamp) {
      return false;
    }

    // Check timestamp is recent (within 5 minutes)
    const currentTime = Date.now();
    const webhookTime = parseInt(timestamp);
    if (Math.abs(currentTime - webhookTime) > 300000) {
      logger.warn('Webhook timestamp too old', {
        webhookTime,
        currentTime,
        diff: Math.abs(currentTime - webhookTime)
      });
      return false;
    }

    // Compute expected signature
    const payload = `${timestamp}.${JSON.stringify(req.body)}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Compare signatures using timing-safe comparison
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (err) {
      return false;
    }
  }

  private async processGenericWebhook(provider: string, data: any): Promise<void> {
    // Process based on provider type
    logger.info(`Processing webhook for provider: ${provider}`, { 
      provider,
      dataKeys: Object.keys(data)
    });
    
    // Store webhook data for processing
    await db('webhook_events').insert({
      provider,
      payload: JSON.stringify(data),
      received_at: new Date(),
      processed: false
    });
  }
  
  private async updateNotificationStatus(
    providerMessageId: string,
    status: string,
    additionalData?: any
  ) {
    await db('notification_tracking')
      .where('provider_message_id', providerMessageId)
      .update({
        status,
        updated_at: new Date(),
        ...(status === 'delivered' && { delivered_at: new Date() }),
        ...(additionalData?.errorCode && { failure_reason: additionalData.errorCode }),
      });
  }
  
  private mapSendGridStatus(event: string): string {
    switch (event) {
      case 'delivered': return 'delivered';
      case 'bounce': return 'bounced';
      case 'dropped': return 'failed';
      case 'deferred': return 'queued';
      default: return 'sent';
    }
  }
  
  private mapTwilioStatus(status: string): string {
    switch (status) {
      case 'delivered': return 'delivered';
      case 'failed': return 'failed';
      case 'undelivered': return 'bounced';
      default: return 'sent';
    }
  }
}

export const webhookController = new WebhookController();

import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { metricsService } from '../services/metrics.service';
import * as crypto from 'crypto';

export class WebhookController {
  // Webhook secrets for external providers
  private readonly SENDGRID_WEBHOOK_KEY = process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY || '';
  private readonly TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';

  async handleSendGridWebhook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      // Verify SendGrid webhook signature
      if (!this.verifySendGridSignature(request)) {
        logger.warn('Invalid SendGrid webhook signature', {
          ip: request.ip,
          userAgent: request.headers['user-agent']
        });
        reply.status(401).send('Unauthorized');
        return;
      }

      const events = request.body as any[];
      for (const event of events) {
        // Track webhook metrics
        metricsService.trackWebhookReceived('sendgrid', event.event || 'unknown');
        
        if (event.sg_message_id) {
          await this.updateNotificationStatus(
            event.sg_message_id,
            this.mapSendGridStatus(event.event),
            event
          );
          
          // Track delivery metrics
          const status = this.mapSendGridStatus(event.event);
          if (status === 'delivered' || status === 'failed' || status === 'bounced') {
            metricsService.trackNotificationDelivery('email', status, 'sendgrid');
          }
        }
      }
      reply.status(200).send('OK');
    } catch (error) {
      logger.error('SendGrid webhook error', error);
      reply.status(500).send('Error processing webhook');
    }
  }

  async handleTwilioWebhook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      // Verify Twilio webhook signature
      if (!this.verifyTwilioSignature(request)) {
        logger.warn('Invalid Twilio webhook signature', {
          ip: request.ip,
          userAgent: request.headers['user-agent']
        });
        reply.status(401).send('Unauthorized');
        return;
      }

      const body = request.body as { MessageSid: string; MessageStatus: string; ErrorCode?: string };
      const { MessageSid, MessageStatus, ErrorCode } = body;
      
      // Track webhook metrics
      metricsService.trackWebhookReceived('twilio', MessageStatus || 'unknown');
      
      await this.updateNotificationStatus(
        MessageSid,
        this.mapTwilioStatus(MessageStatus),
        { errorCode: ErrorCode }
      );
      
      // Track delivery metrics
      const status = this.mapTwilioStatus(MessageStatus);
      if (status === 'delivered' || status === 'failed' || status === 'bounced') {
        metricsService.trackNotificationDelivery('sms', status, 'twilio');
      }
      
      reply.status(200).send('OK');
    } catch (error) {
      logger.error('Twilio webhook error', error);
      reply.status(500).send('Error processing webhook');
    }
  }

  private verifySendGridSignature(request: FastifyRequest): boolean {
    // SendGrid Event Webhook uses the Event Webhook Signing Key
    const signature = request.headers['x-twilio-email-event-webhook-signature'] as string;
    const timestamp = request.headers['x-twilio-email-event-webhook-timestamp'] as string;

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
    const payload = timestamp + JSON.stringify(request.body) + this.SENDGRID_WEBHOOK_KEY;
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

  private verifyTwilioSignature(request: FastifyRequest): boolean {
    const twilioSignature = request.headers['x-twilio-signature'] as string;

    if (!twilioSignature || !this.TWILIO_AUTH_TOKEN) {
      logger.warn('Missing Twilio webhook verification components', {
        hasSignature: !!twilioSignature,
        hasToken: !!this.TWILIO_AUTH_TOKEN
      });
      return false;
    }

    // Build the full URL (Twilio requires the exact URL)
    const protocol = request.headers['x-forwarded-proto'] as string || request.protocol;
    const fullUrl = `${protocol}://${request.hostname}${request.url}`;

    // Sort the POST parameters alphabetically and concatenate
    const body = request.body as Record<string, any>;
    const params = Object.keys(body)
      .sort()
      .reduce((acc, key) => {
        return acc + key + body[key];
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
  async handleGenericWebhook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const params = request.params as { provider: string };
      const provider = params.provider;
      const signature = request.headers['x-webhook-signature'] as string;
      const timestamp = request.headers['x-webhook-timestamp'] as string;

      // Get provider-specific secret
      const webhookSecret = process.env[`${provider.toUpperCase()}_WEBHOOK_SECRET`];

      if (!webhookSecret) {
        logger.error(`No webhook secret configured for provider: ${provider}`);
        reply.status(500).send('Provider not configured');
        return;
      }

      // Verify signature
      if (!this.verifyGenericSignature(request, webhookSecret)) {
        logger.warn(`Invalid webhook signature for provider: ${provider}`, {
          ip: request.ip,
          userAgent: request.headers['user-agent']
        });
        reply.status(401).send('Unauthorized');
        return;
      }

      // Track webhook metrics
      metricsService.trackWebhookReceived(provider, 'generic');
      
      // Process webhook based on provider
      await this.processGenericWebhook(provider, request.body);
      reply.status(200).send('OK');
    } catch (error) {
      logger.error('Generic webhook error', error);
      reply.status(500).send('Error processing webhook');
    }
  }

  private verifyGenericSignature(request: FastifyRequest, secret: string): boolean {
    const signature = request.headers['x-webhook-signature'] as string;
    const timestamp = request.headers['x-webhook-timestamp'] as string;

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
    const payload = `${timestamp}.${JSON.stringify(request.body)}`;
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
    await db('notification_webhook_events').insert({
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

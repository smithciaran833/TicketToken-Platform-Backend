// serviceCache is not used - removed
import { Request, Response, NextFunction } from 'express';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { queues } from '../config/queue';
import { v4 as uuidv4 } from 'uuid';

export class WebhookController {
  async handleSquareWebhook(req: Request, res: Response, _next: NextFunction) {
    try {
      const signature = req.headers['x-square-signature'] as string;
      const body = JSON.stringify(req.body);

      // Verify signature
      const provider = new (require('../providers/square/square.provider').SquareProvider)();
      const isValid = provider.validateWebhookSignature(body, signature);

      if (!isValid) {
        logger.warn('Invalid Square webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Store webhook event
      const webhookId = uuidv4();
      await db('integration_webhooks').insert({
        id: webhookId,
        integration_type: 'square',
        event_type: req.body.type,
        event_id: req.body.event_id,
        headers: JSON.stringify(req.headers),
        payload: req.body,
        signature,
        external_id: req.body.event_id
      });

      // Queue for processing
      await queues.high.add('webhook', {
        webhookId,
        provider: 'square',
        event: req.body
      });

      res.json({ received: true });
    } catch (error) {
      logger.error('Square webhook error', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
    return; // Added missing return
  }

  async handleStripeWebhook(req: Request, res: Response, _next: NextFunction) {
    try {
      const signature = req.headers['stripe-signature'] as string;
      const body = JSON.stringify(req.body);

      // Verify signature
      const provider = new (require('../providers/stripe/stripe.provider').StripeProvider)();
      const isValid = provider.validateWebhookSignature(body, signature);

      if (!isValid) {
        logger.warn('Invalid Stripe webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Store webhook event
      const webhookId = uuidv4();
      await db('integration_webhooks').insert({
        id: webhookId,
        integration_type: 'stripe',
        event_type: req.body.type,
        event_id: req.body.id,
        headers: JSON.stringify(req.headers),
        payload: req.body,
        signature,
        external_id: req.body.id
      });

      // Queue for processing
      await queues.high.add('webhook', {
        webhookId,
        provider: 'stripe',
        event: req.body
      });

      res.json({ received: true });
    } catch (error) {
      logger.error('Stripe webhook error', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
    return; // Added missing return
  }

  async handleMailchimpWebhook(req: Request, res: Response, _next: NextFunction) {
    try {
      // Mailchimp webhooks work differently
      const { type, fired_at } = req.body;
      // data is not used, removed from destructuring

      // Store webhook event
      const webhookId = uuidv4();
      await db('integration_webhooks').insert({
        id: webhookId,
        integration_type: 'mailchimp',
        event_type: type,
        headers: JSON.stringify(req.headers),
        payload: req.body,
        external_id: `${type}_${fired_at}`
      });

      // Queue for processing
      await queues.normal.add('webhook', {
        webhookId,
        provider: 'mailchimp',
        event: req.body
      });

      res.json({ received: true });
    } catch (error) {
      logger.error('Mailchimp webhook error', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  async handleQuickBooksWebhook(req: Request, res: Response, _next: NextFunction) {
    try {
      const signature = req.headers['intuit-signature'] as string;
      const body = JSON.stringify(req.body);

      // Verify signature
      const provider = new (require('../providers/quickbooks/quickbooks.provider').QuickBooksProvider)();
      const isValid = provider.validateWebhookSignature(body, signature);

      if (!isValid) {
        logger.warn('Invalid QuickBooks webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Store webhook events
      for (const notification of req.body.eventNotifications || []) {
        const webhookId = uuidv4();
        await db('integration_webhooks').insert({
          id: webhookId,
          integration_type: 'quickbooks',
          event_type: notification.eventType,
          headers: JSON.stringify(req.headers),
          payload: notification,
          signature,
          venue_id: notification.realmId
        });

        // Queue for processing
        await queues.normal.add('webhook', {
          webhookId,
          provider: 'quickbooks',
          event: notification
        });
      }

      res.json({ received: true });
    } catch (error) {
      logger.error('QuickBooks webhook error', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
    return; // Added missing return
  }

  async getWebhookEvents(req: Request, res: Response, next: NextFunction) {
    try {
      const { provider } = req.params;
      const { limit = 50, offset = 0, status } = req.query;

      let query = db('integration_webhooks')
        .where('integration_type', provider)
        .orderBy('received_at', 'desc')
        .limit(Number(limit))
        .offset(Number(offset));

      if (status) {
        query = query.where('status', status);
      }

      const events = await query;

      res.json({
        success: true,
        data: events
      });
    } catch (error) {
      next(error);
    }
  }

  async retryWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const { webhookId } = req.body;

      if (!webhookId) {
        return res.status(400).json({
          success: false,
          error: 'Webhook ID is required'
        });
      }

      const webhook = await db('integration_webhooks')
        .where('id', webhookId)
        .first();

      if (!webhook) {
        return res.status(404).json({
          success: false,
          error: 'Webhook not found'
        });
      }

      // Re-queue for processing
      await queues.normal.add('webhook', {
        webhookId,
        provider: webhook.integration_type,
        event: webhook.payload,
        isRetry: true
      });

      // Update status
      await db('integration_webhooks')
        .where('id', webhookId)
        .update({
          status: 'pending',
          retry_count: db.raw('retry_count + 1')
        });

      res.json({
        success: true,
        message: 'Webhook queued for retry'
      });
    } catch (error) {
      next(error);
    }
    return; // Added missing return
  }
}

export const webhookController = new WebhookController();

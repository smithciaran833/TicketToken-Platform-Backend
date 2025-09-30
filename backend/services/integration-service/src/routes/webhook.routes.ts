import { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller';
import { authenticate, verifyWebhookSignature } from '../middleware/auth.middleware';

export const webhookRoutes = Router();

// Webhook endpoints use signature verification
webhookRoutes.post('/square', verifyWebhookSignature('square'), webhookController.handleSquareWebhook);
webhookRoutes.post('/stripe', verifyWebhookSignature('stripe'), webhookController.handleStripeWebhook);
webhookRoutes.post('/mailchimp', verifyWebhookSignature('mailchimp'), webhookController.handleMailchimpWebhook);
webhookRoutes.post('/quickbooks', verifyWebhookSignature('quickbooks'), webhookController.handleQuickBooksWebhook);

// These routes need JWT auth
webhookRoutes.get('/:provider/events', authenticate, webhookController.getWebhookEvents);
webhookRoutes.post('/retry', authenticate, webhookController.retryWebhook);

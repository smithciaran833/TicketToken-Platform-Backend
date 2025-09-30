import { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller';
import express from 'express';

const router = Router();
const controller = new WebhookController();

// Stripe webhooks need raw body
router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  (req, res, next) => controller.handleStripeWebhook(req, res, next)
);

export default router;

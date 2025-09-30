import express, { Router } from 'express';
import { intentsController } from '../controllers/intentsController';
import { webhookController } from '../controllers/webhookController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Payment intent creation (protected)
router.post('/intents', authMiddleware, intentsController.createIntent.bind(intentsController));

// Webhook endpoints (no auth, verified by signature)
router.post('/webhooks/stripe', express.raw({type: 'application/json'}), webhookController.handleStripeWebhook.bind(webhookController));

export default router;

import { Router } from 'express';
import { webhookAuth } from '../middleware/auth.middleware';

const router = Router();

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'webhook-secret-change-in-production';

// Webhooks need signature verification, not JWT auth
router.post('/webhooks/compliance/tax-update', 
  webhookAuth(WEBHOOK_SECRET),
  async (req, res) => {
    try {
      // Process tax update webhook
      const tenantId = (req as any).tenantId;
      console.log('Tax update webhook received', { tenantId, body: req.body });
      res.json({ received: true });
    } catch (error: any) {
      console.error('Webhook processing error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

router.post('/webhooks/compliance/kyc-update',
  webhookAuth(WEBHOOK_SECRET),
  async (req, res) => {
    try {
      // Process KYC update webhook
      const tenantId = (req as any).tenantId;
      console.log('KYC update webhook received', { tenantId, body: req.body });
      res.json({ received: true });
    } catch (error: any) {
      console.error('Webhook processing error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

router.post('/webhooks/compliance/risk-alert',
  webhookAuth(WEBHOOK_SECRET),
  async (req, res) => {
    try {
      // Process risk alert webhook
      const tenantId = (req as any).tenantId;
      console.log('Risk alert webhook received', { tenantId, body: req.body });
      res.json({ received: true });
    } catch (error: any) {
      console.error('Webhook processing error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;

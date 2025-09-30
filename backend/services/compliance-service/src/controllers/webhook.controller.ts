import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { db } from '../services/database.service';
import crypto from 'crypto';

export class WebhookController {
  // Plaid webhook for bank verification
  static async handlePlaidWebhook(req: Request, res: Response) {
    try {
      const { webhook_type, webhook_code, item_id } = req.body;
      console.log(`🏦 Plaid webhook: ${webhook_type} - ${webhook_code}`);
      
      // Log webhook
      await db.query(
        `INSERT INTO webhook_logs (source, type, payload, created_at)
         VALUES ('plaid', $1, $2, NOW())`,
        [webhook_type, JSON.stringify(req.body)]
      );
      
      // Handle different webhook types
      switch (webhook_type) {
        case 'AUTH':
          if (webhook_code === 'VERIFICATION_EXPIRED') {
            // Mark bank verification as expired
            await db.query(
              `UPDATE bank_verifications
               SET verified = false
               WHERE plaid_item_id = $1`,
              [item_id]
            );
          }
          break;
          
        case 'ITEM':
          if (webhook_code === 'ERROR') {
            console.error('Plaid item error:', req.body.error);
          }
          break;
      }
      
      return res.json({ received: true });
    } catch (error: any) {
      console.error('Plaid webhook error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // Stripe webhook for payment processing
  static async handleStripeWebhook(req: Request, res: Response) {
    try {
      const sig = req.headers['stripe-signature'] as string;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      
      if (!webhookSecret) {
        console.log('💳 [MOCK] Stripe webhook received');
        return res.json({ received: true });
      }
      
      // Verify webhook signature
      const payload = req.body;
      const payloadString = JSON.stringify(payload);
      const header = sig;
      
      // In production: Use Stripe SDK to verify
      // const event = stripe.webhooks.constructEvent(payloadString, header, webhookSecret);
      
      // Log webhook
      await db.query(
        `INSERT INTO webhook_logs (source, type, payload, created_at)
         VALUES ('stripe', $1, $2, NOW())`,
        ['payment', payloadString]
      );
      
      return res.json({ received: true });
    } catch (error: any) {
      console.error('Stripe webhook error:', error);
      return res.status(400).json({ error: error.message });
    }
  }

  // SendGrid webhook for email events
  static async handleSendGridWebhook(req: Request, res: Response) {
    try {
      const events = req.body; // Array of events
      
      for (const event of events) {
        console.log(`📧 SendGrid event: ${event.event} for ${event.email}`);
        
        // Update notification log - fixed SQL
        if (event.event === 'delivered' || event.event === 'bounce') {
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
      }
      
      return res.json({ received: true });
    } catch (error: any) {
      console.error('SendGrid webhook error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
}

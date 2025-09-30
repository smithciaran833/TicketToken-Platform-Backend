import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { z } from 'zod';
import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const log = logger.child({ component: 'RefundController' });

// Add validation schema
const refundSchema = z.object({
  paymentIntentId: z.string(),
  amount: z.number().positive(),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer', 'other']).optional()
});

export class RefundController {
  async createRefund(req: Request, res: Response) {
    try {
      // Check authentication
      const user = (req as any).user;
      const tenantId = (req as any).tenantId;
      
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      if (!tenantId) {
        return res.status(403).json({ error: 'Tenant context required' });
      }

      // Validate input
      const validated = refundSchema.parse(req.body);
      const { paymentIntentId, amount, reason } = validated;

      const db = DatabaseService.getPool();
      
      // CRITICAL: Verify the payment intent belongs to this tenant
      const paymentCheck = await db.query(
        `SELECT pi.*, o.tenant_id 
         FROM payment_intents pi
         JOIN orders o ON pi.order_id = o.id
         WHERE pi.stripe_intent_id = $1 AND o.tenant_id = $2`,
        [paymentIntentId, tenantId]
      );

      if (paymentCheck.rows.length === 0) {
        log.warn('Refund attempt for unauthorized payment intent', {
          paymentIntentId,
          tenantId,
          userId: user.id
        });
        return res.status(403).json({ error: 'Payment intent not found or unauthorized' });
      }

      const paymentIntent = paymentCheck.rows[0];

      // Verify refund amount doesn't exceed original amount
      if (amount > paymentIntent.amount) {
        return res.status(400).json({ error: 'Refund amount exceeds original payment' });
      }

      // Check if already refunded
      if (paymentIntent.status === 'refunded') {
        return res.status(400).json({ error: 'Payment already refunded' });
      }

      // Mock Stripe refund (in production, use real Stripe SDK)
      const mockRefund = {
        id: `re_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        payment_intent: paymentIntentId,
        amount: amount,
        status: 'succeeded',
        reason: reason || 'requested_by_customer'
      };

      // Start transaction
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        
        // Set tenant context for RLS
        await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId]);

        // Store refund record with tenant_id
        await client.query(
          `INSERT INTO refunds (id, payment_intent_id, amount, status, reason, tenant_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [mockRefund.id, paymentIntentId, amount, mockRefund.status, mockRefund.reason, tenantId]
        );

        // Update payment intent status
        await client.query(
          `UPDATE payment_intents SET status = 'refunded' WHERE stripe_intent_id = $1`,
          [paymentIntentId]
        );

        // Write to outbox with tenant context
        const outboxId = uuidv4();
        await client.query(
          `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload, tenant_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            outboxId,
            'refund',
            'refund.completed',
            JSON.stringify({
              ...mockRefund,
              tenantId,
              userId: user.id,
              timestamp: new Date().toISOString()
            }),
            tenantId
          ]
        );

        await client.query('COMMIT');
        
        log.info('Refund processed', { 
          refundId: mockRefund.id,
          tenantId,
          userId: user.id
        });

        return res.json({
          refundId: mockRefund.id,
          status: mockRefund.status,
          amount: amount
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: (error as any).errors });
      }
      
      log.error('Refund failed', error);
      return res.status(500).json({ error: 'Refund failed' });
    }
  }
}

export const refundController = new RefundController();

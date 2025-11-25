import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';
import { auditService } from '@tickettoken/shared';
import { v4 as uuidv4 } from 'uuid';
import Stripe from 'stripe';

const log = logger.child({ component: 'RefundController' });

// Initialize Stripe (reuse same validation logic)
function getStripe(): Stripe {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    throw new Error('STRIPE_SECRET_KEY must be set');
  }
  return new Stripe(stripeKey, {
    apiVersion: '2023-10-16',
    timeout: 20000,
    maxNetworkRetries: 0,
  });
}

const stripe = getStripe();

// ============================================================================
// RETRY LOGIC FOR REFUNDS
// ============================================================================

interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  operation: string;
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxAttempts, delayMs, operation } = options;
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry on 4xx client errors
      if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
        log.warn('Client error, not retrying', {
          operation,
          attempt,
          statusCode: error.statusCode,
          message: error.message
        });
        throw error;
      }

      // Retry on 5xx server errors or network errors
      if (attempt < maxAttempts) {
        const delay = delayMs * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        log.warn('Refund API call failed, retrying', {
          operation,
          attempt,
          maxAttempts,
          delayMs: delay,
          error: error.message
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  log.error('Refund API call failed after all retries', {
    operation,
    attempts: maxAttempts,
    error: lastError.message
  });
  throw lastError;
}

// ============================================================================
// REFUND CONTROLLER
// ============================================================================

const refundSchema = z.object({
  paymentIntentId: z.string(),
  amount: z.number().positive(),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer', 'other']).optional()
});

export class RefundController {
  async createRefund(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = (request as any).user;
      const tenantId = (request as any).tenantId;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      if (!tenantId) {
        return reply.code(403).send({ error: 'Tenant context required' });
      }

      const validated = refundSchema.parse(request.body);
      const { paymentIntentId, amount, reason } = validated;

      const db = DatabaseService.getPool();

      const paymentCheck = await db.query(
        `SELECT pi.*, o.tenant_id
         FROM payment_intents pi
         JOIN orders o ON pi.order_id = o.id
         WHERE pi.stripe_intent_id = $1 AND o.tenant_id = $2`,
        [paymentIntentId, tenantId]
      );

      if (paymentCheck.rows.length === 0) {
        log.warn('Refund attempt for unauthorized payment intent', {
          paymentIntentId, tenantId, userId: user.id
        });
        return reply.code(403).send({ error: 'Payment intent not found or unauthorized' });
      }

      const paymentIntent = paymentCheck.rows[0];

      if (amount > paymentIntent.amount) {
        return reply.code(400).send({ error: 'Refund amount exceeds original payment' });
      }

      if (paymentIntent.status === 'refunded') {
        return reply.code(400).send({ error: 'Payment already refunded' });
      }

      // ================================================================
      // CALL REAL STRIPE REFUND API WITH RETRY LOGIC
      // ================================================================
      
      const idempotencyKey = (request as any).idempotencyKey || uuidv4();

      let stripeRefund;
      try {
        stripeRefund = await retryWithBackoff(
          () => stripe.refunds.create({
            payment_intent: paymentIntentId,
            amount: amount,
            reason: (reason === 'other' ? 'requested_by_customer' : reason as any) || 'requested_by_customer',
          }, {
            idempotencyKey: idempotencyKey, // Use idempotency key for safety
          }),
          {
            maxAttempts: 3,
            delayMs: 1000,
            operation: 'createRefund'
          }
        );

        log.info('Stripe refund created successfully', {
          refundId: stripeRefund.id,
          paymentIntentId,
          amount,
          status: stripeRefund.status
        });
      } catch (error: any) {
        log.error('Failed to create Stripe refund', {
          error: error.message,
          paymentIntentId,
          amount,
          userId: user.id
        });

        await auditService.logAction({
          service: 'payment-service',
          action: 'create_refund',
          actionType: 'UPDATE',
          userId: user.id,
          userRole: user.role,
          resourceType: 'payment',
          resourceId: paymentIntentId,
          metadata: { 
            amount, 
            reason,
            error: error.message 
          },
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          success: false,
          errorMessage: error.message,
        });

        return reply.code(500).send({ 
          error: 'Refund failed',
          message: 'Unable to process refund through payment provider. Please try again or contact support.'
        });
      }

      // ================================================================
      // UPDATE DATABASE WITH REAL STRIPE REFUND DATA
      // ================================================================

      const client = await db.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId]);

        // Store refund with REAL Stripe refund ID
        await client.query(
          `INSERT INTO refunds (id, payment_intent_id, amount, status, reason, tenant_id, stripe_refund_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [
            stripeRefund.id,  // Use Stripe's refund ID
            paymentIntentId,
            amount,
            stripeRefund.status,
            reason || 'requested_by_customer',
            tenantId,
            stripeRefund.id  // Store Stripe refund ID for tracking
          ]
        );

        await client.query(
          `UPDATE payment_intents SET status = 'refunded' WHERE stripe_intent_id = $1`,
          [paymentIntentId]
        );

        const outboxId = uuidv4();
        await client.query(
          `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload, tenant_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            outboxId,
            'refund',
            'refund.completed',
            JSON.stringify({
              refundId: stripeRefund.id,
              stripeRefundId: stripeRefund.id,
              paymentIntentId,
              amount,
              status: stripeRefund.status,
              tenantId,
              userId: user.id,
              timestamp: new Date().toISOString()
            }),
            tenantId
          ]
        );

        await client.query('COMMIT');

        await auditService.logAction({
          service: 'payment-service',
          action: 'create_refund',
          actionType: 'UPDATE',
          userId: user.id,
          userRole: user.role,
          resourceType: 'payment',
          resourceId: paymentIntentId,
          previousValue: { status: paymentIntent.status, amount: paymentIntent.amount },
          newValue: { 
            status: 'refunded', 
            refundAmount: amount, 
            refundId: stripeRefund.id,
            stripeRefundId: stripeRefund.id 
          },
          metadata: {
            refundReason: reason || 'requested_by_customer',
            refundPercentage: (amount / paymentIntent.amount) * 100,
            tenantId,
          },
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          success: true,
        });

        log.info('Refund processed successfully', { 
          refundId: stripeRefund.id, 
          stripeRefundId: stripeRefund.id,
          tenantId, 
          userId: user.id,
          amount
        });

        return reply.send({ 
          refundId: stripeRefund.id, 
          status: stripeRefund.status, 
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
        return reply.code(400).send({ error: 'Validation failed', details: (error as any).errors });
      }

      await auditService.logAction({
        service: 'payment-service',
        action: 'create_refund',
        actionType: 'UPDATE',
        userId: (request as any).user?.id || 'unknown',
        resourceType: 'payment',
        resourceId: (request.body as any)?.paymentIntentId,
        metadata: { attemptedAmount: (request.body as any)?.amount },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      log.error('Refund failed', { error: error instanceof Error ? error.message : error });
      return reply.code(500).send({ error: 'Refund failed' });
    }
  }
}

export const refundController = new RefundController();

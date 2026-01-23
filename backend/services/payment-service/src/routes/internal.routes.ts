/**
 * Internal Routes - payment-service
 *
 * For service-to-service communication only.
 * These endpoints handle payment operations from other services
 * (order-service, marketplace-service, etc.)
 *
 * Phase A HMAC Standardization - Decision #2 Implementation
 *
 * Endpoints:
 * - POST /internal/payment-complete - Mark payment as completed
 * - POST /internal/payment-intents - Create payment intent
 * - POST /internal/payment-intents/:id/confirm - Confirm payment intent
 * - POST /internal/payment-intents/:id/cancel - Cancel payment intent
 * - GET /internal/payment-intents/:id/status - Get payment intent status
 * - POST /internal/refunds - Process refund
 * - GET /internal/royalties/order/:orderId - Get royalties for order
 * - POST /internal/royalties/reverse - Reverse royalty distributions
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { internalAuth } from '../middleware/internal-auth';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import Stripe from 'stripe';

const log = logger.child({ component: 'InternalRoutes' });

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-06-20' as any,
});

export default async function internalRoutes(fastify: FastifyInstance) {
  /**
   * POST /internal/payment-complete
   * Mark a payment as completed
   * Used by: order-service (after webhook confirmation)
   */
  fastify.post(
    '/internal/payment-complete',
    { preHandler: [internalAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId, paymentId } = request.body as any;
      const traceId = request.headers['x-trace-id'] as string;
      const callingService = (request as any).internalService;

      try {
        const result = await db('payment_transactions')
          .where('id', paymentId)
          .update({ status: 'completed', updated_at: new Date() })
          .returning('*');

        log.info({ orderId, paymentId, callingService, traceId }, 'Payment completed');

        return reply.send({ success: true, orderId, paymentId, transaction: result[0] });
      } catch (error: any) {
        log.error({ error: error.message, orderId, paymentId, traceId }, 'Payment completion error');
        return reply.status(500).send({ error: 'Failed to complete payment' });
      }
    }
  );

  /**
   * POST /internal/payment-intents
   * Create a new payment intent
   * Used by: order-service (when creating orders)
   */
  fastify.post<{
    Body: {
      amount: number;
      currency: string;
      orderId: string;
      customerId?: string;
      metadata?: Record<string, string>;
    };
  }>(
    '/internal/payment-intents',
    { preHandler: [internalAuth] },
    async (request, reply) => {
      const { amount, currency, orderId, customerId, metadata } = request.body;
      const traceId = request.headers['x-trace-id'] as string;
      const callingService = (request as any).internalService;

      try {
        // Create Stripe payment intent
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: currency.toLowerCase(),
          customer: customerId,
          metadata: {
            orderId,
            ...metadata,
          },
        });

        // Record in database
        const [transaction] = await db('payment_transactions')
          .insert({
            id: paymentIntent.id,
            order_id: orderId,
            amount,
            currency: currency.toUpperCase(),
            status: 'pending',
            stripe_payment_intent_id: paymentIntent.id,
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning('*');

        log.info({
          paymentIntentId: paymentIntent.id,
          orderId,
          amount,
          callingService,
          traceId,
        }, 'Payment intent created');

        return reply.send({
          success: true,
          paymentIntent: {
            id: paymentIntent.id,
            clientSecret: paymentIntent.client_secret,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            status: paymentIntent.status,
          },
        });
      } catch (error: any) {
        log.error({
          error: error.message,
          orderId,
          amount,
          traceId,
        }, 'Failed to create payment intent');

        return reply.status(500).send({
          error: 'Failed to create payment intent',
          message: error.message,
        });
      }
    }
  );

  /**
   * POST /internal/payment-intents/:paymentIntentId/confirm
   * Confirm a payment intent
   * Used by: order-service (when confirming payment)
   */
  fastify.post<{
    Params: { paymentIntentId: string };
    Body: { paymentMethodId?: string };
  }>(
    '/internal/payment-intents/:paymentIntentId/confirm',
    { preHandler: [internalAuth] },
    async (request, reply) => {
      const { paymentIntentId } = request.params;
      const { paymentMethodId } = request.body;
      const traceId = request.headers['x-trace-id'] as string;
      const callingService = (request as any).internalService;

      try {
        const confirmParams: Stripe.PaymentIntentConfirmParams = {};
        if (paymentMethodId) {
          confirmParams.payment_method = paymentMethodId;
        }

        const paymentIntent = await stripe.paymentIntents.confirm(
          paymentIntentId,
          confirmParams
        );

        // Update database
        await db('payment_transactions')
          .where('stripe_payment_intent_id', paymentIntentId)
          .update({
            status: paymentIntent.status === 'succeeded' ? 'completed' : paymentIntent.status,
            updated_at: new Date(),
          });

        log.info({
          paymentIntentId,
          status: paymentIntent.status,
          callingService,
          traceId,
        }, 'Payment intent confirmed');

        return reply.send({
          success: true,
          paymentIntent: {
            id: paymentIntent.id,
            status: paymentIntent.status,
            amount: paymentIntent.amount,
          },
        });
      } catch (error: any) {
        log.error({
          error: error.message,
          paymentIntentId,
          traceId,
        }, 'Failed to confirm payment intent');

        return reply.status(500).send({
          error: 'Failed to confirm payment intent',
          message: error.message,
        });
      }
    }
  );

  /**
   * POST /internal/payment-intents/:paymentIntentId/cancel
   * Cancel a payment intent
   * Used by: order-service (when canceling orders)
   */
  fastify.post<{
    Params: { paymentIntentId: string };
    Body: { cancellationReason?: string };
  }>(
    '/internal/payment-intents/:paymentIntentId/cancel',
    { preHandler: [internalAuth] },
    async (request, reply) => {
      const { paymentIntentId } = request.params;
      const { cancellationReason } = request.body;
      const traceId = request.headers['x-trace-id'] as string;
      const callingService = (request as any).internalService;

      try {
        const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId, {
          cancellation_reason: cancellationReason as any || 'requested_by_customer',
        });

        // Update database
        await db('payment_transactions')
          .where('stripe_payment_intent_id', paymentIntentId)
          .update({
            status: 'canceled',
            cancellation_reason: cancellationReason,
            updated_at: new Date(),
          });

        log.info({
          paymentIntentId,
          cancellationReason,
          callingService,
          traceId,
        }, 'Payment intent canceled');

        return reply.send({
          success: true,
          paymentIntent: {
            id: paymentIntent.id,
            status: paymentIntent.status,
          },
        });
      } catch (error: any) {
        log.error({
          error: error.message,
          paymentIntentId,
          traceId,
        }, 'Failed to cancel payment intent');

        return reply.status(500).send({
          error: 'Failed to cancel payment intent',
          message: error.message,
        });
      }
    }
  );

  /**
   * GET /internal/payment-intents/:paymentIntentId/status
   * Get payment intent status
   * Used by: order-service (when checking payment status)
   */
  fastify.get<{ Params: { paymentIntentId: string } }>(
    '/internal/payment-intents/:paymentIntentId/status',
    { preHandler: [internalAuth] },
    async (request, reply) => {
      const { paymentIntentId } = request.params;
      const traceId = request.headers['x-trace-id'] as string;
      const callingService = (request as any).internalService;

      try {
        // Get from Stripe for latest status
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        // Also get local record
        const transaction = await db('payment_transactions')
          .where('stripe_payment_intent_id', paymentIntentId)
          .first();

        log.info({
          paymentIntentId,
          status: paymentIntent.status,
          callingService,
          traceId,
        }, 'Payment intent status lookup');

        return reply.send({
          paymentIntent: {
            id: paymentIntent.id,
            status: paymentIntent.status,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            amountReceived: paymentIntent.amount_received,
            metadata: paymentIntent.metadata,
          },
          transaction: transaction ? {
            id: transaction.id,
            orderId: transaction.order_id,
            localStatus: transaction.status,
          } : null,
        });
      } catch (error: any) {
        log.error({
          error: error.message,
          paymentIntentId,
          traceId,
        }, 'Failed to get payment intent status');

        return reply.status(500).send({
          error: 'Failed to get payment intent status',
          message: error.message,
        });
      }
    }
  );

  /**
   * POST /internal/refunds
   * Process a refund
   * Used by: order-service, marketplace-service
   */
  fastify.post<{
    Body: {
      paymentIntentId: string;
      amount?: number;
      reason?: string;
      metadata?: Record<string, string>;
    };
  }>(
    '/internal/refunds',
    { preHandler: [internalAuth] },
    async (request, reply) => {
      const { paymentIntentId, amount, reason, metadata } = request.body;
      const traceId = request.headers['x-trace-id'] as string;
      const callingService = (request as any).internalService;

      try {
        // Get the payment intent to find the charge
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (!paymentIntent.latest_charge) {
          return reply.status(400).send({
            error: 'Cannot refund - no charge found',
          });
        }

        // Create refund
        const refundParams: Stripe.RefundCreateParams = {
          charge: paymentIntent.latest_charge as string,
          reason: reason as any || 'requested_by_customer',
          metadata: {
            paymentIntentId,
            callingService,
            ...metadata,
          },
        };

        if (amount) {
          refundParams.amount = amount;
        }

        const refund = await stripe.refunds.create(refundParams);

        // Record in database
        await db('refunds').insert({
          id: refund.id,
          payment_intent_id: paymentIntentId,
          charge_id: paymentIntent.latest_charge,
          amount: refund.amount,
          currency: refund.currency,
          status: refund.status,
          reason: reason,
          created_at: new Date(),
          updated_at: new Date(),
        });

        log.info({
          refundId: refund.id,
          paymentIntentId,
          amount: refund.amount,
          callingService,
          traceId,
        }, 'Refund processed');

        return reply.send({
          success: true,
          refund: {
            id: refund.id,
            amount: refund.amount,
            status: refund.status,
            currency: refund.currency,
          },
        });
      } catch (error: any) {
        log.error({
          error: error.message,
          paymentIntentId,
          amount,
          traceId,
        }, 'Failed to process refund');

        return reply.status(500).send({
          error: 'Failed to process refund',
          message: error.message,
        });
      }
    }
  );

  /**
   * GET /internal/royalties/order/:orderId
   * Get royalty distributions for an order
   * Used by: order-service (for displaying royalty info)
   */
  fastify.get<{ Params: { orderId: string } }>(
    '/internal/royalties/order/:orderId',
    { preHandler: [internalAuth] },
    async (request, reply) => {
      const { orderId } = request.params;
      const traceId = request.headers['x-trace-id'] as string;
      const callingService = (request as any).internalService;

      try {
        const distributions = await db('royalty_distributions')
          .where('order_id', orderId)
          .orderBy('created_at', 'desc');

        const total = distributions.reduce((sum, d) => sum + (d.amount || 0), 0);

        log.info({
          orderId,
          distributionCount: distributions.length,
          totalAmount: total,
          callingService,
          traceId,
        }, 'Royalty distributions lookup');

        return reply.send({
          orderId,
          distributions: distributions.map(d => ({
            id: d.id,
            recipientId: d.recipient_id,
            recipientType: d.recipient_type,
            amount: d.amount,
            currency: d.currency,
            status: d.status,
            createdAt: d.created_at,
          })),
          summary: {
            totalDistributions: distributions.length,
            totalAmount: total,
            currency: distributions[0]?.currency || 'USD',
          },
        });
      } catch (error: any) {
        log.error({
          error: error.message,
          orderId,
          traceId,
        }, 'Failed to get royalty distributions');

        return reply.status(500).send({
          error: 'Failed to get royalty distributions',
        });
      }
    }
  );

  /**
   * POST /internal/royalties/reverse
   * Reverse royalty distributions for a refund
   * Used by: order-service (when processing refunds)
   */
  fastify.post<{
    Body: {
      orderId: string;
      refundId: string;
      refundAmount: number;
      reason?: string;
    };
  }>(
    '/internal/royalties/reverse',
    { preHandler: [internalAuth] },
    async (request, reply) => {
      const { orderId, refundId, refundAmount, reason } = request.body;
      const traceId = request.headers['x-trace-id'] as string;
      const callingService = (request as any).internalService;

      try {
        // Get original distributions
        const originalDistributions = await db('royalty_distributions')
          .where('order_id', orderId)
          .where('status', 'completed');

        if (originalDistributions.length === 0) {
          return reply.send({
            success: true,
            message: 'No royalty distributions to reverse',
            reversals: [],
          });
        }

        // Calculate total original amount
        const totalOriginal = originalDistributions.reduce((sum, d) => sum + d.amount, 0);

        // Calculate reversal ratio (partial vs full refund)
        const reversalRatio = refundAmount / totalOriginal;

        const reversals = [];

        // Create reversal records
        for (const dist of originalDistributions) {
          const reversalAmount = Math.round(dist.amount * reversalRatio);

          const [reversal] = await db('royalty_reversals')
            .insert({
              original_distribution_id: dist.id,
              order_id: orderId,
              refund_id: refundId,
              recipient_id: dist.recipient_id,
              original_amount: dist.amount,
              reversal_amount: reversalAmount,
              reason: reason || 'refund',
              status: 'pending',
              created_at: new Date(),
            })
            .returning('*');

          reversals.push(reversal);

          // Update original distribution status
          await db('royalty_distributions')
            .where('id', dist.id)
            .update({
              status: reversalRatio >= 1 ? 'reversed' : 'partially_reversed',
              updated_at: new Date(),
            });
        }

        log.info({
          orderId,
          refundId,
          refundAmount,
          reversalCount: reversals.length,
          callingService,
          traceId,
        }, 'Royalty distributions reversed');

        return reply.send({
          success: true,
          reversals: reversals.map(r => ({
            id: r.id,
            originalDistributionId: r.original_distribution_id,
            recipientId: r.recipient_id,
            originalAmount: r.original_amount,
            reversalAmount: r.reversal_amount,
            status: r.status,
          })),
          summary: {
            totalReversals: reversals.length,
            totalReversalAmount: reversals.reduce((sum, r) => sum + r.reversal_amount, 0),
          },
        });
      } catch (error: any) {
        log.error({
          error: error.message,
          orderId,
          refundId,
          traceId,
        }, 'Failed to reverse royalty distributions');

        return reply.status(500).send({
          error: 'Failed to reverse royalty distributions',
        });
      }
    }
  );
}

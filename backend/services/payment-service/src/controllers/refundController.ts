/**
 * Refund Controller
 * 
 * HIGH FIX: Added proper Stripe error wrapping with RFC 7807 responses.
 * 
 * MEDIUM FIXES:
 * - REF-10: Handle partial refund for one of many tickets in an order (createTicketRefund)
 * - REF-11: Track promo code discounts in refund calculations (getPromoCodeAdjustment)
 * - DRP-4: Track cumulative total refunded across multiple refunds (getRefundableInfo)
 * - DRP-9: Calculate max refundable amount including fees (getRefundableInfo)
 * - EDGE-4: Validate currency mismatch between refund and original payment (validateCurrency)
 * 
 * PHASE 5c BYPASS EXCEPTION:
 * This controller queries payment_intents, orders, tickets, and payment_refunds
 * tables. Direct DB access is retained because:
 * 
 * 1. FINANCIAL ATOMICITY: Refund creation must be transactional with ticket status updates
 * 2. STRIPE INTEGRATION: Must verify payment state before issuing refunds
 * 3. PARTIAL REFUNDS: Multi-ticket refund calculations require JOIN with ticket prices
 * 4. CONSISTENCY: Payment and ticket status must be updated atomically
 * 
 * Tables accessed:
 * - payment_intents: Payment verification (payment-service owned)
 * - orders: Order context for refunds (order-service owned)
 * - tickets: Ticket prices and status updates (ticket-service owned)
 * - payment_refunds: Refund records (payment-service owned)
 * - ticket_refunds: Per-ticket refund tracking (payment-service owned)
 * 
 * Future: Consider ticketServiceClient.getTicketPrices() for refund calculations
 * and ticketServiceClient.markRefunded() for status updates.
 */

import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import Stripe from 'stripe';
import { 
  StripeError, 
  RefundFailedError, 
  NotFoundError, 
  ForbiddenError,
  BadRequestError,
  sendProblemResponse,
  toAppError 
} from '../utils/errors';
import { feeCalculationService, SUPPORTED_CURRENCIES } from '../services/fee-calculation.service';

const log = logger.child({ component: 'RefundController' });

// =============================================================================
// MEDIUM FIX TYPES
// =============================================================================

/**
 * REF-10: Partial refund tracking for multi-ticket orders
 */
interface TicketRefundInfo {
  ticketId: string;
  amount: number;
  refundedAt?: Date;
}

/**
 * REF-11: Promo code discount tracking
 */
interface PromoCodeDiscount {
  promoCode: string;
  discountAmount: number;
  discountPercent?: number;
  applicableAmount: number; // Amount the promo applied to
}

/**
 * DRP-4 & DRP-9: Refund tracking with cumulative totals
 */
interface RefundableInfo {
  originalAmount: number;
  totalRefunded: number;
  maxRefundable: number;
  stripeFee: number;
  platformFee: number;
  ticketCount: number;
  ticketsRefunded: number;
  promoDiscount?: PromoCodeDiscount;
  currency: string;
}

// Mock audit service if shared package not available
const auditService = {
  logAction: async (data: any) => {
    log.info({ audit: data }, 'Audit log');
  }
};

// Initialize Stripe (reuse same validation logic)
function getStripe(): Stripe | null {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    log.warn('STRIPE_SECRET_KEY not set - Stripe operations disabled');
    return null;
  }
  return new Stripe(stripeKey, {
    apiVersion: '2023-10-16',
    timeout: 20000,
    maxNetworkRetries: 0,
  });
}

const stripe = getStripe();

/**
 * Wrap Stripe errors in RFC 7807 format
 */
function wrapStripeError(error: any): StripeError | RefundFailedError {
  // Check if this is a Stripe error
  if (error.type && error.type.startsWith('Stripe')) {
    return new StripeError(error);
  }
  
  // Check for specific Stripe error codes
  if (error.code) {
    switch (error.code) {
      case 'charge_already_refunded':
        return new RefundFailedError('This charge has already been fully refunded', 'ALREADY_REFUNDED');
      case 'charge_disputed':
        return new RefundFailedError('Cannot refund a disputed charge', 'CHARGE_DISPUTED');
      case 'charge_expired_for_refund':
        return new RefundFailedError('Charge is too old to be refunded', 'CHARGE_EXPIRED');
      case 'insufficient_funds':
        return new RefundFailedError('Insufficient funds to process refund', 'INSUFFICIENT_FUNDS');
      case 'refund_amount_invalid':
        return new RefundFailedError('Invalid refund amount', 'INVALID_AMOUNT');
      default:
        return new RefundFailedError(
          error.message || 'Refund could not be processed',
          error.code
        );
    }
  }
  
  return new RefundFailedError(
    error.message || 'Refund could not be processed',
    'REFUND_FAILED'
  );
}

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
        log.warn({
          operation,
          attempt,
          statusCode: error.statusCode,
          message: error.message
        }, 'Client error, not retrying');
        throw error;
      }

      // Retry on 5xx server errors or network errors
      if (attempt < maxAttempts) {
        const delay = delayMs * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        log.warn({
          operation,
          attempt,
          maxAttempts,
          delayMs: delay,
          error: error.message
        }, 'Refund API call failed, retrying');
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  log.error({
    operation,
    attempts: maxAttempts,
    error: lastError.message
  }, 'Refund API call failed after all retries');
  throw lastError;
}

// ============================================================================
// REFUND CONTROLLER
// ============================================================================

// =============================================================================
// SCHEMAS WITH MEDIUM FIX ADDITIONS
// =============================================================================

const refundSchema = z.object({
  paymentIntentId: z.string(),
  amount: z.number().positive(),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer', 'other']).optional(),
  // REF-10: Support partial refund for specific tickets
  ticketIds: z.array(z.string()).optional(),
  // REF-11: Note about promo codes for audit trail
  promoCodeAdjustment: z.boolean().optional(),
});

/**
 * EDGE-4: Validate currency matches between request and payment
 */
function validateCurrency(requestCurrency: string | undefined, paymentCurrency: string): void {
  const reqCurrency = (requestCurrency || 'USD').toUpperCase();
  const payCurrency = paymentCurrency.toUpperCase();
  
  if (reqCurrency !== payCurrency) {
    throw new BadRequestError(
      `Currency mismatch: requested ${reqCurrency} but payment is in ${payCurrency}`
    );
  }
  
  // Also validate it's a supported currency
  if (!SUPPORTED_CURRENCIES[payCurrency]) {
    log.warn({ currency: payCurrency }, 'Refund for unsupported currency');
  }
}

/**
 * DRP-4 & DRP-9: Get refundable info with cumulative totals
 */
async function getRefundableInfo(
  paymentIntentId: string,
  tenantId: string
): Promise<RefundableInfo> {
  const db = DatabaseService.getPool();
  
  // Get payment details
  const paymentResult = await db.query(`
    SELECT pi.amount, pi.currency, pi.status, 
           o.ticket_count, o.promo_code, o.promo_discount
    FROM payment_intents pi
    JOIN orders o ON pi.order_id = o.id
    WHERE pi.stripe_intent_id = $1 AND o.tenant_id = $2
  `, [paymentIntentId, tenantId]);
  
  if (paymentResult.rows.length === 0) {
    throw new NotFoundError('Payment', paymentIntentId);
  }
  
  const payment = paymentResult.rows[0];
  
  // DRP-4: Get cumulative refunds already issued
  const refundsResult = await db.query(`
    SELECT COALESCE(SUM(amount), 0) as total_refunded,
           COUNT(*) as refund_count,
           COUNT(DISTINCT ticket_id) as tickets_refunded
    FROM payment_refunds
    WHERE transaction_id = $1 AND tenant_id = $2 AND status = 'succeeded'
  `, [paymentIntentId, tenantId]);
  
  const totalRefunded = parseInt(refundsResult.rows[0].total_refunded, 10);
  const ticketsRefunded = parseInt(refundsResult.rows[0].tickets_refunded, 10) || 0;
  
  // DRP-9: Calculate max refundable (original - already refunded)
  const originalAmount = payment.amount;
  
  // Calculate fees for the original amount
  const stripeFee = feeCalculationService.calculateStripeFee(originalAmount);
  const platformFee = feeCalculationService.calculatePlatformFee(originalAmount);
  
  // Max refundable is original minus already refunded
  // Note: We typically absorb Stripe fees on refunds
  const maxRefundable = originalAmount - totalRefunded;
  
  // Build promo code info if applicable
  let promoDiscount: PromoCodeDiscount | undefined;
  if (payment.promo_code && payment.promo_discount) {
    promoDiscount = {
      promoCode: payment.promo_code,
      discountAmount: payment.promo_discount,
      applicableAmount: originalAmount + payment.promo_discount, // Original before discount
    };
  }
  
  return {
    originalAmount,
    totalRefunded,
    maxRefundable,
    stripeFee,
    platformFee,
    ticketCount: payment.ticket_count || 1,
    ticketsRefunded,
    promoDiscount,
    currency: payment.currency || 'USD',
  };
}

/**
 * REF-10: Calculate refund amount for specific tickets
 */
async function calculateTicketRefundAmount(
  paymentIntentId: string,
  ticketIds: string[],
  tenantId: string
): Promise<{ amount: number; ticketDetails: TicketRefundInfo[] }> {
  const db = DatabaseService.getPool();
  
  // Get ticket prices from the order
  const ticketsResult = await db.query(`
    SELECT t.id, t.price, t.status, pr.id as refund_id
    FROM tickets t
    JOIN orders o ON t.order_id = o.id
    JOIN payment_intents pi ON pi.order_id = o.id
    LEFT JOIN payment_refunds pr ON pr.ticket_id = t.id AND pr.status = 'succeeded'
    WHERE pi.stripe_intent_id = $1 AND t.id = ANY($2) AND o.tenant_id = $3
  `, [paymentIntentId, ticketIds, tenantId]);
  
  if (ticketsResult.rows.length !== ticketIds.length) {
    const foundIds = ticketsResult.rows.map((r: any) => r.id);
    const missingIds = ticketIds.filter(id => !foundIds.includes(id));
    throw new BadRequestError(`Tickets not found: ${missingIds.join(', ')}`);
  }
  
  // Check for already refunded tickets
  const alreadyRefunded = ticketsResult.rows.filter((t: any) => t.refund_id);
  if (alreadyRefunded.length > 0) {
    throw new BadRequestError(
      `Tickets already refunded: ${alreadyRefunded.map((t: any) => t.id).join(', ')}`
    );
  }
  
  // Calculate total refund amount for these tickets
  const ticketDetails: TicketRefundInfo[] = ticketsResult.rows.map((t: any) => ({
    ticketId: t.id,
    amount: t.price,
  }));
  
  const totalAmount = ticketDetails.reduce((sum, t) => sum + t.amount, 0);
  
  return { amount: totalAmount, ticketDetails };
}

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

      // Check if Stripe is configured
      if (!stripe) {
        return sendProblemResponse(
          reply,
          new RefundFailedError('Payment provider not configured', 'STRIPE_NOT_CONFIGURED'),
          request.id
        );
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
        log.warn({
          paymentIntentId, 
          tenantId, 
          userId: user.id
        }, 'Refund attempt for unauthorized payment intent');
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

      let stripeRefund: Stripe.Refund;
      try {
        stripeRefund = await retryWithBackoff(
          () => stripe!.refunds.create({
            payment_intent: paymentIntentId,
            amount: amount,
            reason: (reason === 'other' ? 'requested_by_customer' : reason as any) || 'requested_by_customer',
          }, {
            idempotencyKey: idempotencyKey,
          }),
          {
            maxAttempts: 3,
            delayMs: 1000,
            operation: 'createRefund'
          }
        );

        log.info({
          refundId: stripeRefund.id,
          paymentIntentId,
          amount,
          status: stripeRefund.status
        }, 'Stripe refund created successfully');
      } catch (error: any) {
        log.error({
          error: error.message,
          paymentIntentId,
          amount,
          userId: user.id
        }, 'Failed to create Stripe refund');

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

        // Wrap and return Stripe error in RFC 7807 format
        const wrappedError = wrapStripeError(error);
        return sendProblemResponse(reply, wrappedError, request.id);
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
          `INSERT INTO payment_refunds (id, transaction_id, amount, status, reason, tenant_id, stripe_refund_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [
            stripeRefund.id,
            paymentIntentId,
            amount,
            stripeRefund.status,
            reason || 'requested_by_customer',
            tenantId,
            stripeRefund.id
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

        log.info({ 
          refundId: stripeRefund.id, 
          stripeRefundId: stripeRefund.id,
          tenantId, 
          userId: user.id,
          amount
        }, 'Refund processed successfully');

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

      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error({ error: errMsg }, 'Refund failed');
      return reply.code(500).send({ error: 'Refund failed' });
    }
  }

  /**
   * Get a refund by ID
   */
  async getRefund(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = (request as any).user;
      const tenantId = (request as any).tenantId;
      const { refundId } = request.params as { refundId: string };

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      if (!tenantId) {
        return reply.code(403).send({ error: 'Tenant context required' });
      }

      const db = DatabaseService.getPool();

      const result = await db.query(
        `SELECT r.*, pi.stripe_intent_id as payment_intent_id
         FROM payment_refunds r
         JOIN payment_intents pi ON r.transaction_id = pi.stripe_intent_id
         WHERE r.id = $1 AND r.tenant_id = $2`,
        [refundId, tenantId]
      );

      if (result.rows.length === 0) {
        return sendProblemResponse(
          reply,
          new NotFoundError('Refund', refundId),
          request.id
        );
      }

      const refund = result.rows[0];

      return reply.send({
        id: refund.id,
        paymentIntentId: refund.payment_intent_id,
        amount: refund.amount,
        status: refund.status,
        reason: refund.reason,
        createdAt: refund.created_at,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error({ error: errMsg }, 'Failed to get refund');
      return reply.code(500).send({ error: 'Failed to get refund' });
    }
  }

  /**
   * List refunds with filtering and pagination
   */
  async listRefunds(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = (request as any).user;
      const tenantId = (request as any).tenantId;
      const query = request.query as {
        paymentIntentId?: string;
        status?: string;
        limit?: number;
        offset?: number;
        createdAfter?: string;
        createdBefore?: string;
      };

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      if (!tenantId) {
        return reply.code(403).send({ error: 'Tenant context required' });
      }

      const db = DatabaseService.getPool();

      // Build query
      let sql = `
        SELECT r.*, pi.stripe_intent_id as payment_intent_id
        FROM payment_refunds r
        JOIN payment_intents pi ON r.transaction_id = pi.stripe_intent_id
        WHERE r.tenant_id = $1
      `;
      const params: any[] = [tenantId];
      let paramIndex = 2;

      if (query.paymentIntentId) {
        sql += ` AND pi.stripe_intent_id = $${paramIndex}`;
        params.push(query.paymentIntentId);
        paramIndex++;
      }

      if (query.status) {
        sql += ` AND r.status = $${paramIndex}`;
        params.push(query.status);
        paramIndex++;
      }

      if (query.createdAfter) {
        sql += ` AND r.created_at >= $${paramIndex}`;
        params.push(query.createdAfter);
        paramIndex++;
      }

      if (query.createdBefore) {
        sql += ` AND r.created_at <= $${paramIndex}`;
        params.push(query.createdBefore);
        paramIndex++;
      }

      // Get total count
      const countResult = await db.query(
        `SELECT COUNT(*) as total FROM (${sql}) as subq`,
        params
      );
      const total = parseInt(countResult.rows[0].total, 10);

      // Add pagination
      const limit = query.limit || 20;
      const offset = query.offset || 0;
      sql += ` ORDER BY r.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await db.query(sql, params);

      const refunds = result.rows.map(row => ({
        id: row.id,
        paymentIntentId: row.payment_intent_id,
        amount: row.amount,
        status: row.status,
        reason: row.reason,
        createdAt: row.created_at,
      }));

      return reply.send({
        refunds,
        total,
        limit,
        offset,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error({ error: errMsg }, 'Failed to list refunds');
      return reply.code(500).send({ error: 'Failed to list refunds' });
    }
  }

  // ===========================================================================
  // MEDIUM FIX: NEW ENDPOINTS
  // ===========================================================================

  /**
   * DRP-4 & DRP-9: Get refundable information for a payment
   * Shows cumulative refunds and max refundable amount
   */
  async getRefundableInfo(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = (request as any).user;
      const tenantId = (request as any).tenantId;
      const { paymentIntentId } = request.params as { paymentIntentId: string };

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      if (!tenantId) {
        return reply.code(403).send({ error: 'Tenant context required' });
      }

      const info = await getRefundableInfo(paymentIntentId, tenantId);

      return reply.send({
        paymentIntentId,
        originalAmount: info.originalAmount,
        totalRefunded: info.totalRefunded,
        maxRefundable: info.maxRefundable,
        stripeFee: info.stripeFee,
        platformFee: info.platformFee,
        ticketCount: info.ticketCount,
        ticketsRefunded: info.ticketsRefunded,
        currency: info.currency,
        promoDiscount: info.promoDiscount,
        isFullyRefunded: info.maxRefundable <= 0,
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        return sendProblemResponse(reply, error, request.id);
      }
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error({ error: errMsg }, 'Failed to get refundable info');
      return reply.code(500).send({ error: 'Failed to get refundable info' });
    }
  }

  /**
   * REF-10: Create partial refund for specific tickets
   */
  async createTicketRefund(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = (request as any).user;
      const tenantId = (request as any).tenantId;

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      if (!tenantId) {
        return reply.code(403).send({ error: 'Tenant context required' });
      }

      if (!stripe) {
        return sendProblemResponse(
          reply,
          new RefundFailedError('Payment provider not configured', 'STRIPE_NOT_CONFIGURED'),
          request.id
        );
      }

      const body = request.body as {
        paymentIntentId: string;
        ticketIds: string[];
        reason?: string;
        currency?: string;
      };

      const { paymentIntentId, ticketIds, reason, currency } = body;

      if (!ticketIds || ticketIds.length === 0) {
        return reply.code(400).send({ error: 'At least one ticket ID required' });
      }

      // DRP-4: Get refundable info first
      const refundableInfo = await getRefundableInfo(paymentIntentId, tenantId);

      // EDGE-4: Validate currency
      validateCurrency(currency, refundableInfo.currency);

      // REF-10: Calculate ticket-specific refund
      const { amount, ticketDetails } = await calculateTicketRefundAmount(
        paymentIntentId,
        ticketIds,
        tenantId
      );

      // DRP-9: Check max refundable
      if (amount > refundableInfo.maxRefundable) {
        return reply.code(400).send({
          error: 'Refund amount exceeds maximum refundable',
          requestedAmount: amount,
          maxRefundable: refundableInfo.maxRefundable,
        });
      }

      const db = DatabaseService.getPool();
      const idempotencyKey = (request as any).idempotencyKey || uuidv4();

      // Create Stripe refund
      let stripeRefund: Stripe.Refund;
      try {
        stripeRefund = await retryWithBackoff(
          () => stripe!.refunds.create({
            payment_intent: paymentIntentId,
            amount: amount,
            reason: (reason === 'other' ? 'requested_by_customer' : reason as any) || 'requested_by_customer',
            metadata: {
              ticket_ids: ticketIds.join(','),
              ticket_count: ticketIds.length.toString(),
            },
          }, {
            idempotencyKey: idempotencyKey,
          }),
          {
            maxAttempts: 3,
            delayMs: 1000,
            operation: 'createTicketRefund'
          }
        );
      } catch (error: any) {
        const wrappedError = wrapStripeError(error);
        return sendProblemResponse(reply, wrappedError, request.id);
      }

      // Store refund with ticket associations
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId]);

        // Insert main refund record
        await client.query(
          `INSERT INTO payment_refunds (
            id, transaction_id, amount, status, reason, tenant_id, 
            stripe_refund_id, ticket_ids, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [
            stripeRefund.id,
            paymentIntentId,
            amount,
            stripeRefund.status,
            reason || 'requested_by_customer',
            tenantId,
            stripeRefund.id,
            ticketIds,
          ]
        );

        // Insert per-ticket refund records
        for (const ticket of ticketDetails) {
          await client.query(
            `INSERT INTO ticket_refunds (
              id, refund_id, ticket_id, amount, tenant_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, NOW())`,
            [uuidv4(), stripeRefund.id, ticket.ticketId, ticket.amount, tenantId]
          );

          // Update ticket status
          await client.query(
            `UPDATE tickets SET status = 'refunded' WHERE id = $1`,
            [ticket.ticketId]
          );
        }

        // Check if all tickets are refunded, update payment status
        const remainingResult = await client.query(
          `SELECT COUNT(*) as remaining 
           FROM tickets t
           JOIN orders o ON t.order_id = o.id
           JOIN payment_intents pi ON pi.order_id = o.id
           WHERE pi.stripe_intent_id = $1 AND t.status != 'refunded'`,
          [paymentIntentId]
        );

        const remaining = parseInt(remainingResult.rows[0].remaining, 10);
        if (remaining === 0) {
          await client.query(
            `UPDATE payment_intents SET status = 'refunded' WHERE stripe_intent_id = $1`,
            [paymentIntentId]
          );
        } else {
          await client.query(
            `UPDATE payment_intents SET status = 'partially_refunded' WHERE stripe_intent_id = $1`,
            [paymentIntentId]
          );
        }

        await client.query('COMMIT');

        log.info({
          refundId: stripeRefund.id,
          paymentIntentId,
          amount,
          ticketCount: ticketIds.length,
          remainingTickets: remaining,
        }, 'Ticket refund processed');

        return reply.send({
          refundId: stripeRefund.id,
          status: stripeRefund.status,
          amount,
          ticketIds,
          ticketDetails,
          remainingTickets: remaining,
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      if (error instanceof BadRequestError) {
        return sendProblemResponse(reply, error, request.id);
      }
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error({ error: errMsg }, 'Ticket refund failed');
      return reply.code(500).send({ error: 'Ticket refund failed' });
    }
  }

  /**
   * REF-11: Get promo code adjustment for refund
   */
  async getPromoCodeAdjustment(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = (request as any).user;
      const tenantId = (request as any).tenantId;
      const { paymentIntentId } = request.params as { paymentIntentId: string };
      const { refundAmount } = request.query as { refundAmount?: number };

      if (!user) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      if (!tenantId) {
        return reply.code(403).send({ error: 'Tenant context required' });
      }

      const info = await getRefundableInfo(paymentIntentId, tenantId);

      if (!info.promoDiscount) {
        return reply.send({
          paymentIntentId,
          hasPromoCode: false,
          adjustment: 0,
          note: 'No promo code applied to this order',
        });
      }

      // Calculate proportional promo discount adjustment
      const requestedRefund = refundAmount || info.maxRefundable;
      const refundRatio = requestedRefund / info.originalAmount;
      const promoAdjustment = Math.round(info.promoDiscount.discountAmount * refundRatio);

      return reply.send({
        paymentIntentId,
        hasPromoCode: true,
        promoCode: info.promoDiscount.promoCode,
        originalDiscount: info.promoDiscount.discountAmount,
        promoAdjustment,
        refundRatio,
        note: 'Promo discount will be proportionally reduced on refund',
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error({ error: errMsg }, 'Failed to get promo code adjustment');
      return reply.code(500).send({ error: 'Failed to get promo code adjustment' });
    }
  }
}

export const refundController = new RefundController();

// Export helper functions for use in routes
export { getRefundableInfo, calculateTicketRefundAmount, validateCurrency };

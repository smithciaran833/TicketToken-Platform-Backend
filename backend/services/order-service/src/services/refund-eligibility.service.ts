import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { TicketClient } from './ticket.client';
import { PaymentClient } from './payment.client';
import { EventClient } from './event.client';
import { disputeService } from './dispute.service';
import { RequestContext, createRequestContext } from '@tickettoken/shared';

/**
 * CRITICAL: Refund eligibility service with transfer check
 * Prevents double spend vulnerability by checking ticket transfers before refund
 *
 * Key validations:
 * - Ticket has NOT been transferred (CRITICAL - prevents double spend)
 * - No active dispute on order
 * - Payment is refundable in Stripe
 * - Event status (cancelled/postponed/rescheduled) - HIGH
 * - Payout status (seller already paid out) - HIGH
 * - Currency validation - MEDIUM
 * - Event hasn't passed (configurable)
 * - Within refund policy window
 * - Policy version tracking - MEDIUM
 */

export interface RefundEligibilityResult {
  eligible: boolean;
  reason?: string;
  maxRefundAmountCents?: number;
  refundPercentage?: number;
  warnings?: string[];
  blockers?: string[];
  autoApprove?: boolean;
  requiresManualReview?: boolean;
  manualReviewReason?: string;
  // MEDIUM: Track policy version used for eligibility check
  policyVersion?: {
    policyId: string;
    policyName: string;
    ruleId?: string;
    checkedAt: string;
  };
  // MEDIUM: Currency info
  currency?: string;
}

interface PolicyResult {
  eligible: boolean;
  refundPercentage: number;
  reason?: string;
  policyId?: string;
  policyName?: string;
  ruleId?: string;
}

// MEDIUM: Supported currencies for refunds
const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

export class RefundEligibilityService {
  private db = getDatabase();
  private ticketClient = new TicketClient();
  private paymentClient = new PaymentClient();
  private eventClient = new EventClient();

  /**
   * CRITICAL: Check refund eligibility with all validations
   * This is the main entry point for refund validation
   */
  async checkEligibility(
    orderId: string,
    userId: string,
    context?: RequestContext,
    requestedCurrency?: string
  ): Promise<RefundEligibilityResult> {
    const blockers: string[] = [];
    const warnings: string[] = [];
    let autoApprove = false;
    let requiresManualReview = false;
    let manualReviewReason: string | undefined;
    let policyVersion: RefundEligibilityResult['policyVersion'];

    logger.info('Checking refund eligibility', { orderId, userId });

    // Get order details
    const order = await this.getOrder(orderId);
    if (!order) {
      return {
        eligible: false,
        reason: 'Order not found',
        blockers: ['ORDER_NOT_FOUND'],
      };
    }

    // Create proper context for S2S calls if not provided
    const ctx = context || createRequestContext(order.tenant_id, userId);

    // Verify user owns the order
    if (order.user_id !== userId) {
      return {
        eligible: false,
        reason: 'Order does not belong to this user',
        blockers: ['NOT_ORDER_OWNER'],
      };
    }

    // Check order status
    if (!['CONFIRMED', 'COMPLETED'].includes(order.status)) {
      return {
        eligible: false,
        reason: `Order status '${order.status}' is not eligible for refund`,
        blockers: ['INVALID_ORDER_STATUS'],
      };
    }

    // MEDIUM: Validate currency matches order currency
    const currencyCheck = this.validateCurrency(order.currency, requestedCurrency);
    if (!currencyCheck.valid) {
      return {
        eligible: false,
        reason: currencyCheck.reason,
        blockers: ['CURRENCY_MISMATCH'],
        currency: order.currency,
      };
    }

    // CRITICAL: Check for active dispute
    const hasDispute = await disputeService.hasActiveDispute(orderId);
    if (hasDispute) {
      blockers.push('ACTIVE_DISPUTE');
      return {
        eligible: false,
        reason: 'Order has an active dispute. Refunds are locked until dispute is resolved.',
        blockers,
        currency: order.currency,
      };
    }

    // CRITICAL: Check if tickets have been transferred (DOUBLE SPEND PREVENTION)
    const transferCheck = await this.checkTicketTransfers(orderId, order.user_id, ctx);
    if (!transferCheck.allValid) {
      blockers.push('TICKETS_TRANSFERRED');
      return {
        eligible: false,
        reason: `${transferCheck.transferredCount} ticket(s) have been transferred. Cannot refund transferred tickets.`,
        blockers,
        warnings: [`Transferred tickets: ${transferCheck.transferredTickets.join(', ')}`],
        currency: order.currency,
      };
    }

    // HIGH: Check event status (cancelled/postponed/rescheduled)
    const eventStatusCheck = await this.checkEventStatus(order.event_id, ctx);
    if (eventStatusCheck.autoApprove) {
      autoApprove = true;
      warnings.push(eventStatusCheck.reason || 'Event status allows auto-approval');
    }
    if (eventStatusCheck.bypassPolicy) {
      warnings.push(`Policy bypassed: ${eventStatusCheck.reason}`);
    }

    // HIGH: Check payout status (seller already paid out)
    const payoutCheck = await this.checkPayoutStatus(orderId, order.stripe_payment_intent_id, ctx);
    if (payoutCheck.payoutCompleted) {
      requiresManualReview = true;
      manualReviewReason = `Seller payout already completed (${payoutCheck.payoutAmountCents} cents). Manual review required.`;
      warnings.push(manualReviewReason);
    }

    // Check payment status is refundable
    if (order.stripe_payment_intent_id) {
      const paymentCheck = await this.checkPaymentRefundable(
        order.stripe_payment_intent_id,
        ctx
      );
      if (!paymentCheck.refundable) {
        blockers.push('PAYMENT_NOT_REFUNDABLE');
        return {
          eligible: false,
          reason: paymentCheck.reason || 'Payment is not refundable',
          blockers,
          currency: order.currency,
        };
      }
      if (paymentCheck.hasDispute) {
        blockers.push('PAYMENT_HAS_DISPUTE');
        return {
          eligible: false,
          reason: 'Payment has a dispute in Stripe',
          blockers,
          currency: order.currency,
        };
      }
    }

    // Check event date (optional - configurable)
    const eventCheck = await this.checkEventDate(orderId);
    if (eventCheck.eventPassed) {
      warnings.push('Event has already occurred');
      // May still be eligible depending on policy
    }

    // Check refund policy (skip if event status bypasses policy)
    let policyResult: PolicyResult = { eligible: true, refundPercentage: 100 };
    if (!eventStatusCheck.bypassPolicy) {
      policyResult = await this.applyRefundPolicy(orderId, order);

      if (!policyResult.eligible) {
        return {
          eligible: false,
          reason: policyResult.reason,
          blockers: ['POLICY_RESTRICTION'],
          warnings,
          currency: order.currency,
          policyVersion: policyResult.policyId ? {
            policyId: policyResult.policyId,
            policyName: policyResult.policyName || 'Unknown',
            ruleId: policyResult.ruleId,
            checkedAt: new Date().toISOString(),
          } : undefined,
        };
      }
    }

    // MEDIUM: Track policy version used
    if (policyResult.policyId) {
      policyVersion = {
        policyId: policyResult.policyId,
        policyName: policyResult.policyName || 'Unknown',
        ruleId: policyResult.ruleId,
        checkedAt: new Date().toISOString(),
      };
    }

    // Calculate max refund amount
    const maxRefundCents = this.calculateMaxRefund(
      order.total_amount_cents,
      order.refunded_amount_cents || 0,
      policyResult.refundPercentage
    );

    if (maxRefundCents <= 0) {
      return {
        eligible: false,
        reason: 'No refundable amount remaining',
        blockers: ['NO_REFUNDABLE_AMOUNT'],
        warnings,
        currency: order.currency,
        policyVersion,
      };
    }

    logger.info('Refund eligibility check passed', {
      orderId,
      maxRefundCents,
      refundPercentage: policyResult.refundPercentage,
      autoApprove,
      requiresManualReview,
      policyVersion,
    });

    return {
      eligible: true,
      maxRefundAmountCents: maxRefundCents,
      refundPercentage: policyResult.refundPercentage,
      warnings: warnings.length > 0 ? warnings : undefined,
      autoApprove,
      requiresManualReview,
      manualReviewReason,
      currency: order.currency,
      policyVersion,
    };
  }

  /**
   * MEDIUM: Validate currency for refund request
   * Ensures refund currency matches order currency and is supported
   */
  private validateCurrency(
    orderCurrency: string,
    requestedCurrency?: string
  ): { valid: boolean; reason?: string } {
    // Check if order currency is supported
    if (!SUPPORTED_CURRENCIES.includes(orderCurrency.toUpperCase())) {
      return {
        valid: false,
        reason: `Order currency '${orderCurrency}' is not supported for refunds. Supported: ${SUPPORTED_CURRENCIES.join(', ')}`,
      };
    }

    // If a specific currency was requested, it must match order currency
    if (requestedCurrency && requestedCurrency.toUpperCase() !== orderCurrency.toUpperCase()) {
      return {
        valid: false,
        reason: `Requested currency '${requestedCurrency}' does not match order currency '${orderCurrency}'`,
      };
    }

    return { valid: true };
  }

  /**
   * HIGH: Check event status for refund eligibility
   * Handles cancelled, postponed, and rescheduled events
   */
  private async checkEventStatus(
    eventId: string,
    context?: RequestContext
  ): Promise<{
    eligible: boolean;
    autoApprove: boolean;
    bypassPolicy: boolean;
    reason?: string;
  }> {
    try {
      const status = await this.eventClient.getEventStatus(eventId, context);

      // Cancelled event - auto-approve refund, bypass policy
      if (status.isCancelled) {
        logger.info('Event cancelled - auto-approving refund', { eventId });
        return {
          eligible: true,
          autoApprove: true,
          bypassPolicy: true,
          reason: 'Event has been cancelled',
        };
      }

      // Postponed event - allow refund regardless of policy window
      if (status.isPostponed) {
        logger.info('Event postponed - bypassing refund policy', { eventId });
        return {
          eligible: true,
          autoApprove: false,
          bypassPolicy: true,
          reason: 'Event has been postponed',
        };
      }

      // Rescheduled event - allow refund if user doesn't accept new date
      if (status.isRescheduled) {
        logger.info('Event rescheduled - bypassing refund policy', {
          eventId,
          originalDate: status.originalDate,
          newDate: status.newDate,
        });
        return {
          eligible: true,
          autoApprove: false,
          bypassPolicy: true,
          reason: `Event rescheduled from ${status.originalDate} to ${status.newDate}`,
        };
      }

      // Normal event - apply standard policy
      return {
        eligible: true,
        autoApprove: false,
        bypassPolicy: false,
      };
    } catch (error) {
      logger.error('Failed to check event status', { error, eventId });
      // Don't block refund if we can't check status, but don't bypass policy either
      return {
        eligible: true,
        autoApprove: false,
        bypassPolicy: false,
      };
    }
  }

  /**
   * HIGH: Check if seller has already been paid out
   * If payout completed, requires manual review for refund
   */
  private async checkPayoutStatus(
    orderId: string,
    paymentIntentId: string | null,
    context?: RequestContext
  ): Promise<{
    payoutCompleted: boolean;
    payoutAmountCents?: number;
    payoutDate?: Date;
  }> {
    try {
      // Check order-level payout tracking
      const result = await this.db.query(
        `SELECT payout_completed, payout_amount_cents, payout_completed_at
         FROM orders
         WHERE id = $1`,
        [orderId]
      );

      if (result.rows.length > 0 && result.rows[0].payout_completed) {
        logger.warn('Seller payout already completed - manual review required', {
          orderId,
          payoutAmountCents: result.rows[0].payout_amount_cents,
          payoutDate: result.rows[0].payout_completed_at,
        });
        return {
          payoutCompleted: true,
          payoutAmountCents: result.rows[0].payout_amount_cents,
          payoutDate: result.rows[0].payout_completed_at,
        };
      }

      // If we have a payment intent, also check with payment service
      if (paymentIntentId) {
        try {
          const paymentStatus = await this.paymentClient.getPaymentStatus(paymentIntentId, context);
          // Check if payment service indicates payout completed
          if ((paymentStatus as any).payoutCompleted) {
            return {
              payoutCompleted: true,
              payoutAmountCents: (paymentStatus as any).payoutAmountCents,
            };
          }
        } catch (paymentError) {
          // Log but don't fail - local DB check is sufficient
          logger.debug('Could not check payout status with payment service', { paymentError });
        }
      }

      return { payoutCompleted: false };
    } catch (error) {
      logger.error('Failed to check payout status', { error, orderId });
      // Fail open - don't block refund if we can't check
      return { payoutCompleted: false };
    }
  }

  /**
   * CRITICAL: Check if any tickets have been transferred
   * This prevents double spend where user transfers ticket then requests refund
   */
  private async checkTicketTransfers(
    orderId: string,
    originalBuyerId: string,
    context?: RequestContext
  ): Promise<{ allValid: boolean; transferredCount: number; transferredTickets: string[] }> {
    try {
      const result = await this.ticketClient.checkOrderTicketsNotTransferred(
        orderId,
        originalBuyerId,
        context
      );

      if (!result.allValid) {
        logger.warn('REFUND BLOCKED: Tickets have been transferred', {
          orderId,
          originalBuyerId,
          transferredCount: result.transferredTickets.length,
        });
      }

      return {
        allValid: result.allValid,
        transferredCount: result.transferredTickets.length,
        transferredTickets: result.transferredTickets,
      };
    } catch (error) {
      logger.error('Failed to check ticket transfers', { error, orderId });
      // Fail closed - if we can't verify, don't allow refund
      return {
        allValid: false,
        transferredCount: -1,
        transferredTickets: ['VERIFICATION_FAILED'],
      };
    }
  }

  /**
   * Check if payment is refundable in Stripe
   */
  private async checkPaymentRefundable(
    paymentIntentId: string,
    context?: RequestContext
  ): Promise<{ refundable: boolean; hasDispute: boolean; reason?: string }> {
    try {
      const status = await this.paymentClient.getPaymentStatus(paymentIntentId, context);

      return {
        refundable: status.refundable,
        hasDispute: status.hasDispute,
        reason: status.refundable ? undefined : `Payment status: ${status.status}`,
      };
    } catch (error) {
      logger.error('Failed to check payment status', { error, paymentIntentId });
      // Fail closed - if we can't verify, don't allow refund
      return {
        refundable: false,
        hasDispute: false,
        reason: 'Unable to verify payment status',
      };
    }
  }

  /**
   * Check event date for refund eligibility
   */
  private async checkEventDate(orderId: string): Promise<{ eventPassed: boolean; eventDate?: Date }> {
    const result = await this.db.query(
      `SELECT MIN(oi.event_date) as event_date
       FROM order_items oi
       WHERE oi.order_id = $1`,
      [orderId]
    );

    if (result.rows.length === 0 || !result.rows[0].event_date) {
      return { eventPassed: false };
    }

    const eventDate = new Date(result.rows[0].event_date);
    return {
      eventPassed: eventDate < new Date(),
      eventDate,
    };
  }

  /**
   * Apply refund policy to determine eligibility and percentage
   * MEDIUM: Now tracks policy version for audit
   */
  private async applyRefundPolicy(
    orderId: string,
    order: any
  ): Promise<PolicyResult> {
    // Get applicable refund policy
    const policyResult = await this.db.query(
      `SELECT rp.id as policy_id, rp.policy_name, rpr.id as rule_id, rp.*, rpr.*
       FROM refund_policies rp
       LEFT JOIN refund_policy_rules rpr ON rpr.policy_id = rp.id AND rpr.is_active = true
       WHERE rp.is_active = true
       AND (rp.tenant_id = $1 OR rp.is_default = true)
       ORDER BY rp.is_default ASC, rpr.priority DESC
       LIMIT 10`,
      [order.tenant_id]
    );

    if (policyResult.rows.length === 0) {
      // No policy - default to 100% refund
      return { eligible: true, refundPercentage: 100 };
    }

    // Get event date for time-based calculations
    const eventResult = await this.db.query(
      `SELECT MIN(event_date) as event_date FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    const eventDate = eventResult.rows[0]?.event_date ? new Date(eventResult.rows[0].event_date) : null;

    // Calculate hours until event
    const hoursUntilEvent = eventDate
      ? (eventDate.getTime() - Date.now()) / (1000 * 60 * 60)
      : Infinity;

    // Find applicable rule
    for (const rule of policyResult.rows) {
      if (rule.condition_type === 'HOURS_BEFORE_EVENT') {
        if (hoursUntilEvent >= (rule.condition_value || 0)) {
          return {
            eligible: true,
            refundPercentage: rule.refund_percentage || 100,
            policyId: rule.policy_id,
            policyName: rule.policy_name,
            ruleId: rule.rule_id,
          };
        }
      } else if (rule.condition_type === 'DAYS_BEFORE_EVENT') {
        const daysUntilEvent = hoursUntilEvent / 24;
        if (daysUntilEvent >= (rule.condition_value || 0)) {
          return {
            eligible: true,
            refundPercentage: rule.refund_percentage || 100,
            policyId: rule.policy_id,
            policyName: rule.policy_name,
            ruleId: rule.rule_id,
          };
        }
      } else if (rule.condition_type === 'ALWAYS') {
        return {
          eligible: true,
          refundPercentage: rule.refund_percentage || 100,
          policyId: rule.policy_id,
          policyName: rule.policy_name,
          ruleId: rule.rule_id,
        };
      }
    }

    // No applicable rule found - return first policy info for tracking
    const firstPolicy = policyResult.rows[0];
    return {
      eligible: false,
      refundPercentage: 0,
      reason: 'Order is outside the refund policy window',
      policyId: firstPolicy?.policy_id,
      policyName: firstPolicy?.policy_name,
    };
  }

  /**
   * Calculate maximum refund amount
   */
  private calculateMaxRefund(
    totalAmountCents: number,
    refundedAmountCents: number,
    refundPercentage: number
  ): number {
    const eligibleAmount = Math.floor(totalAmountCents * (refundPercentage / 100));
    const remainingAmount = totalAmountCents - refundedAmountCents;
    return Math.min(eligibleAmount, remainingAmount);
  }

  /**
   * Get order details
   */
  private async getOrder(orderId: string): Promise<any> {
    const result = await this.db.query(
      `SELECT * FROM orders WHERE id = $1`,
      [orderId]
    );
    return result.rows[0] || null;
  }

  /**
   * Validate partial refund request
   * Ensures specified items haven't been transferred
   */
  async validatePartialRefund(
    orderId: string,
    userId: string,
    itemIds: string[],
    context?: RequestContext
  ): Promise<RefundEligibilityResult> {
    // First check general eligibility
    const eligibility = await this.checkEligibility(orderId, userId, context);
    if (!eligibility.eligible) {
      return eligibility;
    }

    // For partial refund, check specific items
    const blockers: string[] = [];
    const warnings: string[] = [];

    // Get tickets for specific items
    for (const itemId of itemIds) {
      // This would need ticket-to-item mapping
      // For now, the general transfer check covers this
    }

    // Calculate partial refund amount
    const itemsResult = await this.db.query(
      `SELECT SUM(unit_price_cents * quantity) as total_cents
       FROM order_items
       WHERE order_id = $1 AND id = ANY($2)`,
      [orderId, itemIds]
    );

    const itemsTotalCents = itemsResult.rows[0]?.total_cents || 0;
    const maxPartialRefund = Math.min(
      itemsTotalCents,
      eligibility.maxRefundAmountCents || 0
    );

    return {
      eligible: true,
      maxRefundAmountCents: maxPartialRefund,
      refundPercentage: eligibility.refundPercentage,
      warnings: eligibility.warnings,
      autoApprove: eligibility.autoApprove,
      requiresManualReview: eligibility.requiresManualReview,
      manualReviewReason: eligibility.manualReviewReason,
      currency: eligibility.currency,
      policyVersion: eligibility.policyVersion,
    };
  }
}

export const refundEligibilityService = new RefundEligibilityService();

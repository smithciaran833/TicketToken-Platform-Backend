/**
 * Refund Service for Marketplace Service
 * 
 * Issues Fixed:
 * - REF-1: No dedicated refund service → Centralized refund logic
 * - REF-2: No event cancellation refunds → Bulk refund for cancelled events
 * - REF-3: No refund audit trail → Complete refund logging
 * 
 * Features:
 * - Individual transfer refunds
 * - Bulk event cancellation refunds
 * - Refund reason tracking
 * - Full audit trail
 * - Integration with payment service
 */

import knex from '../config/database';
import { logger } from '../utils/logger';
import { getCurrentRequestId } from '../middleware/request-id';
import { withCircuitBreakerAndRetry } from '../utils/circuit-breaker';
import { buildInternalHeaders } from '../middleware/internal-auth';
import { BusinessMetrics } from '../utils/metrics';
import { ExternalServiceError, ValidationError } from '../errors';

const log = logger.child({ component: 'RefundService' });

// Configuration
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3007';
const REFUND_BATCH_SIZE = parseInt(process.env.REFUND_BATCH_SIZE || '50', 10);

// Refund statuses
export enum RefundStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PARTIAL = 'partial'
}

// Refund reasons
export enum RefundReason {
  EVENT_CANCELLED = 'event_cancelled',
  BUYER_REQUEST = 'buyer_request',
  SELLER_REQUEST = 'seller_request',
  DISPUTE_RESOLUTION = 'dispute_resolution',
  DUPLICATE_CHARGE = 'duplicate_charge',
  FRAUD = 'fraud',
  ADMIN_ACTION = 'admin_action',
  OTHER = 'other'
}

interface RefundRequest {
  transferId: string;
  reason: RefundReason;
  reasonDetails?: string;
  amount?: number; // For partial refunds, null = full refund
  initiatedBy: string; // userId or 'system'
  requestId?: string;
}

interface RefundResult {
  success: boolean;
  refundId?: string;
  status: RefundStatus;
  amount: number;
  error?: string;
}

interface BulkRefundResult {
  success: boolean;
  totalRequested: number;
  totalProcessed: number;
  totalFailed: number;
  totalAmount: number;
  errors: { transferId: string; error: string }[];
}

/**
 * AUDIT FIX REF-1: Individual transfer refund
 */
export async function processRefund(request: RefundRequest): Promise<RefundResult> {
  const requestId = request.requestId || getCurrentRequestId() || `refund-${Date.now()}`;
  
  log.info('Processing refund request', {
    transferId: request.transferId,
    reason: request.reason,
    requestId
  });

  try {
    // Get transfer details
    const transfer = await knex('transfers')
      .where('id', request.transferId)
      .first();

    if (!transfer) {
      throw new ValidationError(`Transfer ${request.transferId} not found`);
    }

    if (transfer.status === 'refunded') {
      throw new ValidationError(`Transfer ${request.transferId} already refunded`);
    }

    if (transfer.status !== 'completed') {
      throw new ValidationError(`Cannot refund transfer in status: ${transfer.status}`);
    }

    // Calculate refund amount
    const refundAmount = request.amount || transfer.total_amount;

    if (request.amount && request.amount > transfer.total_amount) {
      throw new ValidationError(`Refund amount ${request.amount} exceeds transfer total ${transfer.total_amount}`);
    }

    // Create refund record
    const refundId = require('crypto').randomUUID();
    
    await knex.transaction(async (trx) => {
      // Insert refund record
      await trx('refunds').insert({
        id: refundId,
        transfer_id: request.transferId,
        listing_id: transfer.listing_id,
        buyer_id: transfer.buyer_id,
        seller_id: transfer.seller_id,
        original_amount: transfer.total_amount,
        refund_amount: refundAmount,
        reason: request.reason,
        reason_details: request.reasonDetails,
        initiated_by: request.initiatedBy,
        status: RefundStatus.PROCESSING,
        created_at: new Date(),
        updated_at: new Date()
      });

      // Create audit log
      await createRefundAuditLog(trx, {
        refundId,
        transferId: request.transferId,
        action: 'refund_initiated',
        oldStatus: transfer.status,
        newStatus: 'processing',
        amount: refundAmount,
        reason: request.reason,
        initiatedBy: request.initiatedBy,
        requestId
      });
    });

    // Call payment service to process refund
    let paymentRefundResult;
    try {
      paymentRefundResult = await processPaymentRefund(
        transfer.stripe_payment_intent_id,
        refundAmount,
        request.reason,
        requestId
      );
    } catch (error: any) {
      // Mark refund as failed
      await knex('refunds')
        .where('id', refundId)
        .update({
          status: RefundStatus.FAILED,
          error_message: error.message,
          updated_at: new Date()
        });

      await createRefundAuditLog(knex, {
        refundId,
        transferId: request.transferId,
        action: 'refund_failed',
        error: error.message,
        requestId
      });

      throw error;
    }

    // Update refund and transfer status
    await knex.transaction(async (trx) => {
      await trx('refunds')
        .where('id', refundId)
        .update({
          status: RefundStatus.COMPLETED,
          stripe_refund_id: paymentRefundResult.stripeRefundId,
          completed_at: new Date(),
          updated_at: new Date()
        });

      // Update transfer status
      const newStatus = refundAmount >= transfer.total_amount ? 'refunded' : 'partially_refunded';
      await trx('transfers')
        .where('id', request.transferId)
        .update({
          status: newStatus,
          refund_amount: knex.raw('COALESCE(refund_amount, 0) + ?', [refundAmount]),
          updated_at: new Date()
        });

      await createRefundAuditLog(trx, {
        refundId,
        transferId: request.transferId,
        action: 'refund_completed',
        oldStatus: 'processing',
        newStatus: RefundStatus.COMPLETED,
        amount: refundAmount,
        stripeRefundId: paymentRefundResult.stripeRefundId,
        requestId
      });
    });

    log.info('Refund completed successfully', {
      refundId,
      transferId: request.transferId,
      amount: refundAmount,
      requestId
    });

    return {
      success: true,
      refundId,
      status: RefundStatus.COMPLETED,
      amount: refundAmount
    };
  } catch (error: any) {
    log.error('Refund failed', {
      transferId: request.transferId,
      error: error.message,
      requestId
    });

    return {
      success: false,
      status: RefundStatus.FAILED,
      amount: 0,
      error: error.message
    };
  }
}

/**
 * AUDIT FIX REF-2: Bulk refund for event cancellation
 */
export async function processEventCancellationRefunds(
  eventId: string,
  initiatedBy: string,
  reasonDetails?: string
): Promise<BulkRefundResult> {
  const requestId = getCurrentRequestId() || `bulk-refund-${Date.now()}`;
  
  log.info('Processing bulk refunds for cancelled event', {
    eventId,
    initiatedBy,
    requestId
  });

  const errors: { transferId: string; error: string }[] = [];
  let totalProcessed = 0;
  let totalFailed = 0;
  let totalAmount = 0;

  try {
    // Get all completed transfers for this event that haven't been refunded
    const transfers = await knex('transfers')
      .select('transfers.*')
      .join('listings', 'transfers.listing_id', 'listings.id')
      .where('listings.event_id', eventId)
      .where('transfers.status', 'completed')
      .whereNull('transfers.refund_amount')
      .orderBy('transfers.created_at', 'asc');

    const totalRequested = transfers.length;

    log.info('Found transfers to refund', {
      eventId,
      count: totalRequested,
      requestId
    });

    // Process in batches
    for (let i = 0; i < transfers.length; i += REFUND_BATCH_SIZE) {
      const batch = transfers.slice(i, i + REFUND_BATCH_SIZE);
      
      // Process batch sequentially to avoid overwhelming payment service
      for (const transfer of batch) {
        const result = await processRefund({
          transferId: transfer.id,
          reason: RefundReason.EVENT_CANCELLED,
          reasonDetails: reasonDetails || `Event ${eventId} cancelled`,
          initiatedBy,
          requestId
        });

        if (result.success) {
          totalProcessed++;
          totalAmount += result.amount;
        } else {
          totalFailed++;
          errors.push({
            transferId: transfer.id,
            error: result.error || 'Unknown error'
          });
        }
      }

      // Log batch progress
      log.info('Batch refund progress', {
        eventId,
        processed: totalProcessed,
        failed: totalFailed,
        remaining: totalRequested - (totalProcessed + totalFailed),
        requestId
      });
    }

    // Create summary audit log
    await createRefundAuditLog(knex, {
      action: 'bulk_refund_completed',
      eventId,
      totalRequested,
      totalProcessed,
      totalFailed,
      totalAmount,
      initiatedBy,
      requestId
    });

    log.info('Bulk refund completed', {
      eventId,
      totalRequested,
      totalProcessed,
      totalFailed,
      totalAmount,
      requestId
    });

    return {
      success: totalFailed === 0,
      totalRequested,
      totalProcessed,
      totalFailed,
      totalAmount,
      errors
    };
  } catch (error: any) {
    log.error('Bulk refund failed', {
      eventId,
      error: error.message,
      requestId
    });

    throw error;
  }
}

/**
 * Get refund history for a transfer
 */
export async function getRefundHistory(transferId: string): Promise<any[]> {
  return knex('refunds')
    .where('transfer_id', transferId)
    .orderBy('created_at', 'desc');
}

/**
 * Get all refunds for a user (buyer or seller)
 */
export async function getUserRefunds(
  userId: string,
  role: 'buyer' | 'seller',
  options: { page?: number; limit?: number } = {}
): Promise<{ refunds: any[]; total: number }> {
  const { page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  const column = role === 'buyer' ? 'buyer_id' : 'seller_id';

  const [refunds, countResult] = await Promise.all([
    knex('refunds')
      .where(column, userId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset),
    knex('refunds')
      .where(column, userId)
      .count('* as count')
      .first()
  ]);

  return {
    refunds,
    total: parseInt(countResult?.count?.toString() || '0', 10)
  };
}

/**
 * Call payment service to process refund
 */
async function processPaymentRefund(
  paymentIntentId: string,
  amount: number,
  reason: string,
  requestId: string
): Promise<{ stripeRefundId: string }> {
  return withCircuitBreakerAndRetry(
    'payment-service',
    async () => {
      const body = JSON.stringify({
        paymentIntentId,
        amount,
        reason,
        metadata: { requestId }
      });

      const headers = buildInternalHeaders(JSON.parse(body), requestId);
      
      const response = await fetch(`${PAYMENT_SERVICE_URL}/internal/refunds`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ExternalServiceError(
          'Payment Service',
          errorData.message || `HTTP ${response.status}`,
          undefined,
          { statusCode: response.status }
        );
      }

      const data = await response.json();
      return { stripeRefundId: data.refundId };
    },
    { failureThreshold: 3, timeout: 60000 },
    { maxRetries: 2, initialDelayMs: 1000 }
  );
}

/**
 * AUDIT FIX REF-3: Create refund audit log entry
 */
async function createRefundAuditLog(
  trxOrKnex: any,
  data: {
    refundId?: string;
    transferId?: string;
    eventId?: string;
    action: string;
    oldStatus?: string;
    newStatus?: string;
    amount?: number;
    stripeRefundId?: string;
    reason?: string;
    error?: string;
    initiatedBy?: string;
    totalRequested?: number;
    totalProcessed?: number;
    totalFailed?: number;
    totalAmount?: number;
    requestId?: string;
  }
): Promise<void> {
  try {
    await trxOrKnex('refund_audit_log').insert({
      id: require('crypto').randomUUID(),
      refund_id: data.refundId,
      transfer_id: data.transferId,
      event_id: data.eventId,
      action: data.action,
      old_status: data.oldStatus,
      new_status: data.newStatus,
      amount: data.amount,
      stripe_refund_id: data.stripeRefundId,
      reason: data.reason,
      error: data.error,
      initiated_by: data.initiatedBy,
      metadata: JSON.stringify({
        totalRequested: data.totalRequested,
        totalProcessed: data.totalProcessed,
        totalFailed: data.totalFailed,
        totalAmount: data.totalAmount
      }),
      request_id: data.requestId,
      created_at: new Date()
    });
  } catch (err: any) {
    // Don't fail the main operation if audit logging fails
    log.warn('Failed to create refund audit log', { 
      error: err.message, 
      data: { ...data, action: data.action }
    });
  }
}

// Export service
export const refundService = {
  processRefund,
  processEventCancellationRefunds,
  getRefundHistory,
  getUserRefunds
};

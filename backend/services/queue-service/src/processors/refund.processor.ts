import { BullJobData } from '../adapters/bull-job-adapter';
import { stripeService, RefundData, RefundResult } from '../services/stripe.service';
import { emailService } from '../services/email.service';
import { webhookService } from '../services/webhook.service';
import { logger } from '../utils/logger';

/**
 * Refund Processor
 * Handles async refund processing jobs for Stripe transactions
 */

export interface RefundJobData extends RefundData {
  orderId?: string;
  userId?: string;
  tenantId?: string;
  refundReason?: string;
}

export interface RefundJobResult extends RefundResult {
  orderId?: string;
  userId?: string;
  processingTime: number;
}

/**
 * Process refund job
 * Creates a Stripe refund and handles the result
 */
export async function processRefund(job: BullJobData<RefundJobData>): Promise<RefundJobResult> {
  const startTime = Date.now();
  const { orderId, userId, tenantId, refundReason, ...refundData } = job.data;

  logger.info('Processing refund job', {
    jobId: job.id,
    orderId,
    userId,
    tenantId,
    paymentIntentId: refundData.paymentIntentId,
    amount: refundData.amount,
    reason: refundData.reason,
    attempt: (job.attemptsMade || 0) + 1,
  });

  try {
    // Create refund via Stripe
    const result = await stripeService.createRefund(refundData);

    const processingTime = Date.now() - startTime;

    if (result.success) {
      logger.info('Refund processed successfully', {
        jobId: job.id,
        orderId,
        refundId: result.refundId,
        status: result.status,
        amount: result.amount,
        processingTime,
      });

      // Update job progress
      await job.progress?.(100);

      return {
        ...result,
        orderId,
        userId,
        processingTime,
      };
    } else {
      logger.error('Refund processing failed', {
        jobId: job.id,
        orderId,
        error: result.error,
        processingTime,
      });

      // Throw error to trigger retry
      throw new Error(result.error || 'Refund processing failed');
    }
  } catch (error: any) {
    const processingTime = Date.now() - startTime;

    logger.error('Refund job failed', {
      jobId: job.id,
      orderId,
      userId,
      error: error.message,
      attempt: (job.attemptsMade || 0) + 1,
      processingTime,
    });

    // Re-throw to let Bull handle retries
    throw error;
  }
}

/**
 * Handle refund job failure
 * Called when all retry attempts have been exhausted
 */
export async function onRefundFailed(job: BullJobData<RefundJobData>, error: Error): Promise<void> {
  const { orderId, userId, tenantId, paymentIntentId } = job.data;

  logger.error('Refund job failed permanently', {
    jobId: job.id,
    orderId,
    userId,
    tenantId,
    paymentIntentId,
    error: error.message,
    attempts: job.attemptsMade,
  });

  // Send admin alert
  await emailService.sendAdminAlert(
    'Refund Processing Failed',
    `Refund failed after ${job.attemptsMade} attempts`,
    {
      jobId: job.id,
      orderId,
      userId,
      tenantId,
      paymentIntentId,
      error: error.message,
      attempts: job.attemptsMade,
    }
  );

  // Send failure webhook
  await webhookService.sendOperationFailed({
    operation: 'refund',
    orderId,
    userId,
    error: error.message,
  });
}

/**
 * Handle refund job completion
 */
export async function onRefundCompleted(job: BullJobData<RefundJobData>, result: RefundJobResult): Promise<void> {
  const { orderId, userId, tenantId } = job.data;

  logger.info('Refund job completed', {
    jobId: job.id,
    orderId,
    userId,
    tenantId,
    refundId: result.refundId,
    status: result.status,
    amount: result.amount,
    processingTime: result.processingTime,
  });

  // Send refund confirmation email (if user data available)
  if (job.data.metadata?.userEmail && job.data.metadata?.userName) {
    await emailService.sendRefundConfirmation({
      recipientEmail: job.data.metadata.userEmail,
      recipientName: job.data.metadata.userName,
      orderId: orderId || 'N/A',
      amount: result.amount,
      currency: result.currency,
      refundId: result.refundId,
      reason: job.data.metadata?.refundReason,
    });
  }

  // Send webhook notification
  await webhookService.sendRefundCompleted({
    orderId: orderId || '',
    userId: userId || '',
    amount: result.amount,
    currency: result.currency,
    refundId: result.refundId,
    webhookUrl: job.data.metadata?.webhookUrl,
  });
}

/**
 * Handle refund job progress
 */
export async function onRefundProgress(job: BullJobData<RefundJobData>, progress: number): Promise<void> {
  logger.debug('Refund job progress', {
    jobId: job.id,
    orderId: job.data.orderId,
    progress,
  });
}

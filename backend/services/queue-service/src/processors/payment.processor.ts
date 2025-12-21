import { BullJobData } from '../adapters/bull-job-adapter';
import { stripeService, PaymentIntentData, PaymentResult } from '../services/stripe.service';
import { emailService } from '../services/email.service';
import { webhookService } from '../services/webhook.service';
import { logger } from '../utils/logger';

/**
 * Payment Processor
 * Handles async payment processing jobs for Stripe transactions
 */

export interface PaymentJobData extends PaymentIntentData {
  orderId?: string;
  userId?: string;
  tenantId?: string;
  retryCount?: number;
}

export interface PaymentJobResult extends PaymentResult {
  orderId?: string;
  userId?: string;
  processingTime: number;
}

/**
 * Process payment job
 * Creates a Stripe payment intent and handles the result
 */
export async function processPayment(job: BullJobData<PaymentJobData>): Promise<PaymentJobResult> {
  const startTime = Date.now();
  const { orderId, userId, tenantId, retryCount = 0, ...paymentData } = job.data;

  logger.info('Processing payment job', {
    jobId: job.id,
    orderId,
    userId,
    tenantId,
    amount: paymentData.amount,
    attempt: (job.attemptsMade || 0) + 1,
  });

  try {
    // Create payment intent via Stripe
    const result = await stripeService.createPaymentIntent(paymentData);

    const processingTime = Date.now() - startTime;

    if (result.success) {
      logger.info('Payment processed successfully', {
        jobId: job.id,
        orderId,
        paymentIntentId: result.paymentIntentId,
        status: result.status,
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
      logger.error('Payment processing failed', {
        jobId: job.id,
        orderId,
        error: result.error,
        processingTime,
      });

      // Throw error to trigger retry
      throw new Error(result.error || 'Payment processing failed');
    }
  } catch (error: any) {
    const processingTime = Date.now() - startTime;

    logger.error('Payment job failed', {
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
 * Handle payment job failure
 * Called when all retry attempts have been exhausted
 */
export async function onPaymentFailed(job: BullJobData<PaymentJobData>, error: Error): Promise<void> {
  const { orderId, userId, tenantId } = job.data;

  logger.error('Payment job failed permanently', {
    jobId: job.id,
    orderId,
    userId,
    tenantId,
    error: error.message,
    attempts: job.attemptsMade,
  });

  // Send admin alert
  await emailService.sendAdminAlert(
    'Payment Processing Failed',
    `Payment failed after ${job.attemptsMade} attempts`,
    {
      jobId: job.id,
      orderId,
      userId,
      tenantId,
      error: error.message,
      attempts: job.attemptsMade,
    }
  );

  // Send failure webhook
  await webhookService.sendOperationFailed({
    operation: 'payment',
    orderId,
    userId,
    error: error.message,
  });
}

/**
 * Handle payment job completion
 */
export async function onPaymentCompleted(job: BullJobData<PaymentJobData>, result: PaymentJobResult): Promise<void> {
  const { orderId, userId, tenantId } = job.data;

  logger.info('Payment job completed', {
    jobId: job.id,
    orderId,
    userId,
    tenantId,
    paymentIntentId: result.paymentIntentId,
    status: result.status,
    processingTime: result.processingTime,
  });

  // Send payment confirmation email (if user data available)
  if (job.data.metadata?.userEmail && job.data.metadata?.userName) {
    await emailService.sendPaymentConfirmation({
      recipientEmail: job.data.metadata.userEmail,
      recipientName: job.data.metadata.userName,
      orderId: orderId || 'N/A',
      amount: job.data.amount,
      currency: job.data.currency,
      paymentIntentId: result.paymentIntentId,
      items: Array.isArray(job.data.metadata?.items) ? job.data.metadata.items : undefined,
    });
  }

  // Send webhook notification
  await webhookService.sendPaymentCompleted({
    orderId: orderId || '',
    userId: userId || '',
    amount: job.data.amount,
    currency: job.data.currency,
    paymentIntentId: result.paymentIntentId,
    webhookUrl: job.data.metadata?.webhookUrl,
  });
}

/**
 * Handle payment job progress
 */
export async function onPaymentProgress(job: BullJobData<PaymentJobData>, progress: number): Promise<void> {
  logger.debug('Payment job progress', {
    jobId: job.id,
    orderId: job.data.orderId,
    progress,
  });
}

/**
 * Notification Service
 * 
 * MEDIUM FIXES:
 * - COMM-1: Refund confirmation email
 * - COMM-2: Timeline communication
 */

import { logger } from '../utils/logger';
import { config } from '../config';
import { serviceClients } from '../utils/http-client.util';

const log = logger.child({ component: 'NotificationService' });

// =============================================================================
// TYPES
// =============================================================================

interface RefundNotificationData {
  userId: string;
  email: string;
  tenantId: string;
  refundId: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  reason?: string;
  ticketIds?: string[];
  eventName?: string;
  eventDate?: string;
  estimatedTimelineDays?: number;
}

interface DisputeNotificationData {
  userId: string;
  email: string;
  tenantId: string;
  disputeId: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  reason: string;
  dueDate: string;
  evidenceRequired: string[];
}

interface PaymentNotificationData {
  userId: string;
  email: string;
  tenantId: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  status: 'succeeded' | 'failed' | 'requires_action';
  eventName?: string;
  ticketCount?: number;
}

type NotificationType = 
  | 'refund_initiated'
  | 'refund_completed'
  | 'refund_failed'
  | 'dispute_opened'
  | 'dispute_evidence_needed'
  | 'dispute_resolved'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'payment_requires_action';

interface NotificationRequest {
  type: NotificationType;
  recipientEmail: string;
  recipientUserId: string;
  tenantId: string;
  templateData: Record<string, any>;
  channels?: ('email' | 'sms' | 'push')[];
}

// =============================================================================
// SERVICE
// =============================================================================

class NotificationService {
  private enabled: boolean;
  private notificationServiceUrl: string;

  constructor() {
    this.enabled = process.env.NOTIFICATIONS_ENABLED !== 'false';
    this.notificationServiceUrl = config.services.notificationUrl;
    
    log.info({ enabled: this.enabled }, 'Notification service initialized');
  }

  /**
   * Send notification via notification service
   */
  private async sendNotification(request: NotificationRequest): Promise<boolean> {
    if (!this.enabled) {
      log.debug({ type: request.type }, 'Notifications disabled, skipping');
      return false;
    }

    try {
      // Queue notification via notification service
      const response = await serviceClients.auth.post('/api/notifications/send', {
        ...request,
        source: 'payment-service',
        priority: this.getPriority(request.type),
        timestamp: new Date().toISOString(),
      });

      log.info({
        type: request.type,
        recipient: request.recipientEmail,
        status: response.status,
      }, 'Notification sent');

      return response.status === 200 || response.status === 202;
    } catch (error) {
      log.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        type: request.type,
        recipient: request.recipientEmail,
      }, 'Failed to send notification');
      
      // Don't throw - notification failures shouldn't break the main flow
      return false;
    }
  }

  /**
   * Get notification priority based on type
   */
  private getPriority(type: NotificationType): 'high' | 'normal' | 'low' {
    switch (type) {
      case 'dispute_opened':
      case 'dispute_evidence_needed':
      case 'payment_failed':
        return 'high';
      case 'refund_completed':
      case 'refund_initiated':
      case 'payment_succeeded':
        return 'normal';
      default:
        return 'low';
    }
  }

  // ===========================================================================
  // COMM-1: REFUND CONFIRMATION EMAILS
  // ===========================================================================

  /**
   * Send refund initiated notification
   */
  async sendRefundInitiated(data: RefundNotificationData): Promise<void> {
    // COMM-2: Include timeline in notification
    const estimatedDays = data.estimatedTimelineDays || this.getEstimatedRefundDays(data.amount);
    const estimatedDate = new Date();
    estimatedDate.setDate(estimatedDate.getDate() + estimatedDays);

    await this.sendNotification({
      type: 'refund_initiated',
      recipientEmail: data.email,
      recipientUserId: data.userId,
      tenantId: data.tenantId,
      channels: ['email'],
      templateData: {
        refundId: data.refundId,
        paymentIntentId: data.paymentIntentId,
        amount: this.formatCurrency(data.amount, data.currency),
        amountCents: data.amount,
        currency: data.currency,
        reason: data.reason || 'Requested by customer',
        ticketCount: data.ticketIds?.length || 0,
        eventName: data.eventName || 'Your order',
        eventDate: data.eventDate,
        // COMM-2: Timeline communication
        estimatedDays,
        estimatedCompletionDate: estimatedDate.toISOString(),
        estimatedCompletionFormatted: estimatedDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        statusTrackingUrl: `${process.env.APP_URL || 'https://app.tickettoken.com'}/refunds/${data.refundId}`,
        supportEmail: process.env.SUPPORT_EMAIL || 'support@tickettoken.com',
      },
    });
  }

  /**
   * Send refund completed notification
   */
  async sendRefundCompleted(data: RefundNotificationData): Promise<void> {
    await this.sendNotification({
      type: 'refund_completed',
      recipientEmail: data.email,
      recipientUserId: data.userId,
      tenantId: data.tenantId,
      channels: ['email'],
      templateData: {
        refundId: data.refundId,
        paymentIntentId: data.paymentIntentId,
        amount: this.formatCurrency(data.amount, data.currency),
        amountCents: data.amount,
        currency: data.currency,
        reason: data.reason,
        eventName: data.eventName || 'Your order',
        completedAt: new Date().toISOString(),
        // COMM-2: Next steps information
        bankProcessingNote: 'Your refund has been processed. It may take 5-10 business days for the funds to appear in your account, depending on your bank.',
        supportEmail: process.env.SUPPORT_EMAIL || 'support@tickettoken.com',
      },
    });
  }

  /**
   * Send refund failed notification
   */
  async sendRefundFailed(data: RefundNotificationData & { errorMessage?: string }): Promise<void> {
    await this.sendNotification({
      type: 'refund_failed',
      recipientEmail: data.email,
      recipientUserId: data.userId,
      tenantId: data.tenantId,
      channels: ['email'],
      templateData: {
        refundId: data.refundId,
        paymentIntentId: data.paymentIntentId,
        amount: this.formatCurrency(data.amount, data.currency),
        amountCents: data.amount,
        currency: data.currency,
        reason: data.reason,
        eventName: data.eventName || 'Your order',
        errorMessage: data.errorMessage || 'An error occurred while processing your refund.',
        nextSteps: 'Our team has been notified and will reach out to you within 24 hours. You can also contact support for immediate assistance.',
        supportEmail: process.env.SUPPORT_EMAIL || 'support@tickettoken.com',
        supportPhone: process.env.SUPPORT_PHONE || '',
      },
    });
  }

  // ===========================================================================
  // DISPUTE NOTIFICATIONS
  // ===========================================================================

  /**
   * Send dispute opened notification to merchant
   */
  async sendDisputeOpened(data: DisputeNotificationData): Promise<void> {
    await this.sendNotification({
      type: 'dispute_opened',
      recipientEmail: data.email,
      recipientUserId: data.userId,
      tenantId: data.tenantId,
      channels: ['email'],
      templateData: {
        disputeId: data.disputeId,
        paymentIntentId: data.paymentIntentId,
        amount: this.formatCurrency(data.amount, data.currency),
        amountCents: data.amount,
        currency: data.currency,
        reason: data.reason,
        dueDate: data.dueDate,
        dueDateFormatted: new Date(data.dueDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        evidenceRequired: data.evidenceRequired,
        dashboardUrl: `${process.env.MERCHANT_DASHBOARD_URL || 'https://dashboard.tickettoken.com'}/disputes/${data.disputeId}`,
        urgencyNote: 'Responding to disputes promptly significantly increases your chances of winning.',
      },
    });
  }

  // ===========================================================================
  // PAYMENT NOTIFICATIONS
  // ===========================================================================

  /**
   * Send payment success notification
   */
  async sendPaymentSucceeded(data: PaymentNotificationData): Promise<void> {
    await this.sendNotification({
      type: 'payment_succeeded',
      recipientEmail: data.email,
      recipientUserId: data.userId,
      tenantId: data.tenantId,
      channels: ['email'],
      templateData: {
        paymentIntentId: data.paymentIntentId,
        amount: this.formatCurrency(data.amount, data.currency),
        amountCents: data.amount,
        currency: data.currency,
        eventName: data.eventName,
        ticketCount: data.ticketCount,
        orderUrl: `${process.env.APP_URL || 'https://app.tickettoken.com'}/orders/${data.paymentIntentId}`,
      },
    });
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Format currency amount for display
   */
  private formatCurrency(amountCents: number, currency: string): string {
    const amount = amountCents / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  }

  /**
   * COMM-2: Get estimated refund processing days
   */
  private getEstimatedRefundDays(amount: number): number {
    // Larger refunds may take longer due to additional verification
    if (amount > 100000) { // > $1000
      return 10;
    } else if (amount > 50000) { // > $500
      return 7;
    }
    return 5;
  }

  /**
   * Check if notifications are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const notificationService = new NotificationService();

// Export types for use elsewhere
export type {
  RefundNotificationData,
  DisputeNotificationData,
  PaymentNotificationData,
  NotificationType,
};

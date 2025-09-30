import { BaseEventHandler } from './base-event-handler';
import { ProviderFactory } from '../providers/provider-factory';
import { logger } from '../config/logger';

interface PaymentEventData {
  userId: string;
  amount: number;
  currency: string;
  eventId?: string;
  eventName?: string;
  ticketCount?: number;
  orderId: string;
  paymentIntentId?: string;
  refundId?: string;
  reason?: string;
  timestamp: string;
}

export class PaymentEventHandler extends BaseEventHandler {
  private emailProvider = ProviderFactory.getEmailProvider();
  private smsProvider = ProviderFactory.getSMSProvider();

  constructor() {
    super('payment-notifications', 'PaymentEventHandler');
  }

  initializeListeners(): void {
    this.queue.process('payment.succeeded', async (job) => {
      await this.handlePaymentSuccess(job.data);
    });

    this.queue.process('payment.failed', async (job) => {
      await this.handlePaymentFailed(job.data);
    });

    this.queue.process('refund.processed', async (job) => {
      await this.handleRefundProcessed(job.data);
    });

    this.queue.process('dispute.created', async (job) => {
      await this.handleDisputeCreated(job.data);
    });

    logger.info('Payment event listeners initialized');
  }

  private async handlePaymentSuccess(data: PaymentEventData): Promise<void> {
    try {
      logger.info(`Processing payment success for order ${data.orderId}`);

      const user = await this.getUserDetails(data.userId);
      
      let eventDetails: any = null;
      if (data.eventId) {
        eventDetails = await this.getEventDetails(data.eventId);
      }

      const templateData = {
        user: {
          name: user.name || user.email?.split('@')[0] || 'Customer',
          email: user.email || `user_${data.userId}@tickettoken.com`
        },
        amount: (data.amount / 100).toFixed(2),
        currency: (data.currency || 'USD').toUpperCase(),
        eventName: data.eventName || eventDetails?.name || 'Event',
        ticketCount: data.ticketCount || 1,
        orderId: data.orderId,
        orderUrl: `${process.env.FRONTEND_URL || 'https://app.tickettoken.com'}/orders/${data.orderId}`,
        supportEmail: process.env.SUPPORT_EMAIL || 'support@tickettoken.com'
      };

      // For now, create simple HTML without template service
      const emailHtml = this.createPaymentSuccessHtml(templateData);
      const emailText = this.stripHtml(emailHtml);

      try {
        const emailResult = await this.emailProvider.send({
          to: user.email || templateData.user.email,
          subject: `Payment Confirmed - ${templateData.eventName}`,
          html: emailHtml,
          text: emailText,
          tags: ['payment', 'confirmation'],
          metadata: {
            orderId: data.orderId,
            userId: data.userId,
            type: 'payment_success'
          }
        });

        await this.recordNotification({
          userId: data.userId,
          type: 'payment_success',
          channel: 'email',
          recipient: user.email,
          status: emailResult.status,
          metadata: {
            orderId: data.orderId,
            amount: data.amount,
            messageId: emailResult.id
          }
        });

        logger.info(`Payment success email sent to ${user.email} for order ${data.orderId}`);
      } catch (error) {
        logger.error(`Failed to send payment success email:`, error);
      }

      if (user.phone && this.isValidPhone(user.phone)) {
        try {
          const smsMessage = `TicketToken: Payment of $${templateData.amount} confirmed for ${templateData.eventName}. Order #${data.orderId.slice(-8)}`;
          
          const smsResult = await this.smsProvider.send({
            to: user.phone,
            message: smsMessage,
            metadata: {
              orderId: data.orderId,
              type: 'payment_success'
            }
          });

          await this.recordNotification({
            userId: data.userId,
            type: 'payment_success',
            channel: 'sms',
            recipient: user.phone,
            status: smsResult.status,
            metadata: {
              orderId: data.orderId,
              messageId: smsResult.id
            }
          });

          logger.info(`Payment success SMS sent to ${user.phone}`);
        } catch (error) {
          logger.error(`Failed to send payment success SMS:`, error);
        }
      }
    } catch (error) {
      logger.error(`Error handling payment success:`, error);
    }
  }

  private async handlePaymentFailed(data: PaymentEventData): Promise<void> {
    try {
      logger.info(`Processing payment failure for order ${data.orderId}`);

      const user = await this.getUserDetails(data.userId);

      const templateData = {
        user: {
          name: user.name || user.email?.split('@')[0] || 'Customer',
          email: user.email || `user_${data.userId}@tickettoken.com`
        },
        amount: (data.amount / 100).toFixed(2),
        currency: (data.currency || 'USD').toUpperCase(),
        eventName: data.eventName || 'Event',
        orderId: data.orderId,
        reason: data.reason || 'Payment could not be processed',
        retryUrl: `${process.env.FRONTEND_URL || 'https://app.tickettoken.com'}/checkout/retry/${data.orderId}`,
        supportEmail: process.env.SUPPORT_EMAIL || 'support@tickettoken.com'
      };

      const emailHtml = this.createPaymentFailedHtml(templateData);
      const emailText = this.stripHtml(emailHtml);

      const emailResult = await this.emailProvider.send({
        to: user.email || templateData.user.email,
        subject: `Payment Failed - Action Required`,
        html: emailHtml,
        text: emailText,
        tags: ['payment', 'failed'],
        metadata: {
          orderId: data.orderId,
          type: 'payment_failed'
        }
      });

      await this.recordNotification({
        userId: data.userId,
        type: 'payment_failed',
        channel: 'email',
        recipient: user.email,
        status: emailResult.status,
        metadata: {
          orderId: data.orderId,
          reason: data.reason
        }
      });

      logger.info(`Payment failure email sent to ${user.email}`);
    } catch (error) {
      logger.error(`Error handling payment failure:`, error);
    }
  }

  private async handleRefundProcessed(data: PaymentEventData): Promise<void> {
    try {
      logger.info(`Processing refund for order ${data.orderId}`);

      const user = await this.getUserDetails(data.userId);

      const templateData = {
        user: {
          name: user.name || user.email?.split('@')[0] || 'Customer',
          email: user.email || `user_${data.userId}@tickettoken.com`
        },
        amount: (data.amount / 100).toFixed(2),
        currency: (data.currency || 'USD').toUpperCase(),
        orderId: data.orderId,
        refundId: data.refundId,
        reason: data.reason || 'Refund processed',
        processingTime: '3-5 business days',
        supportEmail: process.env.SUPPORT_EMAIL || 'support@tickettoken.com'
      };

      const emailHtml = this.createRefundHtml(templateData);
      const emailText = this.stripHtml(emailHtml);

      const emailResult = await this.emailProvider.send({
        to: user.email || templateData.user.email,
        subject: `Refund Processed - Order #${data.orderId.slice(-8)}`,
        html: emailHtml,
        text: emailText,
        tags: ['payment', 'refund'],
        metadata: {
          orderId: data.orderId,
          refundId: data.refundId,
          type: 'refund_processed'
        }
      });

      await this.recordNotification({
        userId: data.userId,
        type: 'refund_processed',
        channel: 'email',
        recipient: user.email,
        status: emailResult.status,
        metadata: {
          orderId: data.orderId,
          refundId: data.refundId,
          amount: data.amount
        }
      });

      if (user.phone && this.isValidPhone(user.phone)) {
        const smsMessage = `TicketToken: Refund of $${templateData.amount} has been processed. Expect funds in ${templateData.processingTime}.`;
        
        await this.smsProvider.send({
          to: user.phone,
          message: smsMessage,
          metadata: {
            orderId: data.orderId,
            refundId: data.refundId,
            type: 'refund_processed'
          }
        });
      }

      logger.info(`Refund notification sent to ${user.email}`);
    } catch (error) {
      logger.error(`Error handling refund:`, error);
    }
  }

  private async handleDisputeCreated(data: any): Promise<void> {
    try {
      logger.info(`Processing dispute for order ${data.orderId}`);

      const csEmail = process.env.CS_TEAM_EMAIL || 'disputes@tickettoken.com';
      
      await this.emailProvider.send({
        to: csEmail,
        subject: `[URGENT] Payment Dispute Created - Order #${data.orderId}`,
        html: `
          <h2>Payment Dispute Alert</h2>
          <p>A payment dispute has been created.</p>
          <ul>
            <li>Order ID: ${data.orderId}</li>
            <li>Amount: $${(data.amount / 100).toFixed(2)}</li>
            <li>User ID: ${data.userId}</li>
            <li>Reason: ${data.reason || 'Not specified'}</li>
            <li>Created: ${new Date(data.timestamp).toLocaleString()}</li>
          </ul>
          <p>Please review in the admin dashboard immediately.</p>
        `,
        text: `Payment dispute created for order ${data.orderId}. Amount: $${(data.amount / 100).toFixed(2)}. Please review immediately.`,
        tags: ['dispute', 'urgent']
      });

      logger.info(`Dispute alert sent to customer service`);
    } catch (error) {
      logger.error(`Error handling dispute:`, error);
    }
  }

  private createPaymentSuccessHtml(data: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <title>Payment Confirmation</title>
      </head>
      <body>
          <h1>Payment Confirmed! 🎉</h1>
          <p>Hi ${data.user.name},</p>
          <p>Your payment has been successfully processed.</p>
          <h3>Order Details</h3>
          <ul>
              <li>Event: ${data.eventName}</li>
              <li>Tickets: ${data.ticketCount}</li>
              <li>Amount: $${data.amount} ${data.currency}</li>
              <li>Order ID: #${data.orderId}</li>
          </ul>
          <p><a href="${data.orderUrl}">View Your Tickets</a></p>
          <p>Thank you for using TicketToken!</p>
      </body>
      </html>
    `;
  }

  private createPaymentFailedHtml(data: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <title>Payment Failed</title>
      </head>
      <body>
          <h1>Payment Failed</h1>
          <p>Hi ${data.user.name},</p>
          <p>Unfortunately, we were unable to process your payment.</p>
          <p>Reason: ${data.reason}</p>
          <p>Event: ${data.eventName}</p>
          <p>Amount: $${data.amount} ${data.currency}</p>
          <p><a href="${data.retryUrl}">Try Payment Again</a></p>
      </body>
      </html>
    `;
  }

  private createRefundHtml(data: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <title>Refund Processed</title>
      </head>
      <body>
          <h1>Refund Processed</h1>
          <p>Hi ${data.user.name},</p>
          <p>Your refund has been processed.</p>
          <ul>
              <li>Amount: $${data.amount} ${data.currency}</li>
              <li>Order ID: ${data.orderId}</li>
              <li>Refund ID: ${data.refundId}</li>
              <li>Processing Time: ${data.processingTime}</li>
          </ul>
          <p>If you have questions, contact ${data.supportEmail}</p>
      </body>
      </html>
    `;
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  private isValidPhone(phone: string): boolean {
    return /^\+[1-9]\d{1,14}$/.test(phone);
  }
}

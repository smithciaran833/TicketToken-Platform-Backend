import { EmailService } from './email.service';
import { SMSService } from './sms.service';
import { PushNotificationService } from './push-notification.service';
import { WebhookService } from './webhook.service';
import { notificationPreferencesService } from './notification-preferences.service';
import { logger } from '../utils/logger';
import { NotificationType, NotificationChannel, NotificationContext } from '../types/notification.types';

export class NotificationService {
  private emailService: EmailService;
  private smsService: SMSService;
  private pushService: PushNotificationService;
  private webhookService: WebhookService;

  constructor() {
    this.emailService = new EmailService();
    this.smsService = new SMSService();
    this.pushService = new PushNotificationService();
    this.webhookService = new WebhookService();
  }

  async sendOrderConfirmation(context: NotificationContext, orderData: any): Promise<void> {
    const { tenantId, userId, orderId } = context;
    const results = { email: false, sms: false, errors: [] as string[] };

    try {
      // Check if user wants email notifications
      const canSendEmail = await notificationPreferencesService.canSendNotification(
        userId,
        tenantId,
        NotificationType.ORDER_CONFIRMATION,
        NotificationChannel.EMAIL
      );

      if (canSendEmail && orderData.customer?.email) {
        try {
          await this.emailService.sendOrderConfirmation(tenantId, userId, orderId!, orderData);
          results.email = true;
        } catch (emailError) {
          logger.error('Failed to send order confirmation email', { error: emailError, orderId, email: orderData.customer.email });
          results.errors.push('email');
        }
      }

      // Check if user wants SMS notifications
      const canSendSMS = await notificationPreferencesService.canSendNotification(
        userId,
        tenantId,
        NotificationType.ORDER_CONFIRMATION,
        NotificationChannel.SMS
      );

      if (canSendSMS && orderData.customer?.phone) {
        try {
          await this.smsService.sendSMS({
            to: orderData.customer.phone,
            message: `Order confirmed! Order #${orderData.orderNumber}. Check your email for details.`,
            metadata: { tenantId, userId, orderId },
          });
          results.sms = true;
        } catch (smsError) {
          logger.error('Failed to send order confirmation SMS', { error: smsError, orderId, phone: orderData.customer.phone });
          results.errors.push('sms');
        }
      }

      logger.info('Order confirmation processing complete', { 
        orderId, 
        sent: { email: results.email, sms: results.sms },
        failedChannels: results.errors.length > 0 ? results.errors : undefined
      });
    } catch (error) {
      // Log but don't throw - notification failures shouldn't break order processing
      logger.error('Error in order confirmation notification handler', { error, orderId: context.orderId });
    }
  }

  async sendStatusUpdate(
    context: NotificationContext,
    status: string,
    orderData: any
  ): Promise<void> {
    try {
      const { tenantId, userId, orderId } = context;

      // Push notification
      const canSendPush = await notificationPreferencesService.canSendNotification(
        userId,
        tenantId,
        NotificationType.ORDER_CONFIRMED,
        NotificationChannel.PUSH
      );

      if (canSendPush) {
        await this.pushService.sendOrderUpdate(
          tenantId,
          userId,
          orderId!,
          'Order Status Update',
          `Your order status has been updated to: ${status}`
        );
      }

      // SMS notification
      const canSendSMS = await notificationPreferencesService.canSendNotification(
        userId,
        tenantId,
        NotificationType.ORDER_CONFIRMED,
        NotificationChannel.SMS
      );

      if (canSendSMS && orderData.customer?.phone) {
        await this.smsService.sendOrderStatusUpdate(tenantId, userId, orderId!, orderData.customer.phone, status);
      }

      logger.info('Status update sent', { orderId, status, channels: { push: canSendPush, sms: canSendSMS } });
    } catch (error) {
      logger.error('Error sending status update', { error, orderId: context.orderId });
    }
  }

  async sendWebhookNotification(
    context: NotificationContext,
    webhookUrl: string,
    orderData: any
  ): Promise<void> {
    try {
      const { tenantId, userId, orderId } = context;
      await this.webhookService.sendOrderEvent(tenantId, userId, orderId!, 'order.updated', webhookUrl, orderData);
      logger.info('Webhook notification sent', { orderId, webhookUrl });
    } catch (error) {
      logger.error('Error sending webhook notification', { error, orderId: context.orderId });
    }
  }
}

export const notificationService = new NotificationService();

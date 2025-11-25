import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { SendSMSRequest, NotificationType, NotificationStatus, NotificationChannel } from '../types/notification.types';
import { NotificationMetrics } from '../utils/notification-metrics';

export class SMSService {
  private provider: string;

  constructor() {
    this.provider = process.env.SMS_PROVIDER || 'console'; // 'twilio', 'sns', 'console'
  }

  async sendSMS(request: SendSMSRequest): Promise<void> {
    try {
      // Validate phone number format
      if (!this.isValidPhoneNumber(request.to)) {
        throw new Error('Invalid phone number format');
      }

      // Truncate message if too long (SMS limit: 160 chars)
      const message = request.message.length > 160 ? request.message.substring(0, 157) + '...' : request.message;

      switch (this.provider) {
        case 'twilio':
          await this.sendViaTwilio({ ...request, message });
          break;
        case 'sns':
          await this.sendViaSNS({ ...request, message });
          break;
        default:
          await this.sendViaConsole({ ...request, message });
      }

      NotificationMetrics.incrementSent('sms', 'success');
      logger.info('SMS sent successfully', { to: request.to });
    } catch (error) {
      NotificationMetrics.incrementSent('sms', 'failed');
      NotificationMetrics.incrementError('sms', error instanceof Error ? error.message : 'unknown');
      logger.error('Error sending SMS', { error, to: request.to });
      throw error;
    }
  }

  async sendOrderStatusUpdate(
    tenantId: string,
    userId: string,
    orderId: string,
    phoneNumber: string,
    status: string
  ): Promise<void> {
    const message = `Your order status has been updated to: ${status}. Order ID: ${orderId}`;
    
    await this.sendSMS({
      to: phoneNumber,
      message,
      metadata: { tenantId, userId, orderId },
    });

    await this.logNotification(tenantId, userId, orderId, NotificationType.ORDER_CONFIRMED, phoneNumber);
  }

  private isValidPhoneNumber(phone: string): boolean {
    // E.164 format: +[country code][number]
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phone);
  }

  private async sendViaTwilio(request: SendSMSRequest): Promise<void> {
    // TODO: Implement Twilio integration
    // const twilio = require('twilio');
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // await client.messages.create({
    //   body: request.message,
    //   from: process.env.TWILIO_PHONE_NUMBER,
    //   to: request.to
    // });
    logger.info('[Twilio] SMS would be sent', { to: request.to, message: request.message });
  }

  private async sendViaSNS(request: SendSMSRequest): Promise<void> {
    // TODO: Implement AWS SNS integration
    // const AWS = require('aws-sdk');
    // const sns = new AWS.SNS();
    // await sns.publish({
    //   Message: request.message,
    //   PhoneNumber: request.to
    // }).promise();
    logger.info('[SNS] SMS would be sent', { to: request.to, message: request.message });
  }

  private async sendViaConsole(request: SendSMSRequest): Promise<void> {
    logger.info('[Console] SMS sent', {
      to: request.to,
      message: request.message,
    });
  }

  private async logNotification(
    tenantId: string,
    userId: string,
    orderId: string,
    type: NotificationType,
    recipient: string
  ): Promise<void> {
    const db = getDatabase();
    try {
      await db.query(
        `INSERT INTO notification_logs (tenant_id, user_id, order_id, notification_type, channel, recipient, status, sent_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [tenantId, userId, orderId, type, NotificationChannel.SMS, recipient, NotificationStatus.SENT]
      );
    } catch (error) {
      logger.error('Failed to log SMS notification to database', { 
        error, 
        orderId, 
        recipient,
        type,
        impact: 'notification was sent but not recorded in logs'
      });
      // Don't throw - logging failure shouldn't prevent notification from being considered sent
    }
  }
}

import * as fs from 'fs';
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import * as path from 'path';
import * as handlebars from 'handlebars';
import { EmailProvider } from '../providers/email/email.provider';
import { SMSProvider } from '../providers/sms/sms.provider';
import { PushProvider } from '../providers/push/push.provider';
import { NotificationRequest, NotificationResponse } from '../types/notification.types';
import { logger } from '../config/logger';
import { db } from '../config/database';

export class NotificationService {
  async getNotificationStatus(_id: string): Promise<'queued'|'sent'|'failed'|'unknown'> {
    // compile-time stub; replace with real lookup when wired
    return 'queued';
  }

  private emailProvider: EmailProvider;
  private smsProvider: SMSProvider;
  private pushProvider: PushProvider;
  private templates: Map<string, handlebars.TemplateDelegate> = new Map();

  constructor() {
    this.emailProvider = new EmailProvider();
    this.smsProvider = new SMSProvider();
    this.pushProvider = new PushProvider();
    this.loadTemplates();
  }

  private loadTemplates() {
    const templateDir = path.join(__dirname, '../templates/email');
    
    try {
      const files = fs.readdirSync(templateDir);
      
      files.forEach(file => {
        if (file.endsWith('.hbs')) {
          const templateName = file.replace('.hbs', '');
          const templateContent = fs.readFileSync(
            path.join(templateDir, file),
            'utf-8'
          );
          const compiled = handlebars.compile(templateContent);
          this.templates.set(templateName, compiled);
          logger.info(`Loaded template: ${templateName}`);
        }
      });
    } catch (error) {
      logger.error('Failed to load templates:', error);
    }
  }

  async send(request: NotificationRequest): Promise<NotificationResponse> {
    try {
      // Check consent
      const hasConsent = await this.checkConsent(
        request.recipientId,
        request.channel,
        request.type
      );

      if (!hasConsent && request.type === 'marketing') {
        logger.info(`No consent for marketing notification to ${request.recipientId}`);
        return { id: '', status: 'queued', channel: 'email' };
      }

      // Store notification record
      const notificationId = await this.storeNotification(request);

      // Process based on channel
      let result: NotificationResponse;
      
      switch (request.channel) {
        case 'email':
          result = await this.sendEmail(request);
          break;
        case 'sms':
          result = await this.sendSMS(request);
          break;
        case 'push':
          result = await this.sendPush(request);
          break;
        default:
          throw new Error(`Unsupported channel: ${request.channel}`);
      }

      // Update notification status
      await this.updateNotificationStatus(notificationId, result.status);

      return result;
      
    } catch (error) {
      logger.error('Failed to send notification:', error);
      throw error;
    }
  }

  private async sendEmail(request: NotificationRequest): Promise<NotificationResponse> {
    // Get template
    const template = this.templates.get(request.template);
    
    if (!template) {
      throw new Error(`Template not found: ${request.template}`);
    }

    // Render template with data
    const html = template(request.data);
    
    // Extract subject from template or use default
    const subject = request.data.subject || this.getSubjectForTemplate(request.template);

    // Send via provider
    return await this.emailProvider.send({
      to: request.recipient.email!,
      subject,
      html,
      from: process.env.EMAIL_FROM || 'noreply@tickettoken.com'
    });
  }

  private async sendSMS(request: NotificationRequest): Promise<NotificationResponse> {
    return await this.smsProvider.send({
      to: request.recipient.phone!,
      message: request.data.message || 'TicketToken notification'
    });
  }

  private async sendPush(request: NotificationRequest): Promise<NotificationResponse> {
    return await this.pushProvider.send({
      token: (request as any).recipient?.pushToken as any,
      title: request.data.title,
      body: request.data.body,
      data: request.data
    });
  }

  private async checkConsent(recipientId: string, channel: string, type: string): Promise<boolean> {
    // Check consent in database
    const consent = await db('consent')
      .where({
        customer_id: recipientId,
        channel,
        type,
        granted: true
      })
      .first();

    return !!consent;
  }

  private async storeNotification(request: NotificationRequest): Promise<string> {
    const [notification] = await db('notifications')
      .insert({
        venue_id: request.venueId,
        recipient_id: request.recipientId,
        channel: request.channel,
        type: request.type,
        template: request.template,
        priority: request.priority,
        data: JSON.stringify(request.data),
        status: 'pending'
      })
      .returning('id');

    return notification.id;
  }

  private async updateNotificationStatus(id: string, status: string): Promise<void> {
    await db('notifications')
      .where({ id })
      .update({
        status,
        sent_at: status === 'sent' ? new Date() : null
      });
  }

  private getSubjectForTemplate(template: string): string {
    const subjects: Record<string, string> = {
      'order-confirmation': 'Order Confirmed - Your tickets are ready!',
      'payment-failed': 'Payment Failed - Action required',
      'refund-processed': 'Refund Processed Successfully'
    };

    return subjects[template] || 'TicketToken Notification';
  }
}

export const notificationService = new NotificationService();

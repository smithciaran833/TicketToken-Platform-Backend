import * as fs from 'fs';
import { QUEUES } from "@tickettoken/shared";
import * as path from 'path';
import * as handlebars from 'handlebars';
import axios from 'axios';
import { EmailProvider } from '../providers/email/email.provider';
import { SMSProvider } from '../providers/sms/sms.provider';
import { PushProvider } from '../providers/push/push.provider';
import { NotificationRequest, NotificationResponse } from '../types/notification.types';
import { logger } from '../config/logger';
import { db } from '../config/database';
import { metricsService } from './metrics.service';

export class NotificationService {
  async getNotificationStatus(_id: string): Promise<'queued'|'sent'|'failed'|'unknown'> {
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

  /**
   * Fetch venue branding from venue-service
   */
  private async getVenueBranding(venueId: string): Promise<any> {
    try {
      const venueServiceUrl = process.env.VENUE_SERVICE_URL || 'http://venue-service:3002';
      const response = await axios.get(
        `${venueServiceUrl}/api/v1/branding/${venueId}`,
        { timeout: 2000 }
      );

      return response.data.branding;
    } catch (error: any) {
      logger.warn(`Failed to fetch branding for venue ${venueId}:`, error.message);
      return null;
    }
  }

  /**
   * Check if venue has white-label tier
   */
  private async isWhiteLabel(venueId: string): Promise<boolean> {
    try {
      const venue = await db('venues').where('id', venueId).first();
      return venue?.hide_platform_branding || false;
    } catch (error) {
      return false;
    }
  }

  async send(request: NotificationRequest): Promise<NotificationResponse> {
    const startTime = Date.now();
    const provider = this.getProviderName(request.channel);
    
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

      // Track metrics
      const duration = (Date.now() - startTime) / 1000;
      metricsService.trackNotificationSent(
        request.channel,
        request.type,
        result.status,
        provider
      );
      metricsService.recordNotificationSendDuration(
        request.channel,
        provider,
        request.type,
        duration
      );

      return result;

    } catch (error: any) {
      logger.error('Failed to send notification:', error);
      
      // Track error metrics
      metricsService.trackNotificationError(
        error.message || 'unknown_error',
        provider,
        request.channel
      );
      
      throw error;
    }
  }

  private async sendEmail(request: NotificationRequest): Promise<NotificationResponse> {
    // Get template
    const template = this.templates.get(request.template);

    if (!template) {
      throw new Error(`Template not found: ${request.template}`);
    }

    // Fetch venue branding if venueId provided
    let branding = null;
    let isWhiteLabel = false;
    let fromEmail = process.env.EMAIL_FROM || 'noreply@tickettoken.com';
    let fromName = 'TicketToken';

    if (request.venueId) {
      branding = await this.getVenueBranding(request.venueId);
      isWhiteLabel = await this.isWhiteLabel(request.venueId);

      // Use venue's custom email settings if white-label
      if (branding && isWhiteLabel) {
        if (branding.email_reply_to) {
          fromEmail = branding.email_reply_to;
        }
        if (branding.email_from_name) {
          fromName = branding.email_from_name;
        }
      }
    }

    // Merge branding data into template data
    const templateData = {
      ...request.data,
      branding: branding || {},
      isWhiteLabel
    };

    // Render template with data and track duration
    const renderStart = Date.now();
    const html = template(templateData);
    const renderDuration = (Date.now() - renderStart) / 1000;
    
    // Track template render metrics
    metricsService.recordTemplateRenderDuration(
      request.template,
      'email',
      renderDuration
    );

    // Extract subject from template or use default
    const subject = request.data.subject || this.getSubjectForTemplate(request.template, fromName);

    // Send via provider
    return await this.emailProvider.send({
      to: request.recipient.email!,
      subject,
      html,
      from: `${fromName} <${fromEmail}>`
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
    const consent = await db('consent_records')
      .where({
        customer_id: recipientId,
        channel,
        type,
        status: 'granted'
      })
      .first();

    return !!consent;
  }

  private async storeNotification(request: NotificationRequest): Promise<string> {
    const [notification] = await db('notification_history')
      .insert({
        venue_id: request.venueId,
        recipient_id: request.recipientId,
        channel: request.channel,
        type: request.type,
        template_name: request.template,
        priority: request.priority,
        metadata: request.data,
        status: 'pending'
      })
      .returning('id');

    return notification.id;
  }

  private async updateNotificationStatus(id: string, status: string): Promise<void> {
    await db('notification_history')
      .where({ id })
      .update({
        status,
        sent_at: status === 'sent' ? new Date() : null
      });
  }

  private getSubjectForTemplate(template: string, brandName: string = 'TicketToken'): string {
    const subjects: Record<string, string> = {
      'order-confirmation': `Order Confirmed - Your tickets are ready!`,
      'ticket-purchased': `Your Tickets for {{eventName}} are Ready!`,
      'payment-failed': `Payment Failed - Action required`,
      'refund-processed': `Refund Processed Successfully`,
      'event-reminder': `Reminder: {{eventName}} is coming up!`,
      'abandoned-cart': `Complete your ticket purchase`,
      'post-event-followup': `Thank you for attending {{eventName}}!`,
      'newsletter': `Latest updates from ${brandName}`
    };

    return subjects[template] || `${brandName} Notification`;
  }

  private getProviderName(channel: string): string {
    switch (channel) {
      case 'email':
        return process.env.NOTIFICATION_MODE === 'production' ? 'sendgrid' : 'mock';
      case 'sms':
        return process.env.NOTIFICATION_MODE === 'production' ? 'twilio' : 'mock';
      case 'push':
        return 'mock';
      default:
        return 'unknown';
    }
  }
}

export const notificationService = new NotificationService();

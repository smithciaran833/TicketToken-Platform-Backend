import { NotificationRequest, NotificationResponse, NotificationStatus } from '../types/notification.types';
import { complianceService } from './compliance.service';
import { templateService } from './template.service';
import { providerManager } from './provider-manager.service';
import { queueManager } from './queue-manager.service';
import { retryService } from './retry.service';
import { emailProvider } from '../providers/email.provider';
import { smsProvider } from '../providers/sms.provider';
import { awsSESProvider } from '../providers/aws-ses.provider';
import { awsSNSProvider } from '../providers/aws-sns.provider';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { v4 as uuidv4 } from 'uuid';

export class NotificationServiceV2 {
  private readonly tableName = 'notification_tracking';

  constructor() {
    this.setupQueueProcessors();
  }

  private setupQueueProcessors() {
    queueManager.setupQueueProcessors(async (job) => {
      return this.processNotification(job.data);
    });
  }

  async send(request: NotificationRequest): Promise<NotificationResponse> {
    const notificationId = request.id || uuidv4();

    try {
      // Step 1: Compliance check
      const compliance = await complianceService.checkCompliance(request);
      if (!compliance.isCompliant) {
        return this.createResponse(notificationId, 'failed', request.channel, compliance.reason);
      }

      // Step 2: Get and render template
      const template = await templateService.getTemplate(
        request.template,
        request.channel,
        request.venueId
      );

      if (!template) {
        return this.createResponse(notificationId, 'failed', request.channel, 'Template not found');
      }

      const rendered = await templateService.renderTemplate(template, request.data);

      // Step 3: Track notification
      await this.trackNotification({
        id: notificationId,
        ...request,
        status: 'queued',
      });

      // Step 4: Add to appropriate queue based on priority
      const queuePriority = this.mapPriorityToQueue(request.priority);
      await queueManager.addToQueue(queuePriority, {
        id: notificationId,
        request,
        rendered,
        template,
      });

      return this.createResponse(notificationId, 'queued', request.channel);
    } catch (error: any) {
      logger.error('Failed to send notification', { 
        notificationId, 
        error: error.message 
      });
      return this.createResponse(notificationId, 'failed', request.channel, error.message);
    }
  }

  private async processNotification(jobData: any): Promise<NotificationResponse> {
    const { id, request, rendered, template: _template } = jobData;

    try {
      // Update status to sending
      await this.updateNotificationStatus(id, 'sending');

      let result: NotificationResponse;
      let provider: string;

      // Send based on channel with provider failover
      switch (request.channel) {
        case 'email':
          provider = await providerManager.getHealthyEmailProvider();
          result = await this.sendEmail(provider, request, rendered);
          break;

        case 'sms':
          provider = await providerManager.getHealthySmsProvider();
          result = await this.sendSms(provider, request, rendered);
          break;

        default:
          throw new Error(`Unsupported channel: ${request.channel}`);
      }

      // Record success
      providerManager.recordSuccess(provider!);

      // Update tracking with result
      await this.updateNotificationStatus(id, result.status, result);

      // Track cost if applicable
      if (result.cost) {
        await this.trackCost(id, request.venueId, request.channel, result.cost, provider!);
      }

      return result;
    } catch (error: any) {
      logger.error('Notification processing failed', { 
        notificationId: id, 
        error: error.message 
      });

      // Check if we should retry
      const retryDecision = await retryService.shouldRetry(id, error);
      
      if (retryDecision.retry) {
        // Re-queue with delay
        const queuePriority = this.mapPriorityToQueue(jobData.request.priority);
        await queueManager.addToQueue(queuePriority, {
          ...jobData,
          _retry: true,
          _delay: retryDecision.delay,
        });
        
        await this.updateNotificationStatus(id, 'queued', { 
          failureReason: `Retrying: ${error.message}` 
        });
      } else {
        await this.updateNotificationStatus(id, 'failed', { 
          failureReason: error.message 
        });
      }
      
      throw error;
    }
  }

  private async sendEmail(provider: string, request: any, rendered: any): Promise<NotificationResponse> {
    switch (provider) {
      case 'sendgrid':
        return await emailProvider.send({
          to: request.recipient.email!,
          subject: rendered.subject || 'Notification from TicketToken',
          text: rendered.content,
          html: rendered.htmlContent,
          from: env.SENDGRID_FROM_EMAIL,
          fromName: env.SENDGRID_FROM_NAME,
        });

      case 'aws-ses':
        return await awsSESProvider.send({
          to: request.recipient.email!,
          subject: rendered.subject || 'Notification from TicketToken',
          text: rendered.content,
          html: rendered.htmlContent,
          from: env.SENDGRID_FROM_EMAIL,
        });

      default:
        throw new Error(`Unknown email provider: ${provider}`);
    }
  }

  private async sendSms(provider: string, request: any, rendered: any): Promise<NotificationResponse> {
    switch (provider) {
      case 'twilio':
        return await smsProvider.send({
          to: request.recipient.phone!,
          body: rendered.content,
          from: env.TWILIO_FROM_NUMBER,
        });

      case 'aws-sns':
        return await awsSNSProvider.send({
          to: request.recipient.phone!,
          body: rendered.content,
          messageType: request.type === 'marketing' ? 'Promotional' : 'Transactional',
        });

      default:
        throw new Error(`Unknown SMS provider: ${provider}`);
    }
  }

  private mapPriorityToQueue(priority: string): 'CRITICAL' | 'HIGH' | 'NORMAL' | 'BULK' {
    switch (priority) {
      case 'critical': return 'CRITICAL';
      case 'high': return 'HIGH';
      case 'normal': return 'NORMAL';
      case 'low': 
      case 'bulk': return 'BULK';
      default: return 'NORMAL';
    }
  }

  private async trackNotification(data: any): Promise<void> {
    await db(this.tableName).insert({
      id: data.id,
      venue_id: data.venueId,
      recipient_id: data.recipientId,
      channel: data.channel,
      type: data.type,
      template: data.template,
      priority: data.priority,
      status: data.status,
      scheduled_for: data.scheduledFor,
      metadata: JSON.stringify(data.metadata || {}),
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  private async updateNotificationStatus(
    id: string, 
    status: NotificationStatus,
    additionalData?: any
  ): Promise<void> {
    const updates: any = {
      status,
      updated_at: new Date(),
    };

    if (status === 'sent') {
      updates.sent_at = new Date();
    }

    if (status === 'delivered') {
      updates.delivered_at = new Date();
    }

    if (additionalData?.failureReason) {
      updates.failure_reason = additionalData.failureReason;
    }

    if (additionalData?.providerMessageId) {
      updates.provider_message_id = additionalData.providerMessageId;
    }

    await db(this.tableName)
      .where('id', id)
      .update(updates);
  }

  private async trackCost(
    notificationId: string,
    venueId: string,
    channel: string,
    cost: number,
    provider: string
  ): Promise<void> {
    await db('notification_costs').insert({
      id: uuidv4(),
      notification_id: notificationId,
      venue_id: venueId,
      channel,
      provider,
      cost,
      currency: 'USD',
      billing_period: new Date().toISOString().slice(0, 7),
      is_platform_cost: false,
      created_at: new Date(),
    });
  }

  private createResponse(
    id: string,
    status: NotificationStatus,
    channel: string,
    failureReason?: string
  ): NotificationResponse {
    return {
      id,
      status,
      channel: channel as any,
      failureReason,
    };
  }

  async getNotificationStatus(id: string): Promise<any> {
    const notification = await db(this.tableName)
      .where('id', id)
      .first();
    
    return notification;
  }

  async getQueueMetrics() {
    return await queueManager.getQueueMetrics();
  }

  async getProviderHealth(): Promise<any> {
    return providerManager.getProviderStatus();
  }
}

export const notificationServiceV2 = new NotificationServiceV2();

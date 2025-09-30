import { AlertInstance } from '../types';
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import { logger } from '../utils/logger';
import { getChannel } from '../config/rabbitmq';

export interface MessageTemplate {
  id: string;
  name: string;
  channel: 'email' | 'sms' | 'push' | 'slack';
  subject?: string;
  body: string;
  variables: string[];
}

export interface Message {
  id: string;
  channel: 'email' | 'sms' | 'push' | 'slack';
  recipient: string;
  subject?: string;
  body: string;
  metadata?: Record<string, any>;
  scheduledFor?: Date;
  status: 'pending' | 'sent' | 'failed';
}

export class MessageGatewayService {
  private static instance: MessageGatewayService;
  private log = logger.child({ component: 'MessageGatewayService' });
  private templates: Map<string, MessageTemplate> = new Map();

  static getInstance(): MessageGatewayService {
    if (!this.instance) {
      this.instance = new MessageGatewayService();
    }
    return this.instance;
  }

  constructor() {
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    // Alert templates
    this.templates.set('alert-email', {
      id: 'alert-email',
      name: 'Alert Email',
      channel: 'email',
      subject: 'Analytics Alert: {{alertName}}',
      body: `
        <h2>{{alertName}}</h2>
        <p>{{alertDescription}}</p>
        <p><strong>Severity:</strong> {{severity}}</p>
        <p><strong>Triggered at:</strong> {{triggeredAt}}</p>
        <p><strong>Current value:</strong> {{currentValue}}</p>
        <p><strong>Threshold:</strong> {{threshold}}</p>
        <a href="{{dashboardUrl}}">View Dashboard</a>
      `,
      variables: ['alertName', 'alertDescription', 'severity', 'triggeredAt', 'currentValue', 'threshold', 'dashboardUrl']
    });

    this.templates.set('alert-sms', {
      id: 'alert-sms',
      name: 'Alert SMS',
      channel: 'sms',
      body: 'Analytics Alert: {{alertName}} - {{severity}}. Value: {{currentValue}}. Check dashboard for details.',
      variables: ['alertName', 'severity', 'currentValue']
    });

    this.templates.set('alert-slack', {
      id: 'alert-slack',
      name: 'Alert Slack',
      channel: 'slack',
      body: JSON.stringify({
        text: 'Analytics Alert',
        attachments: [{
          color: '{{color}}',
          title: '{{alertName}}',
          text: '{{alertDescription}}',
          fields: [
            { title: 'Severity', value: '{{severity}}', short: true },
            { title: 'Current Value', value: '{{currentValue}}', short: true },
            { title: 'Threshold', value: '{{threshold}}', short: true },
            { title: 'Time', value: '{{triggeredAt}}', short: true }
          ],
          actions: [{
            type: 'button',
            text: 'View Dashboard',
            url: '{{dashboardUrl}}'
          }]
        }]
      }),
      variables: ['color', 'alertName', 'alertDescription', 'severity', 'currentValue', 'threshold', 'triggeredAt', 'dashboardUrl']
    });

    // Report templates
    this.templates.set('report-ready-email', {
      id: 'report-ready-email',
      name: 'Report Ready Email',
      channel: 'email',
      subject: 'Your Analytics Report is Ready',
      body: `
        <h2>Your report is ready for download</h2>
        <p>Report: {{reportName}}</p>
        <p>Generated: {{generatedAt}}</p>
        <p>Size: {{fileSize}}</p>
        <a href="{{downloadUrl}}">Download Report</a>
        <p><em>This link will expire in {{expirationDays}} days.</em></p>
      `,
      variables: ['reportName', 'generatedAt', 'fileSize', 'downloadUrl', 'expirationDays']
    });

    // Customer insight templates
    this.templates.set('customer-insight-email', {
      id: 'customer-insight-email',
      name: 'Customer Insight Email',
      channel: 'email',
      subject: 'New Customer Insights Available',
      body: `
        <h2>New insights for your venue</h2>
        <ul>
        {{#insights}}
          <li>
            <strong>{{title}}</strong>: {{description}}
            <br>Impact: {{impact}}
            {{#actionable}}
            <br>Suggested actions:
            <ul>
              {{#suggestedActions}}
              <li>{{.}}</li>
              {{/suggestedActions}}
            </ul>
            {{/actionable}}
          </li>
        {{/insights}}
        </ul>
        <a href="{{dashboardUrl}}">View Full Analytics</a>
      `,
      variables: ['insights', 'dashboardUrl']
    });
  }

  async sendMessage(
    channel: 'email' | 'sms' | 'push' | 'slack',
    recipient: string,
    templateId: string,
    variables: Record<string, any>
  ): Promise<Message> {
    try {
      const template = this.templates.get(templateId);
      if (!template) {
        throw new Error(`Template ${templateId} not found`);
      }

      const message: Message = {
        id: `msg-${Date.now()}`,
        channel,
        recipient,
        subject: this.interpolateTemplate(template.subject || '', variables),
        body: this.interpolateTemplate(template.body, variables),
        metadata: { templateId, variables },
        status: 'pending'
      };

      // Queue message for delivery
      await this.queueMessage(message);

      this.log.info('Message queued', { 
        messageId: message.id, 
        channel, 
        recipient: this.maskRecipient(recipient) 
      });

      return message;
    } catch (error) {
      this.log.error('Failed to send message', { error, channel, templateId });
      throw error;
    }
  }

  async sendAlertNotification(
    alert: AlertInstance,
    channel: 'email' | 'sms' | 'slack',
    recipient: string
  ): Promise<void> {
    try {
      const templateId = `alert-${channel}`;
      const variables = {
        alertName: alert.message,
        alertDescription: alert.message,
        severity: alert.severity,
        triggeredAt: alert.triggeredAt.toISOString(),
        currentValue: JSON.stringify(alert.triggerValues),
        threshold: 'Configured threshold',
        dashboardUrl: `${process.env.APP_URL}/dashboard/alerts/${alert.alertId}`,
        color: alert.severity === 'critical' ? '#ff0000' : 
               alert.severity === 'error' ? '#ff6600' : 
               alert.severity === 'warning' ? '#ffcc00' : '#0066cc'
      };

      await this.sendMessage(channel, recipient, templateId, variables);
    } catch (error) {
      this.log.error('Failed to send alert notification', { error, alertId: alert.id });
      throw error;
    }
  }

  async sendBulkMessages(
    messages: Array<{
      channel: 'email' | 'sms' | 'push' | 'slack';
      recipient: string;
      templateId: string;
      variables: Record<string, any>;
    }>
  ): Promise<Message[]> {
    try {
      const results = await Promise.allSettled(
        messages.map(msg => 
          this.sendMessage(msg.channel, msg.recipient, msg.templateId, msg.variables)
        )
      );

      const successful = results
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<Message>).value);

      const failed = results.filter(r => r.status === 'rejected').length;
      
      if (failed > 0) {
        this.log.warn(`Bulk send completed with ${failed} failures`, {
          total: messages.length,
          successful: successful.length,
          failed
        });
      }

      return successful;
    } catch (error) {
      this.log.error('Failed to send bulk messages', { error });
      throw error;
    }
  }

  private interpolateTemplate(template: string, variables: Record<string, any>): string {
    let result = template;
    
    // Simple variable replacement
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, String(value));
    });

    // Handle arrays and conditionals (simplified)
    // In production, use a proper template engine like Handlebars
    
    return result;
  }

  private async queueMessage(message: Message): Promise<void> {
    try {
      const channel = getChannel();
      const routingKey = `messages.${message.channel}`;
      
      channel.publish(
        'tickettoken_events',
        routingKey,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
      );
    } catch (error) {
      this.log.error('Failed to queue message', { error, messageId: message.id });
      throw error;
    }
  }

  private maskRecipient(recipient: string): string {
    if (recipient.includes('@')) {
      // Email
      const [user, domain] = recipient.split('@');
      return `${user.substring(0, 2)}***@${domain}`;
    } else if (recipient.startsWith('+') || /^\d+$/.test(recipient)) {
      // Phone
      return `***${recipient.slice(-4)}`;
    }
    return '***';
  }

  async getMessageStatus(_messageId: string): Promise<Message | null> {
    // In production, this would query the message queue or database
    return null;
  }

  async retryFailedMessages(_since: Date): Promise<number> {
    // In production, this would retry failed messages
    return 0;
  }
}

export const messageGatewayService = MessageGatewayService.getInstance();

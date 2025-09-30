import * as fs from 'fs/promises';
import * as path from 'path';
import Handlebars from 'handlebars';
import { logger } from '../config/logger';

interface TemplateInfo {
  name: string;
  channel: 'email' | 'sms';
  subject?: string;
  variables: string[];
  description: string;
}

export class TemplateRegistry {
  private templates: Map<string, TemplateInfo> = new Map();
  
  constructor() {
    this.registerTemplates();
  }
  
  private registerTemplates() {
    // Email templates
    this.templates.set('payment-success', {
      name: 'payment-success',
      channel: 'email',
      subject: 'Payment Confirmed - {{eventName}}',
      variables: ['user', 'amount', 'currency', 'eventName', 'ticketCount', 'orderId'],
      description: 'Sent when payment is successfully processed'
    });
    
    this.templates.set('payment-failed', {
      name: 'payment-failed',
      channel: 'email',
      subject: 'Payment Failed - Action Required',
      variables: ['user', 'amount', 'eventName', 'reason', 'retryUrl'],
      description: 'Sent when payment fails'
    });
    
    this.templates.set('refund-processed', {
      name: 'refund-processed',
      channel: 'email',
      subject: 'Refund Processed',
      variables: ['user', 'amount', 'orderId', 'refundId'],
      description: 'Sent when refund is processed'
    });
    
    this.templates.set('ticket-purchased', {
      name: 'ticket-purchased',
      channel: 'email',
      subject: 'Your Tickets for {{event.name}}',
      variables: ['user', 'event', 'ticketCount', 'ticketType', 'orderId', 'nftMinted'],
      description: 'Sent after successful ticket purchase'
    });
    
    this.templates.set('event-reminder', {
      name: 'event-reminder',
      channel: 'email',
      subject: 'Reminder: {{event.name}} is coming up!',
      variables: ['user', 'event', 'hoursUntil', 'ticketCount'],
      description: 'Sent 24 hours before event'
    });
    
    this.templates.set('account-verification', {
      name: 'account-verification',
      channel: 'email',
      subject: 'Verify Your TicketToken Account',
      variables: ['user', 'verificationCode', 'verificationUrl'],
      description: 'Sent for email verification'
    });
    
    // SMS templates
    this.templates.set('sms-payment-success', {
      name: 'payment-success',
      channel: 'sms',
      variables: ['amount', 'eventName', 'orderIdShort', 'shortUrl'],
      description: 'SMS payment confirmation'
    });
    
    this.templates.set('sms-event-reminder', {
      name: 'event-reminder',
      channel: 'sms',
      variables: ['eventName', 'timeUntil', 'venue', 'shortUrl'],
      description: 'SMS event reminder'
    });
  }
  
  getTemplate(name: string): TemplateInfo | undefined {
    return this.templates.get(name);
  }
  
  getAllTemplates(): TemplateInfo[] {
    return Array.from(this.templates.values());
  }
  
  getTemplatesByChannel(channel: 'email' | 'sms'): TemplateInfo[] {
    return this.getAllTemplates().filter(t => t.channel === channel);
  }
  
  async validateTemplate(name: string, data: any): Promise<string[]> {
    const template = this.templates.get(name);
    if (!template) {
      return ['Template not found'];
    }
    
    const errors: string[] = [];
    const providedKeys = Object.keys(data);
    
    // Check for missing required variables
    for (const variable of template.variables) {
      if (!providedKeys.includes(variable)) {
        errors.push(`Missing required variable: ${variable}`);
      }
    }
    
    return errors;
  }
  
  async renderTemplate(
    templateName: string,
    data: any
  ): Promise<{ subject?: string; body: string }> {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }
    
    const templatePath = path.join(
      __dirname,
      '../templates',
      template.channel,
      `${template.name}.${template.channel === 'email' ? 'hbs' : 'txt'}`
    );
    
    try {
      const templateContent = await fs.readFile(templatePath, 'utf8');
      const compiled = Handlebars.compile(templateContent);
      const body = compiled(data);
      
      let subject: string | undefined;
      if (template.subject) {
        const subjectCompiled = Handlebars.compile(template.subject);
        subject = subjectCompiled(data);
      }
      
      return { subject, body };
    } catch (error) {
      logger.error(`Failed to render template ${templateName}:`, error);
      throw error;
    }
  }
}

export const templateRegistry = new TemplateRegistry();

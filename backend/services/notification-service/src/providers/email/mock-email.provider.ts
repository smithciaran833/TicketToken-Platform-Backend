import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { BaseEmailProvider } from './base-email.provider';
import { SendEmailInput } from './base-email.provider';
import { NotificationResult } from '../base.provider';
import { logger } from '../../config/logger';

export class MockEmailProvider extends BaseEmailProvider {
  private sentEmails: NotificationResult[] = [];
  private logPath: string;
  private failureRate: number;
  private deliveryDelay: number;
  private bounceEmails: string[];

  constructor(config: any = {}) {
    super(config);
    this.logPath = process.env.MOCK_EMAIL_LOG_PATH || './logs/mock-emails.log';
    this.failureRate = parseFloat(process.env.MOCK_FAILURE_RATE || '0.05');
    this.deliveryDelay = parseInt(process.env.MOCK_DELIVERY_DELAY || '1000');
    this.bounceEmails = (process.env.MOCK_BOUNCE_EMAILS || '').split(',').filter(Boolean);
    this.ensureLogDirectory();
  }

  private async ensureLogDirectory(): Promise<void> {
    const logDir = path.dirname(this.logPath);
    try {
      await fs.access(logDir);
    } catch {
      await fs.mkdir(logDir, { recursive: true });
    }
  }

  async send(input: SendEmailInput): Promise<NotificationResult> {
    const messageId = this.generateMessageId();
    const timestamp = new Date().toISOString();
    
    // Normalize recipients
    const recipients = Array.isArray(input.to) ? input.to : [input.to];
    
    // Check for bounce emails
    const shouldBounce = recipients.some(email => this.bounceEmails.includes(email));
    
    // Simulate random failures
    const shouldFail = !shouldBounce && Math.random() < this.failureRate;
    
    // Simulate network delay
    await this.simulateDelay();
    
    // Determine status
    let status: NotificationResult['status'] = 'delivered';
    if (shouldBounce) status = 'bounced';
    if (shouldFail) status = 'failed';
    
    const result: NotificationResult = {
      id: messageId,
      status,
      channel: 'email',
      timestamp,
      provider: 'mock',
      metadata: {
        from: input.from || 'noreply@tickettoken.com',
        to: recipients,
        subject: input.subject,
        hasHtml: !!input.html,
        hasText: !!input.text,
        attachments: input.attachments?.length || 0,
        tags: input.tags || [],
        deliveryTime: this.deliveryDelay
      }
    };

    // Store and log
    this.sentEmails.push(result);
    await this.logToFile(result);
    
    // Throw error for failures (after logging)
    if (shouldBounce) {
      throw new Error(`Email bounced: ${recipients.join(', ')}`);
    }
    if (shouldFail) {
      throw new Error('Mock provider simulated failure');
    }
    
    return result;
  }

  async sendBulk(inputs: SendEmailInput[]): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];
    for (const input of inputs) {
      try {
        const result = await this.send(input);
        results.push(result);
      } catch (error: any) {
        results.push({
          id: this.generateMessageId(),
          status: 'failed',
          channel: 'email',
          timestamp: new Date().toISOString(),
          provider: 'mock',
          metadata: { error: error.message, to: input.to }
        });
      }
    }
    return results;
  }

  async verify(): Promise<boolean> {
    await this.ensureLogDirectory();
    logger.info('MockEmailProvider: Verified (always ready)');
    return true;
  }

  async getStatus(): Promise<Record<string, any>> {
    const today = new Date().toDateString();
    return {
      provider: 'MockEmailProvider',
      status: 'operational',
      mode: 'mock',
      sentToday: this.sentEmails.filter(e => 
        new Date(e.timestamp).toDateString() === today
      ).length,
      totalSent: this.sentEmails.length,
      failureRate: this.failureRate,
      deliveryDelay: this.deliveryDelay,
      timestamp: new Date().toISOString()
    };
  }

  private async logToFile(result: NotificationResult): Promise<void> {
    const logEntry = JSON.stringify(result) + '\n';
    await fs.appendFile(this.logPath, logEntry);
  }

  private generateMessageId(): string {
    return `mock_${Date.now()}_${crypto.randomBytes(8).toString('hex')}@tickettoken.com`;
  }

  private async simulateDelay(): Promise<void> {
    const delay = this.deliveryDelay + Math.random() * 500;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  // Test helpers
  async getLastEmail(): Promise<NotificationResult | undefined> {
    return this.sentEmails[this.sentEmails.length - 1];
  }

  async clearSentEmails(): Promise<void> {
    this.sentEmails = [];
  }
}

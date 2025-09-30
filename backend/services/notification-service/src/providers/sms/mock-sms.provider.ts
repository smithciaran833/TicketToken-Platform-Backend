import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { BaseSMSProvider, SendSMSInput } from './base-sms.provider';
import { NotificationResult } from '../base.provider';

export class MockSMSProvider extends BaseSMSProvider {
  private sentMessages: NotificationResult[] = [];
  private logPath: string;
  private failureRate: number;
  private deliveryDelay: number;

  constructor(config: any = {}) {
    super(config);
    this.logPath = process.env.MOCK_SMS_LOG_PATH || './logs/mock-sms.log';
    this.failureRate = parseFloat(process.env.MOCK_SMS_FAILURE_RATE || '0.03');
    this.deliveryDelay = parseInt(process.env.MOCK_SMS_DELAY || '500');
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

  async send(input: SendSMSInput): Promise<NotificationResult> {
    const messageId = this.generateMessageId();
    const timestamp = new Date().toISOString();
    
    // Validate phone number
    if (!this.validatePhoneNumber(input.to)) {
      throw new Error(`Invalid phone number format: ${input.to}`);
    }
    
    // Simulate random failures
    const shouldFail = Math.random() < this.failureRate;
    
    // Simulate network delay
    await this.simulateDelay();
    
    const result: NotificationResult = {
      id: messageId,
      status: shouldFail ? 'failed' : 'delivered',
      channel: 'sms',
      timestamp,
      provider: 'mock',
      metadata: {
        from: input.from || '+1234567890',
        to: input.to,
        messageLength: input.message.length,
        segments: Math.ceil(input.message.length / 160),
        deliveryTime: this.deliveryDelay
      }
    };

    // Store and log
    this.sentMessages.push(result);
    await this.logToFile(result);
    
    if (shouldFail) {
      throw new Error('Mock SMS provider simulated failure');
    }
    
    return result;
  }

  async sendBulk(inputs: SendSMSInput[]): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];
    for (const input of inputs) {
      try {
        const result = await this.send(input);
        results.push(result);
      } catch (error: any) {
        results.push({
          id: this.generateMessageId(),
          status: 'failed',
          channel: 'sms',
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
    console.log('MockSMSProvider: Verified (always ready)');
    return true;
  }

  async getStatus(): Promise<Record<string, any>> {
    return {
      provider: 'MockSMSProvider',
      status: 'operational',
      mode: 'mock',
      totalSent: this.sentMessages.length,
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
    return `sms_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  }

  private async simulateDelay(): Promise<void> {
    const delay = this.deliveryDelay + Math.random() * 200;
    return new Promise(resolve => setTimeout(resolve, delay));
  }
}

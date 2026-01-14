import twilio from 'twilio';
import * as crypto from 'crypto';
import { BaseSMSProvider, SendSMSInput } from './base-sms.provider';
import { NotificationResult } from '../base.provider';
import { logger } from '../../config/logger';
import { metricsService } from '../../services/metrics.service';

/**
 * Twilio message response type
 */
interface TwilioMessageResponse {
  sid: string;
  status: string;
  from: string;
  to: string;
  numSegments?: string;
}

/**
 * AUDIT FIX EXT-H1: Provider timeout configuration
 */
const TWILIO_TIMEOUT_MS = parseInt(process.env.TWILIO_TIMEOUT_MS || '30000', 10);

/**
 * AUDIT FIX EXT-H1: Wrap function with timeout
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle!);
    throw error;
  }
}

export class TwilioSMSProvider extends BaseSMSProvider {
  private client: any;
  private initialized = false;
  private fromNumber: string;
  private timeoutMs: number;

  constructor(config: any = {}) {
    super(config);
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';
    // AUDIT FIX EXT-H1: Configurable timeout
    this.timeoutMs = config.timeout || TWILIO_TIMEOUT_MS;
  }

  async verify(): Promise<boolean> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !phoneNumber) {
      logger.error('Twilio credentials not configured', {
        hasAccountSid: !!accountSid,
        hasAuthToken: !!authToken,
        hasPhoneNumber: !!phoneNumber
      });
      return false;
    }

    try {
      this.client = twilio(accountSid, authToken);
      this.fromNumber = phoneNumber;
      this.initialized = true;
      
      logger.info('Twilio SMS provider initialized and verified');
      return true;
    } catch (error) {
      logger.error('Twilio verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  async send(input: SendSMSInput): Promise<NotificationResult> {
    if (!this.initialized) {
      throw new Error('Twilio provider not initialized. Call verify() first.');
    }

    const messageId = this.generateMessageId();
    const timestamp = new Date().toISOString();
    const startTime = Date.now();

    // Validate phone number
    if (!this.validatePhoneNumber(input.to)) {
      logger.error('Invalid phone number format', { to: input.to });
      return {
        id: messageId,
        status: 'failed',
        channel: 'sms',
        timestamp,
        provider: 'twilio',
        metadata: {
          error: `Invalid phone number format: ${input.to}`,
          to: input.to
        }
      };
    }

    try {
      // AUDIT FIX EXT-H1: Send with timeout
      const message = await withTimeout<TwilioMessageResponse>(
        this.client.messages.create({
          body: input.message,
          from: input.from || this.fromNumber,
          to: input.to
        }),
        this.timeoutMs,
        'Twilio SMS send'
      );

      // Track provider metrics
      const duration = (Date.now() - startTime) / 1000;
      metricsService.recordProviderResponseTime('twilio', 'sms', 'send', duration);
      metricsService.setProviderStatus('twilio', 'sms', true);

      logger.info('SMS sent successfully via Twilio', {
        messageId,
        twilioSid: message.sid,
        to: input.to,
        status: message.status
      });

      return {
        id: message.sid || messageId,
        status: this.mapTwilioStatus(message.status),
        channel: 'sms',
        timestamp,
        provider: 'twilio',
        metadata: {
          from: message.from,
          to: message.to,
          messageLength: input.message.length,
          segments: message.numSegments || Math.ceil(input.message.length / 160),
          twilioStatus: message.status,
          twilioSid: message.sid
        }
      };
    } catch (error: any) {
      // Track provider error
      metricsService.setProviderStatus('twilio', 'sms', false);
      
      logger.error('Failed to send SMS via Twilio', {
        error: error.message,
        to: input.to,
        code: error.code,
        status: error.status
      });

      return {
        id: messageId,
        status: 'failed',
        channel: 'sms',
        timestamp,
        provider: 'twilio',
        metadata: {
          error: error.message,
          to: input.to,
          errorCode: error.code,
          errorStatus: error.status
        }
      };
    }
  }

  async sendBulk(inputs: SendSMSInput[]): Promise<NotificationResult[]> {
    if (!this.initialized) {
      throw new Error('Twilio provider not initialized. Call verify() first.');
    }

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
          provider: 'twilio',
          metadata: {
            error: error.message,
            to: input.to
          }
        });
      }
    }

    logger.info('Bulk SMS processed via Twilio', {
      total: inputs.length,
      successful: results.filter(r => r.status === 'delivered').length,
      failed: results.filter(r => r.status === 'failed').length
    });

    return results;
  }

  async getStatus(): Promise<Record<string, any>> {
    return {
      provider: 'TwilioSMSProvider',
      status: this.initialized ? 'operational' : 'not_initialized',
      initialized: this.initialized,
      hasCredentials: !!(process.env.TWILIO_ACCOUNT_SID && 
                         process.env.TWILIO_AUTH_TOKEN && 
                         process.env.TWILIO_PHONE_NUMBER),
      fromNumber: this.fromNumber ? `${this.fromNumber.substring(0, 6)}***` : 'not_set',
      timestamp: new Date().toISOString()
    };
  }

  private generateMessageId(): string {
    return `twilio_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  }

  private mapTwilioStatus(twilioStatus: string): NotificationResult['status'] {
    switch (twilioStatus) {
      case 'delivered':
      case 'sent':
        return 'delivered';
      case 'failed':
      case 'undelivered':
        return 'failed';
      case 'queued':
      case 'sending':
      case 'accepted':
        return 'queued';
      default:
        return 'failed';
    }
  }
}

import sgMail from '@sendgrid/mail';
import * as crypto from 'crypto';
import { BaseEmailProvider, SendEmailInput } from './base-email.provider';
import { NotificationResult } from '../base.provider';
import { logger } from '../../config/logger';
import { metricsService } from '../../services/metrics.service';

/**
 * AUDIT FIX EXT-H1: Provider timeout configuration
 */
const SENDGRID_TIMEOUT_MS = parseInt(process.env.SENDGRID_TIMEOUT_MS || '30000', 10);

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

export class SendGridEmailProvider extends BaseEmailProvider {
  private initialized = false;
  private timeoutMs: number;

  constructor(config: any = {}) {
    super(config);
    // AUDIT FIX EXT-H1: Configurable timeout
    this.timeoutMs = config.timeout || SENDGRID_TIMEOUT_MS;
  }

  async verify(): Promise<boolean> {
    const apiKey = process.env.SENDGRID_API_KEY;
    
    if (!apiKey) {
      logger.error('SENDGRID_API_KEY environment variable is not set');
      return false;
    }

    try {
      sgMail.setApiKey(apiKey);
      this.initialized = true;
      logger.info('SendGrid email provider initialized and verified');
      return true;
    } catch (error) {
      logger.error('SendGrid verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  async send(input: SendEmailInput): Promise<NotificationResult> {
    if (!this.initialized) {
      throw new Error('SendGrid provider not initialized. Call verify() first.');
    }

    const messageId = this.generateMessageId();
    const timestamp = new Date().toISOString();
    const recipients = Array.isArray(input.to) ? input.to : [input.to];
    const startTime = Date.now();

    try {
      // Ensure we have at least html or text content
      if (!input.html && !input.text) {
        throw new Error('Email must have either html or text content');
      }

      const msg: any = {
        to: recipients,
        from: input.from || process.env.SENDGRID_FROM_EMAIL || 'noreply@tickettoken.com',
        subject: input.subject,
        ...(input.html && { html: input.html }),
        ...(input.text && { text: input.text }),
        ...(input.cc && { cc: input.cc }),
        ...(input.bcc && { bcc: input.bcc }),
        ...(input.replyTo && { replyTo: input.replyTo }),
        ...(input.attachments && { attachments: input.attachments.map(att => ({
          filename: att.filename,
          content: att.content.toString('base64'),
          type: att.contentType,
          disposition: 'attachment'
        })) })
      };

      // AUDIT FIX EXT-H1: Send with timeout
      await withTimeout(sgMail.send(msg), this.timeoutMs, 'SendGrid email send');
      
      // Track provider metrics
      const duration = (Date.now() - startTime) / 1000;
      metricsService.recordProviderResponseTime('sendgrid', 'email', 'send', duration);
      metricsService.setProviderStatus('sendgrid', 'email', true);
      
      logger.info('Email sent successfully via SendGrid', {
        messageId,
        to: recipients,
        subject: input.subject
      });

      return {
        id: messageId,
        status: 'delivered',
        channel: 'email',
        timestamp,
        provider: 'sendgrid',
        metadata: {
          from: msg.from,
          to: recipients,
          subject: input.subject,
          hasHtml: !!input.html,
          hasText: !!input.text,
          attachments: input.attachments?.length || 0,
          tags: input.tags || []
        }
      };
    } catch (error: any) {
      // Track provider error
      metricsService.setProviderStatus('sendgrid', 'email', false);
      
      logger.error('Failed to send email via SendGrid', {
        error: error.message,
        to: recipients,
        subject: input.subject,
        code: error.code,
        response: error.response?.body
      });

      // Return failed result instead of throwing
      return {
        id: messageId,
        status: 'failed',
        channel: 'email',
        timestamp,
        provider: 'sendgrid',
        metadata: {
          error: error.message,
          to: recipients,
          errorCode: error.code
        }
      };
    }
  }

  async sendBulk(inputs: SendEmailInput[]): Promise<NotificationResult[]> {
    if (!this.initialized) {
      throw new Error('SendGrid provider not initialized. Call verify() first.');
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
          channel: 'email',
          timestamp: new Date().toISOString(),
          provider: 'sendgrid',
          metadata: { 
            error: error.message,
            to: input.to 
          }
        });
      }
    }

    logger.info('Bulk emails processed via SendGrid', {
      total: inputs.length,
      successful: results.filter(r => r.status === 'delivered').length,
      failed: results.filter(r => r.status === 'failed').length
    });

    return results;
  }

  async getStatus(): Promise<Record<string, any>> {
    return {
      provider: 'SendGridEmailProvider',
      status: this.initialized ? 'operational' : 'not_initialized',
      initialized: this.initialized,
      hasApiKey: !!process.env.SENDGRID_API_KEY,
      timestamp: new Date().toISOString()
    };
  }

  private generateMessageId(): string {
    return `sendgrid_${Date.now()}_${crypto.randomBytes(8).toString('hex')}@tickettoken.com`;
  }
}

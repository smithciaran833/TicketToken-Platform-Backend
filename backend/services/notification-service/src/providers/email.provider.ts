import sgMail from '@sendgrid/mail';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { NotificationResponse } from '../types/notification.types';

interface EmailOptions {
  to: string;
  from: string;
  fromName?: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: Array<{
    content: string;
    filename: string;
    type?: string;
    disposition?: string;
  }>;
}

class EmailProvider {
  constructor() {
    if (env.SENDGRID_API_KEY) {
      sgMail.setApiKey(env.SENDGRID_API_KEY);
    }
  }

  async send(options: EmailOptions): Promise<NotificationResponse> {
    try {
      if (!env.ENABLE_EMAIL) {
        logger.info('Email sending disabled', { to: options.to });
        return {
          id: 'mock-' + Date.now(),
          status: 'sent',
          channel: 'email',
        };
      }

      const msg = {
        to: options.to,
        from: {
          email: options.from,
          name: options.fromName || env.SENDGRID_FROM_NAME,
        },
        subject: options.subject,
        text: options.text,
        html: options.html || options.text,
        replyTo: options.replyTo,
        attachments: options.attachments,
        trackingSettings: {
          clickTracking: {
            enable: true,
          },
          openTracking: {
            enable: true,
          },
        },
      };

      const [response] = await sgMail.send(msg);

      logger.info('Email sent successfully', {
        to: options.to,
        subject: options.subject,
        messageId: response.headers['x-message-id'],
      });

      return {
        id: response.headers['x-message-id'] || 'sg-' + Date.now(),
        status: 'sent',
        channel: 'email',
        sentAt: new Date(),
        providerMessageId: response.headers['x-message-id'],
        cost: 0.0001, // Approximate SendGrid cost per email
      };
    } catch (error: any) {
      logger.error('Failed to send email', {
        to: options.to,
        error: error.message,
        code: error.code,
      });

      // Handle specific SendGrid errors
      if (error.code === 401) {
        throw new Error('Invalid SendGrid API key');
      }

      if (error.response?.body?.errors) {
        const sgError = error.response.body.errors[0];
        throw new Error(sgError.message || 'SendGrid error');
      }

      throw error;
    }
  }

  async sendBulk(messages: EmailOptions[]): Promise<NotificationResponse[]> {
    // SendGrid supports up to 1000 recipients per request
    const chunks = this.chunkArray(messages, 1000);
    const results: NotificationResponse[] = [];

    for (const chunk of chunks) {
      const promises = chunk.map(msg => this.send(msg));
      const chunkResults = await Promise.allSettled(promises);
      
      results.push(...chunkResults.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            id: 'failed-' + Date.now() + '-' + index,
            status: 'failed' as const,
            channel: 'email' as const,
            failureReason: result.reason.message,
          };
        }
      }));
    }

    return results;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  async validateEmail(email: string): Promise<boolean> {
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

export const emailProvider = new EmailProvider();

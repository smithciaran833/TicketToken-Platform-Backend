import twilio from 'twilio';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { NotificationResponse } from '../types/notification.types';

interface SmsOptions {
  to: string;
  body: string;
  from?: string;
  mediaUrl?: string[];
}

class SmsProvider {
  private client: twilio.Twilio | null = null;

  constructor() {
    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
      this.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    }
  }

  async send(options: SmsOptions): Promise<NotificationResponse> {
    try {
      if (!env.ENABLE_SMS) {
        logger.info('SMS sending disabled', { to: options.to });
        return {
          id: 'mock-sms-' + Date.now(),
          status: 'sent',
          channel: 'sms',
        };
      }

      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      // Format phone number
      const toNumber = this.formatPhoneNumber(options.to);
      
      const message = await this.client.messages.create({
        body: options.body,
        to: toNumber,
        from: options.from || env.TWILIO_FROM_NUMBER,
        messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
        mediaUrl: options.mediaUrl,
      });

      logger.info('SMS sent successfully', {
        to: toNumber,
        sid: message.sid,
        status: message.status,
      });

      return {
        id: message.sid,
        status: this.mapTwilioStatus(message.status),
        channel: 'sms',
        sentAt: new Date(),
        providerMessageId: message.sid,
        cost: message.price ? Math.abs(parseFloat(message.price)) : 0.0079, // Approximate cost
      };
    } catch (error: any) {
      logger.error('Failed to send SMS', {
        to: options.to,
        error: error.message,
        code: error.code,
      });

      // Handle specific Twilio errors
      if (error.code === 20003) {
        throw new Error('Invalid Twilio credentials');
      }
      if (error.code === 21211) {
        throw new Error('Invalid phone number');
      }
      if (error.code === 21610) {
        throw new Error('Recipient has opted out of SMS');
      }

      throw error;
    }
  }

  async sendBulk(messages: SmsOptions[]): Promise<NotificationResponse[]> {
    const results: NotificationResponse[] = [];

    // Process in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const promises = batch.map(msg => this.send(msg));
      const batchResults = await Promise.allSettled(promises);
      
      results.push(...batchResults.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            id: 'failed-sms-' + Date.now() + '-' + index,
            status: 'failed' as const,
            channel: 'sms' as const,
            failureReason: result.reason.message,
          };
        }
      }));

      // Add delay between batches to respect rate limits
      if (i + batchSize < messages.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  private formatPhoneNumber(phone: string): string {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');

    // Add US country code if not present
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }

    // Add + prefix if not present
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }

    return cleaned;
  }

  private mapTwilioStatus(status: string): NotificationResponse['status'] {
    switch (status) {
      case 'queued':
      case 'accepted':
        return 'queued';
      case 'sending':
        return 'sending';
      case 'sent':
      case 'delivered':
        return 'delivered';
      case 'failed':
      case 'undelivered':
        return 'failed';
      default:
        return 'sent';
    }
  }

  async validatePhoneNumber(phone: string): Promise<boolean> {
    if (!this.client) {
      // Basic validation if Twilio is not configured
      const cleaned = phone.replace(/\D/g, '');
      return cleaned.length >= 10 && cleaned.length <= 15;
    }

    try {
      const lookup = await this.client.lookups.v1
        .phoneNumbers(phone)
        .fetch();
      
      return lookup.phoneNumber !== null;
    } catch (error) {
      logger.warn('Phone validation failed', { phone, error });
      return false;
    }
  }

  async getDeliveryStatus(messageSid: string): Promise<string> {
    if (!this.client) {
      throw new Error('Twilio client not initialized');
    }

    const message = await this.client.messages(messageSid).fetch();
    return message.status;
  }
}

export const smsProvider = new SmsProvider();

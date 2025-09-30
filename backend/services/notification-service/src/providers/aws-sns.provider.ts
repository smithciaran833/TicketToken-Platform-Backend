// @ts-nocheck
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import AWS from 'aws-sdk';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { NotificationResponse } from '../types/notification.types';

interface SNSSmsOptions {
  to: string;
  body: string;
  messageType?: 'Transactional' | 'Promotional';
}

class AWSSNSProvider {
  private sns: AWS.SNS;

  constructor() {
    this.sns = new AWS.SNS({
      region: env.AWS_REGION || 'us-east-1',
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    });
  }

  async send(options: SNSSmsOptions): Promise<NotificationResponse> {
    try {
      const params: AWS.SNS.PublishRequest = {
        Message: options.body,
        PhoneNumber: this.formatPhoneNumber(options.to),
        MessageAttributes: {
          'AWS.SNS.SMS.SMSType': {
            DataType: 'String',
            StringValue: options.messageType || 'Transactional',
          },
          'AWS.SNS.SMS.SenderID': {
            DataType: 'String',
            StringValue: 'TicketToken',
          },
        },
      };

      const result = await this.sns.publish(params).promise();

      logger.info('SMS sent via AWS SNS', {
        messageId: result.MessageId,
        to: options.to,
      });

      return {
        id: result.MessageId!,
        status: 'sent',
        channel: 'sms',
        sentAt: new Date(),
        providerMessageId: result.MessageId,
        cost: 0.00645, // AWS SNS pricing for US
      };
    } catch (error: any) {
      logger.error('AWS SNS send failed', error);
      throw error;
    }
  }

  private formatPhoneNumber(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    return cleaned;
  }

  async setSMSAttributes(attributes: AWS.SNS.SetSMSAttributesInput): Promise<void> {
    await this.sns.setSMSAttributes(attributes).promise();
  }
}

export const awsSNSProvider = new AWSSNSProvider();

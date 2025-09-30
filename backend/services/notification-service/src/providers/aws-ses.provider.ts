// @ts-nocheck
import AWS from 'aws-sdk';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { NotificationResponse } from '../types/notification.types';

interface SESEmailOptions {
  to: string | string[];
  from: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

class AWSSESProvider {
  private ses: AWS.SES;

  constructor() {
    this.ses = new AWS.SES({
      region: env.AWS_REGION || 'us-east-1',
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    });
  }

  async send(options: SESEmailOptions): Promise<NotificationResponse> {
    try {
      const params: AWS.SES.SendEmailRequest = {
        Source: options.from,
        Destination: {
          ToAddresses: Array.isArray(options.to) ? options.to : [options.to],
        },
        Message: {
          Subject: {
            Data: options.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Text: {
              Data: options.text,
              Charset: 'UTF-8',
            },
            ...(options.html && {
              Html: {
                Data: options.html,
                Charset: 'UTF-8',
              },
            }),
          },
        },
        ...(options.replyTo && { ReplyToAddresses: [options.replyTo] }),
      };

      const result = await this.ses.sendEmail(params).promise();

      logger.info('Email sent via AWS SES', {
        messageId: result.MessageId,
        to: options.to,
      });

      return {
        id: result.MessageId,
        status: 'sent',
        channel: 'email',
        sentAt: new Date(),
        providerMessageId: result.MessageId,
        cost: 0.0001, // AWS SES pricing
      };
    } catch (error: any) {
      logger.error('AWS SES send failed', error);
      throw error;
    }
  }

  async getQuota(): Promise<AWS.SES.GetSendQuotaResponse> {
    return await this.ses.getSendQuota().promise();
  }

  async verifyEmailIdentity(email: string): Promise<void> {
    await this.ses.verifyEmailIdentity({ EmailAddress: email }).promise();
  }
}

export const awsSESProvider = new AWSSESProvider();

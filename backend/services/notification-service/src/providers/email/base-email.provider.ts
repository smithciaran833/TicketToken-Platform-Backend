import { BaseProvider, NotificationResult } from '../base.provider';

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  tags?: string[];
  metadata?: Record<string, any>;
}

export abstract class BaseEmailProvider extends BaseProvider {
  abstract send(input: SendEmailInput): Promise<NotificationResult>;
  abstract sendBulk(inputs: SendEmailInput[]): Promise<NotificationResult[]>;
}

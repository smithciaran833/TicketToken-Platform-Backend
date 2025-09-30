import { BaseProvider, NotificationResult } from '../base.provider';

export interface SendSMSInput {
  to: string;
  message: string;
  from?: string;
  metadata?: Record<string, any>;
}

export abstract class BaseSMSProvider extends BaseProvider {
  abstract send(input: SendSMSInput): Promise<NotificationResult>;
  abstract sendBulk(inputs: SendSMSInput[]): Promise<NotificationResult[]>;
  
  protected validatePhoneNumber(phone: string): boolean {
    // E.164 format validation
    return /^\+[1-9]\d{1,14}$/.test(phone);
  }
}

import { MockEmailProvider } from './email/mock-email.provider';
import { MockSMSProvider } from './sms/mock-sms.provider';
import { BaseEmailProvider } from './email/base-email.provider';
import { BaseSMSProvider } from './sms/base-sms.provider';

export class ProviderFactory {
  private static emailProvider: BaseEmailProvider;
  private static smsProvider: BaseSMSProvider;

  static getEmailProvider(): BaseEmailProvider {
    if (!this.emailProvider) {
      const mode = process.env.NOTIFICATION_MODE || 'mock';
      
      if (mode === 'mock') {
        this.emailProvider = new MockEmailProvider();
      } else if (mode === 'production') {
        // TODO: Implement real providers when ready
        // this.emailProvider = new SendGridProvider();
        console.warn('Production email provider not configured, using mock');
        this.emailProvider = new MockEmailProvider();
      } else {
        this.emailProvider = new MockEmailProvider();
      }
    }
    return this.emailProvider;
  }

  static getSMSProvider(): BaseSMSProvider {
    if (!this.smsProvider) {
      const mode = process.env.NOTIFICATION_MODE || 'mock';
      
      if (mode === 'mock') {
        this.smsProvider = new MockSMSProvider();
      } else if (mode === 'production') {
        // TODO: Implement real providers when ready
        // this.smsProvider = new TwilioProvider();
        console.warn('Production SMS provider not configured, using mock');
        this.smsProvider = new MockSMSProvider();
      } else {
        this.smsProvider = new MockSMSProvider();
      }
    }
    return this.smsProvider;
  }

  static async verifyProviders(): Promise<boolean> {
    const emailOk = await this.getEmailProvider().verify();
    const smsOk = await this.getSMSProvider().verify();
    return emailOk && smsOk;
  }

  static async getProvidersStatus(): Promise<Record<string, any>> {
    const emailStatus = await this.getEmailProvider().getStatus();
    const smsStatus = await this.getSMSProvider().getStatus();
    return {
      email: emailStatus,
      sms: smsStatus,
      mode: process.env.NOTIFICATION_MODE || 'mock'
    };
  }
}

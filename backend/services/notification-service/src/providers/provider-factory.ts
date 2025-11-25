import { MockEmailProvider } from './email/mock-email.provider';
import { SendGridEmailProvider } from './email/sendgrid-email.provider';
import { MockSMSProvider } from './sms/mock-sms.provider';
import { TwilioSMSProvider } from './sms/twilio-sms.provider';
import { BaseEmailProvider } from './email/base-email.provider';
import { BaseSMSProvider } from './sms/base-sms.provider';
import { logger } from '../config/logger';
import { metricsService } from '../services/metrics.service';

export class ProviderFactory {
  private static emailProvider: BaseEmailProvider;
  private static smsProvider: BaseSMSProvider;

  static getEmailProvider(): BaseEmailProvider {
    if (!this.emailProvider) {
      const mode = process.env.NOTIFICATION_MODE || 'mock';
      
      if (mode === 'mock') {
        this.emailProvider = new MockEmailProvider();
        logger.info('Using MockEmailProvider');
      } else if (mode === 'production') {
        this.emailProvider = new SendGridEmailProvider();
        logger.info('Using SendGridEmailProvider');
      } else {
        this.emailProvider = new MockEmailProvider();
        logger.info('Using MockEmailProvider (default)');
      }
    }
    return this.emailProvider;
  }

  static getSMSProvider(): BaseSMSProvider {
    if (!this.smsProvider) {
      const mode = process.env.NOTIFICATION_MODE || 'mock';
      
      if (mode === 'mock') {
        this.smsProvider = new MockSMSProvider();
        logger.info('Using MockSMSProvider');
      } else if (mode === 'production') {
        this.smsProvider = new TwilioSMSProvider();
        logger.info('Using TwilioSMSProvider');
      } else {
        this.smsProvider = new MockSMSProvider();
        logger.info('Using MockSMSProvider (default)');
      }
    }
    return this.smsProvider;
  }

  static async verifyProviders(): Promise<boolean> {
    const emailOk = await this.getEmailProvider().verify();
    const smsOk = await this.getSMSProvider().verify();
    
    // Update provider status metrics
    const mode = process.env.NOTIFICATION_MODE || 'mock';
    const emailProvider = mode === 'production' ? 'sendgrid' : 'mock';
    const smsProvider = mode === 'production' ? 'twilio' : 'mock';
    
    metricsService.setProviderStatus(emailProvider, 'email', emailOk);
    metricsService.setProviderStatus(smsProvider, 'sms', smsOk);
    
    return emailOk && smsOk;
  }

  static async getProvidersStatus(): Promise<Record<string, any>> {
    const emailStatus = await this.getEmailProvider().getStatus();
    const smsStatus = await this.getSMSProvider().getStatus();
    
    const mode = process.env.NOTIFICATION_MODE || 'mock';
    
    return {
      email: emailStatus,
      sms: smsStatus,
      mode,
      health: {
        email: emailStatus.status === 'operational',
        sms: smsStatus.status === 'operational'
      }
    };
  }
  
  /**
   * Get provider health score (0-100)
   */
  static async getProviderHealth(): Promise<{ email: number; sms: number }> {
    try {
      const emailProvider = this.getEmailProvider();
      const smsProvider = this.getSMSProvider();
      
      const [emailOk, smsOk] = await Promise.all([
        emailProvider.verify(),
        smsProvider.verify()
      ]);
      
      return {
        email: emailOk ? 100 : 0,
        sms: smsOk ? 100 : 0
      };
    } catch (error) {
      logger.error('Failed to get provider health', { error });
      return { email: 0, sms: 0 };
    }
  }
}

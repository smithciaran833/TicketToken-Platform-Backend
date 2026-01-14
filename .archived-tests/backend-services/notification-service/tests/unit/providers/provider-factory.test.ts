import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ProviderFactory } from '../../../src/providers/provider-factory';
import { MockEmailProvider } from '../../../src/providers/email/mock-email.provider';
import { SendGridEmailProvider } from '../../../src/providers/email/sendgrid-email.provider';
import { MockSMSProvider } from '../../../src/providers/sms/mock-sms.provider';
import { TwilioSMSProvider } from '../../../src/providers/sms/twilio-sms.provider';

describe('ProviderFactory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Reset singleton instances
    (ProviderFactory as any).emailProvider = null;
    (ProviderFactory as any).smsProvider = null;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getEmailProvider()', () => {
    it('should return MockEmailProvider when mode is "mock"', () => {
      process.env.NOTIFICATION_MODE = 'mock';

      const provider = ProviderFactory.getEmailProvider();

      expect(provider).toBeInstanceOf(MockEmailProvider);
    });

    it('should return SendGridEmailProvider when mode is "production"', () => {
      process.env.NOTIFICATION_MODE = 'production';

      const provider = ProviderFactory.getEmailProvider();

      expect(provider).toBeInstanceOf(SendGridEmailProvider);
    });

    it('should return MockEmailProvider when mode is not set (default)', () => {
      delete process.env.NOTIFICATION_MODE;

      const provider = ProviderFactory.getEmailProvider();

      expect(provider).toBeInstanceOf(MockEmailProvider);
    });

    it('should return MockEmailProvider when mode is invalid', () => {
      process.env.NOTIFICATION_MODE = 'invalid-mode';

      const provider = ProviderFactory.getEmailProvider();

      expect(provider).toBeInstanceOf(MockEmailProvider);
    });

    it('should return same instance on multiple calls (singleton)', () => {
      process.env.NOTIFICATION_MODE = 'mock';

      const provider1 = ProviderFactory.getEmailProvider();
      const provider2 = ProviderFactory.getEmailProvider();

      expect(provider1).toBe(provider2);
    });

    it('should cache provider instance', () => {
      process.env.NOTIFICATION_MODE = 'production';
      
      const provider1 = ProviderFactory.getEmailProvider();
      
      // Change mode after first call
      process.env.NOTIFICATION_MODE = 'mock';
      const provider2 = ProviderFactory.getEmailProvider();

      // Should still return cached production provider
      expect(provider1).toBe(provider2);
      expect(provider2).toBeInstanceOf(SendGridEmailProvider);
    });
  });

  describe('getSMSProvider()', () => {
    it('should return MockSMSProvider when mode is "mock"', () => {
      process.env.NOTIFICATION_MODE = 'mock';

      const provider = ProviderFactory.getSMSProvider();

      expect(provider).toBeInstanceOf(MockSMSProvider);
    });

    it('should return TwilioSMSProvider when mode is "production"', () => {
      process.env.NOTIFICATION_MODE = 'production';

      const provider = ProviderFactory.getSMSProvider();

      expect(provider).toBeInstanceOf(TwilioSMSProvider);
    });

    it('should return MockSMSProvider when mode is not set (default)', () => {
      delete process.env.NOTIFICATION_MODE;

      const provider = ProviderFactory.getSMSProvider();

      expect(provider).toBeInstanceOf(MockSMSProvider);
    });

    it('should return MockSMSProvider when mode is invalid', () => {
      process.env.NOTIFICATION_MODE = 'invalid-mode';

      const provider = ProviderFactory.getSMSProvider();

      expect(provider).toBeInstanceOf(MockSMSProvider);
    });

    it('should return same instance on multiple calls (singleton)', () => {
      process.env.NOTIFICATION_MODE = 'mock';

      const provider1 = ProviderFactory.getSMSProvider();
      const provider2 = ProviderFactory.getSMSProvider();

      expect(provider1).toBe(provider2);
    });

    it('should cache provider instance', () => {
      process.env.NOTIFICATION_MODE = 'production';
      
      const provider1 = ProviderFactory.getSMSProvider();
      
      // Change mode after first call
      process.env.NOTIFICATION_MODE = 'mock';
      const provider2 = ProviderFactory.getSMSProvider();

      // Should still return cached production provider
      expect(provider1).toBe(provider2);
      expect(provider2).toBeInstanceOf(TwilioSMSProvider);
    });
  });

  describe('verifyProviders()', () => {
    it('should verify both email and SMS providers in mock mode', async () => {
      process.env.NOTIFICATION_MODE = 'mock';

      const result = await ProviderFactory.verifyProviders();

      expect(result).toBe(true);
    });

    it('should return false if email provider verification fails', async () => {
      process.env.NOTIFICATION_MODE = 'production';
      // Missing SendGrid credentials
      delete process.env.SENDGRID_API_KEY;
      // Valid Twilio credentials
      process.env.TWILIO_ACCOUNT_SID = 'test-sid';
      process.env.TWILIO_AUTH_TOKEN = 'test-token';
      process.env.TWILIO_PHONE_NUMBER = '+15555551234';

      const result = await ProviderFactory.verifyProviders();

      expect(result).toBe(false);
    });

    it('should return false if SMS provider verification fails', async () => {
      process.env.NOTIFICATION_MODE = 'production';
      // Valid SendGrid credentials
      process.env.SENDGRID_API_KEY = 'test-key';
      // Missing Twilio credentials
      delete process.env.TWILIO_ACCOUNT_SID;

      const result = await ProviderFactory.verifyProviders();

      expect(result).toBe(false);
    });

    it('should return false if both providers verification fails', async () => {
      process.env.NOTIFICATION_MODE = 'production';
      // Missing all credentials
      delete process.env.SENDGRID_API_KEY;
      delete process.env.TWILIO_ACCOUNT_SID;

      const result = await ProviderFactory.verifyProviders();

      expect(result).toBe(false);
    });

    it('should return true if both providers verify successfully in production', async () => {
      process.env.NOTIFICATION_MODE = 'production';
      process.env.SENDGRID_API_KEY = 'test-key';
      process.env.TWILIO_ACCOUNT_SID = 'test-sid';
      process.env.TWILIO_AUTH_TOKEN = 'test-token';
      process.env.TWILIO_PHONE_NUMBER = '+15555551234';

      const result = await ProviderFactory.verifyProviders();

      expect(result).toBe(true);
    });
  });

  describe('getProvidersStatus()', () => {
    it('should return status for both providers in mock mode', async () => {
      process.env.NOTIFICATION_MODE = 'mock';

      const status = await ProviderFactory.getProvidersStatus();

      expect(status).toHaveProperty('email');
      expect(status).toHaveProperty('sms');
      expect(status).toHaveProperty('mode');
      expect(status.mode).toBe('mock');
      expect(status.email.provider).toBe('MockEmailProvider');
      expect(status.sms.provider).toBe('MockSMSProvider');
    });

    it('should return status for both providers in production mode', async () => {
      process.env.NOTIFICATION_MODE = 'production';
      process.env.SENDGRID_API_KEY = 'test-key';
      process.env.TWILIO_ACCOUNT_SID = 'test-sid';
      process.env.TWILIO_AUTH_TOKEN = 'test-token';
      process.env.TWILIO_PHONE_NUMBER = '+15555551234';

      const status = await ProviderFactory.getProvidersStatus();

      expect(status.mode).toBe('production');
      expect(status.email.provider).toBe('SendGridEmailProvider');
      expect(status.sms.provider).toBe('TwilioSMSProvider');
    });

    it('should include initialization status', async () => {
      process.env.NOTIFICATION_MODE = 'mock';

      const status = await ProviderFactory.getProvidersStatus();

      expect(status.email).toHaveProperty('initialized');
      expect(status.sms).toHaveProperty('initialized');
    });

    it('should default to mock mode when not set', async () => {
      delete process.env.NOTIFICATION_MODE;

      const status = await ProviderFactory.getProvidersStatus();

      expect(status.mode).toBe('mock');
    });
  });

  describe('Provider independence', () => {
    it('should allow email and SMS providers to be in different states', () => {
      process.env.NOTIFICATION_MODE = 'mock';

      const emailProvider = ProviderFactory.getEmailProvider();
      const smsProvider = ProviderFactory.getSMSProvider();

      expect(emailProvider).toBeInstanceOf(MockEmailProvider);
      expect(smsProvider).toBeInstanceOf(MockSMSProvider);
      expect(emailProvider).not.toBe(smsProvider);
    });

    it('should maintain separate instances for email and SMS', () => {
      process.env.NOTIFICATION_MODE = 'production';

      const emailProvider = ProviderFactory.getEmailProvider();
      const smsProvider = ProviderFactory.getSMSProvider();

      expect(emailProvider).toBeInstanceOf(SendGridEmailProvider);
      expect(smsProvider).toBeInstanceOf(TwilioSMSProvider);
    });
  });

  describe('Mode switching scenarios', () => {
    it('should handle development to production transition', () => {
      // Start in development
      process.env.NOTIFICATION_MODE = 'mock';
      const devEmailProvider = ProviderFactory.getEmailProvider();
      expect(devEmailProvider).toBeInstanceOf(MockEmailProvider);

      // Reset factory
      (ProviderFactory as any).emailProvider = null;
      
      // Switch to production
      process.env.NOTIFICATION_MODE = 'production';
      const prodEmailProvider = ProviderFactory.getEmailProvider();
      expect(prodEmailProvider).toBeInstanceOf(SendGridEmailProvider);
    });

    it('should handle missing mode gracefully', () => {
      delete process.env.NOTIFICATION_MODE;

      const emailProvider = ProviderFactory.getEmailProvider();
      const smsProvider = ProviderFactory.getSMSProvider();

      expect(emailProvider).toBeInstanceOf(MockEmailProvider);
      expect(smsProvider).toBeInstanceOf(MockSMSProvider);
    });
  });
});

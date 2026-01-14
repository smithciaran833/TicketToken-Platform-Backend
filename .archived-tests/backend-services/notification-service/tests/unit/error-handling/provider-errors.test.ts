import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SendGridEmailProvider } from '../../../src/providers/email/sendgrid-email.provider';
import { TwilioSMSProvider } from '../../../src/providers/sms/twilio-sms.provider';

// Mock external dependencies
jest.mock('@sendgrid/mail');
jest.mock('twilio');

const mockSendGrid = require('@sendgrid/mail');
const mockTwilio = require('twilio');

describe('Provider Error Handling Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('SendGrid Email Provider - API Errors', () => {
    it('should handle missing API key error', async () => {
      delete process.env.SENDGRID_API_KEY;

      const provider = new SendGridEmailProvider();
      const verified = await provider.verify();

      expect(verified).toBe(false);
    });

    it('should handle invalid API key error', async () => {
      process.env.SENDGRID_API_KEY = 'invalid-key';

      mockSendGrid.setApiKey = jest.fn();
      mockSendGrid.send = jest.fn().mockRejectedValue({
        code: 401,
        message: 'Unauthorized',
        response: { body: { errors: [{ message: 'Invalid API key' }] } }
      });

      const provider = new SendGridEmailProvider();
      await provider.verify();

      const result = await provider.send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>'
      });

      expect(result.status).toBe('failed');
      expect(result.metadata.error).toContain('Unauthorized');
    });

    it('should handle rate limit errors from SendGrid', async () => {
      process.env.SENDGRID_API_KEY = 'valid-key';

      mockSendGrid.setApiKey = jest.fn();
      mockSendGrid.send = jest.fn().mockRejectedValue({
        code: 429,
        message: 'Too many requests',
        response: { body: { errors: [{ message: 'Rate limit exceeded' }] } }
      });

      const provider = new SendGridEmailProvider();
      await provider.verify();

      const result = await provider.send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>'
      });

      expect(result.status).toBe('failed');
      expect(result.metadata.errorCode).toBe(429);
    });

    it('should handle SendGrid service unavailable error', async () => {
      process.env.SENDGRID_API_KEY = 'valid-key';

      mockSendGrid.setApiKey = jest.fn();
      mockSendGrid.send = jest.fn().mockRejectedValue({
        code: 503,
        message: 'Service Unavailable',
        response: { body: { errors: [{ message: 'Service temporarily unavailable' }] } }
      });

      const provider = new SendGridEmailProvider();
      await provider.verify();

      const result = await provider.send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>'
      });

      expect(result.status).toBe('failed');
      expect(result.metadata.errorCode).toBe(503);
    });

    it('should handle invalid recipient email error', async () => {
      process.env.SENDGRID_API_KEY = 'valid-key';

      mockSendGrid.setApiKey = jest.fn();
      mockSendGrid.send = jest.fn().mockRejectedValue({
        code: 400,
        message: 'Bad Request',
        response: { body: { errors: [{ message: 'Invalid email address' }] } }
      });

      const provider = new SendGridEmailProvider();
      await provider.verify();

      const result = await provider.send({
        to: 'invalid-email',
        subject: 'Test',
        html: '<p>Test</p>'
      });

      expect(result.status).toBe('failed');
      expect(result.metadata.errorCode).toBe(400);
    });

    it('should handle missing content error', async () => {
      process.env.SENDGRID_API_KEY = 'valid-key';

      mockSendGrid.setApiKey = jest.fn();

      const provider = new SendGridEmailProvider();
      await provider.verify();

      const result = await provider.send({
        to: 'test@example.com',
        subject: 'Test',
        html: undefined as any,
        text: undefined as any
      });

      expect(result.status).toBe('failed');
      expect(result.metadata.error).toContain('Email must have either html or text content');
    });
  });

  describe('Twilio SMS Provider - API Errors', () => {
    it('should handle missing credentials error', async () => {
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;

      const provider = new TwilioSMSProvider();
      const verified = await provider.verify();

      expect(verified).toBe(false);
    });

    it('should handle invalid credentials error', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'invalid-sid';
      process.env.TWILIO_AUTH_TOKEN = 'invalid-token';
      process.env.TWILIO_PHONE_NUMBER = '+1234567890';

      const mockMessages = {
        create: jest.fn().mockRejectedValue({
          code: 20003,
          message: 'Authenticate',
          status: 401
        })
      };

      mockTwilio.mockReturnValue({
        messages: mockMessages
      });

      const provider = new TwilioSMSProvider();
      await provider.verify();

      const result = await provider.send({
        to: '+1234567890',
        body: 'Test message'
      });

      expect(result.status).toBe('failed');
      expect(result.metadata.error).toContain('Authenticate');
    });

    it('should handle invalid phone number error', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'valid-sid';
      process.env.TWILIO_AUTH_TOKEN = 'valid-token';
      process.env.TWILIO_PHONE_NUMBER = '+1234567890';

      const mockMessages = {
        create: jest.fn().mockRejectedValue({
          code: 21211,
          message: 'Invalid \'To\' Phone Number',
          status: 400
        })
      };

      mockTwilio.mockReturnValue({
        messages: mockMessages
      });

      const provider = new TwilioSMSProvider();
      await provider.verify();

      const result = await provider.send({
        to: 'invalid-number',
        body: 'Test message'
      });

      expect(result.status).toBe('failed');
      expect(result.metadata.errorCode).toBe(21211);
    });

    it('should handle insufficient balance error', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'valid-sid';
      process.env.TWILIO_AUTH_TOKEN = 'valid-token';
      process.env.TWILIO_PHONE_NUMBER = '+1234567890';

      const mockMessages = {
        create: jest.fn().mockRejectedValue({
          code: 21606,
          message: 'The From phone number provided is not a valid, message-capable Twilio phone number',
          status: 400
        })
      };

      mockTwilio.mockReturnValue({
        messages: mockMessages
      });

      const provider = new TwilioSMSProvider();
      await provider.verify();

      const result = await provider.send({
        to: '+1234567890',
        body: 'Test message'
      });

      expect(result.status).toBe('failed');
      expect(result.metadata.errorCode).toBe(21606);
    });
  });

  describe('Network Timeout Handling', () => {
    it('should handle SendGrid network timeout', async () => {
      process.env.SENDGRID_API_KEY = 'valid-key';

      mockSendGrid.setApiKey = jest.fn();
      mockSendGrid.send = jest.fn().mockRejectedValue({
        code: 'ETIMEDOUT',
        message: 'Request timeout',
        errno: 'ETIMEDOUT'
      });

      const provider = new SendGridEmailProvider();
      await provider.verify();

      const result = await provider.send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>'
      });

      expect(result.status).toBe('failed');
      expect(result.metadata.error).toContain('Request timeout');
    });

    it('should handle Twilio network timeout', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'valid-sid';
      process.env.TWILIO_AUTH_TOKEN = 'valid-token';
      process.env.TWILIO_PHONE_NUMBER = '+1234567890';

      const mockMessages = {
        create: jest.fn().mockRejectedValue({
          code: 'ETIMEDOUT',
          message: 'Connection timeout',
          errno: 'ETIMEDOUT'
        })
      };

      mockTwilio.mockReturnValue({
        messages: mockMessages
      });

      const provider = new TwilioSMSProvider();
      await provider.verify();

      const result = await provider.send({
        to: '+1234567890',
        body: 'Test message'
      });

      expect(result.status).toBe('failed');
      expect(result.metadata.error).toContain('Connection timeout');
    });

    it('should handle connection refused error', async () => {
      process.env.SENDGRID_API_KEY = 'valid-key';

      mockSendGrid.setApiKey = jest.fn();
      mockSendGrid.send = jest.fn().mockRejectedValue({
        code: 'ECONNREFUSED',
        message: 'Connection refused',
        errno: 'ECONNREFUSED'
      });

      const provider = new SendGridEmailProvider();
      await provider.verify();

      const result = await provider.send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>'
      });

      expect(result.status).toBe('failed');
      expect(result.metadata.error).toContain('Connection refused');
    });

    it('should handle DNS lookup failure', async () => {
      process.env.SENDGRID_API_KEY = 'valid-key';

      mockSendGrid.setApiKey = jest.fn();
      mockSendGrid.send = jest.fn().mockRejectedValue({
        code: 'ENOTFOUND',
        message: 'DNS lookup failed',
        errno: 'ENOTFOUND',
        hostname: 'api.sendgrid.com'
      });

      const provider = new SendGridEmailProvider();
      await provider.verify();

      const result = await provider.send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>'
      });

      expect(result.status).toBe('failed');
      expect(result.metadata.error).toContain('DNS lookup failed');
    });
  });

  describe('Provider Not Initialized Errors', () => {
    it('should throw error when sending email without verification', async () => {
      const provider = new SendGridEmailProvider();

      await expect(provider.send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>'
      })).rejects.toThrow('SendGrid provider not initialized');
    });

    it('should throw error when sending SMS without verification', async () => {
      const provider = new TwilioSMSProvider();

      await expect(provider.send({
        to: '+1234567890',
        body: 'Test message'
      })).rejects.toThrow('Twilio provider not initialized');
    });

    it('should throw error when sending bulk emails without verification', async () => {
      const provider = new SendGridEmailProvider();

      await expect(provider.sendBulk([
        { to: 'test1@example.com', subject: 'Test', html: '<p>Test</p>' },
        { to: 'test2@example.com', subject: 'Test', html: '<p>Test</p>' }
      ])).rejects.toThrow('SendGrid provider not initialized');
    });
  });

  describe('Bulk Send Error Handling', () => {
    it('should handle partial failures in bulk send', async () => {
      process.env.SENDGRID_API_KEY = 'valid-key';

      mockSendGrid.setApiKey = jest.fn();
      mockSendGrid.send = jest.fn()
        .mockResolvedValueOnce([{ statusCode: 202 }])
        .mockRejectedValueOnce({ code: 400, message: 'Invalid email' })
        .mockResolvedValueOnce([{ statusCode: 202 }]);

      const provider = new SendGridEmailProvider();
      await provider.verify();

      const results = await provider.sendBulk([
        { to: 'test1@example.com', subject: 'Test', html: '<p>Test</p>' },
        { to: 'invalid', subject: 'Test', html: '<p>Test</p>' },
        { to: 'test3@example.com', subject: 'Test', html: '<p>Test</p>' }
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('delivered');
      expect(results[1].status).toBe('failed');
      expect(results[2].status).toBe('delivered');
    });

    it('should continue processing after individual failures', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'valid-sid';
      process.env.TWILIO_AUTH_TOKEN = 'valid-token';
      process.env.TWILIO_PHONE_NUMBER = '+1234567890';

      const mockMessages = {
        create: jest.fn()
          .mockResolvedValueOnce({ sid: 'SM123', status: 'queued' })
          .mockRejectedValueOnce({ code: 21211, message: 'Invalid number' })
          .mockResolvedValueOnce({ sid: 'SM456', status: 'queued' })
      };

      mockTwilio.mockReturnValue({
        messages: mockMessages
      });

      const provider = new TwilioSMSProvider();
      await provider.verify();

      const results = await provider.sendBulk([
        { to: '+1234567890', body: 'Test 1' },
        { to: 'invalid', body: 'Test 2' },
        { to: '+1234567891', body: 'Test 3' }
      ]);

      expect(results).toHaveLength(3);
      expect(results.filter(r => r.status === 'delivered')).toHaveLength(2);
      expect(results.filter(r => r.status === 'failed')).toHaveLength(1);
    });
  });

  describe('Error Metadata Capture', () => {
    it('should capture error code in metadata', async () => {
      process.env.SENDGRID_API_KEY = 'valid-key';

      mockSendGrid.setApiKey = jest.fn();
      mockSendGrid.send = jest.fn().mockRejectedValue({
        code: 429,
        message: 'Rate limit exceeded'
      });

      const provider = new SendGridEmailProvider();
      await provider.verify();

      const result = await provider.send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>'
      });

      expect(result.metadata.errorCode).toBe(429);
      expect(result.metadata.error).toBe('Rate limit exceeded');
    });

    it('should capture recipient in error metadata', async () => {
      process.env.SENDGRID_API_KEY = 'valid-key';

      mockSendGrid.setApiKey = jest.fn();
      mockSendGrid.send = jest.fn().mockRejectedValue({
        code: 400,
        message: 'Invalid recipient'
      });

      const provider = new SendGridEmailProvider();
      await provider.verify();

      const result = await provider.send({
        to: 'invalid@example.com',
        subject: 'Test',
        html: '<p>Test</p>'
      });

      expect(result.metadata.to).toContain('invalid@example.com');
      expect(result.metadata.error).toBe('Invalid recipient');
    });
  });

  describe('Provider Status After Errors', () => {
    it('should report operational status when initialized', async () => {
      process.env.SENDGRID_API_KEY = 'valid-key';

      mockSendGrid.setApiKey = jest.fn();

      const provider = new SendGridEmailProvider();
      await provider.verify();

      const status = await provider.getStatus();

      expect(status.status).toBe('operational');
      expect(status.initialized).toBe(true);
    });

    it('should report not initialized status without verification', async () => {
      const provider = new SendGridEmailProvider();
      const status = await provider.getStatus();

      expect(status.status).toBe('not_initialized');
      expect(status.initialized).toBe(false);
    });
  });
});

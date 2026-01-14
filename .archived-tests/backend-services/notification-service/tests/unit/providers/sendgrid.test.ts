import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SendGridEmailProvider } from '../../../src/providers/email/sendgrid-email.provider';

// Mock @sendgrid/mail
const mockSend = jest.fn() as jest.MockedFunction<any>;
const mockSetApiKey = jest.fn() as jest.MockedFunction<any>;

jest.mock('@sendgrid/mail', () => ({
  default: {
    send: mockSend,
    setApiKey: mockSetApiKey
  }
}));

describe('SendGridEmailProvider', () => {
  let provider: SendGridEmailProvider;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    provider = new SendGridEmailProvider();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('verify()', () => {
    it('should return false when API key is not set', async () => {
      delete process.env.SENDGRID_API_KEY;

      const result = await provider.verify();

      expect(result).toBe(false);
      expect(mockSetApiKey).not.toHaveBeenCalled();
    });

    it('should return true when API key is valid', async () => {
      process.env.SENDGRID_API_KEY = 'valid-api-key';
      mockSetApiKey.mockImplementation(() => {});

      const result = await provider.verify();

      expect(result).toBe(true);
      expect(mockSetApiKey).toHaveBeenCalledWith('valid-api-key');
    });

    it('should return false and log error when setApiKey throws', async () => {
      process.env.SENDGRID_API_KEY = 'invalid-key';
      mockSetApiKey.mockImplementation(() => {
        throw new Error('Invalid API key');
      });

      const result = await provider.verify();

      expect(result).toBe(false);
    });
  });

  describe('send()', () => {
    beforeEach(async () => {
      process.env.SENDGRID_API_KEY = 'test-api-key';
      process.env.SENDGRID_FROM_EMAIL = 'from@test.com';
      await provider.verify();
    });

    it('should throw error if not initialized', async () => {
      const uninitializedProvider = new SendGridEmailProvider();

      await expect(uninitializedProvider.send({
        to: 'test@test.com',
        subject: 'Test',
        html: '<p>Test</p>'
      })).rejects.toThrow('SendGrid provider not initialized');
    });

    it('should successfully send email with HTML content', async () => {
      mockSend.mockResolvedValue([{ statusCode: 202 }]);

      const result = await provider.send({
        to: 'recipient@test.com',
        subject: 'Test Subject',
        html: '<h1>Hello</h1><p>Test email</p>'
      });

      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        to: ['recipient@test.com'],
        from: 'from@test.com',
        subject: 'Test Subject',
        html: '<h1>Hello</h1><p>Test email</p>'
      }));

      expect(result.status).toBe('delivered');
      expect(result.channel).toBe('email');
      expect(result.provider).toBe('sendgrid');
      expect(result.id).toMatch(/^sendgrid_/);
    });

    it('should successfully send email with text content', async () => {
      mockSend.mockResolvedValue([{ statusCode: 202 }]);

      const result = await provider.send({
        to: 'recipient@test.com',
        subject: 'Test Subject',
        text: 'Plain text email'
      });

      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        to: ['recipient@test.com'],
        subject: 'Test Subject',
        text: 'Plain text email'
      }));

      expect(result.status).toBe('delivered');
    });

    it('should send email with attachments', async () => {
      mockSend.mockResolvedValue([{ statusCode: 202 }]);

      const result = await provider.send({
        to: 'recipient@test.com',
        subject: 'Test with Attachment',
        html: '<p>See attachment</p>',
        attachments: [{
          filename: 'document.pdf',
          content: Buffer.from('PDF content'),
          contentType: 'application/pdf'
        }]
      });

      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        attachments: expect.arrayContaining([
          expect.objectContaining({
            filename: 'document.pdf',
            type: 'application/pdf'
          })
        ])
      }));

      expect(result.status).toBe('delivered');
    });

    it('should handle multiple recipients', async () => {
      mockSend.mockResolvedValue([{ statusCode: 202 }]);

      const result = await provider.send({
        to: ['user1@test.com', 'user2@test.com'],
        subject: 'Test',
        html: '<p>Test</p>'
      });

      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        to: ['user1@test.com', 'user2@test.com']
      }));

      expect(result.status).toBe('delivered');
    });

    it('should include CC and BCC recipients', async () => {
      mockSend.mockResolvedValue([{ statusCode: 202 }]);

      const result = await provider.send({
        to: 'primary@test.com',
        cc: ['cc1@test.com', 'cc2@test.com'],
        bcc: ['bcc@test.com'],
        subject: 'Test',
        html: '<p>Test</p>'
      });

      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        cc: ['cc1@test.com', 'cc2@test.com'],
        bcc: ['bcc@test.com']
      }));

      expect(result.status).toBe('delivered');
    });

    it('should throw error when neither html nor text is provided', async () => {
      const result = await provider.send({
        to: 'test@test.com',
        subject: 'No Content'
      } as any);

      expect(result.status).toBe('failed');
      expect(result.metadata).toHaveProperty('error');
    });

    it('should return failed status on SendGrid API error', async () => {
      mockSend.mockRejectedValue({
        code: 400,
        message: 'Invalid email address',
        response: { body: { errors: ['Invalid email'] } }
      });

      const result = await provider.send({
        to: 'invalid-email',
        subject: 'Test',
        html: '<p>Test</p>'
      });

      expect(result.status).toBe('failed');
      expect(result.metadata).toHaveProperty('error');
      expect(result.metadata?.errorCode).toBe(400);
    });

    it('should handle rate limit errors', async () => {
      mockSend.mockRejectedValue({
        code: 429,
        message: 'Rate limit exceeded',
        response: { body: { errors: ['Too many requests'] } }
      });

      const result = await provider.send({
        to: 'test@test.com',
        subject: 'Test',
        html: '<p>Test</p>'
      });

      expect(result.status).toBe('failed');
      expect(result.metadata?.errorCode).toBe(429);
    });

    it('should handle authentication errors (401)', async () => {
      mockSend.mockRejectedValue({
        code: 401,
        message: 'Unauthorized',
        response: { body: { errors: ['Invalid API key'] } }
      });

      const result = await provider.send({
        to: 'test@test.com',
        subject: 'Test',
        html: '<p>Test</p>'
      });

      expect(result.status).toBe('failed');
      expect(result.metadata?.errorCode).toBe(401);
    });

    it('should use custom from address when provided', async () => {
      mockSend.mockResolvedValue([{ statusCode: 202 }]);

      await provider.send({
        from: 'custom@sender.com',
        to: 'test@test.com',
        subject: 'Test',
        html: '<p>Test</p>'
      });

      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        from: 'custom@sender.com'
      }));
    });
  });

  describe('sendBulk()', () => {
    beforeEach(async () => {
      process.env.SENDGRID_API_KEY = 'test-api-key';
      await provider.verify();
    });

    it('should throw error if not initialized', async () => {
      const uninitializedProvider = new SendGridEmailProvider();

      await expect(uninitializedProvider.sendBulk([])).rejects.toThrow(
        'SendGrid provider not initialized'
      );
    });

    it('should send multiple emails successfully', async () => {
      mockSend.mockResolvedValue([{ statusCode: 202 }]);

      const inputs = [
        { to: 'user1@test.com', subject: 'Test 1', html: '<p>Test 1</p>' },
        { to: 'user2@test.com', subject: 'Test 2', html: '<p>Test 2</p>' },
        { to: 'user3@test.com', subject: 'Test 3', html: '<p>Test 3</p>' }
      ];

      const results = await provider.sendBulk(inputs);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.status === 'delivered')).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures in bulk send', async () => {
      mockSend
        .mockResolvedValueOnce([{ statusCode: 202 }])
        .mockRejectedValueOnce(new Error('Failed to send'))
        .mockResolvedValueOnce([{ statusCode: 202 }]);

      const inputs = [
        { to: 'user1@test.com', subject: 'Test 1', html: '<p>Test</p>' },
        { to: 'invalid@test.com', subject: 'Test 2', html: '<p>Test</p>' },
        { to: 'user3@test.com', subject: 'Test 3', html: '<p>Test</p>' }
      ];

      const results = await provider.sendBulk(inputs);

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('delivered');
      expect(results[1].status).toBe('failed');
      expect(results[2].status).toBe('delivered');
    });

    it('should return empty array for empty input', async () => {
      const results = await provider.sendBulk([]);

      expect(results).toEqual([]);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('getStatus()', () => {
    it('should return not initialized status before verify', async () => {
      const status = await provider.getStatus();

      expect(status.provider).toBe('SendGridEmailProvider');
      expect(status.status).toBe('not_initialized');
      expect(status.initialized).toBe(false);
    });

    it('should return operational status after successful verify', async () => {
      process.env.SENDGRID_API_KEY = 'test-key';
      await provider.verify();

      const status = await provider.getStatus();

      expect(status.status).toBe('operational');
      expect(status.initialized).toBe(true);
      expect(status.hasApiKey).toBe(true);
    });

    it('should indicate missing API key in status', async () => {
      delete process.env.SENDGRID_API_KEY;

      const status = await provider.getStatus();

      expect(status.hasApiKey).toBe(false);
    });
  });
});

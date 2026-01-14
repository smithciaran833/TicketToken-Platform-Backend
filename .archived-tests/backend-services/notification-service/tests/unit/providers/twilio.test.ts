import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TwilioSMSProvider } from '../../../src/providers/sms/twilio-sms.provider';

// Mock twilio
const mockCreate = jest.fn() as jest.MockedFunction<any>;
const mockTwilioClient = {
  messages: {
    create: mockCreate
  }
};
const mockTwilio = jest.fn(() => mockTwilioClient) as jest.MockedFunction<any>;

jest.mock('twilio', () => mockTwilio);

describe('TwilioSMSProvider', () => {
  let provider: TwilioSMSProvider;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    provider = new TwilioSMSProvider();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('verify()', () => {
    it('should return false when credentials are not set', async () => {
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_PHONE_NUMBER;

      const result = await provider.verify();

      expect(result).toBe(false);
      expect(mockTwilio).not.toHaveBeenCalled();
    });

    it('should return false when only account SID is missing', async () => {
      delete process.env.TWILIO_ACCOUNT_SID;
      process.env.TWILIO_AUTH_TOKEN = 'test-token';
      process.env.TWILIO_PHONE_NUMBER = '+15555551234';

      const result = await provider.verify();

      expect(result).toBe(false);
    });

    it('should return false when only auth token is missing', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'test-sid';
      delete process.env.TWILIO_AUTH_TOKEN;
      process.env.TWILIO_PHONE_NUMBER = '+15555551234';

      const result = await provider.verify();

      expect(result).toBe(false);
    });

    it('should return false when only phone number is missing', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'test-sid';
      process.env.TWILIO_AUTH_TOKEN = 'test-token';
      delete process.env.TWILIO_PHONE_NUMBER;

      const result = await provider.verify();

      expect(result).toBe(false);
    });

    it('should return true when all credentials are valid', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'test-sid';
      process.env.TWILIO_AUTH_TOKEN = 'test-token';
      process.env.TWILIO_PHONE_NUMBER = '+15555551234';

      const result = await provider.verify();

      expect(result).toBe(true);
      expect(mockTwilio).toHaveBeenCalledWith('test-sid', 'test-token');
    });

    it('should return false when twilio throws error', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'invalid-sid';
      process.env.TWILIO_AUTH_TOKEN = 'invalid-token';
      process.env.TWILIO_PHONE_NUMBER = '+15555551234';
      
      mockTwilio.mockImplementationOnce(() => {
        throw new Error('Invalid credentials');
      });

      const result = await provider.verify();

      expect(result).toBe(false);
    });
  });

  describe('send()', () => {
    beforeEach(async () => {
      process.env.TWILIO_ACCOUNT_SID = 'test-sid';
      process.env.TWILIO_AUTH_TOKEN = 'test-token';
      process.env.TWILIO_PHONE_NUMBER = '+15555551234';
      await provider.verify();
    });

    it('should throw error if not initialized', async () => {
      const uninitializedProvider = new TwilioSMSProvider();

      await expect(uninitializedProvider.send({
        to: '+15555555678',
        message: 'Test message'
      })).rejects.toThrow('Twilio provider not initialized');
    });

    it('should successfully send SMS', async () => {
      mockCreate.mockResolvedValue({
        sid: 'SM123456789',
        status: 'sent',
        from: '+15555551234',
        to: '+15555555678',
        body: 'Test message',
        numSegments: 1
      });

      const result = await provider.send({
        to: '+15555555678',
        message: 'Test message'
      });

      expect(mockCreate).toHaveBeenCalledWith({
        body: 'Test message',
        from: '+15555551234',
        to: '+15555555678'
      });

      expect(result.status).toBe('delivered');
      expect(result.channel).toBe('sms');
      expect(result.provider).toBe('twilio');
      expect(result.id).toBe('SM123456789');
      expect(result.metadata?.twilioSid).toBe('SM123456789');
    });

    it('should use custom from number when provided', async () => {
      mockCreate.mockResolvedValue({
        sid: 'SM123456789',
        status: 'sent',
        from: '+15555559999',
        to: '+15555555678'
      });

      await provider.send({
        from: '+15555559999',
        to: '+15555555678',
        message: 'Test message'
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '+15555559999'
        })
      );
    });

    it('should return failed status for invalid phone number', async () => {
      const result = await provider.send({
        to: 'invalid-number',
        message: 'Test message'
      });

      expect(result.status).toBe('failed');
      expect(result.metadata?.error).toContain('Invalid phone number format');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should handle Twilio API errors', async () => {
      mockCreate.mockRejectedValue({
        code: 21211,
        message: 'Invalid "To" Phone Number',
        status: 400
      });

      const result = await provider.send({
        to: '+15555555678',
        message: 'Test message'
      });

      expect(result.status).toBe('failed');
      expect(result.metadata?.error).toContain('Invalid "To" Phone Number');
      expect(result.metadata?.errorCode).toBe(21211);
    });

    it('should handle authentication errors', async () => {
      mockCreate.mockRejectedValue({
        code: 20003,
        message: 'Authenticate',
        status: 401
      });

      const result = await provider.send({
        to: '+15555555678',
        message: 'Test message'
      });

      expect(result.status).toBe('failed');
      expect(result.metadata?.errorCode).toBe(20003);
      expect(result.metadata?.errorStatus).toBe(401);
    });

    it('should handle insufficient balance errors', async () => {
      mockCreate.mockRejectedValue({
        code: 21606,
        message: 'Account has insufficient balance',
        status: 400
      });

      const result = await provider.send({
        to: '+15555555678',
        message: 'Test message'
      });

      expect(result.status).toBe('failed');
      expect(result.metadata?.errorCode).toBe(21606);
    });

    it('should calculate message segments for long messages', async () => {
      const longMessage = 'A'.repeat(200); // > 160 chars
      mockCreate.mockResolvedValue({
        sid: 'SM123456789',
        status: 'sent',
        from: '+15555551234',
        to: '+15555555678',
        body: longMessage,
        numSegments: 2
      });

      const result = await provider.send({
        to: '+15555555678',
        message: longMessage
      });

      expect(result.metadata?.segments).toBe(2);
      expect(result.metadata?.messageLength).toBe(200);
    });

    it('should map "delivered" status correctly', async () => {
      mockCreate.mockResolvedValue({
        sid: 'SM123456789',
        status: 'delivered',
        from: '+15555551234',
        to: '+15555555678'
      });

      const result = await provider.send({
        to: '+15555555678',
        message: 'Test'
      });

      expect(result.status).toBe('delivered');
    });

    it('should map "queued" status correctly', async () => {
      mockCreate.mockResolvedValue({
        sid: 'SM123456789',
        status: 'queued',
        from: '+15555551234',
        to: '+15555555678'
      });

      const result = await provider.send({
        to: '+15555555678',
        message: 'Test'
      });

      expect(result.status).toBe('queued');
    });

    it('should map "failed" status correctly', async () => {
      mockCreate.mockResolvedValue({
        sid: 'SM123456789',
        status: 'failed',
        from: '+15555551234',
        to: '+15555555678'
      });

      const result = await provider.send({
        to: '+15555555678',
        message: 'Test'
      });

      expect(result.status).toBe('failed');
    });
  });

  describe('sendBulk()', () => {
    beforeEach(async () => {
      process.env.TWILIO_ACCOUNT_SID = 'test-sid';
      process.env.TWILIO_AUTH_TOKEN = 'test-token';
      process.env.TWILIO_PHONE_NUMBER = '+15555551234';
      await provider.verify();
    });

    it('should throw error if not initialized', async () => {
      const uninitializedProvider = new TwilioSMSProvider();

      await expect(uninitializedProvider.sendBulk([])).rejects.toThrow(
        'Twilio provider not initialized'
      );
    });

    it('should send multiple SMS successfully', async () => {
      mockCreate.mockResolvedValue({
        sid: 'SM123456789',
        status: 'sent',
        from: '+15555551234',
        to: '+15555555678',
        numSegments: 1
      });

      const inputs = [
        { to: '+15555555678', message: 'Message 1' },
        { to: '+15555555679', message: 'Message 2' },
        { to: '+15555555680', message: 'Message 3' }
      ];

      const results = await provider.sendBulk(inputs);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.status === 'delivered')).toBe(true);
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures in bulk send', async () => {
      mockCreate
        .mockResolvedValueOnce({
          sid: 'SM1',
          status: 'sent',
          from: '+15555551234',
          to: '+15555555678'
        })
        .mockRejectedValueOnce({
          code:21211,
          message: 'Invalid phone',
          status: 400
        })
        .mockResolvedValueOnce({
          sid: 'SM3',
          status: 'sent',
          from: '+15555551234',
          to: '+15555555680'
        });

      const inputs = [
        { to: '+15555555678', message: 'Message 1' },
        { to: 'invalid', message: 'Message 2' },
        { to: '+15555555680', message: 'Message 3' }
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
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should filter invalid phone numbers in bulk send', async () => {
      const results = await provider.sendBulk([
        { to: 'invalid1', message: 'Test 1' },
        { to: 'invalid2', message: 'Test 2' }
      ]);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.status === 'failed')).toBe(true);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('getStatus()', () => {
    it('should return not initialized status before verify', async () => {
      const status = await provider.getStatus();

      expect(status.provider).toBe('TwilioSMSProvider');
      expect(status.status).toBe('not_initialized');
      expect(status.initialized).toBe(false);
    });

    it('should return operational status after successful verify', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'test-sid';
      process.env.TWILIO_AUTH_TOKEN = 'test-token';
      process.env.TWILIO_PHONE_NUMBER = '+15555551234';
      await provider.verify();

      const status = await provider.getStatus();

      expect(status.status).toBe('operational');
      expect(status.initialized).toBe(true);
      expect(status.hasCredentials).toBe(true);
    });

    it('should mask phone number in status', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'test-sid';
      process.env.TWILIO_AUTH_TOKEN = 'test-token';
      process.env.TWILIO_PHONE_NUMBER = '+15555551234';
      await provider.verify();

      const status = await provider.getStatus();

      expect(status.fromNumber).toMatch(/^\+15555\*\*\*/);
      expect(status.fromNumber).not.toContain('1234');
    });

    it('should indicate missing credentials in status', async () => {
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_PHONE_NUMBER;

      const status = await provider.getStatus();

      expect(status.hasCredentials).toBe(false);
      expect(status.fromNumber).toBe('not_set');
    });
  });
});

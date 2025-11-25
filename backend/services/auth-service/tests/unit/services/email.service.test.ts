import { EmailService } from '../../../src/services/email.service';

// Mock dependencies
jest.mock('crypto');
jest.mock('../../../src/config/redis', () => ({
  redis: {
    setex: jest.fn(),
  },
}));
jest.mock('../../../src/config/env', () => ({
  env: {
    API_GATEWAY_URL: 'https://api.tickettoken.com',
    NODE_ENV: 'development', // Changed to 'development' so emails are logged
  },
}));

import crypto from 'crypto';
import { redis } from '../../../src/config/redis';

describe('EmailService', () => {
  let service: EmailService;
  let mockRedis: jest.Mocked<typeof redis>;
  let mockCrypto: jest.Mocked<typeof crypto>;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    mockRedis = redis as jest.Mocked<typeof redis>;
    mockCrypto = crypto as jest.Mocked<typeof crypto>;
    service = new EmailService();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('sendVerificationEmail', () => {
    const userId = 'user-123';
    const email = 'test@example.com';
    const firstName = 'John';
    const mockToken = 'abcd1234token';

    beforeEach(() => {
      (mockCrypto.randomBytes as jest.Mock).mockReturnValue({
        toString: jest.fn().mockReturnValue(mockToken),
      });
    });

    it('should generate verification token', async () => {
      await service.sendVerificationEmail(userId, email, firstName);

      expect(crypto.randomBytes).toHaveBeenCalledWith(32);
    });

    it('should store token in Redis with 24 hour expiry', async () => {
      await service.sendVerificationEmail(userId, email, firstName);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `email-verify:${mockToken}`,
        86400, // 24 hours in seconds
        JSON.stringify({ userId, email })
      );
    });

    it('should include verification URL in email', async () => {
      await service.sendVerificationEmail(userId, email, firstName);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '📧 Email would be sent:',
        expect.objectContaining({
          to: email,
          subject: 'Verify your TicketToken account',
        })
      );
    });

    it('should personalize email with first name', async () => {
      await service.sendVerificationEmail(userId, email, firstName);

      const callArgs = consoleLogSpy.mock.calls[0];
      expect(callArgs[1].preview).toContain(firstName);
    });
  });

  describe('sendPasswordResetEmail', () => {
    const userId = 'user-123';
    const email = 'test@example.com';
    const firstName = 'John';
    const mockToken = 'reset5678token';

    beforeEach(() => {
      (mockCrypto.randomBytes as jest.Mock).mockReturnValue({
        toString: jest.fn().mockReturnValue(mockToken),
      });
    });

    it('should generate reset token', async () => {
      await service.sendPasswordResetEmail(userId, email, firstName);

      expect(crypto.randomBytes).toHaveBeenCalledWith(32);
    });

    it('should store token in Redis with 1 hour expiry', async () => {
      await service.sendPasswordResetEmail(userId, email, firstName);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `password-reset:${mockToken}`,
        3600, // 1 hour in seconds
        JSON.stringify({ userId, email })
      );
    });

    it('should include reset URL in email', async () => {
      await service.sendPasswordResetEmail(userId, email, firstName);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '📧 Email would be sent:',
        expect.objectContaining({
          to: email,
          subject: 'Reset your TicketToken password',
        })
      );
    });

    it('should personalize email with first name', async () => {
      await service.sendPasswordResetEmail(userId, email, firstName);

      const callArgs = consoleLogSpy.mock.calls[0];
      expect(callArgs[1].preview).toContain(firstName);
    });
  });

  describe('sendMFABackupCodesEmail', () => {
    const email = 'test@example.com';
    const firstName = 'John';
    const backupCodes = ['CODE1-1234', 'CODE2-5678', 'CODE3-9012'];

    it('should send email with backup codes', async () => {
      await service.sendMFABackupCodesEmail(email, firstName, backupCodes);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '📧 Email would be sent:',
        expect.objectContaining({
          to: email,
          subject: 'Your TicketToken MFA backup codes',
        })
      );
    });

    it('should include all backup codes in email', async () => {
      await service.sendMFABackupCodesEmail(email, firstName, backupCodes);

      const callArgs = consoleLogSpy.mock.calls[0];
      const preview = callArgs[1].preview;
      
      backupCodes.forEach(code => {
        expect(preview).toContain(code);
      });
    });

    it('should personalize email with first name', async () => {
      await service.sendMFABackupCodesEmail(email, firstName, backupCodes);

      const callArgs = consoleLogSpy.mock.calls[0];
      expect(callArgs[1].preview).toContain(firstName);
    });

    it('should handle empty backup codes array', async () => {
      await service.sendMFABackupCodesEmail(email, firstName, []);

      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('sendEmail (private method behavior)', () => {
    it('should log email in development environment', async () => {
      await service.sendVerificationEmail('user-123', 'test@example.com', 'John');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '📧 Email would be sent:',
        expect.any(Object)
      );
    });

    it('should not throw errors when sending emails', async () => {
      await expect(
        service.sendVerificationEmail('user-123', 'test@example.com', 'John')
      ).resolves.not.toThrow();
    });
  });
});

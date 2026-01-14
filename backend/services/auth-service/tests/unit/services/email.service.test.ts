const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
};

const mockResend = {
  emails: {
    send: jest.fn(),
  },
};

jest.mock('../../../src/config/redis', () => ({ getRedis: () => mockRedis }));
jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    API_GATEWAY_URL: 'https://api.test.com',
    EMAIL_FROM: 'noreply@test.com',
    RESEND_API_KEY: 'test-key',
  },
}));
jest.mock('resend', () => ({
  Resend: jest.fn(() => mockResend),
}));

import { EmailService } from '../../../src/services/email.service';

describe('EmailService', () => {
  let service: EmailService;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EmailService();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('sendVerificationEmail', () => {
    it('generates token and stores in Redis', async () => {
      await service.sendVerificationEmail('user-123', 'test@example.com', 'John', 'tenant-1');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('email-verify'),
        24 * 60 * 60, // 24 hours
        expect.stringContaining('user-123')
      );
    });

    it('stores tenant in token data', async () => {
      await service.sendVerificationEmail('user-123', 'test@example.com', 'John', 'tenant-1');

      const storedData = JSON.parse(mockRedis.setex.mock.calls[0][2]);
      expect(storedData.tenantId).toBe('tenant-1');
    });

    it('logs email in test mode instead of sending', async () => {
      await service.sendVerificationEmail('user-123', 'test@example.com', 'John');

      expect(consoleSpy).toHaveBeenCalledWith(
        '📧 Email would be sent:',
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Verify your TicketToken account',
        })
      );
      expect(mockResend.emails.send).not.toHaveBeenCalled();
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('generates token with 1 hour TTL', async () => {
      await service.sendPasswordResetEmail('user-123', 'test@example.com', 'John', 'tenant-1');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('password-reset'),
        60 * 60, // 1 hour
        expect.any(String)
      );
    });

    it('logs email in test mode', async () => {
      await service.sendPasswordResetEmail('user-123', 'test@example.com', 'John');

      expect(consoleSpy).toHaveBeenCalledWith(
        '📧 Email would be sent:',
        expect.objectContaining({
          subject: 'Reset your TicketToken password',
        })
      );
    });
  });

  describe('sendMFABackupCodesEmail', () => {
    it('logs backup codes email in test mode', async () => {
      const codes = ['ABCD-1234', 'EFGH-5678'];

      await service.sendMFABackupCodesEmail('test@example.com', 'John', codes);

      expect(consoleSpy).toHaveBeenCalledWith(
        '📧 Email would be sent:',
        expect.objectContaining({
          subject: 'Your TicketToken MFA backup codes',
        })
      );
    });
  });
});

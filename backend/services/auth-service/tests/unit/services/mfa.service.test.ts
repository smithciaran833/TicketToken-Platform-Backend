// Mocks
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
};

const mockDbQuery = {
  withSchema: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  first: jest.fn(),
  update: jest.fn(),
};

const mockDb = jest.fn().mockReturnValue(mockDbQuery);

const mockSpeakeasy = {
  generateSecret: jest.fn(),
  otpauthURL: jest.fn(),
  totp: { verify: jest.fn() },
};

const mockQRCode = {
  toDataURL: jest.fn(),
};

const mockOtpRateLimiter = {
  consume: jest.fn(),
  reset: jest.fn(),
};
const mockMfaSetupRateLimiter = {
  consume: jest.fn(),
  reset: jest.fn(),
};
const mockBackupCodeRateLimiter = {
  consume: jest.fn(),
  reset: jest.fn(),
};

jest.mock('../../../src/config/redis', () => ({ getRedis: () => mockRedis }));
jest.mock('../../../src/config/database', () => ({ db: mockDb }));
jest.mock('../../../src/config/env', () => ({
  env: {
    MFA_ISSUER: 'TestIssuer',
    ENCRYPTION_KEY: '12345678901234567890123456789012',
  },
}));
jest.mock('speakeasy', () => mockSpeakeasy);
jest.mock('qrcode', () => mockQRCode);
jest.mock('../../../src/utils/rateLimiter', () => ({
  otpRateLimiter: mockOtpRateLimiter,
  mfaSetupRateLimiter: mockMfaSetupRateLimiter,
  backupCodeRateLimiter: mockBackupCodeRateLimiter,
}));

import { MFAService } from '../../../src/services/mfa.service';
import { AuthenticationError } from '../../../src/errors';

describe('MFAService', () => {
  let service: MFAService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock chain
    mockDbQuery.withSchema.mockReturnThis();
    mockDbQuery.where.mockReturnThis();
    service = new MFAService();
  });

  describe('setupTOTP', () => {
    const userId = 'user-123';
    const mockUser = { id: userId, email: 'test@example.com', tenant_id: 'tenant-1', mfa_enabled: false };

    beforeEach(() => {
      mockDbQuery.first.mockResolvedValue(mockUser);
      mockRedis.get.mockResolvedValue(null);
      mockSpeakeasy.generateSecret.mockReturnValue({
        base32: 'TESTSECRET',
        otpauth_url: 'otpauth://totp/test',
      });
      mockQRCode.toDataURL.mockResolvedValue('data:image/png;base64,qrcode');
    });

    it('generates new secret and QR code', async () => {
      const result = await service.setupTOTP(userId);

      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('qrCode');
      expect(mockQRCode.toDataURL).toHaveBeenCalled();
    });

    it('rate limits setup attempts', async () => {
      await service.setupTOTP(userId, 'tenant-1');
      expect(mockMfaSetupRateLimiter.consume).toHaveBeenCalledWith(userId, 1, 'tenant-1');
    });

    it('throws if user not found', async () => {
      mockDbQuery.first.mockResolvedValue(null);
      await expect(service.setupTOTP(userId)).rejects.toThrow('User not found');
    });

    it('throws if MFA already enabled', async () => {
      mockDbQuery.first.mockResolvedValue({ ...mockUser, mfa_enabled: true });
      await expect(service.setupTOTP(userId)).rejects.toThrow('MFA is already enabled');
    });

    it('returns existing setup if within idempotency window', async () => {
      const existingSetup = {
        secret: service['encrypt']('EXISTINGSECRET'),
        backupCodes: [],
        tenantId: 'tenant-1',
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(existingSetup));
      mockSpeakeasy.otpauthURL.mockReturnValue('otpauth://totp/existing');

      const result = await service.setupTOTP(userId);

      expect(result.secret).toBe('EXISTINGSECRET');
      expect(mockSpeakeasy.generateSecret).not.toHaveBeenCalled();
    });

    it('stores setup data in Redis with TTL', async () => {
      await service.setupTOTP(userId);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('mfa:setup'),
        600,
        expect.any(String)
      );
    });
  });

  describe('verifyTOTP', () => {
    const userId = 'user-123';
    let mockUser: any;

    beforeEach(() => {
      // Create a valid encrypted secret
      const svc = new MFAService();
      mockUser = {
        id: userId,
        mfa_enabled: true,
        mfa_secret: svc['encrypt']('VALIDSECRET'),
        tenant_id: 'tenant-1',
      };
      mockDbQuery.first.mockResolvedValue(mockUser);
      mockRedis.get.mockResolvedValue(null);
    });

    it('returns true for valid token', async () => {
      mockSpeakeasy.totp.verify.mockReturnValue(true);

      const result = await service.verifyTOTP(userId, '123456');

      expect(result).toBe(true);
    });

    it('returns false for invalid token', async () => {
      mockSpeakeasy.totp.verify.mockReturnValue(false);

      const result = await service.verifyTOTP(userId, '000000');

      expect(result).toBe(false);
    });

    it('rate limits verification attempts', async () => {
      mockSpeakeasy.totp.verify.mockReturnValue(true);

      await service.verifyTOTP(userId, '123456', 'tenant-1');

      expect(mockOtpRateLimiter.consume).toHaveBeenCalledWith(userId, 1, 'tenant-1');
    });

    it('returns false if MFA not enabled', async () => {
      mockDbQuery.first.mockResolvedValue({ ...mockUser, mfa_enabled: false });

      const result = await service.verifyTOTP(userId, '123456');

      expect(result).toBe(false);
    });

    it('rejects non-6-digit tokens', async () => {
      const result = await service.verifyTOTP(userId, '12345'); // 5 digits

      expect(result).toBe(false);
      expect(mockSpeakeasy.totp.verify).not.toHaveBeenCalled();
    });

    it('prevents token reuse', async () => {
      mockRedis.get.mockResolvedValue('1'); // Token recently used

      await expect(service.verifyTOTP(userId, '123456')).rejects.toThrow('MFA token recently used');
    });

    it('marks token as used after success', async () => {
      mockSpeakeasy.totp.verify.mockReturnValue(true);

      await service.verifyTOTP(userId, '123456');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('mfa:recent'),
        90,
        '1'
      );
    });

    it('resets rate limiter on success', async () => {
      mockSpeakeasy.totp.verify.mockReturnValue(true);

      await service.verifyTOTP(userId, '123456', 'tenant-1');

      expect(mockOtpRateLimiter.reset).toHaveBeenCalledWith(userId, 'tenant-1');
    });
  });

  describe('verifyBackupCode', () => {
    const userId = 'user-123';

    it('returns true and removes used code', async () => {
      const svc = new MFAService();
      const hashedCode = svc['hashBackupCode']('ABCD-1234');
      mockDbQuery.first.mockResolvedValue({
        id: userId,
        backup_codes: [hashedCode, 'other-hash'],
      });
      mockDbQuery.update.mockResolvedValue(1);

      const result = await service.verifyBackupCode(userId, 'ABCD-1234');

      expect(result).toBe(true);
      expect(mockDbQuery.update).toHaveBeenCalled();
    });

    it('returns false for invalid code', async () => {
      mockDbQuery.first.mockResolvedValue({
        id: userId,
        backup_codes: ['some-hash'],
      });

      const result = await service.verifyBackupCode(userId, 'WRONG-CODE');

      expect(result).toBe(false);
    });

    it('rate limits backup code attempts', async () => {
      mockDbQuery.first.mockResolvedValue({ id: userId, backup_codes: [] });

      await service.verifyBackupCode(userId, 'CODE-1234', 'tenant-1');

      expect(mockBackupCodeRateLimiter.consume).toHaveBeenCalledWith(userId, 1, 'tenant-1');
    });
  });

  describe('requireMFAForOperation', () => {
    it('allows non-sensitive operations without MFA', async () => {
      await expect(service.requireMFAForOperation('user-123', 'read:profile')).resolves.toBeUndefined();
      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it('requires recent MFA for sensitive operations', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(service.requireMFAForOperation('user-123', 'withdraw:funds'))
        .rejects.toThrow('MFA required for this operation');
    });

    it('allows sensitive operation if MFA recently verified', async () => {
      mockRedis.get.mockResolvedValue('1');

      await expect(service.requireMFAForOperation('user-123', 'disable:mfa')).resolves.toBeUndefined();
    });
  });

  describe('markMFAVerified', () => {
    it('sets verification flag with 5 minute TTL', async () => {
      await service.markMFAVerified('user-123', 'tenant-1');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('mfa:verified'),
        300,
        '1'
      );
    });
  });
});

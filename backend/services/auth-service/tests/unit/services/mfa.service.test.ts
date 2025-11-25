import { MFAService } from '../../../src/services/mfa.service';
import { AuthenticationError } from '../../../src/errors';

// Mock dependencies
jest.mock('speakeasy');
jest.mock('qrcode');
jest.mock('crypto');
jest.mock('../../../src/config/database', () => ({
  db: jest.fn(() => ({
    withSchema: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    first: jest.fn(),
    update: jest.fn(),
  })),
}));
jest.mock('../../../src/config/redis', () => ({
  redis: {
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
  },
}));

// Mock the env module properly
jest.mock('../../../src/config/env', () => ({
  env: {
    MFA_ISSUER: 'TicketToken',
    ENCRYPTION_KEY: 'test-encryption-key-must-be-32-characters-long!!',
  },
}));

import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { db } from '../../../src/config/database';
import { redis } from '../../../src/config/redis';

describe('MFAService', () => {
  let service: MFAService;
  let mockDb: any;
  let mockRedis: jest.Mocked<typeof redis>;

  beforeEach(() => {
    mockDb = db as jest.MockedFunction<typeof db>;
    mockRedis = redis as jest.Mocked<typeof redis>;
    service = new MFAService();
    jest.clearAllMocks();
  });

  describe('setupTOTP', () => {
    const userId = 'user-123';
    const user = { id: userId, email: 'user@example.com' };

    it('should setup TOTP with secret and QR code', async () => {
      const mockSecret = {
        base32: 'SECRET123',
        otpauth_url: 'otpauth://totp/TicketToken:user@example.com?secret=SECRET123',
      };

      (speakeasy.generateSecret as jest.Mock).mockReturnValue(mockSecret);
      (QRCode.toDataURL as jest.Mock).mockResolvedValue('data:image/png;base64,qrcode');
      
      // Mock crypto functions for backup codes
      let callCount = 0;
      (crypto.randomBytes as jest.Mock).mockImplementation((size: number) => {
        if (size === 16) {
          // For IV in encryption
          return Buffer.from('1234567890123456');
        } else {
          // For backup codes
          callCount++;
          return Buffer.from(`ABCD${callCount}234`);
        }
      });

      (crypto.createHash as jest.Mock).mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('hashed'),
      });

      (crypto.createCipheriv as jest.Mock).mockReturnValue({
        update: jest.fn().mockReturnValue('encrypted'),
        final: jest.fn().mockReturnValue(''),
        getAuthTag: jest.fn().mockReturnValue(Buffer.from('authtag')),
      });

      const mockQuery = {
        withSchema: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(user),
      };
      mockDb.mockReturnValue(mockQuery);

      const result = await service.setupTOTP(userId);

      expect(result.secret).toBe('SECRET123');
      expect(result.qrCode).toBe('data:image/png;base64,qrcode');
      expect(result.backupCodes).toHaveLength(10);
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should throw error when user not found', async () => {
      const mockQuery = {
        withSchema: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      };
      mockDb.mockReturnValue(mockQuery);

      await expect(service.setupTOTP(userId)).rejects.toThrow('User not found');
    });
  });

  describe('verifyAndEnableTOTP', () => {
    const userId = 'user-123';
    const token = '123456';

    it('should verify token and enable MFA', async () => {
      const setupData = {
        secret: '313233343536373839303132333435:617574687461673a656e637279707465643a',
        backupCodes: ['hashed1', 'hashed2'],
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(setupData));
      (speakeasy.totp.verify as jest.Mock).mockReturnValue(true);
      
      (crypto.createDecipheriv as jest.Mock).mockReturnValue({
        setAuthTag: jest.fn(),
        update: jest.fn().mockReturnValue('decrypted'),
        final: jest.fn().mockReturnValue('SECRET'),
      });

      const mockQuery = {
        withSchema: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1),
      };
      mockDb.mockReturnValue(mockQuery);

      const result = await service.verifyAndEnableTOTP(userId, token);

      expect(result).toBe(true);
      expect(mockQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          mfa_enabled: true,
        })
      );
      expect(mockRedis.del).toHaveBeenCalledWith(`mfa:setup:${userId}`);
    });

    it('should throw error when setup data expired', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(service.verifyAndEnableTOTP(userId, token))
        .rejects.toThrow('MFA setup expired or not found');
    });

    it('should throw error for invalid token', async () => {
      const setupData = {
        secret: '313233343536373839303132333435:617574687461673a656e637279707465643a',
        backupCodes: ['hashed1'],
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(setupData));
      (speakeasy.totp.verify as jest.Mock).mockReturnValue(false);
      
      (crypto.createDecipheriv as jest.Mock).mockReturnValue({
        setAuthTag: jest.fn(),
        update: jest.fn().mockReturnValue('decrypted'),
        final: jest.fn().mockReturnValue('SECRET'),
      });

      await expect(service.verifyAndEnableTOTP(userId, token))
        .rejects.toThrow(AuthenticationError);
    });
  });

  describe('verifyTOTP', () => {
    const userId = 'user-123';
    const token = '123456';

    it('should verify valid TOTP token', async () => {
      const user = {
        id: userId,
        mfa_enabled: true,
        mfa_secret: '313233343536373839303132333435:617574687461673a656e637279707465643a',
      };

      const mockQuery = {
        withSchema: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(user),
      };
      mockDb.mockReturnValue(mockQuery);

      mockRedis.get.mockResolvedValue(null);
      (speakeasy.totp.verify as jest.Mock).mockReturnValue(true);
      
      (crypto.createDecipheriv as jest.Mock).mockReturnValue({
        setAuthTag: jest.fn(),
        update: jest.fn().mockReturnValue('decrypted'),
        final: jest.fn().mockReturnValue('SECRET'),
      });

      const result = await service.verifyTOTP(userId, token);

      expect(result).toBe(true);
      expect(mockRedis.setex).toHaveBeenCalledWith(`mfa:recent:${userId}:${token}`, 90, '1');
    });

    it('should return false when MFA not enabled', async () => {
      const user = { id: userId, mfa_enabled: false };

      const mockQuery = {
        withSchema: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(user),
      };
      mockDb.mockReturnValue(mockQuery);

      const result = await service.verifyTOTP(userId, token);

      expect(result).toBe(false);
    });

    it('should throw error when token recently used', async () => {
      const user = {
        id: userId,
        mfa_enabled: true,
        mfa_secret: '313233343536373839303132333435:617574687461673a656e637279707465643a',
      };

      const mockQuery = {
        withSchema: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(user),
      };
      mockDb.mockReturnValue(mockQuery);

      mockRedis.get.mockResolvedValue('1');
      
      (crypto.createDecipheriv as jest.Mock).mockReturnValue({
        setAuthTag: jest.fn(),
        update: jest.fn().mockReturnValue('decrypted'),
        final: jest.fn().mockReturnValue('SECRET'),
      });

      await expect(service.verifyTOTP(userId, token))
        .rejects.toThrow('MFA token recently used');
    });
  });

  describe('verifyBackupCode', () => {
    const userId = 'user-123';
    const code = 'ABCD-1234';

    it('should verify valid backup code', async () => {
      const hashedCode = 'hashed_code';
      const user = {
        id: userId,
        backup_codes: JSON.stringify([hashedCode, 'other_hash']),
      };

      const mockQuery = {
        withSchema: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue(1),
      };
      mockDb.mockReturnValue(mockQuery);

      (crypto.createHash as jest.Mock).mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue(hashedCode),
      });

      const result = await service.verifyBackupCode(userId, code);

      expect(result).toBe(true);
      expect(mockQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          backup_codes: JSON.stringify(['other_hash']),
        })
      );
    });

    it('should return false for invalid backup code', async () => {
      const user = {
        id: userId,
        backup_codes: JSON.stringify(['hash1', 'hash2']),
      };

      const mockQuery = {
        withSchema: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(user),
      };
      mockDb.mockReturnValue(mockQuery);

      (crypto.createHash as jest.Mock).mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('wrong_hash'),
      });

      const result = await service.verifyBackupCode(userId, code);

      expect(result).toBe(false);
    });

    it('should return false when no backup codes', async () => {
      const user = { id: userId, backup_codes: null };

      const mockQuery = {
        withSchema: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(user),
      };
      mockDb.mockReturnValue(mockQuery);

      const result = await service.verifyBackupCode(userId, code);

      expect(result).toBe(false);
    });
  });

  describe('requireMFAForOperation', () => {
    const userId = 'user-123';

    it('should not throw for non-sensitive operation', async () => {
      await expect(
        service.requireMFAForOperation(userId, 'view:tickets')
      ).resolves.not.toThrow();
    });

    it('should throw when MFA not recently verified for sensitive operation', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(
        service.requireMFAForOperation(userId, 'withdraw:funds')
      ).rejects.toThrow('MFA required for this operation');
    });

    it('should not throw when MFA recently verified', async () => {
      mockRedis.get.mockResolvedValue('1');

      await expect(
        service.requireMFAForOperation(userId, 'withdraw:funds')
      ).resolves.not.toThrow();
    });

    it('should check all sensitive operations', async () => {
      const sensitiveOps = [
        'withdraw:funds',
        'update:bank-details',
        'delete:venue',
        'export:customer-data',
        'disable:mfa',
      ];

      mockRedis.get.mockResolvedValue(null);

      for (const op of sensitiveOps) {
        await expect(
          service.requireMFAForOperation(userId, op)
        ).rejects.toThrow('MFA required for this operation');
      }
    });
  });

  describe('markMFAVerified', () => {
    const userId = 'user-123';

    it('should mark MFA as verified', async () => {
      await service.markMFAVerified(userId);

      expect(mockRedis.setex).toHaveBeenCalledWith(`mfa:verified:${userId}`, 300, '1');
    });
  });

  describe('disableTOTP', () => {
    const userId = 'user-123';

    it('should disable TOTP for user', async () => {
      const mockQuery = {
        withSchema: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1),
      };
      mockDb.mockReturnValue(mockQuery);

      await service.disableTOTP(userId);

      expect(mockQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          mfa_enabled: false,
          mfa_secret: null,
          backup_codes: null,
        })
      );
      expect(mockRedis.del).toHaveBeenCalledWith(`mfa:secret:${userId}`);
    });
  });
});

import { AuthExtendedService } from '../../../src/services/auth-extended.service';
import { EmailService } from '../../../src/services/email.service';
import { ValidationError, AuthenticationError } from '../../../src/errors';
import bcrypt from 'bcrypt';
import { redis } from '../../../src/config/redis';
import { passwordResetRateLimiter } from '../../../src/utils/rateLimiter';

// Mock the entire database module
jest.mock('../../../src/config/database', () => ({
  db: jest.fn()
}));

jest.mock('../../../src/config/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn()
  }
}));

jest.mock('../../../src/utils/rateLimiter', () => ({
  passwordResetRateLimiter: {
    consume: jest.fn()
  }
}));

jest.mock('bcrypt');

// Import db after mocking
import { db } from '../../../src/config/database';

// Test data
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
  password_hash: 'hashed_password',
  email_verified: false,
  mfa_enabled: false,
  role: 'user',
  tenant_id: 'tenant-123'
};

describe('AuthExtendedService', () => {
  let authExtendedService: AuthExtendedService;
  let mockEmailService: jest.Mocked<EmailService>;

  // Database mock setup
  const mockWhere = jest.fn().mockReturnThis();
  const mockWhereNull = jest.fn().mockReturnThis();
  const mockFirst = jest.fn();
  const mockUpdate = jest.fn();
  const mockInsert = jest.fn();
  const mockWithSchema = jest.fn();
  const mockDbRaw = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup EmailService mock
    mockEmailService = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Reset all mock functions
    mockWhere.mockReturnThis();
    mockWhereNull.mockReturnThis();
    mockFirst.mockReset();
    mockUpdate.mockReset();
    mockInsert.mockReset();
    mockDbRaw.mockReturnValue({ revoked_reason: 'password_changed' });

    // Setup database mock chain
    mockWithSchema.mockReturnValue({
      where: mockWhere,
      whereNull: mockWhereNull,
      first: mockFirst,
      update: mockUpdate
    });

    mockWhere.mockReturnValue({
      whereNull: mockWhereNull,
      first: mockFirst,
      update: mockUpdate
    });

    mockWhereNull.mockReturnValue({
      first: mockFirst,
      update: mockUpdate
    });

    const mockDb = db as jest.MockedFunction<typeof db>;
    mockDb.mockImplementation((tableName?: any) => {
      if (tableName === 'users') {
        return {
          withSchema: mockWithSchema
        } as any;
      }
      if (tableName === 'audit_logs') {
        return {
          insert: mockInsert
        } as any;
      }
      if (tableName === 'user_sessions') {
        return {
          where: jest.fn().mockReturnValue({
            whereNull: jest.fn().mockReturnValue({
              update: jest.fn().mockResolvedValue(1)
            })
          })
        } as any;
      }
      return {} as any;
    });

    // Add raw method to db mock - this is critical!
    (db as any).raw = mockDbRaw;

    // Setup bcrypt mocks
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    // Setup rate limiter mock
    (passwordResetRateLimiter.consume as jest.Mock).mockResolvedValue(undefined);

    // Create service instance
    authExtendedService = new AuthExtendedService(mockEmailService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requestPasswordReset()', () => {
    const mockIpAddress = '192.168.1.1';

    it('should send password reset email for existing user', async () => {
      // Setup
      mockFirst.mockResolvedValue(mockUser);
      mockInsert.mockResolvedValue([1]);

      // Execute
      await authExtendedService.requestPasswordReset(mockUser.email, mockIpAddress);

      // Verify
      expect(passwordResetRateLimiter.consume).toHaveBeenCalledWith(mockIpAddress);
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.email,
        mockUser.first_name
      );
      expect(db).toHaveBeenCalledWith('audit_logs');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUser.id,
          action: 'password_reset_requested',
          ip_address: mockIpAddress
        })
      );
    });

    it('should silently handle non-existent user (prevent enumeration)', async () => {
      // Setup
      mockFirst.mockResolvedValue(null);

      // Execute - should not throw
      await authExtendedService.requestPasswordReset('nonexistent@example.com', mockIpAddress);

      // Verify
      expect(passwordResetRateLimiter.consume).toHaveBeenCalledWith(mockIpAddress);
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('should enforce rate limiting', async () => {
      // Setup
      (passwordResetRateLimiter.consume as jest.Mock).mockRejectedValue(new Error('Rate limit exceeded'));

      // Execute & Verify
      await expect(
        authExtendedService.requestPasswordReset(mockUser.email, mockIpAddress)
      ).rejects.toThrow('Rate limit exceeded');
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should convert email to lowercase', async () => {
      // Setup
      mockFirst.mockResolvedValue(mockUser);
      mockInsert.mockResolvedValue([1]);

      // Execute
      await authExtendedService.requestPasswordReset('TEST@EXAMPLE.COM', mockIpAddress);

      // Verify
      expect(mockWhere).toHaveBeenCalledWith({ email: 'test@example.com' });
    });
  });

  describe('resetPassword()', () => {
    const mockToken = 'reset-token-123';
    const mockUserId = 'user-123';
    const mockNewPassword = 'NewPass123!';
    const mockIpAddress = '192.168.1.1';
    const combinedErrorMessage = 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character';

    beforeEach(() => {
      // Setup successful token lookup by default
      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({ userId: mockUserId }));
      (redis.keys as jest.Mock).mockResolvedValue([
        'refresh_token:token1',
        'refresh_token:token2'
      ]);
    });

    it('should reset password successfully', async () => {
      // Setup
      mockUpdate.mockResolvedValue(1);
      mockInsert.mockResolvedValue([1]);

      // Execute
      await authExtendedService.resetPassword(mockToken, mockNewPassword, mockIpAddress);

      // Verify
      expect(redis.get).toHaveBeenCalledWith(`password-reset:${mockToken}`);
      expect(bcrypt.hash).toHaveBeenCalledWith(mockNewPassword, 10);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          password_hash: 'hashed_password',
          password_changed_at: expect.any(Date),
          updated_at: expect.any(Date)
        })
      );
      expect(redis.del).toHaveBeenCalledWith(`password-reset:${mockToken}`);
      expect(db).toHaveBeenCalledWith('audit_logs');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUserId,
          action: 'password_reset_completed',
          ip_address: mockIpAddress
        })
      );
    });

    it('should throw error for invalid token', async () => {
      // Setup
      (redis.get as jest.Mock).mockResolvedValue(null);

      // Execute & Verify - ValidationError always has message 'Validation failed'
      await expect(
        authExtendedService.resetPassword(mockToken, mockNewPassword, mockIpAddress)
      ).rejects.toThrow(ValidationError);
      await expect(
        authExtendedService.resetPassword(mockToken, mockNewPassword, mockIpAddress)
      ).rejects.toThrow('Validation failed');
      
      // Verify the error contains the expected error details
      try {
        await authExtendedService.resetPassword(mockToken, mockNewPassword, mockIpAddress);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).errors).toBe('Invalid or expired reset token');
      }
      
      expect(bcrypt.hash).not.toHaveBeenCalled();
    });

    it('should invalidate all refresh tokens for the user', async () => {
      // Setup
      const mockTokenData1 = JSON.stringify({ userId: mockUserId });
      const mockTokenData2 = JSON.stringify({ userId: 'other-user' });
      const mockTokenData3 = JSON.stringify({ userId: mockUserId });

      (redis.keys as jest.Mock).mockResolvedValue([
        'refresh_token:token1',
        'refresh_token:token2',
        'refresh_token:token3'
      ]);
      (redis.get as jest.Mock)
        .mockResolvedValueOnce(JSON.stringify({ userId: mockUserId })) // password reset token
        .mockResolvedValueOnce(mockTokenData1)
        .mockResolvedValueOnce(mockTokenData2)
        .mockResolvedValueOnce(mockTokenData3);
      (redis.del as jest.Mock).mockResolvedValue(1);
      mockUpdate.mockResolvedValue(1);
      mockInsert.mockResolvedValue([1]);

      // Execute
      await authExtendedService.resetPassword(mockToken, mockNewPassword, mockIpAddress);

      // Verify
      expect(redis.del).toHaveBeenCalledWith(`password-reset:${mockToken}`);
      expect(redis.del).toHaveBeenCalledWith('refresh_token:token1');
      expect(redis.del).toHaveBeenCalledWith('refresh_token:token3');
      expect(redis.del).not.toHaveBeenCalledWith('refresh_token:token2');
    });

    it('should validate password strength - too short', async () => {
      // Execute & Verify - ValidationError always has message 'Validation failed'
      await expect(
        authExtendedService.resetPassword(mockToken, 'Short1!', mockIpAddress)
      ).rejects.toThrow(ValidationError);
      await expect(
        authExtendedService.resetPassword(mockToken, 'Short1!', mockIpAddress)
      ).rejects.toThrow('Validation failed');
      
      // Verify the error contains the expected error details
      try {
        await authExtendedService.resetPassword(mockToken, 'Short1!', mockIpAddress);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).errors).toBe('Password must be at least 8 characters long');
      }
    });

    it('should validate password strength - missing uppercase', async () => {
      // Execute & Verify - ValidationError always has message 'Validation failed'
      await expect(
        authExtendedService.resetPassword(mockToken, 'lowercase123!', mockIpAddress)
      ).rejects.toThrow(ValidationError);
      await expect(
        authExtendedService.resetPassword(mockToken, 'lowercase123!', mockIpAddress)
      ).rejects.toThrow('Validation failed');
      
      // Verify the error contains the expected error details
      try {
        await authExtendedService.resetPassword(mockToken, 'lowercase123!', mockIpAddress);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).errors).toEqual([combinedErrorMessage]);
      }
    });

    it('should validate password strength - missing lowercase', async () => {
      // Execute & Verify - ValidationError always has message 'Validation failed'
      await expect(
        authExtendedService.resetPassword(mockToken, 'UPPERCASE123!', mockIpAddress)
      ).rejects.toThrow(ValidationError);
      await expect(
        authExtendedService.resetPassword(mockToken, 'UPPERCASE123!', mockIpAddress)
      ).rejects.toThrow('Validation failed');
      
      // Verify the error contains the expected error details
      try {
        await authExtendedService.resetPassword(mockToken, 'UPPERCASE123!', mockIpAddress);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).errors).toEqual([combinedErrorMessage]);
      }
    });

    it('should validate password strength - missing number', async () => {
      // Execute & Verify - ValidationError always has message 'Validation failed'
      await expect(
        authExtendedService.resetPassword(mockToken, 'NoNumbers!', mockIpAddress)
      ).rejects.toThrow(ValidationError);
      await expect(
        authExtendedService.resetPassword(mockToken, 'NoNumbers!', mockIpAddress)
      ).rejects.toThrow('Validation failed');
      
      // Verify the error contains the expected error details
      try {
        await authExtendedService.resetPassword(mockToken, 'NoNumbers!', mockIpAddress);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).errors).toEqual([combinedErrorMessage]);
      }
    });

    it('should validate password strength - missing special character', async () => {
      // Execute & Verify - ValidationError always has message 'Validation failed'
      await expect(
        authExtendedService.resetPassword(mockToken, 'NoSpecial123', mockIpAddress)
      ).rejects.toThrow(ValidationError);
      await expect(
        authExtendedService.resetPassword(mockToken, 'NoSpecial123', mockIpAddress)
      ).rejects.toThrow('Validation failed');
      
      // Verify the error contains the expected error details
      try {
        await authExtendedService.resetPassword(mockToken, 'NoSpecial123', mockIpAddress);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).errors).toEqual([combinedErrorMessage]);
      }
    });
  });

  describe('verifyEmail()', () => {
    const mockToken = 'verify-token-123';
    const mockUserId = 'user-123';
    const mockEmail = 'test@example.com';

    it('should verify email successfully', async () => {
      // Setup
      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({ userId: mockUserId, email: mockEmail }));
      (redis.del as jest.Mock).mockResolvedValue(1);
      mockUpdate.mockResolvedValue(1);
      mockInsert.mockResolvedValue([1]);

      // Execute
      await authExtendedService.verifyEmail(mockToken);

      // Verify
      expect(redis.get).toHaveBeenCalledWith(`email-verify:${mockToken}`);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          email_verified: true,
          email_verified_at: expect.any(Date),
          updated_at: expect.any(Date)
        })
      );
      expect(redis.del).toHaveBeenCalledWith(`email-verify:${mockToken}`);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUserId,
          action: 'email_verified'
        })
      );
    });

    it('should throw error for invalid token', async () => {
      // Setup
      (redis.get as jest.Mock).mockResolvedValue(null);

      // Execute & Verify - ValidationError always has message 'Validation failed'
      await expect(authExtendedService.verifyEmail(mockToken)).rejects.toThrow(ValidationError);
      await expect(authExtendedService.verifyEmail(mockToken)).rejects.toThrow('Validation failed');
      
      // Verify the error contains the expected error details
      try {
        await authExtendedService.verifyEmail(mockToken);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).errors).toBe('Invalid or expired verification token');
      }
    });

    it('should throw error if user not found', async () => {
      // Setup
      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({ userId: mockUserId, email: mockEmail }));
      mockUpdate.mockResolvedValue(0);

      // Execute & Verify - ValidationError always has message 'Validation failed'
      await expect(authExtendedService.verifyEmail(mockToken)).rejects.toThrow(ValidationError);
      await expect(authExtendedService.verifyEmail(mockToken)).rejects.toThrow('Validation failed');
      
      // Verify the error contains the expected error details
      try {
        await authExtendedService.verifyEmail(mockToken);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).errors).toBe('User not found or email mismatch');
      }
    });

    it('should handle email mismatch', async () => {
      // Setup
      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({ userId: mockUserId, email: 'different@example.com' }));
      mockUpdate.mockResolvedValue(0);

      // Execute & Verify
      await expect(authExtendedService.verifyEmail(mockToken)).rejects.toThrow(ValidationError);
      expect(redis.del).not.toHaveBeenCalled();
    });
  });

  describe('resendVerificationEmail()', () => {
    const mockUserId = 'user-123';

    beforeEach(() => {
      // Default user setup
      mockFirst.mockResolvedValue(mockUser);
    });

    it('should resend verification email successfully', async () => {
      // Setup
      (redis.incr as jest.Mock).mockResolvedValue(1);

      // Execute
      await authExtendedService.resendVerificationEmail(mockUserId);

      // Verify
      expect(redis.incr).toHaveBeenCalledWith(`resend-verify:${mockUserId}`);
      expect(redis.expire).toHaveBeenCalledWith(`resend-verify:${mockUserId}`, 3600);
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.email,
        mockUser.first_name
      );
    });

    it('should enforce rate limiting - max 3 attempts per hour', async () => {
      // Setup - 4th attempt
      (redis.incr as jest.Mock).mockResolvedValue(4);

      // Execute & Verify - ValidationError always has message 'Validation failed'
      await expect(
        authExtendedService.resendVerificationEmail(mockUserId)
      ).rejects.toThrow(ValidationError);
      await expect(
        authExtendedService.resendVerificationEmail(mockUserId)
      ).rejects.toThrow('Validation failed');
      
      // Verify the error contains the expected error details
      try {
        await authExtendedService.resendVerificationEmail(mockUserId);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).errors).toBe('Too many resend attempts. Try again later.');
      }
      
      expect(mockEmailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('should set expiry only on first attempt', async () => {
      // Setup - 2nd attempt
      (redis.incr as jest.Mock).mockResolvedValue(2);

      // Execute
      await authExtendedService.resendVerificationEmail(mockUserId);

      // Verify
      expect(redis.incr).toHaveBeenCalledWith(`resend-verify:${mockUserId}`);
      expect(redis.expire).not.toHaveBeenCalled(); // No expire on 2nd attempt
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalled();
    });

    it('should throw error if user not found', async () => {
      // Setup
      mockFirst.mockResolvedValue(null);
      (redis.incr as jest.Mock).mockResolvedValue(1);

      // Execute & Verify - ValidationError always has message 'Validation failed'
      await expect(
        authExtendedService.resendVerificationEmail(mockUserId)
      ).rejects.toThrow(ValidationError);
      await expect(
        authExtendedService.resendVerificationEmail(mockUserId)
      ).rejects.toThrow('Validation failed');
      
      // Verify the error contains the expected error details
      try {
        await authExtendedService.resendVerificationEmail(mockUserId);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).errors).toBe('User not found');
      }
    });

    it('should throw error if email already verified', async () => {
      // Setup
      const verifiedUser = { ...mockUser, email_verified: true };
      mockFirst.mockResolvedValue(verifiedUser);
      (redis.incr as jest.Mock).mockResolvedValue(1);

      // Execute & Verify - ValidationError always has message 'Validation failed'
      await expect(
        authExtendedService.resendVerificationEmail(mockUserId)
      ).rejects.toThrow(ValidationError);
      await expect(
        authExtendedService.resendVerificationEmail(mockUserId)
      ).rejects.toThrow('Validation failed');
      
      // Verify the error contains the expected error details
      try {
        await authExtendedService.resendVerificationEmail(mockUserId);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).errors).toBe('Email already verified');
      }
    });
  });

  describe('changePassword()', () => {
    const mockUserId = 'user-123';
    const mockCurrentPassword = 'OldPass123!';
    const mockNewPassword = 'NewPass123!';
    const combinedErrorMessage = 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character';

    beforeEach(() => {
      // Setup default mocks
      mockFirst.mockResolvedValue(mockUser);
    });

    it('should change password successfully', async () => {
      // Setup
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true); // Current password is correct
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false); // New password is different
      mockUpdate.mockResolvedValue(1);
      mockInsert.mockResolvedValue([1]);

      // Mock console.log to verify it's called
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Execute
      await authExtendedService.changePassword(mockUserId, mockCurrentPassword, mockNewPassword);

      // Verify
      expect(bcrypt.compare).toHaveBeenCalledWith(mockCurrentPassword, mockUser.password_hash);
      expect(bcrypt.compare).toHaveBeenCalledWith(mockNewPassword, mockUser.password_hash);
      expect(bcrypt.hash).toHaveBeenCalledWith(mockNewPassword, 10);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          password_hash: 'hashed_password',
          password_changed_at: expect.any(Date),
          updated_at: expect.any(Date)
        })
      );
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUserId,
          action: 'password_changed'
        })
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'All sessions invalidated due to password change for user:',
        mockUserId
      );

      consoleSpy.mockRestore();
    });

    it('should invalidate all user sessions after password change', async () => {
      // Setup
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);
      mockUpdate.mockResolvedValue(1);
      mockInsert.mockResolvedValue([1]);

      const sessionUpdateMock = jest.fn().mockResolvedValue(1);
      const whereNullMock = jest.fn().mockReturnValue({ update: sessionUpdateMock });
      const whereMock = jest.fn().mockReturnValue({ whereNull: whereNullMock });

      const mockDb = db as jest.MockedFunction<typeof db>;
      mockDb.mockImplementation((tableName?: any) => {
        if (tableName === 'user_sessions') {
          return { where: whereMock } as any;
        }
        if (tableName === 'users') {
          return { withSchema: mockWithSchema } as any;
        }
        if (tableName === 'audit_logs') {
          return { insert: mockInsert } as any;
        }
        return {} as any;
      });

      // Execute
      await authExtendedService.changePassword(mockUserId, mockCurrentPassword, mockNewPassword);

      // Verify
      expect(whereMock).toHaveBeenCalledWith({ user_id: mockUserId });
      expect(whereNullMock).toHaveBeenCalledWith('revoked_at');
      expect(sessionUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          revoked_at: expect.any(Date)
        })
      );
    });

    it('should throw error if user not found', async () => {
      // Setup
      mockFirst.mockResolvedValue(null);

      // Execute & Verify
      await expect(
        authExtendedService.changePassword(mockUserId, mockCurrentPassword, mockNewPassword)
      ).rejects.toThrow(AuthenticationError);
      await expect(
        authExtendedService.changePassword(mockUserId, mockCurrentPassword, mockNewPassword)
      ).rejects.toThrow('User not found');
    });

    it('should throw error if current password is incorrect', async () => {
      // Setup
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      // Execute & Verify
      await expect(
        authExtendedService.changePassword(mockUserId, 'WrongPassword', mockNewPassword)
      ).rejects.toThrow(AuthenticationError);
      await expect(
        authExtendedService.changePassword(mockUserId, 'WrongPassword', mockNewPassword)
      ).rejects.toThrow('Current password is incorrect');
    });

    it('should throw error if new password is same as current', async () => {
      // Setup
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true); // Current password is correct
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true); // New password is same as current

      // Execute & Verify - ValidationError always has message 'Validation failed'
      await expect(
        authExtendedService.changePassword(mockUserId, mockCurrentPassword, mockCurrentPassword)
      ).rejects.toThrow(ValidationError);
      await expect(
        authExtendedService.changePassword(mockUserId, mockCurrentPassword, mockCurrentPassword)
      ).rejects.toThrow('Validation failed');
      
      // Verify the error contains the expected error details
      try {
        await authExtendedService.changePassword(mockUserId, mockCurrentPassword, mockCurrentPassword);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).errors).toBe('New password must be different from current password');
      }
    });

    it('should validate new password strength', async () => {
      // Setup
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true); // Current password is correct
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false); // New password is different

      // Execute & Verify - ValidationError always has message 'Validation failed'
      await expect(
        authExtendedService.changePassword(mockUserId, mockCurrentPassword, 'Short1!')
      ).rejects.toThrow(ValidationError);
      await expect(
        authExtendedService.changePassword(mockUserId, mockCurrentPassword, 'Short1!')
      ).rejects.toThrow('Validation failed');
      
      // Verify the error contains the expected error details
      try {
        await authExtendedService.changePassword(mockUserId, mockCurrentPassword, 'Short1!');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).errors).toBe('Password must be at least 8 characters long');
      }
    });

    it('should handle database update failure', async () => {
      // Setup
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);
      mockUpdate.mockRejectedValue(new Error('Database error'));

      // Execute & Verify
      await expect(
        authExtendedService.changePassword(mockUserId, mockCurrentPassword, mockNewPassword)
      ).rejects.toThrow('Database error');
    });
  });

  describe('validatePasswordStrength() - indirect testing', () => {
    const combinedErrorMessage = 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character';

    it('should accept valid password through resetPassword', async () => {
      // Setup
      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({ userId: 'user-123' }));
      mockUpdate.mockResolvedValue(1);
      mockInsert.mockResolvedValue([1]);

      // Execute - should not throw
      await authExtendedService.resetPassword('token', 'ValidPass123!', '192.168.1.1');

      // Verify
      expect(bcrypt.hash).toHaveBeenCalled();
    });

    it('should accept password with all special characters through resetPassword', async () => {
      // Setup
      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({ userId: 'user-123' }));
      mockUpdate.mockResolvedValue(1);
      mockInsert.mockResolvedValue([1]);

      // Test various special characters
      const specialPasswords = [
        'ValidPass123!',
        'ValidPass123@',
        'ValidPass123#',
        'ValidPass123$',
        'ValidPass123%',
        'ValidPass123^',
        'ValidPass123&',
        'ValidPass123*',
        'ValidPass123(',
        'ValidPass123)',
        'ValidPass123,',
        'ValidPass123.',
        'ValidPass123?',
        'ValidPass123"',
        'ValidPass123:',
        'ValidPass123{',
        'ValidPass123}',
        'ValidPass123|',
        'ValidPass123<',
        'ValidPass123>'
      ];

      // Execute & Verify each special character
      for (const password of specialPasswords) {
        await authExtendedService.resetPassword('token', password, '192.168.1.1');
        expect(bcrypt.hash).toHaveBeenCalledWith(password, 10);
        jest.clearAllMocks();
        // Re-setup mocks for next iteration
        (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({ userId: 'user-123' }));
        (redis.keys as jest.Mock).mockResolvedValue([]);
        (redis.del as jest.Mock).mockResolvedValue(1);
        mockUpdate.mockResolvedValue(1);
        mockInsert.mockResolvedValue([1]);
      }
    });
  });
});

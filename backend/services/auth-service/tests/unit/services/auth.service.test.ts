import { AuthService } from '../../../src/services/auth.service';
import { JWTService } from '../../../src/services/jwt.service';
import bcrypt from 'bcrypt';

// Mock all dependencies
jest.mock('../../../src/config/database', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    DEFAULT_TENANT_ID: 'default-tenant-id',
  },
}));

jest.mock('../../../src/services/email.service', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../src/services/audit.service', () => ({
  auditService: {
    logSessionCreated: jest.fn().mockResolvedValue(undefined),
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

jest.mock('../../../src/utils/sanitize', () => ({
  stripHtml: jest.fn((input) => input?.replace(/<[^>]*>/g, '').trim() || ''),
}));

jest.mock('../../../src/utils/normalize', () => ({
  normalizeEmail: jest.fn((email) => email?.toLowerCase().trim() || ''),
  normalizePhone: jest.fn((phone) => phone || null),
  normalizeText: jest.fn((text) => text?.trim() || ''),
}));

import { pool } from '../../../src/config/database';
import { auditService } from '../../../src/services/audit.service';
import { EmailService } from '../../../src/services/email.service';

describe('AuthService Unit Tests', () => {
  let authService: AuthService;
  let mockJwtService: jest.Mocked<JWTService>;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockJwtService = {
      generateTokenPair: jest.fn().mockResolvedValue({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      }),
      refreshTokens: jest.fn().mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      }),
      decode: jest.fn().mockReturnValue({ sub: 'user-id-123' }),
      initialize: jest.fn().mockResolvedValue(undefined),
      verifyAccessToken: jest.fn(),
      verifyRefreshToken: jest.fn(),
      revokeAllUserTokens: jest.fn(),
      getPublicKey: jest.fn(),
      getJWKS: jest.fn(),
    } as any;

    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    (pool.connect as jest.Mock).mockResolvedValue(mockClient);

    authService = new AuthService(mockJwtService);
  });

  describe('constructor', () => {
    it('should initialize with JWTService', () => {
      expect(authService).toBeDefined();
      expect(EmailService).toHaveBeenCalled();
    });
  });

  describe('register', () => {
    const validUserData = {
      email: 'Test@Example.com',
      password: 'SecurePassword123!',
      firstName: 'John',
      lastName: 'Doe',
      tenant_id: 'tenant-123',
      ipAddress: '127.0.0.1',
      userAgent: 'Jest Test',
    };

    beforeEach(() => {
      (pool.query as jest.Mock).mockImplementation((query: string) => {
        if (query.includes('SELECT id FROM users WHERE email')) {
          return { rows: [] };
        }
        if (query.includes('SELECT id FROM tenants')) {
          return { rows: [{ id: 'tenant-123' }] };
        }
        return { rows: [] };
      });

      mockClient.query.mockImplementation((query: string) => {
        if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') {
          return {};
        }
        if (query.includes('INSERT INTO users')) {
          return {
            rows: [{
              id: 'new-user-id',
              email: 'test@example.com',
              first_name: 'John',
              last_name: 'Doe',
              email_verified: false,
              mfa_enabled: false,
              permissions: [],
              role: 'user',
              tenant_id: 'tenant-123',
            }],
          };
        }
        if (query.includes('INSERT INTO user_sessions')) {
          return { rows: [{ id: 'session-id-123' }] };
        }
        return { rows: [] };
      });
    });

    it('should register new user successfully', async () => {
      const result = await authService.register(validUserData);

      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
      expect(result.tokens.accessToken).toBe('mock-access-token');
      expect(result.tokens.refreshToken).toBe('mock-refresh-token');
    });

    it('should normalize email before checking duplicates', async () => {
      await authService.register(validUserData);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM users WHERE email'),
        ['test@example.com']
      );
    });

    it('should throw DUPLICATE_EMAIL for existing user', async () => {
      (pool.query as jest.Mock).mockImplementation((query: string) => {
        if (query.includes('SELECT id FROM users WHERE email')) {
          return { rows: [{ id: 'existing-user' }] };
        }
        return { rows: [] };
      });

      await expect(authService.register(validUserData)).rejects.toMatchObject({
        message: 'User with this email already exists',
        code: 'DUPLICATE_EMAIL',
        statusCode: 409,
      });
    });

    it('should throw INVALID_TENANT for non-existent tenant', async () => {
      (pool.query as jest.Mock).mockImplementation((query: string) => {
        if (query.includes('SELECT id FROM users WHERE email')) {
          return { rows: [] };
        }
        if (query.includes('SELECT id FROM tenants')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      await expect(authService.register(validUserData)).rejects.toMatchObject({
        message: 'Invalid tenant',
        code: 'INVALID_TENANT',
        statusCode: 400,
      });
    });

    it('should use DEFAULT_TENANT_ID when tenant_id not provided', async () => {
      const dataWithoutTenant = { ...validUserData, tenant_id: undefined };

      (pool.query as jest.Mock).mockImplementation((query: string, params?: any[]) => {
        if (query.includes('SELECT id FROM users WHERE email')) {
          return { rows: [] };
        }
        if (query.includes('SELECT id FROM tenants')) {
          expect(params?.[0]).toBe('default-tenant-id');
          return { rows: [{ id: 'default-tenant-id' }] };
        }
        return { rows: [] };
      });

      await authService.register(dataWithoutTenant);
    });

    it('should hash password with bcrypt', async () => {
      const hashSpy = jest.spyOn(bcrypt, 'hash');

      await authService.register(validUserData);

      expect(hashSpy).toHaveBeenCalledWith(validUserData.password, 10);
    });

    it('should create user session with IP and user agent', async () => {
      await authService.register(validUserData);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_sessions'),
        expect.arrayContaining(['new-user-id', '127.0.0.1', 'Jest Test'])
      );
    });

    it('should call auditService.logSessionCreated', async () => {
      await authService.register(validUserData);

      expect(auditService.logSessionCreated).toHaveBeenCalledWith(
        'new-user-id',
        'session-id-123',
        '127.0.0.1',
        'Jest Test',
        'tenant-123'
      );
    });

    it('should rollback transaction on error', async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (query === 'BEGIN') return {};
        if (query.includes('INSERT INTO users')) {
          throw new Error('Database error');
        }
        return {};
      });

      await expect(authService.register(validUserData)).rejects.toThrow('Database error');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should sanitize firstName and lastName (strip HTML)', async () => {
      const dataWithHtml = {
        ...validUserData,
        firstName: '<script>alert("xss")</script>John',
        lastName: '<b>Doe</b>',
      };

      await authService.register(dataWithHtml);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining([expect.stringContaining('John')])
      );
    });

    it('should handle null phone number', async () => {
      const dataWithoutPhone = { ...validUserData, phone: undefined };

      await authService.register(dataWithoutPhone);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining([null])
      );
    });
  });

  describe('login', () => {
    const validLoginData = {
      email: 'test@example.com',
      password: 'SecurePassword123!',
      ipAddress: '127.0.0.1',
      userAgent: 'Jest Test',
    };

    const mockUser = {
      id: 'user-id-123',
      email: 'test@example.com',
      password_hash: '$2b$10$validhashhere',
      first_name: 'John',
      last_name: 'Doe',
      email_verified: true,
      mfa_enabled: false,
      permissions: ['read'],
      role: 'user',
      tenant_id: 'tenant-123',
      failed_login_attempts: 0,
      locked_until: null,
    };

    beforeEach(() => {
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

      (pool.query as jest.Mock).mockImplementation((query: string) => {
        if (query.includes('SELECT id, email, password_hash')) {
          return { rows: [mockUser] };
        }
        return { rows: [] };
      });

      mockClient.query.mockImplementation((query: string) => {
        if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') {
          return {};
        }
        if (query.includes('UPDATE users SET')) {
          return { rowCount: 1 };
        }
        if (query.includes('INSERT INTO user_sessions')) {
          return { rows: [{ id: 'session-id-456' }] };
        }
        return { rows: [] };
      });
    });

    it('should login successfully with valid credentials', async () => {
      const result = await authService.login(validLoginData);

      expect(result.user.id).toBe('user-id-123');
      expect(result.user.email).toBe('test@example.com');
      expect(result.tokens.accessToken).toBe('mock-access-token');
    });

    it('should throw "Invalid credentials" for non-existent user', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await expect(authService.login(validLoginData)).rejects.toThrow('Invalid credentials');
    });

    it('should throw "Invalid credentials" for wrong password', async () => {
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => false);

      await expect(authService.login(validLoginData)).rejects.toThrow('Invalid credentials');
    });

    it('should use dummy hash for timing attack prevention when user not found', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });
      const compareSpy = jest.spyOn(bcrypt, 'compare').mockImplementation(async () => false);

      await expect(authService.login(validLoginData)).rejects.toThrow('Invalid credentials');

      expect(compareSpy).toHaveBeenCalled();
    });

    it('should increment failed_login_attempts on failure', async () => {
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => false);

      await expect(authService.login(validLoginData)).rejects.toThrow('Invalid credentials');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET failed_login_attempts'),
        [1, 'user-id-123']
      );
    });

    it('should lock account after 5 failed attempts', async () => {
      const userWith4Failures = { ...mockUser, failed_login_attempts: 4 };
      (pool.query as jest.Mock).mockImplementation((query: string) => {
        if (query.includes('SELECT id, email, password_hash')) {
          return { rows: [userWith4Failures] };
        }
        return { rows: [] };
      });
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => false);

      await expect(authService.login(validLoginData)).rejects.toThrow('Invalid credentials');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET failed_login_attempts = $1, locked_until = $2'),
        expect.arrayContaining([5])
      );
    });

    it('should throw lockout error for locked account', async () => {
      const lockedUser = {
        ...mockUser,
        locked_until: new Date(Date.now() + 10 * 60 * 1000),
      };
      (pool.query as jest.Mock).mockResolvedValue({ rows: [lockedUser] });

      await expect(authService.login(validLoginData)).rejects.toThrow(/Account is temporarily locked/);
    });

    it('should reset lockout if lockout period has expired', async () => {
      const expiredLockUser = {
        ...mockUser,
        locked_until: new Date(Date.now() - 1000),
        failed_login_attempts: 5,
      };
      (pool.query as jest.Mock).mockImplementation((query: string) => {
        if (query.includes('SELECT id, email, password_hash')) {
          return { rows: [expiredLockUser] };
        }
        if (query.includes('UPDATE users SET failed_login_attempts = 0, locked_until = NULL')) {
          return { rowCount: 1 };
        }
        return { rows: [] };
      });

      await authService.login(validLoginData);

      expect(pool.query).toHaveBeenCalledWith(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
        ['user-id-123']
      );
    });

    it('should reset failed_login_attempts on successful login', async () => {
      await authService.login(validLoginData);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('failed_login_attempts = 0'),
        expect.any(Array)
      );
    });

    it('should update last_login_at and login_count', async () => {
      await authService.login(validLoginData);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('login_count = login_count + 1'),
        expect.any(Array)
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('last_login_at = NOW()'),
        expect.any(Array)
      );
    });

    it('should create user session', async () => {
      await authService.login(validLoginData);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_sessions'),
        ['user-id-123', '127.0.0.1', 'Jest Test']
      );
    });

    it('should rollback transaction on error', async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (query === 'BEGIN') return {};
        if (query.includes('UPDATE users SET')) {
          throw new Error('Database error');
        }
        return {};
      });

      await expect(authService.login(validLoginData)).rejects.toThrow();
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('refreshTokens', () => {
    beforeEach(() => {
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [{
          id: 'user-id-123',
          email: 'test@example.com',
          first_name: 'John',
          last_name: 'Doe',
          email_verified: true,
          mfa_enabled: false,
          permissions: ['read'],
          role: 'user',
          tenant_id: 'tenant-123',
        }],
      });
    });

    it('should return new token pair and user data', async () => {
      const result = await authService.refreshTokens('valid-refresh-token', '127.0.0.1', 'Jest');

      expect(result.tokens.accessToken).toBe('new-access-token');
      expect(result.tokens.refreshToken).toBe('new-refresh-token');
      expect(result.user.id).toBe('user-id-123');
    });

    it('should throw for invalid refresh token', async () => {
      mockJwtService.refreshTokens.mockRejectedValue(new Error('Invalid token'));

      await expect(
        authService.refreshTokens('invalid-token', '127.0.0.1', 'Jest')
      ).rejects.toThrow('Invalid token');
    });

    it('should throw "User not found" for deleted user', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await expect(
        authService.refreshTokens('valid-token', '127.0.0.1', 'Jest')
      ).rejects.toThrow('User not found');
    });

    it('should use default values for missing ipAddress and userAgent', async () => {
      await authService.refreshTokens('valid-token');

      expect(mockJwtService.refreshTokens).toHaveBeenCalledWith(
        'valid-token',
        'unknown',
        'unknown'
      );
    });
  });

  describe('logout', () => {
    beforeEach(() => {
      (pool.query as jest.Mock).mockResolvedValue({ rowCount: 1 });
    });

    it('should invalidate refresh token when provided', async () => {
      await authService.logout('user-id-123', 'refresh-token-abc');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO invalidated_tokens'),
        expect.arrayContaining(['refresh-token-abc', 'user-id-123'])
      );
    });

    it('should end all user sessions', async () => {
      await authService.logout('user-id-123');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_sessions SET ended_at'),
        ['user-id-123']
      );
    });

    it('should return success even without refresh token', async () => {
      const result = await authService.logout('user-id-123');

      expect(result.success).toBe(true);
    });

    it('should return success even on database error (graceful)', async () => {
      (pool.query as jest.Mock).mockRejectedValue(new Error('Database error'));

      const result = await authService.logout('user-id-123');

      expect(result.success).toBe(true);
    });
  });

  describe('verifyEmail', () => {
    it('should verify email with valid token', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [{ id: 'user-id-123' }] });

      const result = await authService.verifyEmail('valid-token');

      expect(result.success).toBe(true);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET email_verified = true'),
        ['valid-token']
      );
    });

    it('should throw for invalid verification token', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await expect(authService.verifyEmail('invalid-token')).rejects.toThrow(
        'Invalid verification token'
      );
    });
  });

  describe('forgotPassword', () => {
    it('should generate reset token for existing user without existing token', async () => {
      (pool.query as jest.Mock).mockImplementation((query: string) => {
        if (query.includes('SELECT id, email, password_reset_token')) {
          return {
            rows: [{
              id: 'user-id-123',
              email: 'test@example.com',
              password_reset_token: null,
              password_reset_expires: null,
            }],
          };
        }
        if (query.includes('UPDATE users SET password_reset_token')) {
          return { rowCount: 1 };
        }
        return { rowCount: 1 };
      });

      const result = await authService.forgotPassword('test@example.com');

      expect(result.message).toContain('If an account exists');
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET password_reset_token'),
        expect.any(Array)
      );
    });

    it('should return same message for non-existent user (no enumeration)', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await authService.forgotPassword('nobody@example.com');

      expect(result.message).toContain('If an account exists');
    });

    it('should reuse token within idempotency window (recently created token)', async () => {
      // Token that expires in 55 minutes means it was created ~5 minutes ago
      // tokenAge = (now + 55min) - now - 60min + 15min = 10min
      // isWithinIdempotencyWindow = 10min < 15min = true
      const recentExpiry = new Date(Date.now() + 55 * 60 * 1000);
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [{
          id: 'user-id-123',
          email: 'test@example.com',
          password_reset_token: 'existing-token',
          password_reset_expires: recentExpiry,
        }],
      });

      await authService.forgotPassword('test@example.com');

      // Should NOT call UPDATE - only the SELECT was called
      const updateCalls = (pool.query as jest.Mock).mock.calls.filter(
        (call: any[]) => call[0].includes('UPDATE users SET password_reset_token')
      );
      expect(updateCalls.length).toBe(0);
    });

    it('should generate new token when existing token is expired', async () => {
      const expiredToken = new Date(Date.now() - 1000); // Expired 1 second ago
      (pool.query as jest.Mock).mockImplementation((query: string) => {
        if (query.includes('SELECT id, email, password_reset_token')) {
          return {
            rows: [{
              id: 'user-id-123',
              email: 'test@example.com',
              password_reset_token: 'expired-token',
              password_reset_expires: expiredToken,
            }],
          };
        }
        if (query.includes('UPDATE users SET password_reset_token')) {
          return { rowCount: 1 };
        }
        return { rowCount: 1 };
      });

      await authService.forgotPassword('test@example.com');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET password_reset_token'),
        expect.any(Array)
      );
    });

    it('should return success message even on database error', async () => {
      (pool.query as jest.Mock).mockRejectedValue(new Error('Database error'));

      const result = await authService.forgotPassword('test@example.com');

      expect(result.message).toContain('If an account exists');
    });
  });

  describe('resetPassword', () => {
    beforeEach(() => {
      mockClient.query.mockImplementation((query: string) => {
        if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') {
          return {};
        }
        if (query.includes('SELECT id FROM users') && query.includes('FOR UPDATE')) {
          return { rows: [{ id: 'user-id-123' }] };
        }
        if (query.includes('UPDATE users')) {
          return { rowCount: 1 };
        }
        return { rows: [] };
      });
    });

    it('should reset password with valid token', async () => {
      const result = await authService.resetPassword('valid-token', 'NewPassword123!');

      expect(result.success).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should hash new password', async () => {
      const hashSpy = jest.spyOn(bcrypt, 'hash');

      await authService.resetPassword('valid-token', 'NewPassword123!');

      expect(hashSpy).toHaveBeenCalledWith('NewPassword123!', 10);
    });

    it('should clear reset token after use', async () => {
      await authService.resetPassword('valid-token', 'NewPassword123!');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('password_reset_token = NULL'),
        expect.any(Array)
      );
    });

    it('should throw for invalid or expired token', async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (query === 'BEGIN' || query === 'ROLLBACK') return {};
        if (query.includes('SELECT id FROM users')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      await expect(
        authService.resetPassword('invalid-token', 'NewPassword123!')
      ).rejects.toThrow('Invalid or expired reset token');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should rollback on error', async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (query === 'BEGIN') return {};
        if (query.includes('SELECT id FROM users')) {
          return { rows: [{ id: 'user-id-123' }] };
        }
        if (query.includes('UPDATE users')) {
          throw new Error('Database error');
        }
        return {};
      });

      await expect(
        authService.resetPassword('valid-token', 'NewPassword123!')
      ).rejects.toThrow('Database error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    beforeEach(() => {
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

      mockClient.query.mockImplementation((query: string) => {
        if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') {
          return {};
        }
        if (query.includes('SELECT password_hash FROM users') && query.includes('FOR UPDATE')) {
          return { rows: [{ password_hash: '$2b$10$validhash' }] };
        }
        if (query.includes('UPDATE users SET password_hash')) {
          return { rowCount: 1 };
        }
        return { rows: [] };
      });
    });

    it('should change password with valid current password', async () => {
      const result = await authService.changePassword(
        'user-id-123',
        'OldPassword123!',
        'NewPassword456!'
      );

      expect(result.success).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should throw "User not found" for invalid userId', async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (query === 'BEGIN' || query === 'ROLLBACK') return {};
        if (query.includes('SELECT password_hash FROM users')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      await expect(
        authService.changePassword('invalid-user', 'OldPass', 'NewPass')
      ).rejects.toThrow('User not found');
    });

    it('should throw "Invalid current password" for wrong password', async () => {
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => false);

      await expect(
        authService.changePassword('user-id-123', 'WrongPassword', 'NewPassword456!')
      ).rejects.toThrow('Invalid current password');
    });

    it('should throw when new password equals current password', async () => {
      await expect(
        authService.changePassword('user-id-123', 'SamePassword123!', 'SamePassword123!')
      ).rejects.toThrow('New password must be different from current password');
    });

    it('should hash new password', async () => {
      const hashSpy = jest.spyOn(bcrypt, 'hash');

      await authService.changePassword('user-id-123', 'OldPassword123!', 'NewPassword456!');

      expect(hashSpy).toHaveBeenCalledWith('NewPassword456!', 10);
    });

    it('should rollback on error', async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (query === 'BEGIN') return {};
        if (query.includes('SELECT password_hash FROM users')) {
          return { rows: [{ password_hash: '$2b$10$validhash' }] };
        }
        if (query.includes('UPDATE users SET password_hash')) {
          throw new Error('Database error');
        }
        return {};
      });

      await expect(
        authService.changePassword('user-id-123', 'OldPassword123!', 'NewPassword456!')
      ).rejects.toThrow('Database error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getUserById', () => {
    it('should return user for valid ID', async () => {
      const mockUser = {
        id: 'user-id-123',
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        email_verified: true,
        mfa_enabled: false,
        permissions: ['read'],
        role: 'user',
        tenant_id: 'tenant-123',
      };
      (pool.query as jest.Mock).mockResolvedValue({ rows: [mockUser] });

      const result = await authService.getUserById('user-id-123');

      expect(result).toEqual(mockUser);
    });

    it('should throw "User not found" for invalid ID', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await expect(authService.getUserById('invalid-id')).rejects.toThrow('User not found');
    });
  });

  describe('regenerateTokensAfterMFA', () => {
    it('should generate new token pair', async () => {
      const mockUser = { id: 'user-id-123', email: 'test@example.com' };

      const result = await authService.regenerateTokensAfterMFA(mockUser);

      expect(mockJwtService.generateTokenPair).toHaveBeenCalledWith(mockUser);
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
    });
  });
});

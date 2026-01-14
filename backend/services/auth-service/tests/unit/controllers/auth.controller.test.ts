// Mocks
const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  refreshTokens: jest.fn(),
  logout: jest.fn(),
  regenerateTokensAfterMFA: jest.fn(),
};

const mockMfaService = {
  setupTOTP: jest.fn(),
  verifyTOTP: jest.fn(),
  verifyAndEnableTOTP: jest.fn(),
  verifyBackupCode: jest.fn(),
  regenerateBackupCodes: jest.fn(),
  disableTOTP: jest.fn(),
};

const mockCaptchaService = {
  isCaptchaRequired: jest.fn(),
  verify: jest.fn(),
  clearFailures: jest.fn(),
  recordFailure: jest.fn(),
};

const mockUserCache = {
  getUser: jest.fn(),
  setUser: jest.fn(),
  deleteUser: jest.fn(),
};

const mockSessionCache = {
  setSession: jest.fn(),
  deleteUserSessions: jest.fn(),
};

const mockDbQuery = jest.fn();
const mockDb = jest.fn(() => ({
  where: jest.fn().mockReturnThis(),
  whereNull: jest.fn().mockReturnThis(),
  first: mockDbQuery,
}));

jest.mock('../../../src/services/captcha.service', () => ({
  captchaService: mockCaptchaService,
}));

jest.mock('../../../src/services/cache-integration', () => ({
  userCache: mockUserCache,
  sessionCache: mockSessionCache,
  getCacheStats: jest.fn().mockReturnValue({ hits: 10, misses: 5 }),
}));

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

import { AuthController } from '../../../src/controllers/auth.controller';

describe('AuthController', () => {
  let controller: AuthController;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(mockAuthService as any, mockMfaService as any);

    mockRequest = {
      body: {},
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test-agent' },
      user: { id: 'user-123', tenant_id: 'tenant-123' },
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    mockCaptchaService.isCaptchaRequired.mockResolvedValue(false);
    mockCaptchaService.recordFailure.mockResolvedValue({ requiresCaptcha: false });
    mockCaptchaService.clearFailures.mockResolvedValue(undefined);
  });

  describe('register', () => {
    it('should register a user successfully', async () => {
      const user = { id: 'user-123', email: 'test@example.com' };
      const tokens = { accessToken: 'at', refreshToken: 'rt' };
      mockAuthService.register.mockResolvedValue({ user, tokens });

      mockRequest.body = { email: 'test@example.com', password: 'Password123!' };

      await controller.register(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({ user, tokens });
      expect(mockUserCache.setUser).toHaveBeenCalledWith('user-123', user);
    });

    it('should return 409 for duplicate email (code 23505)', async () => {
      const error: any = new Error('Duplicate');
      error.code = '23505';
      mockAuthService.register.mockRejectedValue(error);

      await controller.register(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(409);
    });

    it('should return 409 for duplicate email (DUPLICATE_EMAIL code)', async () => {
      const error: any = new Error('Duplicate');
      error.code = 'DUPLICATE_EMAIL';
      mockAuthService.register.mockRejectedValue(error);

      await controller.register(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(409);
    });

    it('should return 409 for duplicate email (statusCode 409)', async () => {
      const error: any = new Error('Already exists');
      error.statusCode = 409;
      mockAuthService.register.mockRejectedValue(error);

      await controller.register(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(409);
    });

    it('should return 409 for message containing duplicate', async () => {
      mockAuthService.register.mockRejectedValue(new Error('duplicate key value'));

      await controller.register(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(409);
    });

    it('should return 409 for message containing already exists', async () => {
      mockAuthService.register.mockRejectedValue(new Error('User already exists'));

      await controller.register(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(409);
    });

    it('should return 500 for other errors', async () => {
      mockAuthService.register.mockRejectedValue(new Error('Database error'));

      await controller.register(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should use error statusCode if provided', async () => {
      const error: any = new Error('Bad request');
      error.statusCode = 400;
      mockAuthService.register.mockRejectedValue(error);

      await controller.register(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('login', () => {
    const loginBody = { email: 'test@example.com', password: 'Password123!' };

    beforeEach(() => {
      mockRequest.body = loginBody;
    });

    it('should login successfully without MFA', async () => {
      const user = { id: 'user-123', email: 'test@example.com', mfa_enabled: false };
      const tokens = { accessToken: 'at', refreshToken: 'rt' };
      mockAuthService.login.mockResolvedValue({ user, tokens });

      await controller.login(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({ user, tokens });
      expect(mockUserCache.setUser).toHaveBeenCalledWith('user-123', user);
      expect(mockSessionCache.setSession).toHaveBeenCalled();
    });

    it('should require CAPTCHA when threshold reached', async () => {
      mockCaptchaService.isCaptchaRequired.mockResolvedValue(true);

      await controller.login(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(428);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        code: 'CAPTCHA_REQUIRED',
        requiresCaptcha: true,
      }));
    });

    it('should verify CAPTCHA when provided', async () => {
      mockCaptchaService.isCaptchaRequired.mockResolvedValue(true);
      mockCaptchaService.verify.mockResolvedValue({ success: true });
      mockRequest.body.captchaToken = 'captcha-token';

      const user = { id: 'user-123', mfa_enabled: false };
      mockAuthService.login.mockResolvedValue({ user, tokens: {} });

      await controller.login(mockRequest, mockReply);

      expect(mockCaptchaService.verify).toHaveBeenCalledWith('captcha-token', '127.0.0.1');
    });

    it('should return 400 when CAPTCHA verification fails', async () => {
      mockCaptchaService.isCaptchaRequired.mockResolvedValue(true);
      mockCaptchaService.verify.mockResolvedValue({ success: false });
      mockRequest.body.captchaToken = 'bad-captcha';

      await controller.login(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        code: 'CAPTCHA_FAILED',
      }));
    });

    it('should return requiresMFA when MFA enabled but no token', async () => {
      const user = { id: 'user-123', mfa_enabled: true };
      mockAuthService.login.mockResolvedValue({ user, tokens: {} });

      await controller.login(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        requiresMFA: true,
        userId: 'user-123',
      });
    });

    it('should verify TOTP when MFA token provided', async () => {
      const user = { id: 'user-123', mfa_enabled: true, tenant_id: 'tenant-123' };
      const tokens = { accessToken: 'at', refreshToken: 'rt' };
      mockAuthService.login.mockResolvedValue({ user, tokens: {} });
      mockMfaService.verifyTOTP.mockResolvedValue(true);
      mockAuthService.regenerateTokensAfterMFA.mockResolvedValue(tokens);
      mockRequest.body.mfaToken = '123456';

      await controller.login(mockRequest, mockReply);

      expect(mockMfaService.verifyTOTP).toHaveBeenCalledWith('user-123', '123456', 'tenant-123');
      expect(mockAuthService.regenerateTokensAfterMFA).toHaveBeenCalled();
    });

    it('should try backup code when TOTP fails', async () => {
      const user = { id: 'user-123', mfa_enabled: true, tenant_id: 'tenant-123' };
      const tokens = { accessToken: 'at', refreshToken: 'rt' };
      mockAuthService.login.mockResolvedValue({ user, tokens: {} });
      mockMfaService.verifyTOTP.mockResolvedValue(false);
      mockMfaService.verifyBackupCode.mockResolvedValue(true);
      mockAuthService.regenerateTokensAfterMFA.mockResolvedValue(tokens);
      mockRequest.body.mfaToken = 'backup-code';

      await controller.login(mockRequest, mockReply);

      expect(mockMfaService.verifyBackupCode).toHaveBeenCalledWith('user-123', 'backup-code', 'tenant-123');
    });

    it('should try backup code when TOTP throws error', async () => {
      const user = { id: 'user-123', mfa_enabled: true, tenant_id: 'tenant-123' };
      const tokens = { accessToken: 'at', refreshToken: 'rt' };
      mockAuthService.login.mockResolvedValue({ user, tokens: {} });
      mockMfaService.verifyTOTP.mockRejectedValue(new Error('TOTP error'));
      mockMfaService.verifyBackupCode.mockResolvedValue(true);
      mockAuthService.regenerateTokensAfterMFA.mockResolvedValue(tokens);
      mockRequest.body.mfaToken = 'backup-code';

      await controller.login(mockRequest, mockReply);

      expect(mockMfaService.verifyBackupCode).toHaveBeenCalled();
    });

    it('should return 401 when both MFA methods fail', async () => {
      const user = { id: 'user-123', mfa_enabled: true, tenant_id: 'tenant-123' };
      mockAuthService.login.mockResolvedValue({ user, tokens: {} });
      mockMfaService.verifyTOTP.mockResolvedValue(false);
      mockMfaService.verifyBackupCode.mockResolvedValue(false);
      mockRequest.body.mfaToken = 'bad-token';

      await controller.login(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid MFA token' });
    });

    it('should return 401 when backup code also throws', async () => {
      const user = { id: 'user-123', mfa_enabled: true, tenant_id: 'tenant-123' };
      mockAuthService.login.mockResolvedValue({ user, tokens: {} });
      mockMfaService.verifyTOTP.mockRejectedValue(new Error('TOTP error'));
      mockMfaService.verifyBackupCode.mockRejectedValue(new Error('Backup error'));
      mockRequest.body.mfaToken = 'bad-token';

      await controller.login(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should return 401 for invalid credentials', async () => {
      mockAuthService.login.mockRejectedValue(new Error('Invalid credentials'));

      await controller.login(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockCaptchaService.recordFailure).toHaveBeenCalled();
    });

    it('should return 401 for user not found', async () => {
      mockAuthService.login.mockRejectedValue(new Error('User not found'));

      await controller.login(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should return 401 for invalid password', async () => {
      mockAuthService.login.mockRejectedValue(new Error('Invalid password'));

      await controller.login(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should return 500 for other errors', async () => {
      mockAuthService.login.mockRejectedValue(new Error('Database error'));

      await controller.login(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should include requiresCaptcha flag after failure', async () => {
      mockCaptchaService.recordFailure.mockResolvedValue({ requiresCaptcha: true });
      mockAuthService.login.mockRejectedValue(new Error('Invalid credentials'));

      await controller.login(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        requiresCaptcha: true,
      }));
    });

    it('should use IP as identifier when no email', async () => {
      mockRequest.body = { password: 'test' };
      mockAuthService.login.mockRejectedValue(new Error('Invalid'));

      await controller.login(mockRequest, mockReply);

      expect(mockCaptchaService.isCaptchaRequired).toHaveBeenCalledWith('127.0.0.1');
    });
  });

  describe('refreshTokens', () => {
    it('should refresh tokens successfully', async () => {
      const tokens = { accessToken: 'new-at', refreshToken: 'new-rt' };
      mockAuthService.refreshTokens.mockResolvedValue(tokens);
      mockRequest.body = { refreshToken: 'old-rt' };

      await controller.refreshTokens(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(tokens);
    });

    it('should return 401 on refresh error', async () => {
      mockAuthService.refreshTokens.mockRejectedValue(new Error('Token expired'));
      mockRequest.body = { refreshToken: 'expired-rt' };

      await controller.refreshTokens(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);

      await controller.logout(mockRequest, mockReply);

      expect(mockUserCache.deleteUser).toHaveBeenCalledWith('user-123');
      expect(mockSessionCache.deleteUserSessions).toHaveBeenCalledWith('user-123');
      expect(mockAuthService.logout).toHaveBeenCalledWith('user-123');
      expect(mockReply.status).toHaveBeenCalledWith(204);
    });
  });

  describe('getMe', () => {
    it('should return cached user', async () => {
      const user = { id: 'user-123', email: 'test@example.com' };
      mockUserCache.getUser.mockResolvedValue(user);

      await controller.getMe(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({ user });
      expect(mockDb).not.toHaveBeenCalled();
    });

    it('should fetch from DB if not cached', async () => {
      const user = { id: 'user-123', email: 'test@example.com' };
      mockUserCache.getUser.mockResolvedValue(null);
      mockDbQuery.mockResolvedValue(user);

      await controller.getMe(mockRequest, mockReply);

      expect(mockDb).toHaveBeenCalledWith('users');
      expect(mockUserCache.setUser).toHaveBeenCalledWith('user-123', user);
      expect(mockReply.send).toHaveBeenCalledWith({ user });
    });

    it('should return 404 if user not found', async () => {
      mockUserCache.getUser.mockResolvedValue(null);
      mockDbQuery.mockResolvedValue(null);

      await controller.getMe(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getCacheStats', () => {
    it('should return cache stats', async () => {
      await controller.getCacheStats(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({ hits: 10, misses: 5 });
    });
  });

  describe('verifyToken', () => {
    it('should return valid with user', async () => {
      await controller.verifyToken(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({ valid: true, user: mockRequest.user });
    });
  });

  describe('getCurrentUser', () => {
    it('should return current user', async () => {
      await controller.getCurrentUser(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({ user: mockRequest.user });
    });
  });

  describe('setupMFA', () => {
    it('should setup MFA successfully', async () => {
      const result = { secret: 'secret', qrCode: 'qr' };
      mockMfaService.setupTOTP.mockResolvedValue(result);

      await controller.setupMFA(mockRequest, mockReply);

      expect(mockMfaService.setupTOTP).toHaveBeenCalledWith('user-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith(result);
    });

    it('should return 400 if MFA already enabled', async () => {
      mockMfaService.setupTOTP.mockRejectedValue(new Error('MFA already enabled'));

      await controller.setupMFA(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should return 500 for other errors', async () => {
      mockMfaService.setupTOTP.mockRejectedValue(new Error('Database error'));

      await controller.setupMFA(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('verifyMFASetup', () => {
    it('should verify MFA setup successfully', async () => {
      const result = { success: true, backupCodes: ['code1', 'code2'] };
      mockMfaService.verifyAndEnableTOTP.mockResolvedValue(result);
      mockRequest.body = { token: '123456' };

      await controller.verifyMFASetup(mockRequest, mockReply);

      expect(mockMfaService.verifyAndEnableTOTP).toHaveBeenCalledWith('user-123', '123456', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith(result);
    });

    it('should return 400 for invalid token', async () => {
      mockMfaService.verifyAndEnableTOTP.mockRejectedValue(new Error('Invalid token'));
      mockRequest.body = { token: 'bad' };

      await controller.verifyMFASetup(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 for expired token', async () => {
      mockMfaService.verifyAndEnableTOTP.mockRejectedValue(new Error('Token expired'));
      mockRequest.body = { token: 'expired' };

      await controller.verifyMFASetup(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should return 500 for other errors', async () => {
      mockMfaService.verifyAndEnableTOTP.mockRejectedValue(new Error('DB error'));
      mockRequest.body = { token: '123456' };

      await controller.verifyMFASetup(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('verifyMFA', () => {
    it('should verify MFA successfully', async () => {
      mockMfaService.verifyTOTP.mockResolvedValue(true);
      mockRequest.body = { token: '123456' };

      await controller.verifyMFA(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({ valid: true });
    });

    it('should return 500 on error', async () => {
      mockMfaService.verifyTOTP.mockRejectedValue(new Error('Error'));
      mockRequest.body = { token: '123456' };

      await controller.verifyMFA(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('regenerateBackupCodes', () => {
    it('should regenerate backup codes successfully', async () => {
      const result = { backupCodes: ['code1', 'code2'] };
      mockMfaService.regenerateBackupCodes.mockResolvedValue(result);

      await controller.regenerateBackupCodes(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(result);
    });

    it('should return 400 if MFA not enabled', async () => {
      mockMfaService.regenerateBackupCodes.mockRejectedValue(new Error('MFA not enabled'));

      await controller.regenerateBackupCodes(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should return 500 for other errors', async () => {
      mockMfaService.regenerateBackupCodes.mockRejectedValue(new Error('DB error'));

      await controller.regenerateBackupCodes(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('disableMFA', () => {
    it('should disable MFA successfully', async () => {
      mockMfaService.disableTOTP.mockResolvedValue(undefined);
      mockRequest.body = { password: 'password', token: '123456' };

      await controller.disableMFA(mockRequest, mockReply);

      expect(mockMfaService.disableTOTP).toHaveBeenCalledWith('user-123', 'password', '123456', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({ success: true });
    });

    it('should return 400 for invalid password', async () => {
      mockMfaService.disableTOTP.mockRejectedValue(new Error('Invalid password'));
      mockRequest.body = { password: 'wrong', token: '123456' };

      await controller.disableMFA(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should return 500 for other errors', async () => {
      mockMfaService.disableTOTP.mockRejectedValue(new Error('DB error'));
      mockRequest.body = { password: 'password', token: '123456' };

      await controller.disableMFA(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });
});

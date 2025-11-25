import { AuthController } from '../../../src/controllers/auth.controller';
import { AuthService } from '../../../src/services/auth.service';
import { MFAService } from '../../../src/services/mfa.service';
import { db } from '../../../src/config/database';
import { userCache, sessionCache, getCacheStats } from '../../../src/services/cache-integration';

// Mock all dependencies
jest.mock('../../../src/services/auth.service');
jest.mock('../../../src/services/mfa.service');
jest.mock('../../../src/config/database', () => ({
  db: jest.fn()
}));
jest.mock('../../../src/services/cache-integration');

describe('AuthController', () => {
  let authController: AuthController;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockMFAService: jest.Mocked<MFAService>;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock instances - use partial mocks to avoid constructor issues
    mockAuthService = {
      register: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
      refreshTokens: jest.fn(),
    } as any;
    
    mockMFAService = {
      setupTOTP: jest.fn(),
      verifyTOTP: jest.fn(),
      verifyBackupCode: jest.fn(),
      disableTOTP: jest.fn(),
    } as any;
    
    // Create controller with mocks
    authController = new AuthController(mockAuthService, mockMFAService);

    // Setup mock request/reply
    mockRequest = {
      body: {},
      headers: {},
      ip: '127.0.0.1',
      user: { id: 'user-123', email: 'test@example.com' }
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    // Setup cache mocks
    (userCache.setUser as jest.Mock) = jest.fn().mockResolvedValue(undefined);
    (userCache.getUser as jest.Mock) = jest.fn().mockResolvedValue(null);
    (userCache.deleteUser as jest.Mock) = jest.fn().mockResolvedValue(undefined);
    (sessionCache.setSession as jest.Mock) = jest.fn().mockResolvedValue(undefined);
    (sessionCache.deleteUserSessions as jest.Mock) = jest.fn().mockResolvedValue(undefined);
    (getCacheStats as jest.Mock) = jest.fn().mockReturnValue({ hits: 10, misses: 5 });
  });

  // Helper to create proper user object with snake_case fields
  const createMockUser = (overrides: any = {}) => ({
    id: 'user-123',
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    email_verified: true,
    mfa_enabled: false,
    tenant_id: 'tenant-123',
    permissions: [],
    role: 'user',
    ...overrides
  });

  // =============================================================================
  // GROUP 1: register() - 10 test cases
  // =============================================================================
  
  describe('register()', () => {
    it('should successfully register a new user with valid credentials', async () => {
      // Arrange
      const registerData = {
        email: 'newuser@example.com',
        password: 'SecurePass123!',
        firstName: 'John',
        lastName: 'Doe'
      };
      
      const mockResult = {
        user: createMockUser({ id: 'user-456', email: 'newuser@example.com', first_name: 'John', last_name: 'Doe' }),
        tokens: { accessToken: 'access-token-123', refreshToken: 'refresh-token-456' }
      };
      
      mockAuthService.register.mockResolvedValue(mockResult as any);
      mockRequest.body = registerData;

      // Act
      await authController.register(mockRequest, mockReply);

      // Assert
      expect(mockAuthService.register).toHaveBeenCalledWith(registerData);
      expect(userCache.setUser).toHaveBeenCalledWith('user-456', mockResult.user);
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        user: mockResult.user,
        tokens: mockResult.tokens
      });
    });

    it('should cache the newly registered user data', async () => {
      // Arrange
      const mockResult = {
        user: createMockUser({ id: 'user-789', email: 'cached@example.com' }),
        tokens: { accessToken: 'token', refreshToken: 'refresh' }
      };
      
      mockAuthService.register.mockResolvedValue(mockResult as any);
      mockRequest.body = { email: 'cached@example.com', password: 'Pass123!' };

      // Act
      await authController.register(mockRequest, mockReply);

      // Assert
      expect(userCache.setUser).toHaveBeenCalledWith('user-789', mockResult.user);
    });

    it('should reject registration with duplicate email', async () => {
      // Arrange
      mockAuthService.register.mockRejectedValue(new Error('Email already exists'));
      mockRequest.body = { email: 'existing@example.com', password: 'Pass123!' };

      // Act & Assert
      await expect(authController.register(mockRequest, mockReply)).rejects.toThrow('Email already exists');
      expect(userCache.setUser).not.toHaveBeenCalled();
    });

    it('should reject registration with weak password', async () => {
      // Arrange
      mockAuthService.register.mockRejectedValue(new Error('Password too weak'));
      mockRequest.body = { email: 'test@example.com', password: '123' };

      // Act & Assert
      await expect(authController.register(mockRequest, mockReply)).rejects.toThrow('Password too weak');
    });

    it('should reject registration with invalid email format', async () => {
      // Arrange
      mockAuthService.register.mockRejectedValue(new Error('Invalid email format'));
      mockRequest.body = { email: 'notanemail', password: 'SecurePass123!' };

      // Act & Assert
      await expect(authController.register(mockRequest, mockReply)).rejects.toThrow('Invalid email format');
    });

    it('should reject registration with missing required fields', async () => {
      // Arrange
      mockAuthService.register.mockRejectedValue(new Error('Missing required fields'));
      mockRequest.body = { email: 'test@example.com' }; // missing password

      // Act & Assert
      await expect(authController.register(mockRequest, mockReply)).rejects.toThrow('Missing required fields');
    });

    it('should handle database errors during registration', async () => {
      // Arrange
      mockAuthService.register.mockRejectedValue(new Error('Database connection failed'));
      mockRequest.body = { email: 'test@example.com', password: 'Pass123!' };

      // Act & Assert
      await expect(authController.register(mockRequest, mockReply)).rejects.toThrow('Database connection failed');
    });

    it('should not cache user if user ID is missing', async () => {
      // Arrange
      const mockResult = {
        user: { email: 'noid@example.com' } as any, // no id field
        tokens: { accessToken: 'token', refreshToken: 'refresh' }
      };
      
      mockAuthService.register.mockResolvedValue(mockResult as any);
      mockRequest.body = { email: 'noid@example.com', password: 'Pass123!' };

      // Act
      await authController.register(mockRequest, mockReply);

      // Assert
      expect(userCache.setUser).not.toHaveBeenCalled();
    });

    it('should return tokens with user data on successful registration', async () => {
      // Arrange
      const mockResult = {
        user: createMockUser({ id: 'user-999', email: 'tokens@example.com' }),
        tokens: { 
          accessToken: 'access-xyz', 
          refreshToken: 'refresh-xyz'
        }
      };
      
      mockAuthService.register.mockResolvedValue(mockResult as any);
      mockRequest.body = { email: 'tokens@example.com', password: 'Pass123!' };

      // Act
      await authController.register(mockRequest, mockReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({
        user: mockResult.user,
        tokens: mockResult.tokens
      });
    });

    it('should handle cache failures gracefully during registration', async () => {
      // Arrange
      const mockResult = {
        user: createMockUser({ id: 'user-111', email: 'cachefail@example.com' }),
        tokens: { accessToken: 'token', refreshToken: 'refresh' }
      };
      
      mockAuthService.register.mockResolvedValue(mockResult as any);
      (userCache.setUser as jest.Mock).mockRejectedValue(new Error('Redis down'));
      mockRequest.body = { email: 'cachefail@example.com', password: 'Pass123!' };

      // Act & Assert
      await expect(authController.register(mockRequest, mockReply)).rejects.toThrow('Redis down');
    });
  });

  // =============================================================================
  // GROUP 2: login() - 15 test cases
  // =============================================================================
  
  describe('login()', () => {
    it('should successfully login with valid credentials without MFA', async () => {
      // Arrange
      const loginData = {
        email: 'user@example.com',
        password: 'ValidPass123!',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0'
      };
      
      const mockResult = {
        user: createMockUser({ id: 'user-123', email: 'user@example.com', mfa_enabled: false }),
        tokens: { accessToken: 'access-abc', refreshToken: 'refresh-abc' }
      };
      
      mockAuthService.login.mockResolvedValue(mockResult as any);
      mockRequest.body = { email: loginData.email, password: loginData.password };
      mockRequest.headers['user-agent'] = 'Mozilla/5.0';

      // Act
      await authController.login(mockRequest, mockReply);

      // Assert
      expect(mockAuthService.login).toHaveBeenCalledWith(loginData);
      expect(userCache.setUser).toHaveBeenCalledWith('user-123', mockResult.user);
      expect(sessionCache.setSession).toHaveBeenCalledWith('access-abc', {
        userId: 'user-123',
        email: 'user@example.com',
        createdAt: expect.any(Number)
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        user: mockResult.user,
        tokens: mockResult.tokens
      });
    });

    it('should cache user and session data after successful login', async () => {
      // Arrange
      const mockResult = {
        user: createMockUser({ id: 'user-456', email: 'cache@example.com', mfa_enabled: false }),
        tokens: { accessToken: 'token-xyz', refreshToken: 'refresh-xyz' }
      };
      
      mockAuthService.login.mockResolvedValue(mockResult as any);
      mockRequest.body = { email: 'cache@example.com', password: 'Pass123!' };

      // Act
      await authController.login(mockRequest, mockReply);

      // Assert
      expect(userCache.setUser).toHaveBeenCalledWith('user-456', mockResult.user);
      expect(sessionCache.setSession).toHaveBeenCalledWith('token-xyz', expect.any(Object));
    });

    it('should prompt for MFA when user has MFA enabled and no token provided', async () => {
      // Arrange
      const mockResult = {
        user: createMockUser({ id: 'user-mfa', email: 'mfa@example.com', mfa_enabled: true }),
        tokens: { accessToken: 'temp-token', refreshToken: 'temp-refresh' }
      };
      
      mockAuthService.login.mockResolvedValue(mockResult as any);
      mockRequest.body = { email: 'mfa@example.com', password: 'Pass123!' };
      // No mfaToken provided

      // Act
      await authController.login(mockRequest, mockReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        requiresMFA: true,
        userId: 'user-mfa'
      });
    });

    it('should successfully login with MFA when valid TOTP provided', async () => {
      // Arrange
      const mockResult = {
        user: createMockUser({ id: 'user-mfa-valid', email: 'mfavalid@example.com', mfa_enabled: true }),
        tokens: { accessToken: 'mfa-token', refreshToken: 'mfa-refresh' }
      };
      
      mockAuthService.login.mockResolvedValue(mockResult as any);
      mockMFAService.verifyTOTP.mockResolvedValue(true);
      mockRequest.body = { 
        email: 'mfavalid@example.com', 
        password: 'Pass123!',
        mfaToken: '123456'
      };

      // Act
      await authController.login(mockRequest, mockReply);

      // Assert
      expect(mockMFAService.verifyTOTP).toHaveBeenCalledWith('user-mfa-valid', '123456');
      expect(mockReply.send).toHaveBeenCalledWith({
        user: mockResult.user,
        tokens: mockResult.tokens
      });
    });

    it('should successfully login with MFA when valid backup code provided', async () => {
      // Arrange
      const mockResult = {
        user: createMockUser({ id: 'user-backup', email: 'backup@example.com', mfa_enabled: true }),
        tokens: { accessToken: 'backup-token', refreshToken: 'backup-refresh' }
      };
      
      mockAuthService.login.mockResolvedValue(mockResult as any);
      mockMFAService.verifyTOTP.mockResolvedValue(false); // TOTP fails
      mockMFAService.verifyBackupCode.mockResolvedValue(true); // Backup succeeds
      mockRequest.body = { 
        email: 'backup@example.com', 
        password: 'Pass123!',
        mfaToken: 'BACKUP-CODE-123'
      };

      // Act
      await authController.login(mockRequest, mockReply);

      // Assert
      expect(mockMFAService.verifyTOTP).toHaveBeenCalled();
      expect(mockMFAService.verifyBackupCode).toHaveBeenCalledWith('user-backup', 'BACKUP-CODE-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        user: mockResult.user,
        tokens: mockResult.tokens
      });
    });

    it('should reject login when MFA token is invalid', async () => {
      // Arrange
      const mockResult = {
        user: createMockUser({ id: 'user-invalid-mfa', email: 'invalidmfa@example.com', mfa_enabled: true }),
        tokens: { accessToken: 'temp', refreshToken: 'temp' }
      };
      
      mockAuthService.login.mockResolvedValue(mockResult as any);
      mockMFAService.verifyTOTP.mockResolvedValue(false);
      mockMFAService.verifyBackupCode.mockResolvedValue(false);
      mockRequest.body = { 
        email: 'invalidmfa@example.com', 
        password: 'Pass123!',
        mfaToken: '000000'
      };

      // Act
      await authController.login(mockRequest, mockReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Invalid MFA token'
      });
    });

    it('should reject login with invalid credentials', async () => {
      // Arrange
      mockAuthService.login.mockRejectedValue(new Error('Invalid credentials'));
      mockRequest.body = { email: 'wrong@example.com', password: 'WrongPass!' };

      // Act & Assert
      await expect(authController.login(mockRequest, mockReply)).rejects.toThrow('Invalid credentials');
    });

    it('should reject login with non-existent user', async () => {
      // Arrange
      mockAuthService.login.mockRejectedValue(new Error('User not found'));
      mockRequest.body = { email: 'notfound@example.com', password: 'Pass123!' };

      // Act & Assert
      await expect(authController.login(mockRequest, mockReply)).rejects.toThrow('User not found');
    });

    it('should capture IP address from request during login', async () => {
      // Arrange
      const mockResult = {
        user: createMockUser({ id: 'user-ip', email: 'ip@example.com', mfa_enabled: false }),
        tokens: { accessToken: 'ip-token', refreshToken: 'ip-refresh' }
      };
      
      mockAuthService.login.mockResolvedValue(mockResult as any);
      mockRequest.body = { email: 'ip@example.com', password: 'Pass123!' };
      mockRequest.ip = '192.168.1.100';

      // Act
      await authController.login(mockRequest, mockReply);

      // Assert
      expect(mockAuthService.login).toHaveBeenCalledWith(
        expect.objectContaining({ ipAddress: '192.168.1.100' })
      );
    });

    it('should capture user agent from request headers during login', async () => {
      // Arrange
      const mockResult = {
        user: createMockUser({ id: 'user-ua', email: 'ua@example.com', mfa_enabled: false }),
        tokens: { accessToken: 'ua-token', refreshToken: 'ua-refresh' }
      };
      
      mockAuthService.login.mockResolvedValue(mockResult as any);
      mockRequest.body = { email: 'ua@example.com', password: 'Pass123!' };
      mockRequest.headers['user-agent'] = 'Custom Agent/1.0';

      // Act
      await authController.login(mockRequest, mockReply);

      // Assert
      expect(mockAuthService.login).toHaveBeenCalledWith(
        expect.objectContaining({ userAgent: 'Custom Agent/1.0' })
      );
    });

    it('should use "unknown" user agent when header is missing', async () => {
      // Arrange
      const mockResult = {
        user: createMockUser({ id: 'user-noua', email: 'noua@example.com', mfa_enabled: false }),
        tokens: { accessToken: 'noua-token', refreshToken: 'noua-refresh' }
      };
      
      mockAuthService.login.mockResolvedValue(mockResult as any);
      mockRequest.body = { email: 'noua@example.com', password: 'Pass123!' };
      mockRequest.headers = {}; // no user-agent

      // Act
      await authController.login(mockRequest, mockReply);

      // Assert
      expect(mockAuthService.login).toHaveBeenCalledWith(
        expect.objectContaining({ userAgent: 'unknown' })
      );
    });

    it('should not cache session if tokens are missing', async () => {
      // Arrange
      const mockResult = {
        user: createMockUser({ id: 'user-notokens', email: 'notokens@example.com', mfa_enabled: false }),
        tokens: null // no tokens
      };
      
      mockAuthService.login.mockResolvedValue(mockResult as any);
      mockRequest.body = { email: 'notokens@example.com', password: 'Pass123!' };

      // Act
      await authController.login(mockRequest, mockReply);

      // Assert
      expect(sessionCache.setSession).not.toHaveBeenCalled();
    });

    it('should handle account lockout after multiple failed attempts', async () => {
      // Arrange
      mockAuthService.login.mockRejectedValue(new Error('Account locked'));
      mockRequest.body = { email: 'locked@example.com', password: 'Pass123!' };

      // Act & Assert
      await expect(authController.login(mockRequest, mockReply)).rejects.toThrow('Account locked');
    });

    it('should reject login for unverified email addresses', async () => {
      // Arrange
      mockAuthService.login.mockRejectedValue(new Error('Email not verified'));
      mockRequest.body = { email: 'unverified@example.com', password: 'Pass123!' };

      // Act & Assert
      await expect(authController.login(mockRequest, mockReply)).rejects.toThrow('Email not verified');
    });
  });

  // =============================================================================
  // GROUP 3: refreshTokens() - 8 test cases
  // =============================================================================
  
  describe('refreshTokens()', () => {
    it('should successfully refresh tokens with valid refresh token', async () => {
      // Arrange
      const mockResult = {
        user: createMockUser(),
        tokens: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token'
        }
      };
      
      mockAuthService.refreshTokens.mockResolvedValue(mockResult as any);
      mockRequest.body = { refreshToken: 'valid-refresh-token' };
      mockRequest.headers['user-agent'] = 'Test Agent';

      // Act
      await authController.refreshTokens(mockRequest, mockReply);

      // Assert
      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(
        'valid-refresh-token',
        '127.0.0.1',
        'Test Agent'
      );
      expect(mockReply.send).toHaveBeenCalledWith(mockResult);
    });

    it('should reject refresh with invalid refresh token', async () => {
      // Arrange
      mockAuthService.refreshTokens.mockRejectedValue(new Error('Invalid refresh token'));
      mockRequest.body = { refreshToken: 'invalid-token' };

      // Act & Assert
      await expect(authController.refreshTokens(mockRequest, mockReply)).rejects.toThrow('Invalid refresh token');
    });

    it('should reject refresh with expired refresh token', async () => {
      // Arrange
      mockAuthService.refreshTokens.mockRejectedValue(new Error('Refresh token expired'));
      mockRequest.body = { refreshToken: 'expired-token' };

      // Act & Assert
      await expect(authController.refreshTokens(mockRequest, mockReply)).rejects.toThrow('Refresh token expired');
    });

    it('should reject refresh with blacklisted refresh token', async () => {
      // Arrange
      mockAuthService.refreshTokens.mockRejectedValue(new Error('Token has been revoked'));
      mockRequest.body = { refreshToken: 'blacklisted-token' };

      // Act & Assert
      await expect(authController.refreshTokens(mockRequest, mockReply)).rejects.toThrow('Token has been revoked');
    });

    it('should capture IP address during token refresh', async () => {
      // Arrange
      const mockResult = { 
        user: createMockUser(), 
        tokens: { accessToken: 'new-token', refreshToken: 'new-refresh' }
      };
      mockAuthService.refreshTokens.mockResolvedValue(mockResult as any);
      mockRequest.body = { refreshToken: 'token' };
      mockRequest.ip = '10.0.0.1';

      // Act
      await authController.refreshTokens(mockRequest, mockReply);

      // Assert
      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(
        'token',
        '10.0.0.1',
        expect.any(String)
      );
    });

    it('should capture user agent during token refresh', async () => {
      // Arrange
      const mockResult = { 
        user: createMockUser(), 
        tokens: { accessToken: 'new-token', refreshToken: 'new-refresh' }
      };
      mockAuthService.refreshTokens.mockResolvedValue(mockResult as any);
      mockRequest.body = { refreshToken: 'token' };
      mockRequest.headers['user-agent'] = 'Mobile App/2.0';

      // Act
      await authController.refreshTokens(mockRequest, mockReply);

      // Assert
      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(
        'token',
        expect.any(String),
        'Mobile App/2.0'
      );
    });

    it('should use "unknown" user agent when missing during refresh', async () => {
      // Arrange
      const mockResult = { 
        user: createMockUser(), 
        tokens: { accessToken: 'new-token', refreshToken: 'new-refresh' }
      };
      mockAuthService.refreshTokens.mockResolvedValue(mockResult as any);
      mockRequest.body = { refreshToken: 'token' };
      mockRequest.headers = {};

      // Act
      await authController.refreshTokens(mockRequest, mockReply);

      // Assert
      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(
        'token',
        expect.any(String),
        'unknown'
      );
    });

    it('should handle missing refresh token in request body', async () => {
      // Arrange
      mockAuthService.refreshTokens.mockRejectedValue(new Error('Refresh token is required'));
      mockRequest.body = {}; // no refreshToken

      // Act & Assert
      await expect(authController.refreshTokens(mockRequest, mockReply)).rejects.toThrow('Refresh token is required');
    });
  });

  // =============================================================================
  // GROUP 4: logout() - 6 test cases
  // =============================================================================
  
  describe('logout()', () => {
    it('should successfully logout and clear user cache', async () => {
      // Arrange
      mockAuthService.logout.mockResolvedValue({ success: true } as any);
      mockRequest.user = { id: 'user-logout-123' };

      // Act
      await authController.logout(mockRequest, mockReply);

      // Assert
      expect(userCache.deleteUser).toHaveBeenCalledWith('user-logout-123');
      expect(mockAuthService.logout).toHaveBeenCalledWith('user-logout-123');
      expect(mockReply.status).toHaveBeenCalledWith(204);
      expect(mockReply.send).toHaveBeenCalled();
    });

    it('should clear session cache during logout', async () => {
      // Arrange
      mockAuthService.logout.mockResolvedValue({ success: true } as any);
      mockRequest.user = { id: 'user-sessions-456' };

      // Act
      await authController.logout(mockRequest, mockReply);

      // Assert
      expect(sessionCache.deleteUserSessions).toHaveBeenCalledWith('user-sessions-456');
    });

    it('should revoke all user sessions during logout', async () => {
      // Arrange
      mockAuthService.logout.mockResolvedValue({ success: true } as any);
      mockRequest.user = { id: 'user-revoke-789' };

      // Act
      await authController.logout(mockRequest, mockReply);

      // Assert
      expect(mockAuthService.logout).toHaveBeenCalledWith('user-revoke-789');
    });

    it('should return 204 status on successful logout', async () => {
      // Arrange
      mockAuthService.logout.mockResolvedValue({ success: true } as any);
      mockRequest.user = { id: 'user-204' };

      // Act
      await authController.logout(mockRequest, mockReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(204);
    });

    it('should handle logout when cache deletion fails', async () => {
      // Arrange
      mockAuthService.logout.mockResolvedValue({ success: true } as any);
      (userCache.deleteUser as jest.Mock).mockRejectedValue(new Error('Cache error'));
      mockRequest.user = { id: 'user-cache-fail' };

      // Act & Assert
      await expect(authController.logout(mockRequest, mockReply)).rejects.toThrow('Cache error');
    });

    it('should handle logout when session revocation fails', async () => {
      // Arrange
      mockAuthService.logout.mockRejectedValue(new Error('Database error during logout'));
      mockRequest.user = { id: 'user-db-fail' };

      // Act & Assert
      await expect(authController.logout(mockRequest, mockReply)).rejects.toThrow('Database error during logout');
    });
  });

  // =============================================================================
  // GROUP 5: getMe() - 5 test cases
  // =============================================================================
  
  describe('getMe()', () => {
    it('should return user data from cache on cache hit', async () => {
      // Arrange
      const cachedUser = createMockUser({ id: 'user-cached', email: 'cached@example.com', first_name: 'Cached' });
      (userCache.getUser as jest.Mock).mockResolvedValue(cachedUser);
      mockRequest.user = { id: 'user-cached' };

      // Act
      await authController.getMe(mockRequest, mockReply);

      // Assert
      expect(userCache.getUser).toHaveBeenCalledWith('user-cached');
      expect(db).not.toHaveBeenCalled(); // Should not hit database
      expect(mockReply.send).toHaveBeenCalledWith({ user: cachedUser });
    });

    it('should fetch from database on cache miss and cache the result', async () => {
      // Arrange
      const dbUser = createMockUser({ id: 'user-db', email: 'db@example.com', first_name: 'Database' });
      (userCache.getUser as jest.Mock).mockResolvedValue(null); // Cache miss
      
      const mockDbQuery = {
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(dbUser)
      };
      (db as jest.MockedFunction<typeof db>).mockReturnValue(mockDbQuery as any);
      
      mockRequest.user = { id: 'user-db' };

      // Act
      await authController.getMe(mockRequest, mockReply);

      // Assert
      expect(userCache.getUser).toHaveBeenCalledWith('user-db');
      expect(db).toHaveBeenCalledWith('users');
      expect(userCache.setUser).toHaveBeenCalledWith('user-db', dbUser);
      expect(mockReply.send).toHaveBeenCalledWith({ user: dbUser });
    });

    it('should return 404 when user not found in database', async () => {
      // Arrange
      (userCache.getUser as jest.Mock).mockResolvedValue(null);
      
      const mockDbQuery = {
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null) // User not found
      };
      (db as jest.MockedFunction<typeof db>).mockReturnValue(mockDbQuery as any);
      
      mockRequest.user = { id: 'user-notfound' };

      // Act
      await authController.getMe(mockRequest, mockReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('should not cache user when database returns null', async () => {
      // Arrange
      (userCache.getUser as jest.Mock).mockResolvedValue(null);
      
      const mockDbQuery = {
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      };
      (db as jest.MockedFunction<typeof db>).mockReturnValue(mockDbQuery as any);
      
      mockRequest.user = { id: 'user-null' };

      // Act
      await authController.getMe(mockRequest, mockReply);

      // Assert
      expect(userCache.setUser).not.toHaveBeenCalled();
    });

    it('should exclude soft-deleted users when fetching from database', async () => {
      // Arrange
      (userCache.getUser as jest.Mock).mockResolvedValue(null);
      
      const mockDbQuery = {
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(createMockUser({ id: 'user-active' }))
      };
      (db as jest.MockedFunction<typeof db>).mockReturnValue(mockDbQuery as any);
      
      mockRequest.user = { id: 'user-active' };

      // Act
      await authController.getMe(mockRequest, mockReply);

      // Assert
      expect(mockDbQuery.whereNull).toHaveBeenCalledWith('deleted_at');
    });
  });

  // =============================================================================
  // GROUP 6: getCacheStats() - 3 test cases
  // =============================================================================
  
  describe('getCacheStats()', () => {
    it('should return cache statistics', async () => {
      // Arrange
      const mockStats = { 
        hits: 150, 
        misses: 25, 
        hitRate: 0.857,
        totalKeys: 200 
      };
      (getCacheStats as jest.Mock).mockReturnValue(mockStats);

      // Act
      await authController.getCacheStats(mockRequest, mockReply);

      // Assert
      expect(getCacheStats).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith(mockStats);
    });

    it('should return current cache metrics including hit rate', async () => {
      // Arrange
      const mockStats = { 
        hits: 1000, 
        misses: 100, 
        hitRate: 0.909 
      };
      (getCacheStats as jest.Mock).mockReturnValue(mockStats);

      // Act
      await authController.getCacheStats(mockRequest, mockReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ hitRate: expect.any(Number) })
      );
    });

    it('should handle empty cache stats gracefully', async () => {
      // Arrange
      const mockStats = { hits: 0, misses: 0, hitRate: 0 };
      (getCacheStats as jest.Mock).mockReturnValue(mockStats);

      // Act
      await authController.getCacheStats(mockRequest, mockReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith(mockStats);
    });
  });

  // =============================================================================
  // GROUP 7: verifyToken() - 6 test cases
  // =============================================================================
  
  describe('verifyToken()', () => {
    it('should return valid true with user data when token is valid', async () => {
      // Arrange
      mockRequest.user = { 
        id: 'user-valid', 
        email: 'valid@example.com',
        roles: ['user'] 
      };

      // Act
      await authController.verifyToken(mockRequest, mockReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({ 
        valid: true, 
        user: mockRequest.user 
      });
    });

    it('should include all user properties in verification response', async () => {
      // Arrange
      mockRequest.user = { 
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        roles: ['admin'],
        permissions: ['read', 'write']
      };

      // Act
      await authController.verifyToken(mockRequest, mockReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({ 
        valid: true, 
        user: expect.objectContaining({
          id: 'user-123',
          email: 'test@example.com',
          roles: ['admin']
        })
      });
    });

    it('should work with minimal user data', async () => {
      // Arrange
      mockRequest.user = { id: 'user-minimal' };

      // Act
      await authController.verifyToken(mockRequest, mockReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({ 
        valid: true, 
        user: { id: 'user-minimal' }
      });
    });

    it('should verify tokens for different user roles', async () => {
      // Arrange
      mockRequest.user = { 
        id: 'admin-user',
        roles: ['admin', 'superuser']
      };

      // Act
      await authController.verifyToken(mockRequest, mockReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({ 
        valid: true, 
        user: expect.objectContaining({ roles: ['admin', 'superuser'] })
      });
    });

    it('should handle token verification for service accounts', async () => {
      // Arrange
      mockRequest.user = { 
        id: 'service-account-123',
        type: 'service',
        permissions: ['api:read', 'api:write']
      };

      // Act
      await authController.verifyToken(mockRequest, mockReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({ 
        valid: true, 
        user: expect.objectContaining({ type: 'service' })
      });
    });

    it('should successfully verify tokens without making external calls', async () => {
      // Arrange
      mockRequest.user = { id: 'user-nocalls' };

      // Act
      await authController.verifyToken(mockRequest, mockReply);

      // Assert
      expect(mockAuthService.login).not.toHaveBeenCalled();
      expect(mockAuthService.register).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({ 
        valid: true, 
        user: mockRequest.user 
      });
    });
  });

  // =============================================================================
  // GROUP 8: getCurrentUser() - 4 test cases
  // =============================================================================
  
  describe('getCurrentUser()', () => {
    it('should return current user from request', async () => {
      // Arrange
      mockRequest.user = { 
        id: 'current-user', 
        email: 'current@example.com' 
      };

      // Act
      await authController.getCurrentUser(mockRequest, mockReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({ 
        user: mockRequest.user 
      });
    });

    it('should return user with all properties attached to request', async () => {
      // Arrange
      mockRequest.user = { 
        id: 'user-full',
        email: 'full@example.com',
        firstName: 'Full',
        lastName: 'User',
        roles: ['user'],
        createdAt: '2024-01-01'
      };

      // Act
      await authController.getCurrentUser(mockRequest, mockReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({ 
        user: expect.objectContaining({
          firstName: 'Full',
          lastName: 'User'
        })
      });
    });

    it('should not make database calls for getCurrentUser', async () => {
      // Arrange
      mockRequest.user = { id: 'user-nodbcall' };

      // Act
      await authController.getCurrentUser(mockRequest, mockReply);

      // Assert
      expect(db).not.toHaveBeenCalled();
      expect(userCache.getUser).not.toHaveBeenCalled();
    });

    it('should return user even with minimal data in request', async () => {
      // Arrange
      mockRequest.user = { id: 'minimal' };

      // Act
      await authController.getCurrentUser(mockRequest, mockReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({ 
        user: { id: 'minimal' }
      });
    });
  });

  // =============================================================================
  // GROUP 9: setupMFA() - 8 test cases
  // =============================================================================
  
  describe('setupMFA()', () => {
    it('should successfully setup MFA and return TOTP secret', async () => {
      // Arrange
      const mockResult = {
        secret: 'JBSWY3DPEHPK3PXP',
        qrCode: 'data:image/png;base64,iVBORw0KGgo...',
        backupCodes: ['ABC123', 'DEF456']
      };
      
      mockMFAService.setupTOTP.mockResolvedValue(mockResult);
      mockRequest.user = { id: 'user-mfa-setup' };

      // Act
      await authController.setupMFA(mockRequest, mockReply);

      // Assert
      expect(mockMFAService.setupTOTP).toHaveBeenCalledWith('user-mfa-setup');
      expect(mockReply.send).toHaveBeenCalledWith(mockResult);
    });

    it('should return QR code for TOTP setup', async () => {
      // Arrange
      const mockResult = {
        secret: 'SECRET123',
        qrCode: 'data:image/png;base64,qrdata',
        backupCodes: ['CODE1', 'CODE2']
      };
      
      mockMFAService.setupTOTP.mockResolvedValue(mockResult);
      mockRequest.user = { id: 'user-qr' };

      // Act
      await authController.setupMFA(mockRequest, mockReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ qrCode: expect.stringContaining('data:image/png') })
      );
    });

    it('should generate backup codes during MFA setup', async () => {
      // Arrange
      const mockResult = {
        secret: 'SECRET',
        qrCode: 'QR',
        backupCodes: ['BACKUP1', 'BACKUP2', 'BACKUP3']
      };
      
      mockMFAService.setupTOTP.mockResolvedValue(mockResult);
      mockRequest.user = { id: 'user-backup' };

      // Act
      await authController.setupMFA(mockRequest, mockReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ 
          backupCodes: expect.arrayContaining(['BACKUP1', 'BACKUP2'])
        })
      );
    });

    it('should use user ID from authenticated request', async () => {
      // Arrange
      mockMFAService.setupTOTP.mockResolvedValue({
        secret: 'S', qrCode: 'Q', backupCodes: []
      });
      mockRequest.user = { id: 'specific-user-123' };

      // Act
      await authController.setupMFA(mockRequest, mockReply);

      // Assert
      expect(mockMFAService.setupTOTP).toHaveBeenCalledWith('specific-user-123');
    });

    it('should handle MFA setup failure', async () => {
      // Arrange
      mockMFAService.setupTOTP.mockRejectedValue(new Error('MFA setup failed'));
      mockRequest.user = { id: 'user-fail' };

      // Act & Assert
      await expect(authController.setupMFA(mockRequest, mockReply)).rejects.toThrow('MFA setup failed');
    });

    it('should reject MFA setup when user already has MFA enabled', async () => {
      // Arrange
      mockMFAService.setupTOTP.mockRejectedValue(new Error('MFA already enabled'));
      mockRequest.user = { id: 'user-already-enabled' };

      // Act & Assert
      await expect(authController.setupMFA(mockRequest, mockReply)).rejects.toThrow('MFA already enabled');
    });

    it('should handle missing user ID in request', async () => {
      // Arrange
      mockMFAService.setupTOTP.mockResolvedValue({ secret: 'S', qrCode: 'Q', backupCodes: [] });
      mockRequest.user = {}; // no id

      // Act
      await authController.setupMFA(mockRequest, mockReply);

      // Assert
      expect(mockMFAService.setupTOTP).toHaveBeenCalledWith(undefined);
    });

    it('should return unique secret for each MFA setup', async () => {
      // Arrange
      const mockResult1 = { secret: 'SECRET1', qrCode: 'QR1', backupCodes: [] };
      const mockResult2 = { secret: 'SECRET2', qrCode: 'QR2', backupCodes: [] };
      
      mockMFAService.setupTOTP
        .mockResolvedValueOnce(mockResult1)
        .mockResolvedValueOnce(mockResult2);
      
      mockRequest.user = { id: 'user-unique' };

      // Act
      await authController.setupMFA(mockRequest, mockReply);
      await authController.setupMFA(mockRequest, mockReply);

      // Assert
      expect(mockMFAService.setupTOTP).toHaveBeenCalledTimes(2);
    });
  });

  // =============================================================================
  // GROUP 10: verifyMFA() - 8 test cases
  // =============================================================================
  
  describe('verifyMFA()', () => {
    it('should successfully verify valid TOTP token', async () => {
      // Arrange
      mockMFAService.verifyTOTP.mockResolvedValue(true);
      mockRequest.user = { id: 'user-verify' };
      mockRequest.body = { token: '123456' };

      // Act
      await authController.verifyMFA(mockRequest, mockReply);

      // Assert
      expect(mockMFAService.verifyTOTP).toHaveBeenCalledWith('user-verify', '123456');
      expect(mockReply.send).toHaveBeenCalledWith({ valid: true });
    });

    it('should return false for invalid TOTP token', async () => {
      // Arrange
      mockMFAService.verifyTOTP.mockResolvedValue(false);
      mockRequest.user = { id: 'user-invalid' };
      mockRequest.body = { token: '000000' };

      // Act
      await authController.verifyMFA(mockRequest, mockReply);

      // Assert
      expect(mockMFAService.verifyTOTP).toHaveBeenCalledWith('user-invalid', '000000');
      expect(mockReply.send).toHaveBeenCalledWith({ valid: false });
    });

    it('should verify 6-digit TOTP codes', async () => {
      // Arrange
      mockMFAService.verifyTOTP.mockResolvedValue(true);
      mockRequest.user = { id: 'user-6digit' };
      mockRequest.body = { token: '654321' };

      // Act
      await authController.verifyMFA(mockRequest, mockReply);

      // Assert
      expect(mockMFAService.verifyTOTP).toHaveBeenCalledWith('user-6digit', '654321');
    });

    it('should use user ID from authenticated request', async () => {
      // Arrange
      mockMFAService.verifyTOTP.mockResolvedValue(true);
      mockRequest.user = { id: 'specific-verify-user' };
      mockRequest.body = { token: '111111' };

      // Act
      await authController.verifyMFA(mockRequest, mockReply);

      // Assert
      expect(mockMFAService.verifyTOTP).toHaveBeenCalledWith('specific-verify-user', '111111');
    });

    it('should handle expired TOTP tokens', async () => {
      // Arrange
      mockMFAService.verifyTOTP.mockResolvedValue(false);
      mockRequest.user = { id: 'user-expired' };
      mockRequest.body = { token: '999999' };

      // Act
      await authController.verifyMFA(mockRequest, mockReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({ valid: false });
    });

    it('should handle missing token in request body', async () => {
      // Arrange
      mockMFAService.verifyTOTP.mockResolvedValue(false);
      mockRequest.user = { id: 'user-notoken' };
      mockRequest.body = {}; // no token

      // Act
      await authController.verifyMFA(mockRequest, mockReply);

      // Assert
      expect(mockMFAService.verifyTOTP).toHaveBeenCalledWith('user-notoken', undefined);
    });

    it('should reject verification when MFA is not enabled for user', async () => {
      // Arrange
      mockMFAService.verifyTOTP.mockRejectedValue(new Error('MFA not enabled'));
      mockRequest.user = { id: 'user-no-mfa' };
      mockRequest.body = { token: '123456' };

      // Act & Assert
      await expect(authController.verifyMFA(mockRequest, mockReply)).rejects.toThrow('MFA not enabled');
    });

    it('should handle MFA service failures gracefully', async () => {
      // Arrange
      mockMFAService.verifyTOTP.mockRejectedValue(new Error('MFA service unavailable'));
      mockRequest.user = { id: 'user-service-fail' };
      mockRequest.body = { token: '123456' };

      // Act & Assert
      await expect(authController.verifyMFA(mockRequest, mockReply)).rejects.toThrow('MFA service unavailable');
    });
  });

  // =============================================================================
  // GROUP 11: disableMFA() - 5 test cases
  // =============================================================================
  
  describe('disableMFA()', () => {
    it('should successfully disable MFA for user', async () => {
      // Arrange
      mockMFAService.disableTOTP.mockResolvedValue(undefined);
      mockRequest.user = { id: 'user-disable' };

      // Act
      await authController.disableMFA(mockRequest, mockReply);

      // Assert
      expect(mockMFAService.disableTOTP).toHaveBeenCalledWith('user-disable');
      expect(mockReply.send).toHaveBeenCalledWith({ success: true });
    });

    it('should use user ID from authenticated request', async () => {
      // Arrange
      mockMFAService.disableTOTP.mockResolvedValue(undefined);
      mockRequest.user = { id: 'specific-disable-user' };

      // Act
      await authController.disableMFA(mockRequest, mockReply);

      // Assert
      expect(mockMFAService.disableTOTP).toHaveBeenCalledWith('specific-disable-user');
    });

    it('should return success true when MFA is disabled', async () => {
      // Arrange
      mockMFAService.disableTOTP.mockResolvedValue(undefined);
      mockRequest.user = { id: 'user-success' };

      // Act
      await authController.disableMFA(mockRequest, mockReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({ success: true });
    });

    it('should handle errors when MFA is not enabled', async () => {
      // Arrange
      mockMFAService.disableTOTP.mockRejectedValue(new Error('MFA not enabled'));
      mockRequest.user = { id: 'user-not-enabled' };

      // Act & Assert
      await expect(authController.disableMFA(mockRequest, mockReply)).rejects.toThrow('MFA not enabled');
    });

    it('should handle MFA service failures during disable', async () => {
      // Arrange
      mockMFAService.disableTOTP.mockRejectedValue(new Error('Failed to disable MFA'));
      mockRequest.user = { id: 'user-fail-disable' };

      // Act & Assert
      await expect(authController.disableMFA(mockRequest, mockReply)).rejects.toThrow('Failed to disable MFA');
    });
  });
});

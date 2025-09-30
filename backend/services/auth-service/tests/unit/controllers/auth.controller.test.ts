import { AuthController } from '../../../src/controllers/auth.controller';
import { testUsers, testTokens } from '../../fixtures/users';

// Mock the services before importing them
jest.mock('../../../src/services/auth.service');
jest.mock('../../../src/services/mfa.service');
jest.mock('../../../src/config/database');
jest.mock('../../../src/services/cache-integration');

describe('AuthController', () => {
  let authController: AuthController;
  let mockAuthService: any;
  let mockMFAService: any;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock services
    mockAuthService = {
      register: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
      refreshTokens: jest.fn(),
      getCurrentUser: jest.fn()
    };
    
    mockMFAService = {
      setupMFA: jest.fn(),
      verifyMFA: jest.fn(),
      disableMFA: jest.fn(),
      generateSecret: jest.fn(),
      verifyTOTP: jest.fn(),
      disable: jest.fn()
    };
    
    authController = new AuthController(mockAuthService, mockMFAService);
    
    mockRequest = {
      body: {},
      params: {},
      headers: {},
      user: null,
      ip: '127.0.0.1'
    };
    
    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('register', () => {
    it('should register user and return 201', async () => {
      mockAuthService.register.mockResolvedValueOnce({
        user: testUsers.validUser,
        tokens: {
          accessToken: testTokens.validAccessToken,
          refreshToken: testTokens.validRefreshToken
        }
      });

      mockRequest.body = {
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      };

      await authController.register(mockRequest, mockReply);

      expect(mockAuthService.register).toHaveBeenCalledWith(mockRequest.body);
      expect(mockReply.status).toHaveBeenCalledWith(201);
    });
  });

  describe('login', () => {
    it('should login user successfully', async () => {
      mockAuthService.login.mockResolvedValueOnce({
        user: { ...testUsers.validUser, mfa_enabled: false },
        tokens: {
          accessToken: testTokens.validAccessToken,
          refreshToken: testTokens.validRefreshToken
        }
      });

      mockRequest.body = {
        email: 'test@example.com',
        password: 'Password123!'
      };

      await authController.login(mockRequest, mockReply);

      expect(mockAuthService.login).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalled();
    });
  });
});

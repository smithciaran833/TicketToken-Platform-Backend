import { AuthService } from '../../../src/services/auth.service';
import { JWTService } from '../../../src/services/jwt.service';
import bcrypt from 'bcrypt';
import { pool } from '../../../src/config/database';
import { testUsers } from '../../fixtures/users';

jest.mock('bcrypt');
jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn() }
}));

describe('AuthService', () => {
  let authService: AuthService;
  let mockJWTService: jest.Mocked<JWTService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockJWTService = {
      generateTokenPair: jest.fn(),
      verifyAccessToken: jest.fn(),
      verifyRefreshToken: jest.fn()
    } as any;
    authService = new AuthService(mockJWTService);
  });

  describe('register', () => {
    it('should successfully register a new user', async () => {
      const mockQuery = pool.query as jest.Mock;
      const mockHash = bcrypt.hash as jest.Mock;
      
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockHash.mockResolvedValueOnce('hashed_password');
      mockQuery.mockResolvedValueOnce({ 
        rows: [testUsers.validUser] 
      });
      mockJWTService.generateTokenPair.mockResolvedValueOnce({
        accessToken: 'access_token',
        refreshToken: 'refresh_token'
      });

      const result = await authService.register({
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.tokens.accessToken).toBe('access_token');
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockHash).toHaveBeenCalledWith('Password123!', 10);
    });

    it('should throw error if email already exists', async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce({ 
        rows: [testUsers.validUser] 
      });

      await expect(authService.register({
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      })).rejects.toThrow('Email already registered');
    });
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      const mockQuery = pool.query as jest.Mock;
      const mockCompare = bcrypt.compare as jest.Mock;
      
      mockQuery.mockResolvedValueOnce({ 
        rows: [testUsers.validUser] 
      });
      mockCompare.mockResolvedValueOnce(true);
      mockJWTService.generateTokenPair.mockResolvedValueOnce({
        accessToken: 'access_token',
        refreshToken: 'refresh_token'
      });

      const result = await authService.login({
        email: 'test@example.com',
        password: 'Password123!',
        ipAddress: '127.0.0.1',
        userAgent: 'Test'
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.tokens.accessToken).toBe('access_token');
    });

    it('should throw error with invalid credentials', async () => {
      const mockQuery = pool.query as jest.Mock;
      const mockCompare = bcrypt.compare as jest.Mock;
      
      mockQuery.mockResolvedValueOnce({ 
        rows: [testUsers.validUser] 
      });
      mockCompare.mockResolvedValueOnce(false);

      await expect(authService.login({
        email: 'test@example.com',
        password: 'WrongPassword',
        ipAddress: '127.0.0.1',
        userAgent: 'Test'
      })).rejects.toThrow('Invalid credentials');
    });
  });
});

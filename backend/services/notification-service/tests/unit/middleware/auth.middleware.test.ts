import { authMiddleware, optionalAuthMiddleware } from '../../../src/middleware/auth.middleware';
import jwt from 'jsonwebtoken';
import { env } from '../../../src/config/env';
import { logger } from '../../../src/config/logger';

jest.mock('jsonwebtoken');
jest.mock('../../../src/config/logger');

describe('Auth Middleware', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      headers: {},
      user: undefined
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('authMiddleware', () => {
    describe('Success Cases', () => {
      it('should authenticate valid token with userId field', async () => {
        const token = 'valid.jwt.token';
        mockRequest.headers.authorization = `Bearer ${token}`;

        const decoded = {
          userId: 'user-123',
          email: 'user@example.com',
          venueId: 'venue-456',
          role: 'admin'
        };

        (jwt.verify as jest.Mock).mockReturnValue(decoded);

        await authMiddleware(mockRequest, mockReply);

        expect(jwt.verify).toHaveBeenCalledWith(token, env.JWT_SECRET, {
          algorithms: ['HS256', 'HS384', 'HS512']
        });
        expect(mockRequest.user).toEqual({
          id: 'user-123',
          email: 'user@example.com',
          venueId: 'venue-456',
          role: 'admin'
        });
        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should authenticate valid token with id field', async () => {
        const token = 'valid.jwt.token';
        mockRequest.headers.authorization = `Bearer ${token}`;

        const decoded = {
          id: 'user-789',
          email: 'admin@example.com',
          role: 'superadmin'
        };

        (jwt.verify as jest.Mock).mockReturnValue(decoded);

        await authMiddleware(mockRequest, mockReply);

        expect(mockRequest.user).toEqual({
          id: 'user-789',
          email: 'admin@example.com',
          venueId: undefined,
          role: 'superadmin'
        });
      });

      it('should handle token without venueId', async () => {
        mockRequest.headers.authorization = 'Bearer token';

        (jwt.verify as jest.Mock).mockReturnValue({
          userId: 'user-1',
          email: 'test@example.com'
        });

        await authMiddleware(mockRequest, mockReply);

        expect(mockRequest.user.venueId).toBeUndefined();
      });

      it('should handle token without role', async () => {
        mockRequest.headers.authorization = 'Bearer token';

        (jwt.verify as jest.Mock).mockReturnValue({
          userId: 'user-1',
          email: 'test@example.com'
        });

        await authMiddleware(mockRequest, mockReply);

        expect(mockRequest.user.role).toBeUndefined();
      });

      it('should specify allowed algorithms (AUDIT FIX SEC-1)', async () => {
        mockRequest.headers.authorization = 'Bearer token';

        (jwt.verify as jest.Mock).mockReturnValue({
          userId: 'user-1',
          email: 'test@example.com'
        });

        await authMiddleware(mockRequest, mockReply);

        expect(jwt.verify).toHaveBeenCalledWith(
          'token',
          env.JWT_SECRET,
          expect.objectContaining({
            algorithms: ['HS256', 'HS384', 'HS512']
          })
        );
      });

      it('should strip Bearer prefix correctly', async () => {
        mockRequest.headers.authorization = 'Bearer abc123';

        (jwt.verify as jest.Mock).mockReturnValue({
          userId: 'user-1',
          email: 'test@example.com'
        });

        await authMiddleware(mockRequest, mockReply);

        expect(jwt.verify).toHaveBeenCalledWith('abc123', env.JWT_SECRET, expect.any(Object));
      });
    });

    describe('Error Cases - Missing Token', () => {
      it('should return 401 when no authorization header', async () => {
        await authMiddleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'No authorization token provided'
        });
        expect(mockRequest.user).toBeUndefined();
      });

      it('should return 401 when authorization header is empty string', async () => {
        mockRequest.headers.authorization = '';

        await authMiddleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'No authorization token provided'
        });
      });

      it('should return 401 when only "Bearer" without token', async () => {
        mockRequest.headers.authorization = 'Bearer ';

        await authMiddleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
      });
    });

    describe('Error Cases - Invalid Token', () => {
      it('should return 401 for JsonWebTokenError', async () => {
        mockRequest.headers.authorization = 'Bearer invalid';

        const error = new Error('Invalid signature');
        error.name = 'JsonWebTokenError';
        (jwt.verify as jest.Mock).mockImplementation(() => {
          throw error;
        });

        await authMiddleware(mockRequest, mockReply);

        expect(logger.error).toHaveBeenCalledWith('Authentication failed', error);
        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid token'
        });
      });

      it('should return 401 for TokenExpiredError', async () => {
        mockRequest.headers.authorization = 'Bearer expired';

        const error = new Error('Token expired');
        error.name = 'TokenExpiredError';
        (jwt.verify as jest.Mock).mockImplementation(() => {
          throw error;
        });

        await authMiddleware(mockRequest, mockReply);

        expect(logger.error).toHaveBeenCalledWith('Authentication failed', error);
        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Token expired'
        });
      });

      it('should return 500 for generic errors', async () => {
        mockRequest.headers.authorization = 'Bearer token';

        const error = new Error('Database error');
        error.name = 'DatabaseError';
        (jwt.verify as jest.Mock).mockImplementation(() => {
          throw error;
        });

        await authMiddleware(mockRequest, mockReply);

        expect(logger.error).toHaveBeenCalledWith('Authentication failed', error);
        expect(mockReply.status).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Authentication error'
        });
      });

      it('should handle malformed JWT', async () => {
        mockRequest.headers.authorization = 'Bearer malformed';

        const error = new Error('Malformed JWT');
        error.name = 'JsonWebTokenError';
        (jwt.verify as jest.Mock).mockImplementation(() => {
          throw error;
        });

        await authMiddleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid token'
        });
      });
    });

    describe('Security', () => {
      it('should prevent algorithm confusion attacks', async () => {
        mockRequest.headers.authorization = 'Bearer token';

        (jwt.verify as jest.Mock).mockReturnValue({
          userId: 'user-1',
          email: 'test@example.com'
        });

        await authMiddleware(mockRequest, mockReply);

        const verifyCall = (jwt.verify as jest.Mock).mock.calls[0];
        expect(verifyCall[2].algorithms).toEqual(['HS256', 'HS384', 'HS512']);
        expect(verifyCall[2].algorithms).not.toContain('none');
        expect(verifyCall[2].algorithms).not.toContain('RS256');
      });

      it('should use JWT_SECRET from env', async () => {
        mockRequest.headers.authorization = 'Bearer token';

        (jwt.verify as jest.Mock).mockReturnValue({
          userId: 'user-1',
          email: 'test@example.com'
        });

        await authMiddleware(mockRequest, mockReply);

        expect(jwt.verify).toHaveBeenCalledWith('token', env.JWT_SECRET, expect.any(Object));
      });
    });
  });

  describe('optionalAuthMiddleware', () => {
    describe('Success Cases', () => {
      it('should authenticate valid token', async () => {
        const token = 'valid.jwt.token';
        mockRequest.headers.authorization = `Bearer ${token}`;

        const decoded = {
          userId: 'user-123',
          email: 'user@example.com',
          venueId: 'venue-456',
          role: 'admin'
        };

        (jwt.verify as jest.Mock).mockReturnValue(decoded);

        await optionalAuthMiddleware(mockRequest, mockReply);

        expect(jwt.verify).toHaveBeenCalledWith(token, env.JWT_SECRET, {
          algorithms: ['HS256', 'HS384', 'HS512']
        });
        expect(mockRequest.user).toEqual({
          id: 'user-123',
          email: 'user@example.com',
          venueId: 'venue-456',
          role: 'admin'
        });
      });

      it('should continue without error when no token provided', async () => {
        await optionalAuthMiddleware(mockRequest, mockReply);

        expect(mockRequest.user).toBeUndefined();
        expect(mockReply.status).not.toHaveBeenCalled();
        expect(mockReply.send).not.toHaveBeenCalled();
      });

      it('should continue without error when token is invalid', async () => {
        mockRequest.headers.authorization = 'Bearer invalid';

        const error = new Error('Invalid token');
        error.name = 'JsonWebTokenError';
        (jwt.verify as jest.Mock).mockImplementation(() => {
          throw error;
        });

        await optionalAuthMiddleware(mockRequest, mockReply);

        expect(mockRequest.user).toBeUndefined();
        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should continue without error when token is expired', async () => {
        mockRequest.headers.authorization = 'Bearer expired';

        const error = new Error('Token expired');
        error.name = 'TokenExpiredError';
        (jwt.verify as jest.Mock).mockImplementation(() => {
          throw error;
        });

        await optionalAuthMiddleware(mockRequest, mockReply);

        expect(mockRequest.user).toBeUndefined();
        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should handle empty authorization header gracefully', async () => {
        mockRequest.headers.authorization = '';

        await optionalAuthMiddleware(mockRequest, mockReply);

        expect(jwt.verify).not.toHaveBeenCalled();
        expect(mockRequest.user).toBeUndefined();
      });

      it('should specify allowed algorithms (AUDIT FIX SEC-1)', async () => {
        mockRequest.headers.authorization = 'Bearer token';

        (jwt.verify as jest.Mock).mockReturnValue({
          userId: 'user-1',
          email: 'test@example.com'
        });

        await optionalAuthMiddleware(mockRequest, mockReply);

        expect(jwt.verify).toHaveBeenCalledWith(
          'token',
          env.JWT_SECRET,
          expect.objectContaining({
            algorithms: ['HS256', 'HS384', 'HS512']
          })
        );
      });

      it('should use id field fallback', async () => {
        mockRequest.headers.authorization = 'Bearer token';

        (jwt.verify as jest.Mock).mockReturnValue({
          id: 'user-999',
          email: 'test@example.com'
        });

        await optionalAuthMiddleware(mockRequest, mockReply);

        expect(mockRequest.user.id).toBe('user-999');
      });
    });

    describe('Silent Failure Behavior', () => {
      it('should not log errors', async () => {
        mockRequest.headers.authorization = 'Bearer invalid';

        (jwt.verify as jest.Mock).mockImplementation(() => {
          throw new Error('Invalid');
        });

        await optionalAuthMiddleware(mockRequest, mockReply);

        expect(logger.error).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
      });

      it('should not throw errors', async () => {
        mockRequest.headers.authorization = 'Bearer invalid';

        (jwt.verify as jest.Mock).mockImplementation(() => {
          throw new Error('Invalid');
        });

        await expect(optionalAuthMiddleware(mockRequest, mockReply)).resolves.not.toThrow();
      });
    });
  });

  describe('Request User Property', () => {
    it('should not modify request when auth fails (required)', async () => {
      mockRequest.headers.authorization = 'Bearer invalid';

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid');
      });

      await authMiddleware(mockRequest, mockReply);

      expect(mockRequest.user).toBeUndefined();
    });

    it('should not modify request when auth fails (optional)', async () => {
      mockRequest.headers.authorization = 'Bearer invalid';

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid');
      });

      await optionalAuthMiddleware(mockRequest, mockReply);

      expect(mockRequest.user).toBeUndefined();
    });
  });
});

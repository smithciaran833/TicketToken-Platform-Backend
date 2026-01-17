// Mock logger BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock jsonwebtoken
jest.mock('jsonwebtoken');

import jwt from 'jsonwebtoken';
import { FastifyRequest, FastifyReply } from 'fastify';
import {
  authenticate,
  authorize,
  authMiddleware,
  optionalAuthMiddleware,
} from '../../../src/middleware/auth.middleware';
import { logger } from '../../../src/utils/logger';

describe('Auth Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('authenticate', () => {
    it('should return 401 when no authorization header provided', async () => {
      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'No authorization header provided',
      });
    });

    it('should return 401 when authorization header is empty after Bearer removal', async () => {
      mockRequest.headers = { authorization: 'Bearer ' };

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid authorization header format',
      });
    });

    it('should return 401 when token is invalid', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid-token' };
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.JsonWebTokenError('invalid token');
      });

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    });

    it('should return 401 when token is expired', async () => {
      mockRequest.headers = { authorization: 'Bearer expired-token' };
      // TokenExpiredError extends JsonWebTokenError, so use JsonWebTokenError in mock
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.JsonWebTokenError('jwt expired');
      });

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    });

    it('should return 500 when unknown error occurs', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Authentication failed',
      });
      expect(logger.error).toHaveBeenCalledWith('Authentication error', {
        error: expect.any(Error),
      });
    });

    it('should set user on request when token is valid', async () => {
      const decodedPayload = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'admin',
      };
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockReturnValue(decodedPayload);

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect((mockRequest as any).user).toEqual({
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'admin',
      });
      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should log debug message on successful authentication', async () => {
      const decodedPayload = { userId: 'user-123' };
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockReturnValue(decodedPayload);

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.debug).toHaveBeenCalledWith('User authenticated', {
        userId: 'user-123',
      });
    });

    it('should handle token without Bearer prefix', async () => {
      const decodedPayload = { userId: 'user-123' };
      mockRequest.headers = { authorization: 'some-token-without-bearer' };
      (jwt.verify as jest.Mock).mockReturnValue(decodedPayload);

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // Token is extracted by replacing 'Bearer ' - if not present, whole string is used
      expect(jwt.verify).toHaveBeenCalledWith(
        'some-token-without-bearer',
        expect.any(String)
      );
    });

    it('should handle user with minimal payload (only userId)', async () => {
      const decodedPayload = { userId: 'user-minimal' };
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockReturnValue(decodedPayload);

      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect((mockRequest as any).user).toEqual({
        userId: 'user-minimal',
        tenantId: undefined,
        role: undefined,
      });
    });
  });

  describe('authorize', () => {
    it('should return 403 when user is not set on request', async () => {
      const middleware = authorize(['admin']);

      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
    });

    it('should return 403 when user has no role', async () => {
      (mockRequest as any).user = { userId: 'user-123' };
      const middleware = authorize(['admin']);

      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
    });

    it('should return 403 when user role is not in allowed roles', async () => {
      (mockRequest as any).user = { userId: 'user-123', role: 'viewer' };
      const middleware = authorize(['admin', 'editor']);

      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
    });

    it('should allow access when user role matches single allowed role', async () => {
      (mockRequest as any).user = { userId: 'user-123', role: 'admin' };
      const middleware = authorize(['admin']);

      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should allow access when user role is one of multiple allowed roles', async () => {
      (mockRequest as any).user = { userId: 'user-123', role: 'editor' };
      const middleware = authorize(['admin', 'editor', 'moderator']);

      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should handle empty roles array (no one authorized)', async () => {
      (mockRequest as any).user = { userId: 'user-123', role: 'admin' };
      const middleware = authorize([]);

      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(403);
    });

    it('should be case-sensitive for role matching', async () => {
      (mockRequest as any).user = { userId: 'user-123', role: 'Admin' };
      const middleware = authorize(['admin']);

      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(403);
    });
  });

  describe('authMiddleware', () => {
    it('should be an alias for authenticate', () => {
      expect(authMiddleware).toBe(authenticate);
    });
  });

  describe('optionalAuthMiddleware', () => {
    it('should set user when valid token provided', async () => {
      const decodedPayload = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'user',
      };
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockReturnValue(decodedPayload);

      await optionalAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect((mockRequest as any).user).toEqual({
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'user',
      });
    });

    it('should not set user when no authorization header', async () => {
      await optionalAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect((mockRequest as any).user).toBeUndefined();
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should not fail when token is invalid', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid-token' };
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.JsonWebTokenError('invalid token');
      });

      await optionalAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect((mockRequest as any).user).toBeUndefined();
      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should log debug message when optional auth fails', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid-token' };
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Token verification failed');
      });

      await optionalAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.debug).toHaveBeenCalledWith(
        'Optional auth failed, continuing without user context'
      );
    });

    it('should continue silently when token is expired', async () => {
      mockRequest.headers = { authorization: 'Bearer expired-token' };
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.JsonWebTokenError('jwt expired');
      });

      await optionalAuthMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect((mockRequest as any).user).toBeUndefined();
      expect(mockReply.code).not.toHaveBeenCalled();
    });
  });
});

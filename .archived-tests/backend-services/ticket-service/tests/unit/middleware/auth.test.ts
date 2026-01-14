// =============================================================================
// TEST SUITE - auth.ts
// =============================================================================

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { authenticate, requireRole } from '../../../src/middleware/auth';
import { UnauthorizedError } from '../../../src/utils/errors';

jest.mock('jsonwebtoken');
jest.mock('fs');

describe('auth middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      headers: {},
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('authenticate', () => {
    it('should return 401 if no authorization header', async () => {
      mockRequest.headers = {};

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'No token provided' });
    });

    it('should return 401 if authorization header missing Bearer', async () => {
      mockRequest.headers = { authorization: 'InvalidToken' };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'No token provided' });
    });

    it('should verify token with public key', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        tenantId: 'tenant-123',
      });

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(jwt.verify).toHaveBeenCalledWith(
        'valid-token',
        expect.any(String),
        expect.objectContaining({
          algorithms: ['RS256'],
        })
      );
    });

    it('should attach user to request', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      const decoded = { userId: 'user-123', role: 'user' };
      (jwt.verify as jest.Mock).mockReturnValue(decoded);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).user).toEqual(decoded);
    });

    it('should attach userId to request', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockReturnValue({ userId: 'user-123' });

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).userId).toBe('user-123');
    });

    it('should use id field if userId not present', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockReturnValue({ id: 'user-456' });

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).userId).toBe('user-456');
    });

    it('should use sub field if userId and id not present', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockReturnValue({ sub: 'user-789' });

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).userId).toBe('user-789');
    });

    it('should attach tenantId to request', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockReturnValue({ tenantId: 'tenant-123' });

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).tenantId).toBe('tenant-123');
    });

    it('should use tenant_id field if tenantId not present', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockReturnValue({ tenant_id: 'tenant-456' });

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).tenantId).toBe('tenant-456');
    });

    it('should return 401 for expired token', async () => {
      mockRequest.headers = { authorization: 'Bearer expired-token' };
      const error: any = new Error('Token expired');
      error.name = 'TokenExpiredError';
      (jwt.verify as jest.Mock).mockImplementation(() => { throw error; });

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Token expired' });
    });

    it('should return 401 for invalid token', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid-token' };
      const error: any = new Error('Invalid token');
      error.name = 'JsonWebTokenError';
      (jwt.verify as jest.Mock).mockImplementation(() => { throw error; });

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('should return 500 for other errors', async () => {
      mockRequest.headers = { authorization: 'Bearer token' };
      (jwt.verify as jest.Mock).mockImplementation(() => { throw new Error('Unknown error'); });

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Authentication error' });
    });

    it('should log authentication errors', async () => {
      mockRequest.headers = { authorization: 'Bearer token' };
      const error = new Error('Auth error');
      (jwt.verify as jest.Mock).mockImplementation(() => { throw error; });

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Auth error:', error);
    });

    it('should verify with correct issuer', async () => {
      process.env.JWT_ISSUER = 'test-issuer';
      mockRequest.headers = { authorization: 'Bearer token' };
      (jwt.verify as jest.Mock).mockReturnValue({ userId: 'user-123' });

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(jwt.verify).toHaveBeenCalledWith(
        'token',
        expect.any(String),
        expect.objectContaining({
          issuer: 'test-issuer',
          audience: 'test-issuer',
        })
      );

      delete process.env.JWT_ISSUER;
    });

    it('should use default issuer if not provided', async () => {
      delete process.env.JWT_ISSUER;
      mockRequest.headers = { authorization: 'Bearer token' };
      (jwt.verify as jest.Mock).mockReturnValue({ userId: 'user-123' });

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(jwt.verify).toHaveBeenCalledWith(
        'token',
        expect.any(String),
        expect.objectContaining({
          issuer: 'tickettoken-auth',
          audience: 'tickettoken-auth',
        })
      );
    });
  });

  describe('requireRole', () => {
    it('should return 401 if no user', async () => {
      mockRequest = { headers: {} };

      const middleware = requireRole(['admin']);
      
      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should allow user with matching role', async () => {
      (mockRequest as any).user = { role: 'admin' };

      const middleware = requireRole(['admin']);
      const result = await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(result).toBeUndefined();
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should allow user with admin:all permission', async () => {
      (mockRequest as any).user = { role: 'user', permissions: ['admin:all'] };

      const middleware = requireRole(['admin']);
      const result = await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(result).toBeUndefined();
    });

    it('should allow venue_manager with venue permissions', async () => {
      (mockRequest as any).user = { role: 'user', permissions: ['venue:manage', 'venue:read'] };

      const middleware = requireRole(['venue_manager']);
      const result = await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(result).toBeUndefined();
    });

    it('should return 403 if role not allowed', async () => {
      (mockRequest as any).user = { role: 'user' };

      const middleware = requireRole(['admin']);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
    });

    it('should check multiple roles', async () => {
      (mockRequest as any).user = { role: 'moderator' };

      const middleware = requireRole(['admin', 'moderator']);
      const result = await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(result).toBeUndefined();
    });

    it('should handle user without role', async () => {
      (mockRequest as any).user = { id: 'user-123' };

      const middleware = requireRole(['admin']);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });

    it('should handle user without permissions', async () => {
      (mockRequest as any).user = { role: 'user' };

      const middleware = requireRole(['admin']);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });

    it('should handle empty roles array', async () => {
      (mockRequest as any).user = { role: 'user' };

      const middleware = requireRole([]);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });
  });
});

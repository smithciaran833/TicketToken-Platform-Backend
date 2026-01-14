import { FastifyRequest, FastifyReply } from 'fastify';

// Mock fs before importing auth
jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue('mock-public-key-content'),
}));

// Mock jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

// Mock errors
jest.mock('../../../src/utils/errors', () => ({
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'UnauthorizedError';
    }
  },
}));

import jwt from 'jsonwebtoken';
import { authenticate, requireRole, authMiddleware } from '../../../src/middleware/auth';
import { UnauthorizedError } from '../../../src/utils/errors';

describe('Auth Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSend = jest.fn().mockReturnThis();
    mockStatus = jest.fn().mockReturnValue({ send: mockSend });

    mockReply = {
      status: mockStatus,
      send: mockSend,
    };

    mockRequest = {
      headers: {},
      url: '/test',
      method: 'GET',
      ip: '127.0.0.1',
    } as any;
  });

  describe('authenticate', () => {
    it('should return 401 if no authorization header', async () => {
      mockRequest.headers = {};

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockSend).toHaveBeenCalledWith({ error: 'No token provided' });
    });

    it('should return 401 if authorization header does not start with Bearer', async () => {
      mockRequest.headers = { authorization: 'Basic abc123' };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockSend).toHaveBeenCalledWith({ error: 'No token provided' });
    });

    it('should return 401 if authorization header is just "Bearer "', async () => {
      mockRequest.headers = { authorization: 'Bearer ' };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // This will attempt to verify an empty token
      (jwt.verify as jest.Mock).mockImplementation(() => {
        const error = new Error('jwt malformed');
        error.name = 'JsonWebTokenError';
        throw error;
      });

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(401);
    });

    it('should successfully authenticate with valid token', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };

      const decodedToken = {
        userId: 'user-123',
        id: 'user-123',
        sub: 'user-123',
        tenantId: 'tenant-456',
        role: 'user',
      };

      (jwt.verify as jest.Mock).mockReturnValue(decodedToken);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(jwt.verify).toHaveBeenCalledWith(
        'valid-token',
        'mock-public-key-content',
        {
          algorithms: ['RS256'],
          issuer: 'tickettoken-auth',
          audience: 'tickettoken-auth',
        }
      );
      expect((mockRequest as any).user).toEqual(decodedToken);
      expect((mockRequest as any).userId).toBe('user-123');
      expect((mockRequest as any).tenantId).toBe('tenant-456');
    });

    it('should extract userId from sub if userId not present', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };

      const decodedToken = {
        sub: 'sub-user-123',
        tenant_id: 'tenant-456',
      };

      (jwt.verify as jest.Mock).mockReturnValue(decodedToken);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).userId).toBe('sub-user-123');
      expect((mockRequest as any).tenantId).toBe('tenant-456');
    });

    it('should extract tenantId from tenant_id if tenantId not present', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };

      const decodedToken = {
        id: 'user-123',
        tenant_id: 'tenant-from-underscore',
      };

      (jwt.verify as jest.Mock).mockReturnValue(decodedToken);

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).tenantId).toBe('tenant-from-underscore');
    });

    it('should return 401 on TokenExpiredError', async () => {
      mockRequest.headers = { authorization: 'Bearer expired-token' };

      const expiredError = new Error('jwt expired');
      expiredError.name = 'TokenExpiredError';
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw expiredError;
      });

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockSend).toHaveBeenCalledWith({ error: 'Token expired' });
    });

    it('should return 401 on JsonWebTokenError', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid-token' };

      const jwtError = new Error('invalid signature');
      jwtError.name = 'JsonWebTokenError';
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw jwtError;
      });

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockSend).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('should return 500 on unexpected errors', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockSend).toHaveBeenCalledWith({ error: 'Authentication error' });
    });
  });

  describe('requireRole', () => {
    it('should throw UnauthorizedError if no user on request', async () => {
      (mockRequest as any).user = undefined;

      const middleware = requireRole(['admin']);

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should allow access if user has required role', async () => {
      (mockRequest as any).user = { id: 'user-123', role: 'admin' };

      const middleware = requireRole(['admin']);

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).not.toHaveBeenCalled();
    });

    it('should allow access if user has one of multiple required roles', async () => {
      (mockRequest as any).user = { id: 'user-123', role: 'moderator' };

      const middleware = requireRole(['admin', 'moderator', 'user']);

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).not.toHaveBeenCalled();
    });

    it('should allow access if user has admin:all permission', async () => {
      (mockRequest as any).user = {
        id: 'user-123',
        role: 'custom-role',
        permissions: ['admin:all'],
      };

      const middleware = requireRole(['admin']);

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).not.toHaveBeenCalled();
    });

    it('should allow venue_manager access if user has venue: permissions', async () => {
      (mockRequest as any).user = {
        id: 'user-123',
        role: 'staff',
        permissions: ['venue:read', 'venue:write'],
      };

      const middleware = requireRole(['venue_manager']);

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).not.toHaveBeenCalled();
    });

    it('should return 403 if user lacks required role and permissions', async () => {
      (mockRequest as any).user = {
        id: 'user-123',
        sub: 'user-123',
        role: 'user',
        permissions: ['read:tickets'],
      };

      const middleware = requireRole(['admin']);

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(403);
      expect(mockSend).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
    });

    it('should return 403 if user has no role and no admin:all permission', async () => {
      (mockRequest as any).user = {
        id: 'user-123',
        permissions: [],
      };

      const middleware = requireRole(['admin']);

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(403);
    });

    it('should return 403 if user.permissions is undefined', async () => {
      (mockRequest as any).user = {
        id: 'user-123',
        role: 'user',
      };

      const middleware = requireRole(['admin']);

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(403);
    });
  });

  describe('authMiddleware export', () => {
    it('should be the same as authenticate function', () => {
      expect(authMiddleware).toBe(authenticate);
    });
  });
});

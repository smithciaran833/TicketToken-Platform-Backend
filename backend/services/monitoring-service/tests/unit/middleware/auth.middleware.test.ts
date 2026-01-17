import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { authenticate, authorize, AuthenticatedRequest } from '../../../src/middleware/auth.middleware';

jest.mock('jsonwebtoken');

describe('Auth Middleware', () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    mockSend = jest.fn().mockReturnThis();
    mockStatus = jest.fn().mockReturnValue({ send: mockSend });

    mockRequest = {
      headers: {},
    };

    mockReply = {
      status: mockStatus,
      send: mockSend,
    };

    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'test';
  });

  describe('authenticate', () => {
    describe('token extraction', () => {
      it('should return 401 when no authorization header is present', async () => {
        mockRequest.headers = {};

        await authenticate(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(401);
        expect(mockSend).toHaveBeenCalledWith({ error: 'Authentication required' });
      });

      it('should return 401 when authorization header is empty', async () => {
        mockRequest.headers = { authorization: '' };

        await authenticate(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(401);
        expect(mockSend).toHaveBeenCalledWith({ error: 'Authentication required' });
      });

      it('should return 401 when authorization header has only "Bearer "', async () => {
        mockRequest.headers = { authorization: 'Bearer ' };

        await authenticate(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(401);
        expect(mockSend).toHaveBeenCalledWith({ error: 'Authentication required' });
      });

      it('should extract token correctly from Bearer scheme', async () => {
        const token = 'valid.jwt.token';
        mockRequest.headers = { authorization: `Bearer ${token}` };
        (jwt.verify as jest.Mock).mockReturnValue({ userId: '123', role: 'admin' });

        await authenticate(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(jwt.verify).toHaveBeenCalledWith(token, expect.any(String));
      });

      it('should handle token without Bearer prefix', async () => {
        mockRequest.headers = { authorization: 'notbearer token123' };

        await authenticate(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(jwt.verify).toHaveBeenCalledWith('notbearer token123', expect.any(String));
      });
    });

    describe('JWT secret handling', () => {
      it('should use JWT_SECRET from environment when available', async () => {
        process.env.JWT_SECRET = 'production-secret-key';
        mockRequest.headers = { authorization: 'Bearer valid.token' };
        (jwt.verify as jest.Mock).mockReturnValue({ userId: '123', role: 'user' });

        await authenticate(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(jwt.verify).toHaveBeenCalledWith('valid.token', 'production-secret-key');
      });

      it('should use dev-secret in non-production when JWT_SECRET is not set', async () => {
        process.env.NODE_ENV = 'development';
        delete process.env.JWT_SECRET;
        mockRequest.headers = { authorization: 'Bearer valid.token' };
        (jwt.verify as jest.Mock).mockReturnValue({ userId: '123', role: 'user' });

        await authenticate(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(jwt.verify).toHaveBeenCalledWith('valid.token', 'dev-secret');
      });

      it('should return 401 in production when JWT_SECRET is not set', async () => {
        process.env.NODE_ENV = 'production';
        delete process.env.JWT_SECRET;
        mockRequest.headers = { authorization: 'Bearer valid.token' };

        await authenticate(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(401);
        expect(mockSend).toHaveBeenCalledWith({ error: 'Invalid token' });
      });
    });

    describe('token verification success', () => {
      beforeEach(() => {
        process.env.JWT_SECRET = 'test-secret';
        mockRequest.headers = { authorization: 'Bearer valid.token' };
      });

      it('should set user on request with userId format', async () => {
        (jwt.verify as jest.Mock).mockReturnValue({
          userId: 'user-123',
          venueId: 'venue-456',
          role: 'admin',
          permissions: ['read', 'write', 'delete'],
        });

        await authenticate(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockRequest.user).toEqual({
          id: 'user-123',
          venueId: 'venue-456',
          role: 'admin',
          permissions: ['read', 'write', 'delete'],
        });
      });

      it('should set user on request with id format', async () => {
        (jwt.verify as jest.Mock).mockReturnValue({
          id: 'user-789',
          venueId: 'venue-111',
          role: 'manager',
          permissions: ['read'],
        });

        await authenticate(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockRequest.user).toEqual({
          id: 'user-789',
          venueId: 'venue-111',
          role: 'manager',
          permissions: ['read'],
        });
      });

      it('should prefer userId over id when both are present', async () => {
        (jwt.verify as jest.Mock).mockReturnValue({
          userId: 'preferred-user',
          id: 'fallback-user',
          role: 'user',
        });

        await authenticate(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockRequest.user?.id).toBe('preferred-user');
      });

      it('should default role to "user" when not in token', async () => {
        (jwt.verify as jest.Mock).mockReturnValue({
          userId: 'user-123',
        });

        await authenticate(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockRequest.user?.role).toBe('user');
      });

      it('should default permissions to empty array when not in token', async () => {
        (jwt.verify as jest.Mock).mockReturnValue({
          userId: 'user-123',
          role: 'admin',
        });

        await authenticate(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockRequest.user?.permissions).toEqual([]);
      });

      it('should handle undefined venueId', async () => {
        (jwt.verify as jest.Mock).mockReturnValue({
          userId: 'user-123',
          role: 'user',
        });

        await authenticate(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockRequest.user?.venueId).toBeUndefined();
      });

      it('should not call reply methods on successful authentication', async () => {
        (jwt.verify as jest.Mock).mockReturnValue({
          userId: 'user-123',
          role: 'user',
        });

        await authenticate(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockStatus).not.toHaveBeenCalled();
        expect(mockSend).not.toHaveBeenCalled();
      });
    });

    describe('token verification errors', () => {
      beforeEach(() => {
        process.env.JWT_SECRET = 'test-secret';
        mockRequest.headers = { authorization: 'Bearer invalid.token' };
      });

      it('should return 401 with "Token expired" for TokenExpiredError', async () => {
        const expiredError = new Error('Token expired');
        expiredError.name = 'TokenExpiredError';
        (jwt.verify as jest.Mock).mockImplementation(() => { throw expiredError; });

        await authenticate(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(401);
        expect(mockSend).toHaveBeenCalledWith({ error: 'Token expired' });
      });

      it('should return 401 with "Invalid token" for JsonWebTokenError', async () => {
        const invalidError = new Error('Invalid token');
        invalidError.name = 'JsonWebTokenError';
        (jwt.verify as jest.Mock).mockImplementation(() => { throw invalidError; });

        await authenticate(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(401);
        expect(mockSend).toHaveBeenCalledWith({ error: 'Invalid token' });
      });

      it('should return 401 with "Invalid token" for NotBeforeError', async () => {
        const notBeforeError = new Error('Token not active');
        notBeforeError.name = 'NotBeforeError';
        (jwt.verify as jest.Mock).mockImplementation(() => { throw notBeforeError; });

        await authenticate(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(401);
        expect(mockSend).toHaveBeenCalledWith({ error: 'Invalid token' });
      });

      it('should return 401 with "Invalid token" for malformed token', async () => {
        (jwt.verify as jest.Mock).mockImplementation(() => { throw new Error('Malformed token'); });

        await authenticate(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(401);
        expect(mockSend).toHaveBeenCalledWith({ error: 'Invalid token' });
      });

      it('should not set user on request when verification fails', async () => {
        (jwt.verify as jest.Mock).mockImplementation(() => { throw new Error('Invalid'); });

        await authenticate(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockRequest.user).toBeUndefined();
      });
    });
  });

  describe('authorize', () => {
    let authorizeMiddleware: (request: AuthenticatedRequest, reply: FastifyReply) => Promise<void>;

    describe('without authenticated user', () => {
      it('should return 401 when user is not set on request', async () => {
        authorizeMiddleware = authorize('admin');
        mockRequest.user = undefined;

        await authorizeMiddleware(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(401);
        expect(mockSend).toHaveBeenCalledWith({ error: 'Authentication required' });
      });
    });

    describe('with authenticated user', () => {
      it('should allow access when user role matches single allowed role', async () => {
        authorizeMiddleware = authorize('admin');
        mockRequest.user = { id: '123', role: 'admin' };

        await authorizeMiddleware(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockStatus).not.toHaveBeenCalled();
        expect(mockSend).not.toHaveBeenCalled();
      });

      it('should allow access when user role matches one of multiple allowed roles', async () => {
        authorizeMiddleware = authorize('admin', 'manager', 'supervisor');
        mockRequest.user = { id: '123', role: 'manager' };

        await authorizeMiddleware(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockStatus).not.toHaveBeenCalled();
      });

      it('should return 403 when user role does not match any allowed role', async () => {
        authorizeMiddleware = authorize('admin', 'manager');
        mockRequest.user = { id: '123', role: 'user' };

        await authorizeMiddleware(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(403);
        expect(mockSend).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      });

      it('should be case-sensitive for role matching', async () => {
        authorizeMiddleware = authorize('Admin');
        mockRequest.user = { id: '123', role: 'admin' };

        await authorizeMiddleware(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(403);
        expect(mockSend).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      });

      it('should handle empty roles array', async () => {
        authorizeMiddleware = authorize();
        mockRequest.user = { id: '123', role: 'admin' };

        await authorizeMiddleware(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(403);
        expect(mockSend).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      });

      it('should work with special role names', async () => {
        authorizeMiddleware = authorize('super-admin', 'system_user', 'role.with.dots');
        mockRequest.user = { id: '123', role: 'system_user' };

        await authorizeMiddleware(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);

        expect(mockStatus).not.toHaveBeenCalled();
      });
    });

    describe('factory function behavior', () => {
      it('should return a new function each time', () => {
        const middleware1 = authorize('admin');
        const middleware2 = authorize('admin');

        expect(middleware1).not.toBe(middleware2);
        expect(typeof middleware1).toBe('function');
        expect(typeof middleware2).toBe('function');
      });

      it('should capture roles in closure correctly', async () => {
        const adminOnly = authorize('admin');
        const userOrManager = authorize('user', 'manager');

        mockRequest.user = { id: '123', role: 'user' };

        await adminOnly(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);
        expect(mockStatus).toHaveBeenCalledWith(403);

        jest.clearAllMocks();
        mockStatus = jest.fn().mockReturnValue({ send: mockSend });
        mockReply.status = mockStatus;

        await userOrManager(mockRequest as AuthenticatedRequest, mockReply as FastifyReply);
        expect(mockStatus).not.toHaveBeenCalled();
      });
    });
  });
});

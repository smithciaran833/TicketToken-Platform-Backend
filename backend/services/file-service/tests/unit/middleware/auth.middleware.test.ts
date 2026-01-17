/**
 * Unit Tests for Authentication Middleware
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import {
  authenticate,
  authenticateOptional,
  requireAdmin,
  requireRole,
  getUser,
} from '../../../src/middleware/auth.middleware';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../src/errors', () => ({
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(message: string, public code: string) {
      super(message);
      this.name = 'UnauthorizedError';
    }
  },
  InvalidTokenError: class InvalidTokenError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'InvalidTokenError';
    }
  },
  TokenExpiredError: class TokenExpiredError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TokenExpiredError';
    }
  },
  ForbiddenError: class ForbiddenError extends Error {
    constructor(message: string, public code: string, public details?: any) {
      super(message);
      this.name = 'ForbiddenError';
    }
  },
}));

describe('middleware/auth.middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = process.env;

    process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
    process.env.JWT_ISSUER = 'tickettoken-auth-service';
    process.env.JWT_AUDIENCE = 'tickettoken-file-service';

    mockRequest = {
      id: 'req-123',
      url: '/api/test',
      headers: {},
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as any;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('authenticate', () => {
    it('should successfully authenticate with valid token', async () => {
      // Don't include iss/aud in payload - let options handle it
      const payload = {
        id: 'user-123',
        email: 'test@example.com',
        tenant_id: 'tenant-123',
        role: 'user',
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET!, {
        algorithm: 'HS256',
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
      });

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const user = getUser(mockRequest as FastifyRequest);
      expect(user).toBeDefined();
      expect(user?.id).toBe('user-123');
      expect(user?.email).toBe('test@example.com');
      expect(user?.tenant_id).toBe('tenant-123');
    });

    it('should throw UnauthorizedError when no authorization header', async () => {
      mockRequest.headers = {};

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('No authentication token provided');
    });

    it('should throw UnauthorizedError when authorization header missing Bearer prefix', async () => {
      mockRequest.headers = {
        authorization: 'InvalidToken',
      };

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('No authentication token provided');
    });

    it('should throw UnauthorizedError when token is empty', async () => {
      mockRequest.headers = {
        authorization: 'Bearer ',
      };

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Empty authentication token');
    });

    it('should throw TokenExpiredError when token is expired', async () => {
      const token = jwt.sign(
        { id: 'user-123' },
        process.env.JWT_SECRET!,
        {
          algorithm: 'HS256',
          expiresIn: '-1h',
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Authentication token has expired');
    });

    it('should throw InvalidTokenError for malformed token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid.token.here',
      };

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid authentication token');
    });

    it('should throw InvalidTokenError when issuer does not match', async () => {
      const token = jwt.sign(
        { id: 'user-123' },
        process.env.JWT_SECRET!,
        {
          algorithm: 'HS256',
          issuer: 'wrong-issuer',
          audience: process.env.JWT_AUDIENCE,
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid authentication token');
    });

    it('should throw InvalidTokenError when audience does not match', async () => {
      const token = jwt.sign(
        { id: 'user-123' },
        process.env.JWT_SECRET!,
        {
          algorithm: 'HS256',
          issuer: process.env.JWT_ISSUER,
          audience: 'wrong-audience',
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid authentication token');
    });

    it('should reject token with none algorithm', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ id: 'user-123' })).toString('base64url');
      const token = `${header}.${payload}.`;

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid authentication token');
    });

    it('should support both id and sub fields', async () => {
      const token = jwt.sign(
        {
          sub: 'user-456',
          email: 'test@example.com',
        },
        process.env.JWT_SECRET!,
        {
          algorithm: 'HS256',
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const user = getUser(mockRequest as FastifyRequest);
      expect(user?.sub).toBe('user-456');
    });

    it('should handle multiple tenant ID field formats', async () => {
      const token = jwt.sign(
        {
          id: 'user-123',
          tenantId: 'tenant-456',
        },
        process.env.JWT_SECRET!,
        {
          algorithm: 'HS256',
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const user = getUser(mockRequest as FastifyRequest);
      expect(user?.tenantId).toBe('tenant-456');
    });
  });

  describe('authenticateOptional', () => {
    it('should attach user when valid token is present', async () => {
      const token = jwt.sign(
        { id: 'user-123', email: 'test@example.com' },
        process.env.JWT_SECRET!,
        {
          algorithm: 'HS256',
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticateOptional(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const user = getUser(mockRequest as FastifyRequest);
      expect(user).toBeDefined();
      expect(user?.id).toBe('user-123');
    });

    it('should not throw error when no token is present', async () => {
      mockRequest.headers = {};

      await expect(
        authenticateOptional(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();

      const user = getUser(mockRequest as FastifyRequest);
      expect(user).toBeUndefined();
    });

    it('should not throw error when token is invalid', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid.token',
      };

      await expect(
        authenticateOptional(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();

      const user = getUser(mockRequest as FastifyRequest);
      expect(user).toBeUndefined();
    });

    it('should not throw error when token is expired', async () => {
      const token = jwt.sign(
        { id: 'user-123' },
        process.env.JWT_SECRET!,
        {
          algorithm: 'HS256',
          expiresIn: '-1h',
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await expect(
        authenticateOptional(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();

      const user = getUser(mockRequest as FastifyRequest);
      expect(user).toBeUndefined();
    });
  });

  describe('requireAdmin', () => {
    beforeEach(async () => {
      const token = jwt.sign(
        { id: 'user-123', role: 'user' },
        process.env.JWT_SECRET!,
        {
          algorithm: 'HS256',
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);
    });

    it('should throw UnauthorizedError when no user is present', async () => {
      mockRequest = { headers: {} };

      await expect(
        requireAdmin(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Authentication required for admin access');
    });

    it('should allow access when user has role admin', async () => {
      const token = jwt.sign(
        { id: 'admin-123', role: 'admin' },
        process.env.JWT_SECRET!,
        {
          algorithm: 'HS256',
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      await expect(
        requireAdmin(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();
    });

    it('should allow access when user has roles array with admin', async () => {
      const token = jwt.sign(
        { id: 'admin-123', roles: ['user', 'admin'] },
        process.env.JWT_SECRET!,
        {
          algorithm: 'HS256',
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      await expect(
        requireAdmin(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();
    });

    it('should allow access when user has is_system_admin flag', async () => {
      const token = jwt.sign(
        { id: 'admin-123', is_system_admin: true },
        process.env.JWT_SECRET!,
        {
          algorithm: 'HS256',
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      await expect(
        requireAdmin(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();
    });

    it('should allow access when user has isSystemAdmin flag', async () => {
      const token = jwt.sign(
        { id: 'admin-123', isSystemAdmin: true },
        process.env.JWT_SECRET!,
        {
          algorithm: 'HS256',
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      await expect(
        requireAdmin(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();
    });

    it('should deny access for regular users', async () => {
      const token = jwt.sign(
        { id: 'user-123', role: 'user' },
        process.env.JWT_SECRET!,
        {
          algorithm: 'HS256',
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      await expect(
        requireAdmin(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Administrator access required');
    });
  });

  describe('requireRole', () => {
    it('should allow access when user has the required role', async () => {
      const token = jwt.sign(
        { id: 'user-123', roles: ['manager', 'editor'] },
        process.env.JWT_SECRET!,
        {
          algorithm: 'HS256',
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const middleware = requireRole('manager');
      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();
    });

    it('should deny access when user does not have required role', async () => {
      const token = jwt.sign(
        { id: 'user-123', roles: ['viewer'] },
        process.env.JWT_SECRET!,
        {
          algorithm: 'HS256',
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const middleware = requireRole('admin');
      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow("Role 'admin' is required");
    });

    it('should allow access for system admins regardless of role', async () => {
      const token = jwt.sign(
        { id: 'admin-123', is_system_admin: true, roles: ['viewer'] },
        process.env.JWT_SECRET!,
        {
          algorithm: 'HS256',
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const middleware = requireRole('manager');
      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();
    });

    it('should throw UnauthorizedError when no user is authenticated', async () => {
      mockRequest = { headers: {} };

      const middleware = requireRole('editor');
      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Authentication required');
    });

    it('should support string role field', async () => {
      const token = jwt.sign(
        { id: 'user-123', role: 'editor' },
        process.env.JWT_SECRET!,
        {
          algorithm: 'HS256',
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const middleware = requireRole('editor');
      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();
    });
  });

  describe('getUser', () => {
    it('should return user when set via authenticate', async () => {
      const token = jwt.sign(
        { id: 'user-123', email: 'test@example.com' },
        process.env.JWT_SECRET!,
        {
          algorithm: 'HS256',
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
        }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const user = getUser(mockRequest as FastifyRequest);
      expect(user).toBeDefined();
      expect(user?.id).toBe('user-123');
      expect(user?.email).toBe('test@example.com');
    });

    it('should return undefined when no user is set', () => {
      const user = getUser(mockRequest as FastifyRequest);
      expect(user).toBeUndefined();
    });

    it('should return user from request.user fallback', () => {
      (mockRequest as any).user = {
        id: 'user-789',
        email: 'fallback@example.com',
      };

      const user = getUser(mockRequest as FastifyRequest);
      expect(user).toBeDefined();
      expect(user?.id).toBe('user-789');
    });
  });
});

import { FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireAdmin } from '../../../src/middleware/auth.middleware';
import { AuthServiceClient } from '../../../src/services/auth.client';
import { logger } from '../../../src/utils/logger';

jest.mock('../../../src/services/auth.client');
jest.mock('../../../src/utils/logger');

describe('Auth Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let statusMock: jest.Mock;
  let sendMock: jest.Mock;
  let mockAuthClient: jest.Mocked<AuthServiceClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    sendMock = jest.fn().mockReturnThis();
    statusMock = jest.fn().mockReturnValue({ send: sendMock });

    mockReply = {
      status: statusMock,
      send: sendMock,
    } as Partial<FastifyReply>;

    mockRequest = {
      headers: {},
    } as Partial<FastifyRequest>;

    // Get the mocked auth client instance
    mockAuthClient = new AuthServiceClient() as jest.Mocked<AuthServiceClient>;
  });

  describe('authenticate', () => {
    describe('Success Cases', () => {
      it('should authenticate valid Bearer token', async () => {
        const mockUser = {
          id: 'user-123',
          email: 'test@example.com',
          role: 'customer',
        };

        mockRequest.headers = {
          authorization: 'Bearer valid-token-123',
        };

        mockAuthClient.validateToken = jest.fn().mockResolvedValue(mockUser);

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockAuthClient.validateToken).toHaveBeenCalledWith('valid-token-123');
        expect(mockRequest.user).toEqual(mockUser);
        expect(statusMock).not.toHaveBeenCalled();
      });

      it('should extract token correctly from Bearer header', async () => {
        const mockUser = { id: 'user-456', role: 'admin' };

        mockRequest.headers = {
          authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        };

        mockAuthClient.validateToken = jest.fn().mockResolvedValue(mockUser);

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockAuthClient.validateToken).toHaveBeenCalledWith(
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
        );
      });

      it('should attach user with all fields to request', async () => {
        const mockUser = {
          id: 'user-789',
          email: 'admin@example.com',
          role: 'admin',
          tenantId: 'tenant-123',
          permissions: ['read:orders', 'write:orders'],
        };

        mockRequest.headers = {
          authorization: 'Bearer valid-token',
        };

        mockAuthClient.validateToken = jest.fn().mockResolvedValue(mockUser);

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockRequest.user).toEqual(mockUser);
      });

      it('should handle long tokens', async () => {
        const longToken = 'a'.repeat(500);
        const mockUser = { id: 'user-123', role: 'customer' };

        mockRequest.headers = {
          authorization: `Bearer ${longToken}`,
        };

        mockAuthClient.validateToken = jest.fn().mockResolvedValue(mockUser);

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockAuthClient.validateToken).toHaveBeenCalledWith(longToken);
      });
    });

    describe('Missing Authorization Header', () => {
      it('should reject request without authorization header', async () => {
        mockRequest.headers = {};

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(sendMock).toHaveBeenCalledWith({
          error: 'Missing or invalid authorization header',
        });
        expect(mockAuthClient.validateToken).not.toHaveBeenCalled();
      });

      it('should reject request with undefined authorization', async () => {
        mockRequest.headers = {
          authorization: undefined,
        };

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(sendMock).toHaveBeenCalledWith({
          error: 'Missing or invalid authorization header',
        });
      });

      it('should reject request with empty authorization header', async () => {
        mockRequest.headers = {
          authorization: '',
        };

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(401);
      });
    });

    describe('Invalid Authorization Format', () => {
      it('should reject token without Bearer prefix', async () => {
        mockRequest.headers = {
          authorization: 'token-without-bearer',
        };

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(sendMock).toHaveBeenCalledWith({
          error: 'Missing or invalid authorization header',
        });
      });

      it('should reject Basic auth format', async () => {
        mockRequest.headers = {
          authorization: 'Basic dXNlcjpwYXNz',
        };

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(401);
      });

      it('should reject Bearer with lowercase', async () => {
        mockRequest.headers = {
          authorization: 'bearer token-123',
        };

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(401);
      });

      it('should reject malformed Bearer format', async () => {
        mockRequest.headers = {
          authorization: 'Bearer',
        };

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(401);
      });

      it('should handle Bearer with only space', async () => {
        mockRequest.headers = {
          authorization: 'Bearer ',
        };

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        // Token would be empty string after substring(7)
        expect(mockAuthClient.validateToken).toHaveBeenCalledWith('');
      });
    });

    describe('Token Validation Failures', () => {
      it('should reject expired token', async () => {
        mockRequest.headers = {
          authorization: 'Bearer expired-token',
        };

        mockAuthClient.validateToken = jest
          .fn()
          .mockRejectedValue(new Error('Token expired'));

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(logger.error).toHaveBeenCalledWith('Authentication failed', {
          error: expect.any(Error),
        });
        expect(statusMock).toHaveBeenCalledWith(401);
        expect(sendMock).toHaveBeenCalledWith({
          error: 'Invalid or expired token',
        });
      });

      it('should reject invalid signature', async () => {
        mockRequest.headers = {
          authorization: 'Bearer tampered-token',
        };

        mockAuthClient.validateToken = jest
          .fn()
          .mockRejectedValue(new Error('Invalid signature'));

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(sendMock).toHaveBeenCalledWith({
          error: 'Invalid or expired token',
        });
      });

      it('should reject revoked token', async () => {
        mockRequest.headers = {
          authorization: 'Bearer revoked-token',
        };

        mockAuthClient.validateToken = jest
          .fn()
          .mockRejectedValue(new Error('Token has been revoked'));

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(401);
      });

      it('should handle auth service network errors', async () => {
        mockRequest.headers = {
          authorization: 'Bearer valid-token',
        };

        mockAuthClient.validateToken = jest
          .fn()
          .mockRejectedValue(new Error('ECONNREFUSED'));

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(logger.error).toHaveBeenCalled();
        expect(statusMock).toHaveBeenCalledWith(401);
      });

      it('should handle auth service timeout', async () => {
        mockRequest.headers = {
          authorization: 'Bearer valid-token',
        };

        mockAuthClient.validateToken = jest
          .fn()
          .mockRejectedValue(new Error('Request timeout'));

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(401);
      });

      it('should handle malformed token errors', async () => {
        mockRequest.headers = {
          authorization: 'Bearer malformed',
        };

        mockAuthClient.validateToken = jest
          .fn()
          .mockRejectedValue(new Error('Malformed token'));

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(401);
      });
    });

    describe('Edge Cases', () => {
      it('should handle token with special characters', async () => {
        const specialToken = 'abc-123_DEF.456+789/xyz=';
        const mockUser = { id: 'user-123', role: 'customer' };

        mockRequest.headers = {
          authorization: `Bearer ${specialToken}`,
        };

        mockAuthClient.validateToken = jest.fn().mockResolvedValue(mockUser);

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockAuthClient.validateToken).toHaveBeenCalledWith(specialToken);
      });

      it('should handle token with spaces (should fail)', async () => {
        mockRequest.headers = {
          authorization: 'Bearer token with spaces',
        };

        mockAuthClient.validateToken = jest
          .fn()
          .mockRejectedValue(new Error('Invalid token format'));

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(401);
      });

      it('should not attach user on authentication failure', async () => {
        mockRequest.headers = {
          authorization: 'Bearer invalid-token',
        };

        mockAuthClient.validateToken = jest
          .fn()
          .mockRejectedValue(new Error('Invalid'));

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockRequest.user).toBeUndefined();
      });

      it('should handle null validateToken response', async () => {
        mockRequest.headers = {
          authorization: 'Bearer token',
        };

        mockAuthClient.validateToken = jest.fn().mockResolvedValue(null);

        await authenticate(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockRequest.user).toBeNull();
      });
    });
  });

  describe('requireAdmin', () => {
    describe('Success Cases', () => {
      it('should allow admin user', async () => {
        mockRequest.user = {
          id: 'admin-123',
          role: 'admin',
          email: 'admin@example.com',
        };

        await requireAdmin(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).not.toHaveBeenCalled();
        expect(sendMock).not.toHaveBeenCalled();
      });

      it('should allow admin with additional properties', async () => {
        mockRequest.user = {
          id: 'admin-456',
          role: 'admin',
          email: 'superadmin@example.com',
          tenantId: 'tenant-123',
          permissions: ['*'],
        };

        await requireAdmin(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).not.toHaveBeenCalled();
      });
    });

    describe('Access Denied Cases', () => {
      it('should reject customer role', async () => {
        mockRequest.user = {
          id: 'user-123',
          role: 'customer',
          email: 'user@example.com',
        };

        await requireAdmin(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(403);
        expect(sendMock).toHaveBeenCalledWith({
          error: 'Admin access required',
        });
      });

      it('should reject manager role', async () => {
        mockRequest.user = {
          id: 'manager-123',
          role: 'manager',
        };

        await requireAdmin(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(403);
      });

      it('should reject vendor role', async () => {
        mockRequest.user = {
          id: 'vendor-123',
          role: 'vendor',
        };

        await requireAdmin(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(403);
      });

      it('should reject undefined user', async () => {
        mockRequest.user = undefined;

        await requireAdmin(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(403);
        expect(sendMock).toHaveBeenCalledWith({
          error: 'Admin access required',
        });
      });

      it('should reject null user', async () => {
        mockRequest.user = null;

        await requireAdmin(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(403);
      });

      it('should reject user without role', async () => {
        mockRequest.user = {
          id: 'user-123',
          email: 'user@example.com',
        } as any;

        await requireAdmin(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(403);
      });

      it('should reject empty role', async () => {
        mockRequest.user = {
          id: 'user-123',
          role: '',
        };

        await requireAdmin(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(403);
      });
    });

    describe('Case Sensitivity', () => {
      it('should reject "Admin" with capital A', async () => {
        mockRequest.user = {
          id: 'user-123',
          role: 'Admin' as any,
        };

        await requireAdmin(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(403);
      });

      it('should reject "ADMIN" all caps', async () => {
        mockRequest.user = {
          id: 'user-123',
          role: 'ADMIN' as any,
        };

        await requireAdmin(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(403);
      });

      it('should reject "administrator"', async () => {
        mockRequest.user = {
          id: 'user-123',
          role: 'administrator' as any,
        };

        await requireAdmin(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(403);
      });
    });

    describe('Edge Cases', () => {
      it('should handle user object with extra whitespace in role', async () => {
        mockRequest.user = {
          id: 'user-123',
          role: ' admin ' as any,
        };

        await requireAdmin(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        // Should fail as role is not exactly 'admin'
        expect(statusMock).toHaveBeenCalledWith(403);
      });

      it('should handle user object as empty object', async () => {
        mockRequest.user = {} as any;

        await requireAdmin(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(403);
      });
    });
  });

  describe('Middleware Chain', () => {
    it('should work when authenticate and requireAdmin called sequentially', async () => {
      const mockUser = {
        id: 'admin-123',
        role: 'admin',
        email: 'admin@example.com',
      };

      mockRequest.headers = {
        authorization: 'Bearer admin-token',
      };

      mockAuthClient.validateToken = jest.fn().mockResolvedValue(mockUser);

      // First authenticate
      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // Then check admin
      await requireAdmin(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.user).toEqual(mockUser);
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should fail requireAdmin if authenticate fails', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token',
      };

      mockAuthClient.validateToken = jest
        .fn()
        .mockRejectedValue(new Error('Invalid'));

      // Authenticate fails
      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // Reset mocks for requireAdmin call
      statusMock.mockClear();
      sendMock.mockClear();

      // RequireAdmin should also fail
      await requireAdmin(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(403);
    });

    it('should fail requireAdmin if user is not admin', async () => {
      const mockUser = {
        id: 'user-123',
        role: 'customer',
        email: 'user@example.com',
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-token',
      };

      mockAuthClient.validateToken = jest.fn().mockResolvedValue(mockUser);

      // Authenticate succeeds
      await authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // Reset mocks
      statusMock.mockClear();
      sendMock.mockClear();

      // RequireAdmin should fail
      await requireAdmin(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Admin access required',
      });
    });
  });
});

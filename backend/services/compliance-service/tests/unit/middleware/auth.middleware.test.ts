/**
 * Unit Tests for Auth Middleware
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import crypto from 'crypto';

// Mock logger before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock jsonwebtoken
jest.mock('jsonwebtoken');

describe('Auth Middleware', () => {
  let mockRequest: any;
  let mockReply: any;
  let jwt: any;
  let authenticate: any;
  let requireAdmin: any;
  let requireComplianceOfficer: any;
  let webhookAuth: any;
  let internalAuth: any;
  let generateWebhookSignature: any;

  const originalEnv = process.env;

  beforeEach(async () => {
    jest.resetModules();

    process.env = {
      ...originalEnv,
      JWT_SECRET: 'test-jwt-secret-that-is-long-enough',
      JWT_ISSUER: 'test-issuer',
      JWT_AUDIENCE: 'test-audience',
      WEBHOOK_SECRET: 'test-webhook-secret',
      INTERNAL_SERVICE_SECRET: 'test-internal-secret',
      NODE_ENV: 'test'
    };

    jwt = (await import('jsonwebtoken')).default;

    const authModule = await import('../../../src/middleware/auth.middleware');
    authenticate = authModule.authenticate;
    requireAdmin = authModule.requireAdmin;
    requireComplianceOfficer = authModule.requireComplianceOfficer;
    webhookAuth = authModule.webhookAuth;
    internalAuth = authModule.internalAuth;
    generateWebhookSignature = authModule.generateWebhookSignature;

    mockRequest = {
      headers: {},
      body: {},
      requestId: 'test-request-id'
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should return 401 when no token provided', async () => {
      mockRequest.headers = {};

      await authenticate(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Authentication required' })
      );
    });

    it('should authenticate with valid token', async () => {
      mockRequest.headers.authorization = 'Bearer valid-token';

      (jwt.verify as jest.Mock).mockReturnValue({
        id: 'user-123',
        tenant_id: 'tenant-456',
        roles: ['user']
      });

      await authenticate(mockRequest, mockReply);

      expect(jwt.verify).toHaveBeenCalledWith(
        'valid-token',
        'test-jwt-secret-that-is-long-enough',
        expect.objectContaining({
          algorithms: ['HS256', 'HS384', 'HS512'],
          issuer: 'test-issuer',
          audience: 'test-audience'
        })
      );
      expect(mockRequest.user).toEqual({
        id: 'user-123',
        tenant_id: 'tenant-456',
        roles: ['user']
      });
      expect(mockRequest.tenantId).toBe('tenant-456');
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should return 401 when token missing tenant_id', async () => {
      mockRequest.headers.authorization = 'Bearer valid-token';

      (jwt.verify as jest.Mock).mockReturnValue({
        id: 'user-123',
        roles: ['user']
      });

      await authenticate(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Token missing tenant_id' })
      );
    });

    it('should return 401 when token is expired', async () => {
      mockRequest.headers.authorization = 'Bearer expired-token';

      const expiredError = new Error('Token expired');
      expiredError.name = 'TokenExpiredError';
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw expiredError;
      });

      await authenticate(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Token has expired' })
      );
    });

    it('should return 401 when token is invalid', async () => {
      mockRequest.headers.authorization = 'Bearer invalid-token';

      const invalidError = new Error('Invalid token');
      invalidError.name = 'JsonWebTokenError';
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw invalidError;
      });

      await authenticate(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid token' })
      );
    });

    it('should return 401 for generic auth errors', async () => {
      mockRequest.headers.authorization = 'Bearer bad-token';

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Some other error');
      });

      await authenticate(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Authentication failed' })
      );
    });
  });

  describe('requireAdmin', () => {
    it('should pass when user has admin role', async () => {
      mockRequest.user = { id: 'user-123', roles: ['admin'] };

      await requireAdmin(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should return 403 when user lacks admin role', async () => {
      mockRequest.user = { id: 'user-123', roles: ['user'] };

      await requireAdmin(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Admin access required' })
      );
    });

    it('should return 403 when user has no roles', async () => {
      mockRequest.user = { id: 'user-123' };

      await requireAdmin(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
    });

    it('should return 403 when no user', async () => {
      mockRequest.user = undefined;

      await requireAdmin(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
    });
  });

  describe('requireComplianceOfficer', () => {
    it('should pass when user has admin role', async () => {
      mockRequest.user = { id: 'user-123', roles: ['admin'] };

      await requireComplianceOfficer(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should pass when user has compliance_officer role', async () => {
      mockRequest.user = { id: 'user-123', roles: ['compliance_officer'] };

      await requireComplianceOfficer(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should pass when user has compliance_manager role', async () => {
      mockRequest.user = { id: 'user-123', roles: ['compliance_manager'] };

      await requireComplianceOfficer(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should return 403 when user lacks compliance roles', async () => {
      mockRequest.user = { id: 'user-123', roles: ['user', 'editor'] };

      await requireComplianceOfficer(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Compliance officer access required' })
      );
    });
  });

  describe('generateWebhookSignature', () => {
    it('should generate valid HMAC signature', () => {
      const payload = '{"event":"test"}';
      const secret = 'test-secret';
      const timestamp = 1234567890;

      const signature = generateWebhookSignature(payload, secret, timestamp);

      // Verify it's a hex string
      expect(signature).toMatch(/^[a-f0-9]{64}$/);

      // Verify it's deterministic
      const signature2 = generateWebhookSignature(payload, secret, timestamp);
      expect(signature).toBe(signature2);
    });

    it('should produce different signatures for different payloads', () => {
      const secret = 'test-secret';
      const timestamp = 1234567890;

      const sig1 = generateWebhookSignature('payload1', secret, timestamp);
      const sig2 = generateWebhookSignature('payload2', secret, timestamp);

      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different timestamps', () => {
      const payload = '{"event":"test"}';
      const secret = 'test-secret';

      const sig1 = generateWebhookSignature(payload, secret, 1000);
      const sig2 = generateWebhookSignature(payload, secret, 2000);

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('webhookAuth', () => {
    it('should verify valid webhook signature', async () => {
      // FIX: Pass body as object so tenant_id can be extracted
      const bodyObj = { event: 'test', tenant_id: 'tenant-123' };
      const payload = JSON.stringify(bodyObj);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = generateWebhookSignature(payload, 'test-webhook-secret', timestamp);

      mockRequest.headers = {
        'x-webhook-signature': signature,
        'x-webhook-timestamp': timestamp.toString()
      };
      mockRequest.body = bodyObj; // FIX: Pass as object, not string

      const middleware = webhookAuth();
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockRequest.tenantId).toBe('tenant-123');
    });

    it('should return 401 when signature missing', async () => {
      mockRequest.headers = {
        'x-webhook-timestamp': Math.floor(Date.now() / 1000).toString()
      };

      const middleware = webhookAuth();
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Missing webhook signature' })
      );
    });

    it('should return 401 when timestamp expired', async () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const payload = '{"event":"test"}';
      const signature = generateWebhookSignature(payload, 'test-webhook-secret', oldTimestamp);

      mockRequest.headers = {
        'x-webhook-signature': signature,
        'x-webhook-timestamp': oldTimestamp.toString()
      };
      mockRequest.body = payload;

      const middleware = webhookAuth();
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Webhook timestamp invalid or expired' })
      );
    });

    it('should return 401 when signature invalid', async () => {
      const timestamp = Math.floor(Date.now() / 1000);

      mockRequest.headers = {
        'x-webhook-signature': 'invalid-signature-that-is-64-chars-long-aaaaaaaaaaaaaaaaaaaaaaaaa',
        'x-webhook-timestamp': timestamp.toString()
      };
      mockRequest.body = '{"event":"test"}';

      const middleware = webhookAuth();
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid webhook signature' })
      );
    });

    it('should return 401 when signature length mismatch', async () => {
      const timestamp = Math.floor(Date.now() / 1000);

      mockRequest.headers = {
        'x-webhook-signature': 'short',
        'x-webhook-timestamp': timestamp.toString()
      };
      mockRequest.body = '{"event":"test"}';

      const middleware = webhookAuth();
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid webhook signature' })
      );
    });

    it('should accept custom secret', async () => {
      const customSecret = 'custom-webhook-secret';
      const payload = '{"event":"test"}';
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = generateWebhookSignature(payload, customSecret, timestamp);

      mockRequest.headers = {
        'x-webhook-signature': signature,
        'x-webhook-timestamp': timestamp.toString()
      };
      mockRequest.body = payload;

      const middleware = webhookAuth(customSecret);
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should handle object body', async () => {
      const bodyObj = { event: 'test', tenant_id: 'tenant-123' };
      const payload = JSON.stringify(bodyObj);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = generateWebhookSignature(payload, 'test-webhook-secret', timestamp);

      mockRequest.headers = {
        'x-webhook-signature': signature,
        'x-webhook-timestamp': timestamp.toString()
      };
      mockRequest.body = bodyObj;

      const middleware = webhookAuth();
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });
  });

  describe('internalAuth', () => {
    it('should authenticate valid internal service', async () => {
      mockRequest.headers = {
        'x-internal-service-secret': 'test-internal-secret',
        'x-service-id': 'auth-service',
        'x-tenant-id': 'tenant-123'
      };

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockRequest.tenantId).toBe('tenant-123');
    });

    it('should return 401 when secret missing', async () => {
      mockRequest.headers = {
        'x-service-id': 'auth-service'
      };

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Internal service authentication required' })
      );
    });

    it('should return 401 when service-id missing', async () => {
      mockRequest.headers = {
        'x-internal-service-secret': 'test-internal-secret'
      };

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should return 401 when secret invalid', async () => {
      mockRequest.headers = {
        'x-internal-service-secret': 'wrong-secret',
        'x-service-id': 'auth-service'
      };

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid internal service credentials' })
      );
    });

    it('should work without tenant-id header', async () => {
      mockRequest.headers = {
        'x-internal-service-secret': 'test-internal-secret',
        'x-service-id': 'auth-service'
      };

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockRequest.tenantId).toBeUndefined();
    });
  });
});

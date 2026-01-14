/**
 * Unit tests for api-key middleware (S2S authentication)
 * 
 * Tests:
 * - API key validation
 * - Service token validation
 * - Combined S2S authentication
 * - Optional S2S middleware
 * - Service context helpers
 */

import { createMockRequest, createMockReply } from '../../__mocks__/fastify.mock';

// Mock service-auth
jest.mock('../../../src/config/service-auth', () => ({
  verifyApiKey: jest.fn(),
  verifyServiceToken: jest.fn(),
  isTrustedService: jest.fn(),
}));

import { verifyApiKey, verifyServiceToken, isTrustedService } from '../../../src/config/service-auth';
import {
  apiKeyMiddleware,
  serviceTokenMiddleware,
  s2sAuthMiddleware,
  optionalS2sMiddleware,
  isFromTrustedService,
  getServiceContext,
} from '../../../src/middleware/api-key.middleware';

const mockVerifyApiKey = verifyApiKey as jest.MockedFunction<typeof verifyApiKey>;
const mockVerifyServiceToken = verifyServiceToken as jest.MockedFunction<typeof verifyServiceToken>;
const mockIsTrustedService = isTrustedService as jest.MockedFunction<typeof isTrustedService>;

describe('API Key Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsTrustedService.mockReturnValue(false);
  });

  describe('apiKeyMiddleware', () => {
    it('should return 401 if no API key provided', async () => {
      const request = createMockRequest({ headers: {} });
      const reply = createMockReply();

      await apiKeyMiddleware(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'API_KEY_REQUIRED',
        })
      );
    });

    it('should return 401 for invalid API key', async () => {
      const request = createMockRequest({
        headers: { 'x-api-key': 'invalid-key' },
      });
      const reply = createMockReply();
      mockVerifyApiKey.mockReturnValue({ valid: false, error: 'Invalid key' });

      await apiKeyMiddleware(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_API_KEY',
        })
      );
    });

    it('should set service context for valid API key', async () => {
      const request = createMockRequest({
        headers: { 'x-api-key': 'valid-key' },
      });
      const reply = createMockReply();
      mockVerifyApiKey.mockReturnValue({
        valid: true,
        serviceId: 'venue-service',
      });

      await apiKeyMiddleware(request as any, reply as any);

      expect((request as any).serviceContext).toEqual({
        isServiceRequest: true,
        serviceId: 'venue-service',
      });
      expect(reply.status).not.toHaveBeenCalled();
    });
  });

  describe('serviceTokenMiddleware', () => {
    it('should return 401 if no service token provided', async () => {
      const request = createMockRequest({ headers: {} });
      const reply = createMockReply();

      await serviceTokenMiddleware(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'SERVICE_TOKEN_REQUIRED',
        })
      );
    });

    it('should return 401 for invalid service token', async () => {
      const request = createMockRequest({
        headers: { 'x-service-token': 'invalid-token' },
      });
      const reply = createMockReply();
      mockVerifyServiceToken.mockReturnValue({ valid: false, error: 'Invalid token' });

      await serviceTokenMiddleware(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_SERVICE_TOKEN',
        })
      );
    });

    it('should set service context for valid service token', async () => {
      const request = createMockRequest({
        headers: { 'x-service-token': 'valid-token' },
      });
      const reply = createMockReply();
      mockVerifyServiceToken.mockReturnValue({
        valid: true,
        serviceId: 'ticket-service',
      });

      await serviceTokenMiddleware(request as any, reply as any);

      expect((request as any).serviceContext).toEqual({
        isServiceRequest: true,
        serviceId: 'ticket-service',
      });
      expect(reply.status).not.toHaveBeenCalled();
    });
  });

  describe('s2sAuthMiddleware', () => {
    it('should return 401 if no auth provided', async () => {
      const request = createMockRequest({ headers: {} });
      const reply = createMockReply();

      await s2sAuthMiddleware(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'S2S_AUTH_REQUIRED',
        })
      );
    });

    it('should prefer service token over API key', async () => {
      const request = createMockRequest({
        headers: {
          'x-service-token': 'valid-token',
          'x-api-key': 'valid-key',
        },
      });
      const reply = createMockReply();
      mockVerifyServiceToken.mockReturnValue({
        valid: true,
        serviceId: 'auth-service',
      });

      await s2sAuthMiddleware(request as any, reply as any);

      expect((request as any).serviceContext.serviceId).toBe('auth-service');
      expect(mockVerifyApiKey).not.toHaveBeenCalled();
    });

    it('should fall back to API key if service token invalid', async () => {
      const request = createMockRequest({
        headers: {
          'x-service-token': 'invalid-token',
          'x-api-key': 'valid-key',
        },
      });
      const reply = createMockReply();
      mockVerifyServiceToken.mockReturnValue({ valid: false });
      mockVerifyApiKey.mockReturnValue({
        valid: true,
        serviceId: 'order-service',
      });

      await s2sAuthMiddleware(request as any, reply as any);

      expect((request as any).serviceContext.serviceId).toBe('order-service');
    });

    it('should return 401 if both auth methods fail', async () => {
      const request = createMockRequest({
        headers: {
          'x-service-token': 'invalid-token',
          'x-api-key': 'invalid-key',
        },
      });
      const reply = createMockReply();
      mockVerifyServiceToken.mockReturnValue({ valid: false });
      mockVerifyApiKey.mockReturnValue({ valid: false });

      await s2sAuthMiddleware(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_S2S_CREDENTIALS',
        })
      );
    });

    it('should accept API key alone', async () => {
      const request = createMockRequest({
        headers: { 'x-api-key': 'valid-key' },
      });
      const reply = createMockReply();
      mockVerifyApiKey.mockReturnValue({
        valid: true,
        serviceId: 'payment-service',
      });

      await s2sAuthMiddleware(request as any, reply as any);

      expect((request as any).serviceContext).toEqual({
        isServiceRequest: true,
        serviceId: 'payment-service',
      });
    });
  });

  describe('optionalS2sMiddleware', () => {
    it('should set service context for valid service token', async () => {
      const request = createMockRequest({
        headers: { 'x-service-token': 'valid-token' },
      });
      const reply = createMockReply();
      mockVerifyServiceToken.mockReturnValue({
        valid: true,
        serviceId: 'analytics-service',
      });

      await optionalS2sMiddleware(request as any, reply as any);

      expect((request as any).serviceContext).toEqual({
        isServiceRequest: true,
        serviceId: 'analytics-service',
      });
    });

    it('should set service context for valid API key', async () => {
      const request = createMockRequest({
        headers: { 'x-api-key': 'valid-key' },
      });
      const reply = createMockReply();
      mockVerifyServiceToken.mockReturnValue({ valid: false });
      mockVerifyApiKey.mockReturnValue({
        valid: true,
        serviceId: 'search-service',
      });

      await optionalS2sMiddleware(request as any, reply as any);

      expect((request as any).serviceContext).toEqual({
        isServiceRequest: true,
        serviceId: 'search-service',
      });
    });

    it('should set isServiceRequest false when no valid S2S auth', async () => {
      const request = createMockRequest({ headers: {} });
      const reply = createMockReply();

      await optionalS2sMiddleware(request as any, reply as any);

      expect((request as any).serviceContext).toEqual({
        isServiceRequest: false,
      });
      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should not return error for invalid credentials', async () => {
      const request = createMockRequest({
        headers: { 'x-api-key': 'invalid-key' },
      });
      const reply = createMockReply();
      mockVerifyServiceToken.mockReturnValue({ valid: false });
      mockVerifyApiKey.mockReturnValue({ valid: false });

      await optionalS2sMiddleware(request as any, reply as any);

      expect((request as any).serviceContext).toEqual({
        isServiceRequest: false,
      });
      expect(reply.status).not.toHaveBeenCalled();
    });
  });

  describe('isFromTrustedService', () => {
    it('should return true for trusted service', () => {
      const request = createMockRequest();
      (request as any).serviceContext = {
        isServiceRequest: true,
        serviceId: 'auth-service',
      };
      mockIsTrustedService.mockReturnValue(true);

      expect(isFromTrustedService(request as any)).toBe(true);
    });

    it('should return false for untrusted service', () => {
      const request = createMockRequest();
      (request as any).serviceContext = {
        isServiceRequest: true,
        serviceId: 'external-service',
      };
      mockIsTrustedService.mockReturnValue(false);

      expect(isFromTrustedService(request as any)).toBe(false);
    });

    it('should return false when not a service request', () => {
      const request = createMockRequest();
      (request as any).serviceContext = {
        isServiceRequest: false,
      };

      expect(isFromTrustedService(request as any)).toBe(false);
    });

    it('should return false when no service context', () => {
      const request = createMockRequest();

      expect(isFromTrustedService(request as any)).toBe(false);
    });
  });

  describe('getServiceContext', () => {
    it('should return service context when present', () => {
      const request = createMockRequest();
      const context = {
        isServiceRequest: true,
        serviceId: 'venue-service',
      };
      (request as any).serviceContext = context;

      expect(getServiceContext(request as any)).toEqual(context);
    });

    it('should return undefined when no service context', () => {
      const request = createMockRequest();

      expect(getServiceContext(request as any)).toBeUndefined();
    });
  });
});

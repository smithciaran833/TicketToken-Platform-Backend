/**
 * Comprehensive Unit Tests for src/middleware/auth-audit.ts
 *
 * Tests authentication audit logging and authorization rules
 */

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../../../src/utils/logger', () => ({
  default: mockLogger,
  __esModule: true,
}));

import {
  AuthAuditEventType,
  logAuthAuditEvent,
  logSuspiciousActivity,
  authAuditMiddleware,
  logTokenValidated,
  logTokenValidationFailed,
  isHealthEndpoint,
  normalizeEndpoint,
  getAuthRule,
  checkAuthorization,
  endpointAuthRules,
} from '../../../src/middleware/auth-audit';

describe('src/middleware/auth-audit.ts - Comprehensive Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =============================================================================
  // LOG AUTH AUDIT EVENT
  // =============================================================================

  describe('logAuthAuditEvent()', () => {
    it('should log successful event with info level', () => {
      logAuthAuditEvent({
        timestamp: new Date('2024-01-01T00:00:00Z'),
        eventType: AuthAuditEventType.LOGIN_SUCCESS,
        requestId: 'req-123',
        endpoint: '/api/v1/test',
        method: 'GET',
        ipAddress: '127.0.0.1',
        success: true,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          auditType: 'AUTH',
          eventType: AuthAuditEventType.LOGIN_SUCCESS,
          timestamp: '2024-01-01T00:00:00.000Z',
          success: true,
        }),
        'Auth audit: LOGIN_SUCCESS'
      );
    });

    it('should log failed event with warn level', () => {
      logAuthAuditEvent({
        timestamp: new Date('2024-01-01T00:00:00Z'),
        eventType: AuthAuditEventType.LOGIN_FAILURE,
        requestId: 'req-123',
        endpoint: '/api/v1/test',
        method: 'POST',
        ipAddress: '127.0.0.1',
        success: false,
        errorMessage: 'Invalid credentials',
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          auditType: 'AUTH',
          eventType: AuthAuditEventType.LOGIN_FAILURE,
          success: false,
          errorMessage: 'Invalid credentials',
        }),
        'Auth audit failure: LOGIN_FAILURE'
      );
    });

    it('should include all optional fields when provided', () => {
      logAuthAuditEvent({
        timestamp: new Date('2024-01-01T00:00:00Z'),
        eventType: AuthAuditEventType.TOKEN_VALIDATED,
        requestId: 'req-123',
        correlationId: 'corr-456',
        userId: 'user-789',
        serviceId: 'service-abc',
        tenantId: 'tenant-def',
        endpoint: '/api/v1/test',
        method: 'GET',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        success: true,
        metadata: { key: 'value' },
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'corr-456',
          userId: 'user-789',
          serviceId: 'service-abc',
          tenantId: 'tenant-def',
          userAgent: 'Mozilla/5.0',
          metadata: { key: 'value' },
        }),
        expect.any(String)
      );
    });
  });

  // =============================================================================
  // LOG SUSPICIOUS ACTIVITY
  // =============================================================================

  describe('logSuspiciousActivity()', () => {
    it('should log suspicious activity', () => {
      const request: any = {
        requestId: 'req-123',
        correlationId: 'corr-456',
        user: {
          userId: 'user-789',
          serviceId: 'service-abc',
          tenant_id: 'tenant-def',
        },
        url: '/api/v1/test',
        method: 'POST',
        ip: '192.168.1.1',
        headers: {
          'user-agent': 'Mozilla/5.0',
        },
      };

      logSuspiciousActivity(request, 'Multiple failed login attempts', {
        attemptCount: 5,
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuthAuditEventType.SUSPICIOUS_ACTIVITY,
          requestId: 'req-123',
          userId: 'user-789',
          errorMessage: 'Multiple failed login attempts',
          metadata: { attemptCount: 5 },
        }),
        expect.any(String)
      );
    });

    it('should handle missing user', () => {
      const request: any = {
        requestId: 'req-123',
        url: '/api/v1/test',
        method: 'GET',
        ip: '127.0.0.1',
        headers: {},
      };

      logSuspiciousActivity(request, 'Suspicious request');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: undefined,
          serviceId: undefined,
          tenantId: undefined,
        }),
        expect.any(String)
      );
    });

    it('should handle missing requestId', () => {
      const request: any = {
        url: '/api/v1/test',
        method: 'GET',
        ip: '127.0.0.1',
        headers: {},
      };

      logSuspiciousActivity(request, 'Test reason');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'unknown',
        }),
        expect.any(String)
      );
    });
  });

  // =============================================================================
  // LOG TOKEN VALIDATED
  // =============================================================================

  describe('logTokenValidated()', () => {
    it('should log user token validation', () => {
      const request: any = {
        requestId: 'req-123',
        url: '/api/v1/test',
        method: 'GET',
        ip: '127.0.0.1',
        headers: {},
      };

      const user = {
        userId: 'user-123',
        tenant_id: 'tenant-456',
        iss: 'auth-service',
      };

      logTokenValidated(request, user);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuthAuditEventType.TOKEN_VALIDATED,
          userId: 'user-123',
          metadata: {
            tokenType: 'user',
            issuer: 'auth-service',
          },
        }),
        expect.any(String)
      );
    });

    it('should log service-to-service token validation', () => {
      const request: any = {
        requestId: 'req-123',
        url: '/api/v1/test',
        method: 'GET',
        ip: '127.0.0.1',
        headers: {},
      };

      const user = {
        serviceId: 'service-abc',
        iss: 'auth-service',
      };

      logTokenValidated(request, user);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuthAuditEventType.SERVICE_TO_SERVICE,
          serviceId: 'service-abc',
          metadata: {
            tokenType: 's2s',
            issuer: 'auth-service',
          },
        }),
        expect.any(String)
      );
    });
  });

  // =============================================================================
  // LOG TOKEN VALIDATION FAILED
  // =============================================================================

  describe('logTokenValidationFailed()', () => {
    it('should log token validation failure', () => {
      const request: any = {
        requestId: 'req-123',
        url: '/api/v1/test',
        method: 'POST',
        ip: '192.168.1.1',
        headers: {
          'user-agent': 'Test Agent',
        },
      };

      logTokenValidationFailed(
        request,
        AuthAuditEventType.TOKEN_EXPIRED,
        'Token has expired'
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuthAuditEventType.TOKEN_EXPIRED,
          requestId: 'req-123',
          success: false,
          errorMessage: 'Token has expired',
        }),
        expect.any(String)
      );
    });
  });

  // =============================================================================
  // IS HEALTH ENDPOINT
  // =============================================================================

  describe('isHealthEndpoint()', () => {
    it('should identify health endpoints', () => {
      expect(isHealthEndpoint('/health')).toBe(true);
      expect(isHealthEndpoint('/live')).toBe(true);
      expect(isHealthEndpoint('/ready')).toBe(true);
      expect(isHealthEndpoint('/startup')).toBe(true);
      expect(isHealthEndpoint('/metrics')).toBe(true);
    });

    it('should identify health endpoints with query params', () => {
      expect(isHealthEndpoint('/health?detail=true')).toBe(true);
      expect(isHealthEndpoint('/metrics?format=json')).toBe(true);
    });

    it('should not identify non-health endpoints', () => {
      expect(isHealthEndpoint('/api/v1/test')).toBe(false);
      expect(isHealthEndpoint('/users')).toBe(false);
      expect(isHealthEndpoint('/healthcheck')).toBe(false);
    });
  });

  // =============================================================================
  // NORMALIZE ENDPOINT
  // =============================================================================

  describe('normalizeEndpoint()', () => {
    it('should remove query strings', () => {
      expect(normalizeEndpoint('/api/v1/test?param=value')).toBe('/api/v1/test');
    });

    it('should replace UUIDs with wildcards', () => {
      expect(normalizeEndpoint('/api/v1/users/123e4567-e89b-12d3-a456-426614174000')).toBe(
        '/api/v1/users/*'
      );
    });

    it('should replace Base58 addresses with wildcards', () => {
      expect(normalizeEndpoint('/api/v1/wallets/8RtwWeqdFz4EFuZU3MAadfqXZchCCmHCFb3FJGhtkpep')).toBe(
        '/api/v1/wallets/*'
      );
    });

    it('should handle multiple IDs', () => {
      expect(
        normalizeEndpoint('/api/v1/users/123e4567-e89b-12d3-a456-426614174000/transactions/abc123def456')
      ).toContain('*');
    });

    it('should handle paths with no IDs', () => {
      expect(normalizeEndpoint('/api/v1/transactions')).toBe('/api/v1/transactions');
    });
  });

  // =============================================================================
  // GET AUTH RULE
  // =============================================================================

  describe('getAuthRule()', () => {
    it('should return exact match rule', () => {
      const rule = getAuthRule('GET:/health');
      expect(rule.allowAnonymous).toBe(true);
    });

    it('should return wildcard match rule', () => {
      const rule = getAuthRule('GET:/api/v1/transactions/123');
      expect(rule.allowS2S).toBe(true);
    });

    it('should return default rule for unknown endpoints', () => {
      const rule = getAuthRule('POST:/unknown/endpoint');
      expect(rule.allowAnonymous).toBe(false);
      expect(rule.allowS2S).toBe(true);
    });

    it('should match admin endpoints', () => {
      const rule = getAuthRule('POST:/admin/settings');
      expect(rule.roles).toContain('admin');
    });

    it('should match internal endpoints', () => {
      const rule = getAuthRule('POST:/internal/sync');
      expect(rule.allowS2S).toBe(true);
      expect(rule.roles).toContain('service');
    });
  });

  // =============================================================================
  // CHECK AUTHORIZATION
  // =============================================================================

  describe('checkAuthorization()', () => {
    it('should allow anonymous access when rule permits', async () => {
      const request: any = { user: null };
      const rule = { allowAnonymous: true };

      const result = await checkAuthorization(request, rule);
      expect(result).toBe(true);
    });

    it('should deny anonymous access when rule does not permit', async () => {
      const request: any = { user: null };
      const rule = { allowAnonymous: false };

      const result = await checkAuthorization(request, rule);
      expect(result).toBe(false);
    });

    it('should allow service-to-service calls when permitted', async () => {
      const request: any = {
        user: {
          serviceId: 'service-123',
        },
      };
      const rule = { allowS2S: true };

      const result = await checkAuthorization(request, rule);
      expect(result).toBe(true);
    });

    it('should deny service-to-service calls when not permitted', async () => {
      const request: any = {
        user: {
          serviceId: 'service-123',
        },
      };
      const rule = { allowS2S: false };

      const result = await checkAuthorization(request, rule);
      expect(result).toBe(false);
    });

    it('should check user roles', async () => {
      const request: any = {
        user: {
          userId: 'user-123',
          roles: ['user', 'admin'],
        },
      };
      const rule = { roles: ['admin'] };

      const result = await checkAuthorization(request, rule);
      expect(result).toBe(true);
    });

    it('should deny when user lacks required role', async () => {
      const request: any = {
        user: {
          userId: 'user-123',
          roles: ['user'],
        },
      };
      const rule = { roles: ['admin'] };

      const result = await checkAuthorization(request, rule);
      expect(result).toBe(false);
    });

    it('should check user scopes', async () => {
      const request: any = {
        user: {
          userId: 'user-123',
          scopes: ['read:transactions', 'write:transactions'],
        },
      };
      const rule = { scopes: ['read:transactions'] };

      const result = await checkAuthorization(request, rule);
      expect(result).toBe(true);
    });

    it('should deny when user lacks required scope', async () => {
      const request: any = {
        user: {
          userId: 'user-123',
          scopes: ['read:transactions'],
        },
      };
      const rule = { scopes: ['write:transactions'] };

      const result = await checkAuthorization(request, rule);
      expect(result).toBe(false);
    });

    it('should use custom check function', async () => {
      const request: any = {
        user: {
          userId: 'user-123',
        },
      };
      const customCheck = jest.fn().mockResolvedValue(true);
      const rule = { customCheck };

      const result = await checkAuthorization(request, rule);
      expect(result).toBe(true);
      expect(customCheck).toHaveBeenCalledWith(request);
    });

    it('should handle async custom check', async () => {
      const request: any = {
        user: {
          userId: 'user-123',
        },
      };
      const customCheck = jest.fn().mockResolvedValue(false);
      const rule = { customCheck };

      const result = await checkAuthorization(request, rule);
      expect(result).toBe(false);
    });

    it('should allow when no restrictions', async () => {
      const request: any = {
        user: {
          userId: 'user-123',
        },
      };
      const rule = {};

      const result = await checkAuthorization(request, rule);
      expect(result).toBe(true);
    });
  });

  // =============================================================================
  // AUTH AUDIT MIDDLEWARE
  // =============================================================================

  describe('authAuditMiddleware()', () => {
    it('should register Fastify hooks', () => {
      const mockFastify: any = {
        addHook: jest.fn(),
      };

      authAuditMiddleware(mockFastify);

      expect(mockFastify.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
      expect(mockFastify.addHook).toHaveBeenCalledWith('preHandler', expect.any(Function));
    });

    it('should skip health endpoints in onRequest hook', async () => {
      const mockFastify: any = {
        addHook: jest.fn(),
      };

      authAuditMiddleware(mockFastify);

      const onRequestHook = mockFastify.addHook.mock.calls[0][1];
      const request: any = { url: '/health' };
      const reply: any = {};

      await onRequestHook(request, reply);

      expect(request.authAuditStartTime).toBeUndefined();
    });

    it('should set audit start time in onRequest hook', async () => {
      const mockFastify: any = {
        addHook: jest.fn(),
      };

      authAuditMiddleware(mockFastify);

      const onRequestHook = mockFastify.addHook.mock.calls[0][1];
      const request: any = { url: '/api/v1/test' };
      const reply: any = {};

      await onRequestHook(request, reply);

      expect(request.authAuditStartTime).toBeGreaterThan(0);
    });

    it('should log missing token in preHandler hook', async () => {
      const mockFastify: any = {
        addHook: jest.fn(),
      };

      authAuditMiddleware(mockFastify);

      const preHandlerHook = mockFastify.addHook.mock.calls[1][1];
      const request: any = {
        url: '/api/v1/test',
        method: 'GET',
        ip: '127.0.0.1',
        headers: {},
        requestId: 'req-123',
      };
      const reply: any = {};

      await preHandlerHook(request, reply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuthAuditEventType.TOKEN_MISSING,
        }),
        expect.any(String)
      );
    });

    it('should check authorization and grant permission', async () => {
      const mockFastify: any = {
        addHook: jest.fn(),
      };

      authAuditMiddleware(mockFastify);

      const preHandlerHook = mockFastify.addHook.mock.calls[1][1];
      const request: any = {
        url: '/api/v1/test',
        method: 'GET',
        ip: '127.0.0.1',
        headers: {},
        requestId: 'req-123',
        user: {
          userId: 'user-123',
          roles: [],
        },
      };
      const reply: any = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await preHandlerHook(request, reply);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuthAuditEventType.PERMISSION_GRANTED,
        }),
        expect.any(String)
      );
      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should deny permission when unauthorized', async () => {
      const mockFastify: any = {
        addHook: jest.fn(),
      };

      authAuditMiddleware(mockFastify);

      const preHandlerHook = mockFastify.addHook.mock.calls[1][1];
      const request: any = {
        url: '/admin/settings',
        method: 'POST',
        ip: '127.0.0.1',
        headers: {},
        requestId: 'req-123',
        user: {
          userId: 'user-123',
          roles: ['user'], // Not admin
        },
      };
      const reply: any = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await preHandlerHook(request, reply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuthAuditEventType.PERMISSION_DENIED,
        }),
        expect.any(String)
      );
      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Insufficient permissions for this endpoint',
      });
    });
  });

  // =============================================================================
  // ENDPOINT AUTH RULES
  // =============================================================================

  describe('endpointAuthRules', () => {
    it('should have rules for public endpoints', () => {
      expect(endpointAuthRules['GET:/health']).toEqual({ allowAnonymous: true });
      expect(endpointAuthRules['GET:/metrics']).toEqual({ allowAnonymous: true });
    });

    it('should have rules for API endpoints', () => {
      expect(endpointAuthRules['GET:/api/v1/transactions/*']).toEqual({ allowS2S: true });
      expect(endpointAuthRules['GET:/api/v1/wallets/*']).toEqual({ allowS2S: true });
    });

    it('should have rules for admin endpoints', () => {
      expect(endpointAuthRules['POST:/admin/*']).toEqual({ roles: ['admin'] });
      expect(endpointAuthRules['DELETE:/admin/*']).toEqual({ roles: ['admin'] });
    });

    it('should have rules for internal endpoints', () => {
      expect(endpointAuthRules['POST:/internal/*']).toEqual({
        allowS2S: true,
        roles: ['service'],
      });
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('Exports', () => {
    it('should export AuthAuditEventType enum', () => {
      expect(AuthAuditEventType.LOGIN_SUCCESS).toBe('LOGIN_SUCCESS');
      expect(AuthAuditEventType.TOKEN_VALIDATED).toBe('TOKEN_VALIDATED');
      expect(AuthAuditEventType.PERMISSION_DENIED).toBe('PERMISSION_DENIED');
    });

    it('should export all functions', () => {
      expect(typeof logAuthAuditEvent).toBe('function');
      expect(typeof logSuspiciousActivity).toBe('function');
      expect(typeof authAuditMiddleware).toBe('function');
      expect(typeof logTokenValidated).toBe('function');
      expect(typeof logTokenValidationFailed).toBe('function');
      expect(typeof isHealthEndpoint).toBe('function');
      expect(typeof normalizeEndpoint).toBe('function');
      expect(typeof getAuthRule).toBe('function');
      expect(typeof checkAuthorization).toBe('function');
    });

    it('should export endpointAuthRules', () => {
      expect(typeof endpointAuthRules).toBe('object');
      expect(endpointAuthRules).toBeDefined();
    });
  });
});

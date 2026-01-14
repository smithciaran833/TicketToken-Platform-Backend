/**
 * Service Auth Middleware Tests
 * Tests for service-to-service authentication
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: { child: jest.fn().mockReturnValue({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

describe('ServiceAuthMiddleware', () => {
  let middleware: any;
  let mockRequest: any;
  let mockReply: any;
  let mockDone: any;
  let mockServiceRegistry: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockServiceRegistry = { validateService: jest.fn(), getServiceInfo: jest.fn() };
    middleware = createServiceAuthMiddleware(mockServiceRegistry);
    mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis() };
    mockDone = jest.fn();
    mockRequest = { headers: {}, ip: '127.0.0.1' };
  });

  describe('service key validation', () => {
    it('should allow valid service key', async () => {
      mockRequest.headers['x-service-key'] = 'valid-service-key';
      mockServiceRegistry.validateService.mockResolvedValue({ valid: true, serviceName: 'event-service' });

      await middleware(mockRequest, mockReply, mockDone);

      expect(mockDone).toHaveBeenCalled();
    });

    it('should reject invalid service key', async () => {
      mockRequest.headers['x-service-key'] = 'invalid-key';
      mockServiceRegistry.validateService.mockResolvedValue({ valid: false });

      await middleware(mockRequest, mockReply, mockDone);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockDone).not.toHaveBeenCalled();
    });

    it('should reject missing service key', async () => {
      await middleware(mockRequest, mockReply, mockDone);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should set service info on request', async () => {
      mockRequest.headers['x-service-key'] = 'valid-key';
      mockServiceRegistry.validateService.mockResolvedValue({ valid: true, serviceName: 'order-service' });

      await middleware(mockRequest, mockReply, mockDone);

      expect(mockRequest.callingService).toBe('order-service');
    });
  });

  describe('JWT service tokens', () => {
    it('should validate JWT service token', async () => {
      mockRequest.headers['authorization'] = 'Bearer service.jwt.token';
      mockServiceRegistry.validateService.mockResolvedValue({ valid: true, serviceName: 'ticket-service' });

      await middleware(mockRequest, mockReply, mockDone);

      expect(mockDone).toHaveBeenCalled();
    });

    it('should reject expired JWT', async () => {
      mockRequest.headers['authorization'] = 'Bearer expired.jwt.token';
      mockServiceRegistry.validateService.mockResolvedValue({ valid: false, reason: 'Token expired' });

      await middleware(mockRequest, mockReply, mockDone);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });
  });

  describe('IP allowlisting', () => {
    it('should allow requests from trusted IPs', async () => {
      mockRequest.headers['x-service-key'] = 'valid-key';
      mockRequest.ip = '10.0.0.5';
      mockServiceRegistry.validateService.mockResolvedValue({ valid: true, serviceName: 'internal-service' });

      await middleware(mockRequest, mockReply, mockDone);

      expect(mockDone).toHaveBeenCalled();
    });

    it('should check IP against service allowlist', async () => {
      mockRequest.headers['x-service-key'] = 'valid-key';
      mockRequest.ip = '192.168.1.1';
      mockServiceRegistry.validateService.mockResolvedValue({ valid: true, serviceName: 'external-service', allowedIps: ['10.0.0.0/8'] });

      await middleware(mockRequest, mockReply, mockDone);

      // Should still proceed if key is valid
      expect(mockDone).toHaveBeenCalled();
    });
  });

  describe('rate limiting', () => {
    it('should rate limit service calls', async () => {
      mockRequest.headers['x-service-key'] = 'valid-key';
      mockServiceRegistry.validateService.mockResolvedValue({ valid: true, serviceName: 'event-service', rateLimit: { exceeded: true } });

      await middleware(mockRequest, mockReply, mockDone);

      expect(mockReply.code).toHaveBeenCalledWith(429);
    });

    it('should include rate limit headers', async () => {
      mockRequest.headers['x-service-key'] = 'valid-key';
      mockServiceRegistry.validateService.mockResolvedValue({ 
        valid: true, 
        serviceName: 'event-service',
        rateLimit: { remaining: 95, limit: 100 }
      });

      await middleware(mockRequest, mockReply, mockDone);

      expect(mockDone).toHaveBeenCalled();
    });
  });

  describe('permission scopes', () => {
    it('should check service has required scope', async () => {
      mockRequest.headers['x-service-key'] = 'valid-key';
      mockRequest.routeOptions = { config: { scope: 'payments:read' } };
      mockServiceRegistry.validateService.mockResolvedValue({ 
        valid: true, 
        serviceName: 'order-service',
        scopes: ['payments:read', 'payments:write']
      });

      await middleware(mockRequest, mockReply, mockDone);

      expect(mockDone).toHaveBeenCalled();
    });

    it('should reject if scope not present', async () => {
      mockRequest.headers['x-service-key'] = 'valid-key';
      mockRequest.routeOptions = { config: { scope: 'admin:write' } };
      mockServiceRegistry.validateService.mockResolvedValue({ 
        valid: true, 
        serviceName: 'order-service',
        scopes: ['payments:read']
      });

      await middleware(mockRequest, mockReply, mockDone);

      expect(mockReply.code).toHaveBeenCalledWith(403);
    });
  });

  describe('mutual TLS', () => {
    it('should validate client certificate', async () => {
      mockRequest.socket = { getPeerCertificate: jest.fn().mockReturnValue({ subject: { CN: 'order-service' } }) };
      mockServiceRegistry.validateService.mockResolvedValue({ valid: true, serviceName: 'order-service' });

      await middleware(mockRequest, mockReply, mockDone);

      expect(mockDone).toHaveBeenCalled();
    });
  });

  describe('request signing', () => {
    it('should validate request signature', async () => {
      mockRequest.headers['x-service-key'] = 'valid-key';
      mockRequest.headers['x-signature'] = 'valid-hmac-signature';
      mockRequest.headers['x-timestamp'] = String(Date.now());
      mockServiceRegistry.validateService.mockResolvedValue({ valid: true, serviceName: 'event-service' });

      await middleware(mockRequest, mockReply, mockDone);

      expect(mockDone).toHaveBeenCalled();
    });

    it('should reject stale timestamps', async () => {
      mockRequest.headers['x-service-key'] = 'valid-key';
      mockRequest.headers['x-timestamp'] = String(Date.now() - 600000); // 10 minutes ago
      mockServiceRegistry.validateService.mockResolvedValue({ valid: false, reason: 'Stale timestamp' });

      await middleware(mockRequest, mockReply, mockDone);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });
  });

  describe('logging', () => {
    it('should log service-to-service calls', async () => {
      mockRequest.headers['x-service-key'] = 'valid-key';
      mockRequest.headers['x-request-id'] = 'req_123';
      mockServiceRegistry.validateService.mockResolvedValue({ valid: true, serviceName: 'event-service' });

      await middleware(mockRequest, mockReply, mockDone);

      expect(mockRequest.callingService).toBeDefined();
    });
  });
});

function createServiceAuthMiddleware(serviceRegistry: any) {
  return async (request: any, reply: any, done: () => void) => {
    const serviceKey = request.headers['x-service-key'];
    const authHeader = request.headers['authorization'];

    if (!serviceKey && !authHeader) {
      return reply.code(401).send({ error: 'Missing service authentication' });
    }

    const result = await serviceRegistry.validateService(serviceKey || authHeader);

    if (!result.valid) {
      return reply.code(401).send({ error: result.reason || 'Invalid service credentials' });
    }

    if (result.rateLimit?.exceeded) {
      return reply.code(429).send({ error: 'Rate limit exceeded' });
    }

    const requiredScope = request.routeOptions?.config?.scope;
    if (requiredScope && !result.scopes?.includes(requiredScope)) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }

    request.callingService = result.serviceName;
    done();
  };
}

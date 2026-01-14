// Mock dependencies before imports
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockFs = {
  readFileSync: jest.fn(),
};

const mockJwt = {
  sign: jest.fn(),
  verify: jest.fn(),
};

jest.mock('jsonwebtoken', () => mockJwt);
jest.mock('fs', () => mockFs);
jest.mock('../../../src/utils/logger', () => ({ logger: mockLogger }));
jest.mock('../../../src/config/env', () => ({
  env: {
    isProduction: false,
    S2S_PRIVATE_KEY: null,
    S2S_PUBLIC_KEY: null,
    S2S_PRIVATE_KEY_PATH: '/fake/s2s-private.pem',
    S2S_PUBLIC_KEY_PATH: '/fake/s2s-public.pem',
    JWT_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\nTEST\n-----END RSA PRIVATE KEY-----',
    JWT_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\nTEST\n-----END PUBLIC KEY-----',
    JWT_PRIVATE_KEY_PATH: '/fake/jwt-private.pem',
    JWT_PUBLIC_KEY_PATH: '/fake/jwt-public.pem',
    S2S_TOKEN_EXPIRES_IN: '1h',
  },
}));

// Import after mocks
import {
  verifyServiceToken,
  generateServiceToken,
  getAllowedServices,
  allowUserOrService,
  initS2SKeys,
} from '../../../src/middleware/s2s.middleware';

describe('s2s.middleware', () => {
  const createMockRequest = (headers: Record<string, string> = {}, url = '/auth/verify') => ({
    headers,
    url,
    ip: '127.0.0.1',
  });

  const createMockReply = () => {
    const reply: any = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    return reply;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the S2S key manager state by re-initializing
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error('File not found');
    });
  });

  describe('verifyServiceToken', () => {
    beforeEach(async () => {
      // Initialize keys before each test
      await initS2SKeys();
    });

    it('rejects request without service token', async () => {
      const request = createMockRequest({});
      const reply = createMockReply();

      await verifyServiceToken(request as any, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'MISSING_SERVICE_TOKEN' })
      );
    });

    it('accepts valid service token for allowed endpoint', async () => {
      mockJwt.verify.mockReturnValue({
        sub: 'ticket-service',
        type: 'service',
      });

      const request = createMockRequest(
        { 'x-service-token': 'valid-token' },
        '/auth/verify'
      );
      const reply = createMockReply();

      await verifyServiceToken(request as any, reply);

      expect(reply.status).not.toHaveBeenCalled();
      expect((request as any).service).toEqual({
        name: 'ticket-service',
        authenticated: true,
      });
    });

    it('rejects token with wrong type', async () => {
      mockJwt.verify.mockReturnValue({
        sub: 'ticket-service',
        type: 'user', // Wrong type
      });

      const request = createMockRequest(
        { 'x-service-token': 'wrong-type-token' },
        '/auth/verify'
      );
      const reply = createMockReply();

      await verifyServiceToken(request as any, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'INVALID_SERVICE_TOKEN' })
      );
    });

    it('rejects service not in allowlist', async () => {
      mockJwt.verify.mockReturnValue({
        sub: 'unknown-service',
        type: 'service',
      });

      const request = createMockRequest(
        { 'x-service-token': 'valid-token' },
        '/auth/verify'
      );
      const reply = createMockReply();

      await verifyServiceToken(request as any, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'SERVICE_NOT_ALLOWED' })
      );
    });

    it('rejects service accessing non-allowed endpoint', async () => {
      mockJwt.verify.mockReturnValue({
        sub: 'notification-service', // Only allowed /auth/verify
        type: 'service',
      });

      const request = createMockRequest(
        { 'x-service-token': 'valid-token' },
        '/auth/internal/validate-permissions' // Not allowed for this service
      );
      const reply = createMockReply();

      await verifyServiceToken(request as any, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
    });

    it('allows api-gateway wildcard access to internal endpoints', async () => {
      mockJwt.verify.mockReturnValue({
        sub: 'api-gateway',
        type: 'service',
      });

      const request = createMockRequest(
        { 'x-service-token': 'valid-token' },
        '/auth/internal/any-endpoint'
      );
      const reply = createMockReply();

      await verifyServiceToken(request as any, reply);

      expect(reply.status).not.toHaveBeenCalled();
      expect((request as any).service.name).toBe('api-gateway');
    });

    it('returns 401 for expired token', async () => {
      const expiredError = new Error('jwt expired');
      expiredError.name = 'TokenExpiredError';
      mockJwt.verify.mockImplementation(() => {
        throw expiredError;
      });

      const request = createMockRequest(
        { 'x-service-token': 'expired-token' },
        '/auth/verify'
      );
      const reply = createMockReply();

      await verifyServiceToken(request as any, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'SERVICE_TOKEN_EXPIRED' })
      );
    });

    it('strips query string when checking endpoint', async () => {
      mockJwt.verify.mockReturnValue({
        sub: 'ticket-service',
        type: 'service',
      });

      const request = createMockRequest(
        { 'x-service-token': 'valid-token' },
        '/auth/verify?foo=bar&baz=qux'
      );
      const reply = createMockReply();

      await verifyServiceToken(request as any, reply);

      expect(reply.status).not.toHaveBeenCalled();
    });
  });

  describe('generateServiceToken', () => {
    beforeEach(async () => {
      await initS2SKeys();
    });

    it('generates token with correct payload', async () => {
      mockJwt.sign.mockReturnValue('generated-token');

      const token = await generateServiceToken('my-service');

      expect(token).toBe('generated-token');
      expect(mockJwt.sign).toHaveBeenCalledWith(
        { sub: 'my-service', type: 'service' },
        expect.any(String),
        expect.objectContaining({
          algorithm: 'RS256',
          expiresIn: '1h',
        })
      );
    });
  });

  describe('getAllowedServices', () => {
    it('returns copy of allowlist', () => {
      const services = getAllowedServices();

      expect(services).toHaveProperty('ticket-service');
      expect(services).toHaveProperty('payment-service');
      expect(services).toHaveProperty('api-gateway');
      expect(services['ticket-service']).toContain('/auth/verify');
    });

    it('does not allow mutation of original', () => {
      const services = getAllowedServices();
      services['hacker-service'] = ['/admin'];

      const servicesAgain = getAllowedServices();
      expect(servicesAgain).not.toHaveProperty('hacker-service');
    });
  });

  describe('allowUserOrService', () => {
    const mockUserAuth = jest.fn();

    beforeEach(async () => {
      await initS2SKeys();
      mockUserAuth.mockReset();
    });

    it('uses service auth when x-service-token present', async () => {
      mockJwt.verify.mockReturnValue({
        sub: 'ticket-service',
        type: 'service',
      });

      const request = createMockRequest(
        { 'x-service-token': 'service-token' },
        '/auth/verify'
      );
      const reply = createMockReply();

      const middleware = allowUserOrService(mockUserAuth);
      await middleware(request as any, reply);

      expect(mockUserAuth).not.toHaveBeenCalled();
    });

    it('uses user auth when authorization header present', async () => {
      const request = createMockRequest(
        { authorization: 'Bearer user-token' },
        '/auth/verify'
      );
      const reply = createMockReply();

      const middleware = allowUserOrService(mockUserAuth);
      await middleware(request as any, reply);

      expect(mockUserAuth).toHaveBeenCalledWith(request, reply);
    });

    it('returns 401 when no auth present', async () => {
      const request = createMockRequest({}, '/auth/verify');
      const reply = createMockReply();

      const middleware = allowUserOrService(mockUserAuth);
      await middleware(request as any, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'NO_AUTH_TOKEN' })
      );
    });

    it('prefers service token over user token', async () => {
      mockJwt.verify.mockReturnValue({
        sub: 'ticket-service',
        type: 'service',
      });

      const request = createMockRequest(
        {
          'x-service-token': 'service-token',
          authorization: 'Bearer user-token',
        },
        '/auth/verify'
      );
      const reply = createMockReply();

      const middleware = allowUserOrService(mockUserAuth);
      await middleware(request as any, reply);

      expect(mockUserAuth).not.toHaveBeenCalled();
    });
  });
});

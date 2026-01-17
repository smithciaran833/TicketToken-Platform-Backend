// Mock controllers BEFORE imports
const mockHandleCallback = jest.fn();
const mockRefreshToken = jest.fn();

jest.mock('../../../src/controllers/oauth.controller', () => ({
  oauthController: {
    handleCallback: mockHandleCallback,
    refreshToken: mockRefreshToken,
  },
}));

// Mock middleware
const mockAuthenticate = jest.fn();
const mockValidateFastify = jest.fn();

jest.mock('../../../src/middleware/auth.middleware', () => ({
  authenticate: mockAuthenticate,
}));

jest.mock('../../../src/middleware/validation.middleware', () => ({
  validateFastify: mockValidateFastify,
}));

// Mock validators
const mockOauthCallbackParamsSchema = { type: 'object' };
const mockOauthCallbackQuerySchema = { type: 'object' };
const mockRefreshTokenSchema = { type: 'object' };

jest.mock('../../../src/validators/schemas', () => ({
  oauthCallbackParamsSchema: mockOauthCallbackParamsSchema,
  oauthCallbackQuerySchema: mockOauthCallbackQuerySchema,
  refreshTokenSchema: mockRefreshTokenSchema,
}));

import { FastifyInstance } from 'fastify';
import { oauthRoutes } from '../../../src/routes/oauth.routes';

describe('oauthRoutes', () => {
  let mockFastify: Partial<FastifyInstance>;
  let getSpy: jest.Mock;
  let postSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    getSpy = jest.fn();
    postSpy = jest.fn();

    mockFastify = {
      get: getSpy,
      post: postSpy,
    };

    mockValidateFastify.mockReturnValue('validate-middleware');
  });

  describe('GET /callback/:provider', () => {
    it('should register GET /callback/:provider', async () => {
      await oauthRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith(
        '/callback/:provider',
        expect.any(Object),
        mockHandleCallback
      );
    });

    it('should not require authentication', async () => {
      await oauthRoutes(mockFastify as FastifyInstance);

      const callbackRoute = getSpy.mock.calls.find(
        (call) => call[0] === '/callback/:provider'
      );
      expect(callbackRoute[1].onRequest).not.toContain(mockAuthenticate);
    });

    it('should validate params and query', async () => {
      await oauthRoutes(mockFastify as FastifyInstance);

      expect(mockValidateFastify).toHaveBeenCalledWith({
        params: mockOauthCallbackParamsSchema,
        query: mockOauthCallbackQuerySchema,
      });
    });

    it('should include validation middleware in onRequest', async () => {
      await oauthRoutes(mockFastify as FastifyInstance);

      const callbackRoute = getSpy.mock.calls.find(
        (call) => call[0] === '/callback/:provider'
      );
      expect(callbackRoute[1].onRequest).toContain('validate-middleware');
    });
  });

  describe('POST /refresh/:provider', () => {
    it('should register POST /refresh/:provider', async () => {
      await oauthRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith(
        '/refresh/:provider',
        expect.any(Object),
        mockRefreshToken
      );
    });

    it('should require authentication', async () => {
      await oauthRoutes(mockFastify as FastifyInstance);

      const refreshRoute = postSpy.mock.calls.find(
        (call) => call[0] === '/refresh/:provider'
      );
      expect(refreshRoute[1].onRequest).toContain(mockAuthenticate);
    });

    it('should validate params and body', async () => {
      await oauthRoutes(mockFastify as FastifyInstance);

      expect(mockValidateFastify).toHaveBeenCalledWith({
        params: mockOauthCallbackParamsSchema,
        body: mockRefreshTokenSchema,
      });
    });

    it('should include both auth and validation middleware', async () => {
      await oauthRoutes(mockFastify as FastifyInstance);

      const refreshRoute = postSpy.mock.calls.find(
        (call) => call[0] === '/refresh/:provider'
      );
      expect(refreshRoute[1].onRequest).toEqual([mockAuthenticate, 'validate-middleware']);
    });
  });

  it('should register all 2 routes', async () => {
    await oauthRoutes(mockFastify as FastifyInstance);

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('should bind correct controller methods', async () => {
    await oauthRoutes(mockFastify as FastifyInstance);

    expect(getSpy).toHaveBeenCalledWith(expect.any(String), expect.any(Object), mockHandleCallback);
    expect(postSpy).toHaveBeenCalledWith(expect.any(String), expect.any(Object), mockRefreshToken);
  });

  it('should use validateFastify for all routes', async () => {
    await oauthRoutes(mockFastify as FastifyInstance);

    expect(mockValidateFastify).toHaveBeenCalledTimes(2);
  });
});

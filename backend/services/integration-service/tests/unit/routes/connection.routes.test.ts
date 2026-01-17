// Mock controllers BEFORE imports
const mockListIntegrations = jest.fn();
const mockGetIntegration = jest.fn();
const mockConnectIntegration = jest.fn();
const mockDisconnectIntegration = jest.fn();
const mockReconnectIntegration = jest.fn();
const mockValidateApiKey = jest.fn();

jest.mock('../../../src/controllers/connection.controller', () => ({
  connectionController: {
    listIntegrations: mockListIntegrations,
    getIntegration: mockGetIntegration,
    connectIntegration: mockConnectIntegration,
    disconnectIntegration: mockDisconnectIntegration,
    reconnectIntegration: mockReconnectIntegration,
    validateApiKey: mockValidateApiKey,
  },
}));

// Mock middleware
const mockAuthenticate = jest.fn();
const mockAuthorize = jest.fn();

jest.mock('../../../src/middleware/auth.middleware', () => ({
  authenticate: mockAuthenticate,
  authorize: mockAuthorize,
}));

import { FastifyInstance } from 'fastify';
import { connectionRoutes } from '../../../src/routes/connection.routes';

describe('connectionRoutes', () => {
  let mockFastify: Partial<FastifyInstance>;
  let addHookSpy: jest.Mock;
  let getSpy: jest.Mock;
  let postSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    addHookSpy = jest.fn();
    getSpy = jest.fn();
    postSpy = jest.fn();

    mockFastify = {
      addHook: addHookSpy,
      get: getSpy,
      post: postSpy,
    };

    mockAuthorize.mockReturnValue('authorize-middleware');
  });

  it('should register authentication hook for all routes', async () => {
    await connectionRoutes(mockFastify as FastifyInstance);

    expect(addHookSpy).toHaveBeenCalledWith('onRequest', mockAuthenticate);
  });

  describe('GET routes', () => {
    it('should register GET / for listing integrations', async () => {
      await connectionRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/', mockListIntegrations);
    });

    it('should register GET /:provider for getting single integration', async () => {
      await connectionRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/:provider', mockGetIntegration);
    });

    it('should register all GET routes', async () => {
      await connectionRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('POST routes with authorization', () => {
    it('should register POST /connect/:provider with admin authorization', async () => {
      await connectionRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith(
        '/connect/:provider',
        expect.objectContaining({
          onRequest: expect.arrayContaining([
            mockAuthenticate,
            'authorize-middleware',
          ]),
        }),
        mockConnectIntegration
      );
      expect(mockAuthorize).toHaveBeenCalledWith('admin', 'venue_admin');
    });

    it('should register POST /:provider/disconnect with admin authorization', async () => {
      await connectionRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith(
        '/:provider/disconnect',
        expect.objectContaining({
          onRequest: expect.arrayContaining([
            mockAuthenticate,
            'authorize-middleware',
          ]),
        }),
        mockDisconnectIntegration
      );
    });

    it('should register POST /:provider/reconnect with admin authorization', async () => {
      await connectionRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith(
        '/:provider/reconnect',
        expect.objectContaining({
          onRequest: expect.arrayContaining([
            mockAuthenticate,
            'authorize-middleware',
          ]),
        }),
        mockReconnectIntegration
      );
    });

    it('should register POST /:provider/api-key with admin authorization', async () => {
      await connectionRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith(
        '/:provider/api-key',
        expect.objectContaining({
          onRequest: expect.arrayContaining([
            mockAuthenticate,
            'authorize-middleware',
          ]),
        }),
        mockValidateApiKey
      );
    });

    it('should call authorize with correct roles for all POST routes', async () => {
      await connectionRoutes(mockFastify as FastifyInstance);

      expect(mockAuthorize).toHaveBeenCalledTimes(4);
      expect(mockAuthorize).toHaveBeenCalledWith('admin', 'venue_admin');
    });

    it('should register all POST routes', async () => {
      await connectionRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledTimes(4);
    });
  });

  it('should register all 6 routes total', async () => {
    await connectionRoutes(mockFastify as FastifyInstance);

    const totalRoutes = getSpy.mock.calls.length + postSpy.mock.calls.length;
    expect(totalRoutes).toBe(6);
  });

  it('should apply authentication to all routes via hook', async () => {
    await connectionRoutes(mockFastify as FastifyInstance);

    expect(addHookSpy).toHaveBeenCalledWith('onRequest', mockAuthenticate);
  });

  it('should apply additional authorization only to POST routes', async () => {
    await connectionRoutes(mockFastify as FastifyInstance);

    // Check that GET routes don't have onRequest arrays
    const getCalls = getSpy.mock.calls;
    getCalls.forEach((call) => {
      expect(call[1]).not.toHaveProperty('onRequest');
    });

    // Check that POST routes have onRequest arrays
    const postCalls = postSpy.mock.calls;
    postCalls.forEach((call) => {
      expect(call[1]).toHaveProperty('onRequest');
    });
  });
});

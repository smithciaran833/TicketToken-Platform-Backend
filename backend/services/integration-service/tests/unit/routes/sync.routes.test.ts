// Mock controllers BEFORE imports
const mockTriggerSync = jest.fn();
const mockStopSync = jest.fn();
const mockGetSyncStatus = jest.fn();
const mockGetSyncHistory = jest.fn();
const mockRetryFailed = jest.fn();

jest.mock('../../../src/controllers/sync.controller', () => ({
  syncController: {
    triggerSync: mockTriggerSync,
    stopSync: mockStopSync,
    getSyncStatus: mockGetSyncStatus,
    getSyncHistory: mockGetSyncHistory,
    retryFailed: mockRetryFailed,
  },
}));

// Mock middleware
const mockAuthenticate = jest.fn();
const mockAuthorize = jest.fn();
const mockValidateFastify = jest.fn();

jest.mock('../../../src/middleware/auth.middleware', () => ({
  authenticate: mockAuthenticate,
  authorize: mockAuthorize,
}));

jest.mock('../../../src/middleware/validation.middleware', () => ({
  validateFastify: mockValidateFastify,
}));

// Mock validators
const mockQueueSyncSchema = { type: 'object' };
const mockGetSyncHistorySchema = { type: 'object' };
const mockRetrySyncSchema = { type: 'object' };
const mockOauthCallbackParamsSchema = { type: 'object' };

jest.mock('../../../src/validators/schemas', () => ({
  queueSyncSchema: mockQueueSyncSchema,
  getSyncHistorySchema: mockGetSyncHistorySchema,
  retrySyncSchema: mockRetrySyncSchema,
  oauthCallbackParamsSchema: mockOauthCallbackParamsSchema,
}));

import { FastifyInstance } from 'fastify';
import { syncRoutes } from '../../../src/routes/sync.routes';

describe('syncRoutes', () => {
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
    mockValidateFastify.mockReturnValue('validate-middleware');
  });

  it('should register authentication hook for all routes', async () => {
    await syncRoutes(mockFastify as FastifyInstance);

    expect(addHookSpy).toHaveBeenCalledWith('onRequest', mockAuthenticate);
  });

  describe('POST /:provider/sync', () => {
    it('should register POST /:provider/sync', async () => {
      await syncRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith(
        '/:provider/sync',
        expect.any(Object),
        mockTriggerSync
      );
    });

    it('should require admin authorization', async () => {
      await syncRoutes(mockFastify as FastifyInstance);

      const syncRoute = postSpy.mock.calls.find(
        (call) => call[0] === '/:provider/sync'
      );
      expect(syncRoute[1].onRequest).toContain('authorize-middleware');
      expect(mockAuthorize).toHaveBeenCalledWith('admin', 'venue_admin');
    });

    it('should validate params and body', async () => {
      await syncRoutes(mockFastify as FastifyInstance);

      expect(mockValidateFastify).toHaveBeenCalledWith({
        params: mockOauthCallbackParamsSchema,
        body: mockQueueSyncSchema,
      });
    });

    it('should include all middleware in correct order', async () => {
      await syncRoutes(mockFastify as FastifyInstance);

      const syncRoute = postSpy.mock.calls.find(
        (call) => call[0] === '/:provider/sync'
      );
      expect(syncRoute[1].onRequest).toEqual([
        mockAuthenticate,
        'authorize-middleware',
        'validate-middleware',
      ]);
    });
  });

  describe('POST /:provider/sync/stop', () => {
    it('should register POST /:provider/sync/stop', async () => {
      await syncRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith(
        '/:provider/sync/stop',
        expect.any(Object),
        mockStopSync
      );
    });

    it('should require admin authorization', async () => {
      await syncRoutes(mockFastify as FastifyInstance);

      const stopRoute = postSpy.mock.calls.find(
        (call) => call[0] === '/:provider/sync/stop'
      );
      expect(stopRoute[1].onRequest).toContain(mockAuthenticate);
      expect(stopRoute[1].onRequest).toContain('authorize-middleware');
    });

    it('should not include validation middleware', async () => {
      await syncRoutes(mockFastify as FastifyInstance);

      const stopRoute = postSpy.mock.calls.find(
        (call) => call[0] === '/:provider/sync/stop'
      );
      expect(stopRoute[1].onRequest).not.toContain('validate-middleware');
    });
  });

  describe('GET /:provider/sync/status', () => {
    it('should register GET /:provider/sync/status', async () => {
      await syncRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith(
        '/:provider/sync/status',
        expect.any(Object),
        mockGetSyncStatus
      );
    });

    it('should validate params', async () => {
      await syncRoutes(mockFastify as FastifyInstance);

      expect(mockValidateFastify).toHaveBeenCalledWith({
        params: mockOauthCallbackParamsSchema,
      });
    });

    it('should include validation middleware', async () => {
      await syncRoutes(mockFastify as FastifyInstance);

      const statusRoute = getSpy.mock.calls.find(
        (call) => call[0] === '/:provider/sync/status'
      );
      expect(statusRoute[1].onRequest).toContain('validate-middleware');
    });
  });

  describe('GET /:provider/sync/history', () => {
    it('should register GET /:provider/sync/history', async () => {
      await syncRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith(
        '/:provider/sync/history',
        expect.any(Object),
        mockGetSyncHistory
      );
    });

    it('should validate params and query', async () => {
      await syncRoutes(mockFastify as FastifyInstance);

      expect(mockValidateFastify).toHaveBeenCalledWith({
        params: mockOauthCallbackParamsSchema,
        query: mockGetSyncHistorySchema,
      });
    });
  });

  describe('POST /:provider/sync/retry', () => {
    it('should register POST /:provider/sync/retry', async () => {
      await syncRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith(
        '/:provider/sync/retry',
        expect.any(Object),
        mockRetryFailed
      );
    });

    it('should require admin authorization', async () => {
      await syncRoutes(mockFastify as FastifyInstance);

      const retryRoute = postSpy.mock.calls.find(
        (call) => call[0] === '/:provider/sync/retry'
      );
      expect(retryRoute[1].onRequest).toContain(mockAuthenticate);
      expect(retryRoute[1].onRequest).toContain('authorize-middleware');
    });

    it('should validate body', async () => {
      await syncRoutes(mockFastify as FastifyInstance);

      expect(mockValidateFastify).toHaveBeenCalledWith({
        body: mockRetrySyncSchema,
      });
    });
  });

  it('should register all 5 routes', async () => {
    await syncRoutes(mockFastify as FastifyInstance);

    expect(getSpy).toHaveBeenCalledTimes(2);
    expect(postSpy).toHaveBeenCalledTimes(3);
  });

  it('should call authorize with correct roles', async () => {
    await syncRoutes(mockFastify as FastifyInstance);

    expect(mockAuthorize).toHaveBeenCalledTimes(3);
    expect(mockAuthorize).toHaveBeenCalledWith('admin', 'venue_admin');
  });

  it('should use validateFastify for routes with validation', async () => {
    await syncRoutes(mockFastify as FastifyInstance);

    expect(mockValidateFastify).toHaveBeenCalledTimes(4);
  });

  it('should bind correct controller methods', async () => {
    await syncRoutes(mockFastify as FastifyInstance);

    expect(postSpy).toHaveBeenCalledWith(expect.any(String), expect.any(Object), expect.any(Function));
    expect(getSpy).toHaveBeenCalledWith(expect.any(String), expect.any(Object), expect.any(Function));
  });
});

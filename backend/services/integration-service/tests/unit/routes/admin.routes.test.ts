// Mock controllers BEFORE imports
const mockGetAllVenueIntegrations = jest.fn();
const mockGetHealthSummary = jest.fn();
const mockGetCostAnalysis = jest.fn();
const mockForceSync = jest.fn();
const mockClearQueue = jest.fn();
const mockProcessDeadLetter = jest.fn();
const mockRecoverStale = jest.fn();
const mockGetQueueMetrics = jest.fn();

jest.mock('../../../src/controllers/admin.controller', () => ({
  adminController: {
    getAllVenueIntegrations: mockGetAllVenueIntegrations,
    getHealthSummary: mockGetHealthSummary,
    getCostAnalysis: mockGetCostAnalysis,
    forceSync: mockForceSync,
    clearQueue: mockClearQueue,
    processDeadLetter: mockProcessDeadLetter,
    recoverStale: mockRecoverStale,
    getQueueMetrics: mockGetQueueMetrics,
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
import { adminRoutes } from '../../../src/routes/admin.routes';

describe('adminRoutes', () => {
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
    await adminRoutes(mockFastify as FastifyInstance);

    expect(addHookSpy).toHaveBeenCalledWith('onRequest', mockAuthenticate);
  });

  it('should register admin authorization hook for all routes', async () => {
    await adminRoutes(mockFastify as FastifyInstance);

    expect(mockAuthorize).toHaveBeenCalledWith('admin');
    expect(addHookSpy).toHaveBeenCalledWith('onRequest', 'authorize-middleware');
  });

  it('should register both hooks in correct order', async () => {
    await adminRoutes(mockFastify as FastifyInstance);

    expect(addHookSpy).toHaveBeenCalledTimes(2);
    expect(addHookSpy).toHaveBeenNthCalledWith(1, 'onRequest', mockAuthenticate);
    expect(addHookSpy).toHaveBeenNthCalledWith(2, 'onRequest', 'authorize-middleware');
  });

  describe('GET routes', () => {
    it('should register GET /all-venues', async () => {
      await adminRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/all-venues', mockGetAllVenueIntegrations);
    });

    it('should register GET /health-summary', async () => {
      await adminRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/health-summary', mockGetHealthSummary);
    });

    it('should register GET /costs', async () => {
      await adminRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/costs', mockGetCostAnalysis);
    });

    it('should register GET /queue-metrics', async () => {
      await adminRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/queue-metrics', mockGetQueueMetrics);
    });

    it('should register all GET routes', async () => {
      await adminRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledTimes(4);
    });
  });

  describe('POST routes', () => {
    it('should register POST /force-sync', async () => {
      await adminRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith('/force-sync', mockForceSync);
    });

    it('should register POST /clear-queue', async () => {
      await adminRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith('/clear-queue', mockClearQueue);
    });

    it('should register POST /process-dead-letter', async () => {
      await adminRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith('/process-dead-letter', mockProcessDeadLetter);
    });

    it('should register POST /recover-stale', async () => {
      await adminRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith('/recover-stale', mockRecoverStale);
    });

    it('should register all POST routes', async () => {
      await adminRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledTimes(4);
    });
  });

  it('should register all 8 routes total', async () => {
    await adminRoutes(mockFastify as FastifyInstance);

    const totalRoutes = getSpy.mock.calls.length + postSpy.mock.calls.length;
    expect(totalRoutes).toBe(8);
  });

  it('should bind correct controller methods to routes', async () => {
    await adminRoutes(mockFastify as FastifyInstance);

    expect(getSpy).toHaveBeenCalledWith(expect.any(String), expect.any(Function));
    expect(postSpy).toHaveBeenCalledWith(expect.any(String), expect.any(Function));
  });
});

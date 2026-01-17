// Mock controllers BEFORE imports
const mockGetMetrics = jest.fn();
const mockGetLatestMetrics = jest.fn();
const mockGetMetricsByService = jest.fn();
const mockPushMetrics = jest.fn();
const mockExportPrometheusMetrics = jest.fn();

jest.mock('../../../src/controllers/metrics.controller', () => ({
  metricsController: {
    getMetrics: mockGetMetrics,
    getLatestMetrics: mockGetLatestMetrics,
    getMetricsByService: mockGetMetricsByService,
    pushMetrics: mockPushMetrics,
    exportPrometheusMetrics: mockExportPrometheusMetrics,
  },
}));

// Mock middleware
const mockAuthenticate = jest.fn((req: any, reply: any, done: any) => done?.());
const mockAuthorize = jest.fn((roles: string[]) => (req: any, reply: any, done: any) => done?.());

jest.mock('../../../src/middleware/auth.middleware', () => ({
  authenticate: mockAuthenticate,
  authorize: mockAuthorize,
}));

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import metricsRoutes from '../../../src/routes/metrics.routes';

describe('metricsRoutes', () => {
  let mockServer: Partial<FastifyInstance>;
  let registeredRoutes: Map<string, any>;
  let getSpy: jest.Mock;
  let postSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    registeredRoutes = new Map();

    getSpy = jest.fn((path, options, handler) => {
      const actualHandler = handler || options;
      const actualOptions = handler ? options : {};
      registeredRoutes.set(`GET ${path}`, { handler: actualHandler, options: actualOptions });
    });

    postSpy = jest.fn((path, options, handler) => {
      const actualHandler = handler || options;
      const actualOptions = handler ? options : {};
      registeredRoutes.set(`POST ${path}`, { handler: actualHandler, options: actualOptions });
    });

    mockServer = {
      get: getSpy,
      post: postSpy,
    };
  });

  describe('authentication requirements', () => {
    it('should require authentication for GET /', async () => {
      await metricsRoutes(mockServer as FastifyInstance);

      const route = registeredRoutes.get('GET /');
      expect(route.options).toHaveProperty('preHandler', mockAuthenticate);
    });

    it('should require authentication for GET /latest', async () => {
      await metricsRoutes(mockServer as FastifyInstance);

      const route = registeredRoutes.get('GET /latest');
      expect(route.options).toHaveProperty('preHandler', mockAuthenticate);
    });

    it('should require authentication for GET /service/:service', async () => {
      await metricsRoutes(mockServer as FastifyInstance);

      const route = registeredRoutes.get('GET /service/:service');
      expect(route.options).toHaveProperty('preHandler', mockAuthenticate);
    });

    it('should require authentication AND authorization for POST /', async () => {
      await metricsRoutes(mockServer as FastifyInstance);

      const route = registeredRoutes.get('POST /');
      expect(route.options.preHandler).toEqual(
        expect.arrayContaining([mockAuthenticate, expect.any(Function)])
      );
    });

    it('should NOT require authentication for GET /export', async () => {
      await metricsRoutes(mockServer as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/export', mockExportPrometheusMetrics);
      const exportCall = getSpy.mock.calls.find(call => call[0] === '/export');
      expect(exportCall[1]).toBe(mockExportPrometheusMetrics);
    });
  });

  describe('authorization requirements', () => {
    it('should require admin or monitoring role for POST /', async () => {
      await metricsRoutes(mockServer as FastifyInstance);

      expect(mockAuthorize).toHaveBeenCalledWith('admin', 'monitoring');
    });
  });

  describe('handler functionality', () => {
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;
    let mockSend: jest.Mock;
    let mockCode: jest.Mock;

    beforeEach(() => {
      mockSend = jest.fn().mockReturnThis();
      mockCode = jest.fn().mockReturnValue({ send: mockSend });

      mockRequest = {
        params: {},
        query: {},
        body: {},
      };

      mockReply = {
        send: mockSend,
        code: mockCode,
      };
    });

    it('should call getMetrics controller for GET /', async () => {
      mockGetMetrics.mockResolvedValue({ metrics: [] });

      await metricsRoutes(mockServer as FastifyInstance);
      await mockGetMetrics(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockGetMetrics).toHaveBeenCalledWith(mockRequest, mockReply);
    });

    it('should call getLatestMetrics controller for GET /latest', async () => {
      mockGetLatestMetrics.mockResolvedValue({ latest: {} });

      await metricsRoutes(mockServer as FastifyInstance);
      await mockGetLatestMetrics(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockGetLatestMetrics).toHaveBeenCalledWith(mockRequest, mockReply);
    });

    it('should call getMetricsByService with service parameter', async () => {
      mockRequest.params = { service: 'auth-service' };
      mockGetMetricsByService.mockResolvedValue({ metrics: [] });

      await metricsRoutes(mockServer as FastifyInstance);
      await mockGetMetricsByService(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockGetMetricsByService).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { service: 'auth-service' }
        }),
        mockReply
      );
    });

    it('should call pushMetrics with body data', async () => {
      mockRequest.body = {
        service: 'payment-service',
        metric: 'transactions_per_second',
        value: 150,
      };
      mockPushMetrics.mockResolvedValue({ success: true });

      await metricsRoutes(mockServer as FastifyInstance);
      await mockPushMetrics(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockPushMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            service: 'payment-service',
            metric: 'transactions_per_second',
            value: 150,
          })
        }),
        mockReply
      );
    });

    it('should call exportPrometheusMetrics for GET /export', async () => {
      mockExportPrometheusMetrics.mockResolvedValue('# HELP metrics\n');

      await metricsRoutes(mockServer as FastifyInstance);
      await mockExportPrometheusMetrics(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockExportPrometheusMetrics).toHaveBeenCalledWith(mockRequest, mockReply);
    });
  });

  describe('error handling', () => {
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;

    beforeEach(() => {
      mockRequest = {
        params: {},
        query: {},
        body: {},
      };
      mockReply = {
        send: jest.fn(),
        code: jest.fn().mockReturnThis(),
      };
    });

    it('should propagate errors from getMetrics', async () => {
      const error = new Error('Database connection failed');
      mockGetMetrics.mockRejectedValue(error);

      await metricsRoutes(mockServer as FastifyInstance);

      await expect(
        mockGetMetrics(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Database connection failed');
    });

    it('should propagate errors from pushMetrics', async () => {
      const error = new Error('Invalid metric data');
      mockPushMetrics.mockRejectedValue(error);

      await metricsRoutes(mockServer as FastifyInstance);

      await expect(
        mockPushMetrics(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid metric data');
    });

    it('should propagate errors from exportPrometheusMetrics', async () => {
      const error = new Error('Export failed');
      mockExportPrometheusMetrics.mockRejectedValue(error);

      await metricsRoutes(mockServer as FastifyInstance);

      await expect(
        mockExportPrometheusMetrics(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Export failed');
    });
  });

  describe('route registration', () => {
    it('should register all 5 routes', async () => {
      await metricsRoutes(mockServer as FastifyInstance);

      expect(getSpy).toHaveBeenCalledTimes(4);
      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(registeredRoutes.size).toBe(5);
    });

    it('should register routes with correct paths', async () => {
      await metricsRoutes(mockServer as FastifyInstance);

      expect(registeredRoutes.has('GET /')).toBe(true);
      expect(registeredRoutes.has('GET /latest')).toBe(true);
      expect(registeredRoutes.has('GET /service/:service')).toBe(true);
      expect(registeredRoutes.has('POST /')).toBe(true);
      expect(registeredRoutes.has('GET /export')).toBe(true);
    });
  });
});

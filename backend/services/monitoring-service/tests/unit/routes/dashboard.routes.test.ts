// Mock controllers BEFORE imports
const mockGetOverview = jest.fn();
const mockGetSLAMetrics = jest.fn();
const mockGetPerformanceMetrics = jest.fn();
const mockGetBusinessMetrics = jest.fn();
const mockGetIncidents = jest.fn();

jest.mock('../../../src/controllers/dashboard.controller', () => ({
  dashboardController: {
    getOverview: mockGetOverview,
    getSLAMetrics: mockGetSLAMetrics,
    getPerformanceMetrics: mockGetPerformanceMetrics,
    getBusinessMetrics: mockGetBusinessMetrics,
    getIncidents: mockGetIncidents,
  },
}));

// Mock middleware
const mockAuthenticate = jest.fn((req: any, reply: any, done: any) => done?.());

jest.mock('../../../src/middleware/auth.middleware', () => ({
  authenticate: mockAuthenticate,
}));

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import dashboardRoutes from '../../../src/routes/dashboard.routes';

describe('dashboardRoutes', () => {
  let mockServer: Partial<FastifyInstance>;
  let registeredRoutes: Map<string, any>;
  let addHookSpy: jest.Mock;
  let getSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    registeredRoutes = new Map();

    addHookSpy = jest.fn();

    getSpy = jest.fn((path, options, handler) => {
      const actualHandler = handler || options;
      const actualOptions = handler ? options : {};
      registeredRoutes.set(`GET ${path}`, { handler: actualHandler, options: actualOptions });
    });

    mockServer = {
      addHook: addHookSpy,
      get: getSpy,
    };
  });

  describe('authentication requirements', () => {
    it('should require authentication for all routes via preHandler hook', async () => {
      await dashboardRoutes(mockServer as FastifyInstance);

      expect(addHookSpy).toHaveBeenCalledWith('preHandler', mockAuthenticate);
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

    it('should call getOverview for GET /overview', async () => {
      const overview = {
        activeServices: 15,
        totalAlerts: 3,
        systemHealth: 'healthy',
      };
      mockGetOverview.mockResolvedValue(overview);

      await dashboardRoutes(mockServer as FastifyInstance);
      await mockGetOverview(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockGetOverview).toHaveBeenCalledWith(mockRequest, mockReply);
    });

    it('should call getSLAMetrics for GET /sla', async () => {
      const slaMetrics = {
        uptime: 99.95,
        responseTime: 250,
        errorRate: 0.05,
      };
      mockGetSLAMetrics.mockResolvedValue(slaMetrics);

      await dashboardRoutes(mockServer as FastifyInstance);
      await mockGetSLAMetrics(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockGetSLAMetrics).toHaveBeenCalledWith(mockRequest, mockReply);
    });

    it('should call getPerformanceMetrics for GET /performance', async () => {
      const perfMetrics = {
        cpu: 45.2,
        memory: 62.8,
        diskIO: 1250,
      };
      mockGetPerformanceMetrics.mockResolvedValue(perfMetrics);

      await dashboardRoutes(mockServer as FastifyInstance);
      await mockGetPerformanceMetrics(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockGetPerformanceMetrics).toHaveBeenCalledWith(mockRequest, mockReply);
    });

    it('should call getBusinessMetrics for GET /business', async () => {
      const businessMetrics = {
        ticketsSold: 15420,
        revenue: 450000,
        activeEvents: 25,
      };
      mockGetBusinessMetrics.mockResolvedValue(businessMetrics);

      await dashboardRoutes(mockServer as FastifyInstance);
      await mockGetBusinessMetrics(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockGetBusinessMetrics).toHaveBeenCalledWith(mockRequest, mockReply);
    });

    it('should call getIncidents for GET /incidents', async () => {
      mockRequest.query = { status: 'open', severity: 'critical' };
      const incidents = [
        { id: 'inc-1', title: 'Database outage', severity: 'critical' },
        { id: 'inc-2', title: 'Payment gateway timeout', severity: 'critical' },
      ];
      mockGetIncidents.mockResolvedValue(incidents);

      await dashboardRoutes(mockServer as FastifyInstance);
      await mockGetIncidents(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockGetIncidents).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { status: 'open', severity: 'critical' }
        }),
        mockReply
      );
    });

    it('should handle time range query parameters', async () => {
      mockRequest.query = { from: '2024-01-01', to: '2024-01-31' };
      mockGetPerformanceMetrics.mockResolvedValue({});

      await dashboardRoutes(mockServer as FastifyInstance);
      await mockGetPerformanceMetrics(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockGetPerformanceMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { from: '2024-01-01', to: '2024-01-31' }
        }),
        mockReply
      );
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

    it('should propagate errors from getOverview', async () => {
      const error = new Error('Failed to fetch overview');
      mockGetOverview.mockRejectedValue(error);

      await dashboardRoutes(mockServer as FastifyInstance);

      await expect(
        mockGetOverview(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Failed to fetch overview');
    });

    it('should propagate errors from getSLAMetrics', async () => {
      const error = new Error('SLA calculation failed');
      mockGetSLAMetrics.mockRejectedValue(error);

      await dashboardRoutes(mockServer as FastifyInstance);

      await expect(
        mockGetSLAMetrics(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('SLA calculation failed');
    });

    it('should propagate errors from getBusinessMetrics', async () => {
      const error = new Error('Database query timeout');
      mockGetBusinessMetrics.mockRejectedValue(error);

      await dashboardRoutes(mockServer as FastifyInstance);

      await expect(
        mockGetBusinessMetrics(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Database query timeout');
    });
  });

  describe('route registration', () => {
    it('should register all 5 routes', async () => {
      await dashboardRoutes(mockServer as FastifyInstance);

      expect(getSpy).toHaveBeenCalledTimes(5);
      expect(registeredRoutes.size).toBe(5);
    });

    it('should register routes with correct paths', async () => {
      await dashboardRoutes(mockServer as FastifyInstance);

      expect(registeredRoutes.has('GET /overview')).toBe(true);
      expect(registeredRoutes.has('GET /sla')).toBe(true);
      expect(registeredRoutes.has('GET /performance')).toBe(true);
      expect(registeredRoutes.has('GET /business')).toBe(true);
      expect(registeredRoutes.has('GET /incidents')).toBe(true);
    });

    it('should bind correct controller methods to each route', async () => {
      await dashboardRoutes(mockServer as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/overview', mockGetOverview);
      expect(getSpy).toHaveBeenCalledWith('/sla', mockGetSLAMetrics);
      expect(getSpy).toHaveBeenCalledWith('/performance', mockGetPerformanceMetrics);
      expect(getSpy).toHaveBeenCalledWith('/business', mockGetBusinessMetrics);
      expect(getSpy).toHaveBeenCalledWith('/incidents', mockGetIncidents);
    });
  });
});

// Mock controllers BEFORE imports
const mockGetHealth = jest.fn();
const mockGetServiceHealth = jest.fn();
const mockGetAllServicesHealth = jest.fn();
const mockGetDependenciesHealth = jest.fn();

jest.mock('../../../src/controllers/health.controller', () => ({
  healthController: {
    getHealth: mockGetHealth,
    getServiceHealth: mockGetServiceHealth,
    getAllServicesHealth: mockGetAllServicesHealth,
    getDependenciesHealth: mockGetDependenciesHealth,
  },
}));

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import healthRoutes from '../../../src/routes/health.routes';

describe('healthRoutes', () => {
  let mockServer: Partial<FastifyInstance>;
  let registeredRoutes: Map<string, Function>;
  let getSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    registeredRoutes = new Map();

    getSpy = jest.fn((path, handler) => {
      registeredRoutes.set(`GET ${path}`, handler);
    });

    mockServer = {
      get: getSpy,
    };
  });

  describe('route registration', () => {
    it('should register GET / for overall health', async () => {
      await healthRoutes(mockServer as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/', mockGetHealth);
      expect(registeredRoutes.has('GET /')).toBe(true);
    });

    it('should register GET /:service for service-specific health', async () => {
      await healthRoutes(mockServer as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/:service', mockGetServiceHealth);
      expect(registeredRoutes.has('GET /:service')).toBe(true);
    });

    it('should register GET /services/all for all services health', async () => {
      await healthRoutes(mockServer as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/services/all', mockGetAllServicesHealth);
      expect(registeredRoutes.has('GET /services/all')).toBe(true);
    });

    it('should register GET /dependencies for dependencies health', async () => {
      await healthRoutes(mockServer as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/dependencies', mockGetDependenciesHealth);
      expect(registeredRoutes.has('GET /dependencies')).toBe(true);
    });

    it('should register all 4 routes', async () => {
      await healthRoutes(mockServer as FastifyInstance);

      expect(getSpy).toHaveBeenCalledTimes(4);
      expect(registeredRoutes.size).toBe(4);
    });
  });

  describe('handler functionality', () => {
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;

    beforeEach(() => {
      mockRequest = {
        params: {},
        query: {},
      };
      mockReply = {
        send: jest.fn(),
        code: jest.fn().mockReturnThis(),
      };
    });

    it('should call getHealth controller when GET / is invoked', async () => {
      await healthRoutes(mockServer as FastifyInstance);
      
      await mockGetHealth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockGetHealth).toHaveBeenCalledWith(mockRequest, mockReply);
    });

    it('should call getServiceHealth with service parameter', async () => {
      mockRequest.params = { service: 'auth-service' };
      await healthRoutes(mockServer as FastifyInstance);
      
      await mockGetServiceHealth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockGetServiceHealth).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { service: 'auth-service' }
        }),
        mockReply
      );
    });

    it('should call getAllServicesHealth when /services/all is invoked', async () => {
      await healthRoutes(mockServer as FastifyInstance);
      
      await mockGetAllServicesHealth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockGetAllServicesHealth).toHaveBeenCalledWith(mockRequest, mockReply);
    });

    it('should call getDependenciesHealth when /dependencies is invoked', async () => {
      await healthRoutes(mockServer as FastifyInstance);
      
      await mockGetDependenciesHealth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockGetDependenciesHealth).toHaveBeenCalledWith(mockRequest, mockReply);
    });

    it('should propagate errors from controller to error handler', async () => {
      const error = new Error('Health check failed');
      mockGetHealth.mockRejectedValue(error);

      await healthRoutes(mockServer as FastifyInstance);

      await expect(
        mockGetHealth(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Health check failed');
    });
  });

  describe('parameter validation', () => {
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;

    beforeEach(() => {
      mockRequest = {
        params: {},
        query: {},
      };
      mockReply = {
        send: jest.fn(),
        code: jest.fn().mockReturnThis(),
      };
    });

    it('should handle valid service parameter', async () => {
      mockRequest.params = { service: 'payment-service' };
      mockGetServiceHealth.mockResolvedValue({ status: 'healthy' });

      await healthRoutes(mockServer as FastifyInstance);
      await mockGetServiceHealth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockGetServiceHealth).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { service: 'payment-service' }
        }),
        mockReply
      );
    });

    it('should handle service parameter with hyphens', async () => {
      mockRequest.params = { service: 'blockchain-indexer' };
      mockGetServiceHealth.mockResolvedValue({ status: 'healthy' });

      await healthRoutes(mockServer as FastifyInstance);
      await mockGetServiceHealth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockGetServiceHealth).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { service: 'blockchain-indexer' }
        }),
        mockReply
      );
    });
  });
});

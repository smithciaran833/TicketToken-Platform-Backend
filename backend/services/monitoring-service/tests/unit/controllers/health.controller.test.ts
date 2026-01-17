// Mock dependencies BEFORE imports
const mockGetOverallHealth = jest.fn();
const mockGetServiceHealth = jest.fn();
const mockGetAllServicesHealth = jest.fn();
const mockGetDependenciesHealth = jest.fn();

jest.mock('../../../src/services/health.service', () => ({
  healthService: {
    getOverallHealth: mockGetOverallHealth,
    getServiceHealth: mockGetServiceHealth,
    getAllServicesHealth: mockGetAllServicesHealth,
    getDependenciesHealth: mockGetDependenciesHealth,
  },
}));

jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: { get: jest.fn(), set: jest.fn() },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import { healthController } from '../../../src/controllers/health.controller';

describe('HealthController', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = {
      params: {},
      query: {},
    };
    mockReply = {
      send: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis(),
    };
  });

  describe('getHealth', () => {
    it('should return 200 when system is healthy', async () => {
      const healthyResponse = {
        status: 'healthy',
        timestamp: '2024-01-15T10:00:00Z',
        uptime: 86400,
        services: { database: 'up', redis: 'up', kafka: 'up' },
      };
      mockGetOverallHealth.mockResolvedValue(healthyResponse);

      await healthController.getHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetOverallHealth).toHaveBeenCalledTimes(1);
      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(healthyResponse);
    });

    it('should return 503 when system is unhealthy', async () => {
      const unhealthyResponse = {
        status: 'unhealthy',
        timestamp: '2024-01-15T10:00:00Z',
        issues: ['Database connection failed'],
        services: { database: 'down', redis: 'up', kafka: 'up' },
      };
      mockGetOverallHealth.mockResolvedValue(unhealthyResponse);

      await healthController.getHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(unhealthyResponse);
    });

    it('should return 503 when system is degraded', async () => {
      const degradedResponse = {
        status: 'degraded',
        timestamp: '2024-01-15T10:00:00Z',
        issues: ['Redis latency high'],
      };
      mockGetOverallHealth.mockResolvedValue(degradedResponse);

      await healthController.getHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(503);
    });

    it('should return 500 on service error', async () => {
      mockGetOverallHealth.mockRejectedValue(new Error('Health check timeout'));

      await healthController.getHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    it('should handle unknown status as unhealthy (503)', async () => {
      const unknownStatusResponse = { status: 'unknown' };
      mockGetOverallHealth.mockResolvedValue(unknownStatusResponse);

      await healthController.getHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(503);
    });
  });

  describe('getServiceHealth', () => {
    it('should return 200 for healthy service', async () => {
      const healthyService = {
        status: 'healthy',
        service: 'payment-service',
        responseTime: 45,
        lastCheck: '2024-01-15T10:00:00Z',
      };
      mockRequest.params = { service: 'payment-service' };
      mockGetServiceHealth.mockResolvedValue(healthyService);

      await healthController.getServiceHealth(
        mockRequest as FastifyRequest<{ Params: { service: string } }>,
        mockReply as FastifyReply
      );

      expect(mockGetServiceHealth).toHaveBeenCalledWith('payment-service');
      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(healthyService);
    });

    it('should return 503 for unhealthy service', async () => {
      const unhealthyService = {
        status: 'unhealthy',
        service: 'auth-service',
        error: 'Connection refused',
        lastCheck: '2024-01-15T10:00:00Z',
      };
      mockRequest.params = { service: 'auth-service' };
      mockGetServiceHealth.mockResolvedValue(unhealthyService);

      await healthController.getServiceHealth(
        mockRequest as FastifyRequest<{ Params: { service: string } }>,
        mockReply as FastifyReply
      );

      expect(mockGetServiceHealth).toHaveBeenCalledWith('auth-service');
      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(unhealthyService);
    });

    it('should handle service names with hyphens', async () => {
      mockRequest.params = { service: 'blockchain-indexer' };
      mockGetServiceHealth.mockResolvedValue({ status: 'healthy', service: 'blockchain-indexer' });

      await healthController.getServiceHealth(
        mockRequest as FastifyRequest<{ Params: { service: string } }>,
        mockReply as FastifyReply
      );

      expect(mockGetServiceHealth).toHaveBeenCalledWith('blockchain-indexer');
    });

    it('should return 500 on service error', async () => {
      mockRequest.params = { service: 'unknown-service' };
      mockGetServiceHealth.mockRejectedValue(new Error('Service not found'));

      await healthController.getServiceHealth(
        mockRequest as FastifyRequest<{ Params: { service: string } }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('getAllServicesHealth', () => {
    it('should return health status for all services', async () => {
      const allServicesHealth = {
        timestamp: '2024-01-15T10:00:00Z',
        services: [
          { name: 'auth-service', status: 'healthy', responseTime: 30 },
          { name: 'payment-service', status: 'healthy', responseTime: 45 },
          { name: 'notification-service', status: 'degraded', responseTime: 250 },
        ],
        summary: { total: 3, healthy: 2, degraded: 1, unhealthy: 0 },
      };
      mockGetAllServicesHealth.mockResolvedValue(allServicesHealth);

      await healthController.getAllServicesHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetAllServicesHealth).toHaveBeenCalledTimes(1);
      expect(mockReply.send).toHaveBeenCalledWith(allServicesHealth);
    });

    it('should return empty services array when no services configured', async () => {
      const emptyServices = { services: [], summary: { total: 0 } };
      mockGetAllServicesHealth.mockResolvedValue(emptyServices);

      await healthController.getAllServicesHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith(emptyServices);
    });

    it('should return 500 on service error', async () => {
      mockGetAllServicesHealth.mockRejectedValue(new Error('Aggregation failed'));

      await healthController.getAllServicesHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('getDependenciesHealth', () => {
    it('should return health status for all dependencies', async () => {
      const dependenciesHealth = {
        timestamp: '2024-01-15T10:00:00Z',
        dependencies: {
          postgresql: { status: 'up', latency: 5, version: '14.2' },
          redis: { status: 'up', latency: 1, usedMemory: '512MB' },
          kafka: { status: 'up', brokers: 3, topics: 15 },
          elasticsearch: { status: 'up', clusterHealth: 'green' },
        },
      };
      mockGetDependenciesHealth.mockResolvedValue(dependenciesHealth);

      await healthController.getDependenciesHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetDependenciesHealth).toHaveBeenCalledTimes(1);
      expect(mockReply.send).toHaveBeenCalledWith(dependenciesHealth);
    });

    it('should return partial dependencies when some are down', async () => {
      const partialHealth = {
        dependencies: {
          postgresql: { status: 'up', latency: 5 },
          redis: { status: 'down', error: 'Connection refused' },
          kafka: { status: 'degraded', error: 'Broker 2 unreachable' },
        },
      };
      mockGetDependenciesHealth.mockResolvedValue(partialHealth);

      await healthController.getDependenciesHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith(partialHealth);
    });

    it('should return 500 on service error', async () => {
      mockGetDependenciesHealth.mockRejectedValue(new Error('Dependency check failed'));

      await healthController.getDependenciesHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });
});

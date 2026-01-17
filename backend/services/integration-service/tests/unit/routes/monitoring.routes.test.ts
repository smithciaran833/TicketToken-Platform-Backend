// Mock services BEFORE imports
const mockGetPerformanceSummary = jest.fn();
const mockGetSlowOperations = jest.fn();
const mockGetDLQStats = jest.fn();
const mockGetFailurePatterns = jest.fn();
const mockGetJobsNeedingAttention = jest.fn();
const mockGetIdempotencyStats = jest.fn();
const mockGetAllStats = jest.fn();
const mockGetOpenCount = jest.fn();
const mockHasOpenCircuits = jest.fn();
const mockGetCircuitBreaker = jest.fn();
const mockForceClose = jest.fn();

jest.mock('../../../src/services/performance-metrics.service', () => ({
  performanceMetricsService: {
    getPerformanceSummary: mockGetPerformanceSummary,
    getSlowOperations: mockGetSlowOperations,
  },
}));

jest.mock('../../../src/services/dead-letter-queue.service', () => ({
  deadLetterQueueService: {
    getStats: mockGetDLQStats,
    getFailurePatterns: mockGetFailurePatterns,
    getJobsNeedingAttention: mockGetJobsNeedingAttention,
  },
}));

jest.mock('../../../src/services/idempotency.service', () => ({
  idempotencyService: {
    getStats: mockGetIdempotencyStats,
  },
}));

jest.mock('../../../src/utils/circuit-breaker.util', () => ({
  circuitBreakerManager: {
    getAllStats: mockGetAllStats,
    getOpenCount: mockGetOpenCount,
    hasOpenCircuits: mockHasOpenCircuits,
    get: mockGetCircuitBreaker,
  },
}));

jest.mock('../../../src/services/health-check.service', () => ({
  healthCheckService: {},
}));

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { monitoringRoutes } from '../../../src/routes/monitoring.routes';

describe('monitoringRoutes', () => {
  let mockFastify: Partial<FastifyInstance>;
  let getSpy: jest.Mock;
  let postSpy: jest.Mock;
  let registeredRoutes: Map<string, Function>;

  beforeEach(() => {
    jest.clearAllMocks();

    registeredRoutes = new Map();

    getSpy = jest.fn((path, handler) => {
      registeredRoutes.set(`GET ${path}`, handler);
    });

    postSpy = jest.fn((path, handler) => {
      registeredRoutes.set(`POST ${path}`, handler);
    });

    mockFastify = {
      get: getSpy,
      post: postSpy,
    };

    // Default mock returns
    mockGetPerformanceSummary.mockReturnValue({ avgLatency: 100 });
    mockGetSlowOperations.mockReturnValue([]);
    mockGetDLQStats.mockReturnValue({ total: 0, recentFailures: 0 });
    mockGetFailurePatterns.mockReturnValue([]);
    mockGetJobsNeedingAttention.mockReturnValue([]);
    mockGetIdempotencyStats.mockReturnValue({ hits: 10, misses: 5 });
    mockGetAllStats.mockReturnValue({});
    mockGetOpenCount.mockReturnValue(0);
    mockHasOpenCircuits.mockReturnValue(false);
  });

  describe('route registration', () => {
    it('should register GET /monitoring/metrics', async () => {
      await monitoringRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/monitoring/metrics', expect.any(Function));
    });

    it('should register GET /monitoring/performance', async () => {
      await monitoringRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/monitoring/performance', expect.any(Function));
    });

    it('should register GET /monitoring/dlq', async () => {
      await monitoringRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/monitoring/dlq', expect.any(Function));
    });

    it('should register GET /monitoring/circuit-breakers', async () => {
      await monitoringRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/monitoring/circuit-breakers', expect.any(Function));
    });

    it('should register GET /monitoring/health/deep', async () => {
      await monitoringRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/monitoring/health/deep', expect.any(Function));
    });

    it('should register GET /monitoring/health/live', async () => {
      await monitoringRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/monitoring/health/live', expect.any(Function));
    });

    it('should register GET /monitoring/health/ready', async () => {
      await monitoringRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/monitoring/health/ready', expect.any(Function));
    });

    it('should register GET /monitoring/idempotency', async () => {
      await monitoringRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/monitoring/idempotency', expect.any(Function));
    });

    it('should register POST /monitoring/circuit-breakers/:name/reset', async () => {
      await monitoringRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith('/monitoring/circuit-breakers/:name/reset', expect.any(Function));
    });

    it('should register all 9 routes', async () => {
      await monitoringRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledTimes(8);
      expect(postSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /monitoring/metrics handler', () => {
    let handler: Function;
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;
    let mockSend: jest.Mock;
    let mockCode: jest.Mock;

    beforeEach(async () => {
      await monitoringRoutes(mockFastify as FastifyInstance);
      handler = registeredRoutes.get('GET /monitoring/metrics')!;

      mockSend = jest.fn().mockReturnThis();
      mockCode = jest.fn().mockReturnValue({ send: mockSend });

      mockReply = {
        send: mockSend,
        code: mockCode,
      };

      mockRequest = {};
    });

    it('should return 200 with metrics', async () => {
      await handler(mockRequest, mockReply);

      expect(mockCode).toHaveBeenCalledWith(200);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          metrics: expect.any(Object),
        })
      );
    });

    it('should include all metric types', async () => {
      await handler(mockRequest, mockReply);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          metrics: expect.objectContaining({
            performance: expect.any(Object),
            deadLetterQueue: expect.any(Object),
            idempotency: expect.any(Object),
            circuitBreakers: expect.any(Object),
            timestamp: expect.any(String),
          }),
        })
      );
    });

    it('should call all service methods', async () => {
      await handler(mockRequest, mockReply);

      expect(mockGetPerformanceSummary).toHaveBeenCalled();
      expect(mockGetDLQStats).toHaveBeenCalled();
      expect(mockGetIdempotencyStats).toHaveBeenCalled();
      expect(mockGetAllStats).toHaveBeenCalled();
    });

    it('should return 500 on error', async () => {
      mockGetPerformanceSummary.mockImplementation(() => {
        throw new Error('Service error');
      });

      await handler(mockRequest, mockReply);

      expect(mockCode).toHaveBeenCalledWith(500);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Failed to retrieve metrics',
        })
      );
    });
  });

  describe('GET /monitoring/performance handler', () => {
    let handler: Function;
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;
    let mockSend: jest.Mock;
    let mockCode: jest.Mock;

    beforeEach(async () => {
      await monitoringRoutes(mockFastify as FastifyInstance);
      handler = registeredRoutes.get('GET /monitoring/performance')!;

      mockSend = jest.fn().mockReturnThis();
      mockCode = jest.fn().mockReturnValue({ send: mockSend });

      mockReply = {
        send: mockSend,
        code: mockCode,
      };

      mockRequest = {};
    });

    it('should return 200 with performance data', async () => {
      await handler(mockRequest, mockReply);

      expect(mockCode).toHaveBeenCalledWith(200);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            summary: expect.any(Object),
            slowOperations: expect.any(Array),
          }),
        })
      );
    });

    it('should call performance service methods', async () => {
      await handler(mockRequest, mockReply);

      expect(mockGetPerformanceSummary).toHaveBeenCalled();
      expect(mockGetSlowOperations).toHaveBeenCalled();
    });

    it('should return 500 on error', async () => {
      mockGetPerformanceSummary.mockImplementation(() => {
        throw new Error('Service error');
      });

      await handler(mockRequest, mockReply);

      expect(mockCode).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /monitoring/dlq handler', () => {
    let handler: Function;
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;
    let mockSend: jest.Mock;
    let mockCode: jest.Mock;

    beforeEach(async () => {
      await monitoringRoutes(mockFastify as FastifyInstance);
      handler = registeredRoutes.get('GET /monitoring/dlq')!;

      mockSend = jest.fn().mockReturnThis();
      mockCode = jest.fn().mockReturnValue({ send: mockSend });

      mockReply = {
        send: mockSend,
        code: mockCode,
      };

      mockRequest = {};
      mockGetJobsNeedingAttention.mockReturnValue([{ id: 1 }, { id: 2 }]);
    });

    it('should return 200 with DLQ data', async () => {
      await handler(mockRequest, mockReply);

      expect(mockCode).toHaveBeenCalledWith(200);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            stats: expect.any(Object),
            failurePatterns: expect.any(Array),
            jobsNeedingAttention: 2,
          }),
        })
      );
    });

    it('should call DLQ service methods', async () => {
      await handler(mockRequest, mockReply);

      expect(mockGetDLQStats).toHaveBeenCalled();
      expect(mockGetFailurePatterns).toHaveBeenCalled();
      expect(mockGetJobsNeedingAttention).toHaveBeenCalled();
    });
  });

  describe('GET /monitoring/circuit-breakers handler', () => {
    let handler: Function;
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;
    let mockSend: jest.Mock;
    let mockCode: jest.Mock;

    beforeEach(async () => {
      await monitoringRoutes(mockFastify as FastifyInstance);
      handler = registeredRoutes.get('GET /monitoring/circuit-breakers')!;

      mockSend = jest.fn().mockReturnThis();
      mockCode = jest.fn().mockReturnValue({ send: mockSend });

      mockReply = {
        send: mockSend,
        code: mockCode,
      };

      mockRequest = {};
    });

    it('should return 200 with circuit breaker data', async () => {
      mockGetOpenCount.mockReturnValue(2);
      mockHasOpenCircuits.mockReturnValue(true);

      await handler(mockRequest, mockReply);

      expect(mockCode).toHaveBeenCalledWith(200);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            stats: expect.any(Object),
            openCount: 2,
            hasOpenCircuits: true,
          }),
        })
      );
    });

    it('should call circuit breaker manager methods', async () => {
      await handler(mockRequest, mockReply);

      expect(mockGetAllStats).toHaveBeenCalled();
      expect(mockGetOpenCount).toHaveBeenCalled();
      expect(mockHasOpenCircuits).toHaveBeenCalled();
    });
  });

  describe('GET /monitoring/health/deep handler', () => {
    let handler: Function;
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;
    let mockSend: jest.Mock;
    let mockCode: jest.Mock;

    beforeEach(async () => {
      await monitoringRoutes(mockFastify as FastifyInstance);
      handler = registeredRoutes.get('GET /monitoring/health/deep')!;

      mockSend = jest.fn().mockReturnThis();
      mockCode = jest.fn().mockReturnValue({ send: mockSend });

      mockReply = {
        send: mockSend,
        code: mockCode,
      };

      mockRequest = {};
    });

    it('should return 200 when healthy', async () => {
      mockHasOpenCircuits.mockReturnValue(false);
      mockGetDLQStats.mockReturnValue({ total: 5, recentFailures: 2 });

      await handler(mockRequest, mockReply);

      expect(mockCode).toHaveBeenCalledWith(200);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          status: 'healthy',
        })
      );
    });

    it('should return 503 when circuit breakers are open', async () => {
      mockHasOpenCircuits.mockReturnValue(true);
      mockGetDLQStats.mockReturnValue({ total: 5, recentFailures: 2 });

      await handler(mockRequest, mockReply);

      expect(mockCode).toHaveBeenCalledWith(503);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          status: 'degraded',
        })
      );
    });

    it('should return 503 when DLQ has too many failures', async () => {
      mockHasOpenCircuits.mockReturnValue(false);
      mockGetDLQStats.mockReturnValue({ total: 50, recentFailures: 15 });

      await handler(mockRequest, mockReply);

      expect(mockCode).toHaveBeenCalledWith(503);
    });

    it('should return 503 on error', async () => {
      mockHasOpenCircuits.mockImplementation(() => {
        throw new Error('Check failed');
      });

      await handler(mockRequest, mockReply);

      expect(mockCode).toHaveBeenCalledWith(503);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          status: 'unhealthy',
        })
      );
    });
  });

  describe('GET /monitoring/health/live handler', () => {
    let handler: Function;
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;
    let mockSend: jest.Mock;
    let mockCode: jest.Mock;

    beforeEach(async () => {
      await monitoringRoutes(mockFastify as FastifyInstance);
      handler = registeredRoutes.get('GET /monitoring/health/live')!;

      mockSend = jest.fn().mockReturnThis();
      mockCode = jest.fn().mockReturnValue({ send: mockSend });

      mockReply = {
        send: mockSend,
        code: mockCode,
      };

      mockRequest = {};
    });

    it('should return 200 with alive status', async () => {
      await handler(mockRequest, mockReply);

      expect(mockCode).toHaveBeenCalledWith(200);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'alive',
          timestamp: expect.any(String),
        })
      );
    });
  });

  describe('GET /monitoring/health/ready handler', () => {
    let handler: Function;
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;
    let mockSend: jest.Mock;
    let mockCode: jest.Mock;

    beforeEach(async () => {
      await monitoringRoutes(mockFastify as FastifyInstance);
      handler = registeredRoutes.get('GET /monitoring/health/ready')!;

      mockSend = jest.fn().mockReturnThis();
      mockCode = jest.fn().mockReturnValue({ send: mockSend });

      mockReply = {
        send: mockSend,
        code: mockCode,
      };

      mockRequest = {};
    });

    it('should return 200 when ready', async () => {
      mockHasOpenCircuits.mockReturnValue(false);

      await handler(mockRequest, mockReply);

      expect(mockCode).toHaveBeenCalledWith(200);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ready',
          timestamp: expect.any(String),
        })
      );
    });

    it('should return 503 when circuit breakers are open', async () => {
      mockHasOpenCircuits.mockReturnValue(true);

      await handler(mockRequest, mockReply);

      expect(mockCode).toHaveBeenCalledWith(503);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'not ready',
          reason: 'Circuit breakers open',
        })
      );
    });

    it('should return 503 on error', async () => {
      mockHasOpenCircuits.mockImplementation(() => {
        throw new Error('Check failed');
      });

      await handler(mockRequest, mockReply);

      expect(mockCode).toHaveBeenCalledWith(503);
    });
  });

  describe('POST /monitoring/circuit-breakers/:name/reset handler', () => {
    let handler: Function;
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;
    let mockSend: jest.Mock;
    let mockCode: jest.Mock;

    beforeEach(async () => {
      await monitoringRoutes(mockFastify as FastifyInstance);
      handler = registeredRoutes.get('POST /monitoring/circuit-breakers/:name/reset')!;

      mockSend = jest.fn().mockReturnThis();
      mockCode = jest.fn().mockReturnValue({ send: mockSend });

      mockReply = {
        send: mockSend,
        code: mockCode,
      };

      mockRequest = {
        params: { name: 'test-breaker' },
      };
    });

    it('should return 200 when breaker is reset', async () => {
      const mockBreaker = { forceClose: mockForceClose };
      mockGetCircuitBreaker.mockReturnValue(mockBreaker);

      await handler(mockRequest, mockReply);

      expect(mockCode).toHaveBeenCalledWith(200);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Circuit breaker 'test-breaker' has been reset",
        })
      );
      expect(mockForceClose).toHaveBeenCalled();
    });

    it('should return 404 when breaker not found', async () => {
      mockGetCircuitBreaker.mockReturnValue(null);

      await handler(mockRequest, mockReply);

      expect(mockCode).toHaveBeenCalledWith(404);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: "Circuit breaker 'test-breaker' not found",
        })
      );
    });

    it('should return 500 on error', async () => {
      const mockBreaker = {
        forceClose: jest.fn().mockImplementation(() => {
          throw new Error('Reset failed');
        }),
      };
      mockGetCircuitBreaker.mockReturnValue(mockBreaker);

      await handler(mockRequest, mockReply);

      expect(mockCode).toHaveBeenCalledWith(500);
    });
  });
});

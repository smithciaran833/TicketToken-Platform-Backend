// Mock dependencies BEFORE imports
const mockCheckDatabaseHealth = jest.fn();
const mockGetPoolStats = jest.fn();

jest.mock('../../../src/config/database', () => ({
  checkDatabaseHealth: mockCheckDatabaseHealth,
  getPoolStats: mockGetPoolStats,
}));

const mockGetRedisConfig = jest.fn();

jest.mock('../../../src/config/index', () => ({
  getRedisConfig: mockGetRedisConfig,
}));

// Mock process.memoryUsage to control memory check results
const mockMemoryUsage = jest.spyOn(process, 'memoryUsage');

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { healthRoutes } from '../../../src/routes/health.routes';

describe('healthRoutes', () => {
  let mockFastify: Partial<FastifyInstance>;
  let getSpy: jest.Mock;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSend = jest.fn().mockReturnThis();
    mockStatus = jest.fn().mockReturnValue({ send: mockSend });

    mockReply = {
      send: mockSend,
      status: mockStatus,
    };

    mockRequest = {};

    getSpy = jest.fn();

    mockFastify = {
      get: getSpy,
    };

    mockGetPoolStats.mockReturnValue({
      size: 10,
      pending: 0,
      idle: 5,
      used: 5,
    });

    mockCheckDatabaseHealth.mockResolvedValue(true);
    mockGetRedisConfig.mockReturnValue({ host: 'localhost', port: 6379 });

    // Mock healthy memory usage (50% heap)
    mockMemoryUsage.mockReturnValue({
      heapUsed: 50 * 1024 * 1024,
      heapTotal: 100 * 1024 * 1024,
      external: 10 * 1024 * 1024,
      rss: 150 * 1024 * 1024,
      arrayBuffers: 5 * 1024 * 1024,
    });
  });

  afterEach(() => {
    mockMemoryUsage.mockRestore();
  });

  describe('route registration', () => {
    it('should register GET /health/live', async () => {
      await healthRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith(
        '/health/live',
        expect.objectContaining({ schema: expect.any(Object) }),
        expect.any(Function)
      );
    });

    it('should register GET /health/ready', async () => {
      await healthRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith(
        '/health/ready',
        expect.objectContaining({ schema: expect.any(Object) }),
        expect.any(Function)
      );
    });

    it('should register GET /health/details', async () => {
      await healthRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith(
        '/health/details',
        expect.objectContaining({ schema: expect.any(Object) }),
        expect.any(Function)
      );
    });

    it('should register GET /health as alias', async () => {
      await healthRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith(
        '/health',
        expect.objectContaining({ schema: expect.any(Object) }),
        expect.any(Function)
      );
    });

    it('should register all 4 health routes', async () => {
      await healthRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledTimes(4);
    });

    it('should include schema for all routes', async () => {
      await healthRoutes(mockFastify as FastifyInstance);

      getSpy.mock.calls.forEach((call) => {
        expect(call[1]).toHaveProperty('schema');
      });
    });
  });

  describe('liveness handler', () => {
    let livenessHandler: Function;

    beforeEach(async () => {
      await healthRoutes(mockFastify as FastifyInstance);
      const liveCall = getSpy.mock.calls.find((call) => call[0] === '/health/live');
      livenessHandler = liveCall[2];
    });

    it('should return 200 status', async () => {
      await livenessHandler(mockRequest, mockReply);

      expect(mockStatus).toHaveBeenCalledWith(200);
    });

    it('should return healthy status', async () => {
      await livenessHandler(mockRequest, mockReply);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
        })
      );
    });

    it('should include service metadata', async () => {
      await livenessHandler(mockRequest, mockReply);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'integration-service',
          version: expect.any(String),
          timestamp: expect.any(String),
        })
      );
    });

    it('should include uptime', async () => {
      await livenessHandler(mockRequest, mockReply);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          uptime: expect.any(Number),
        })
      );
    });
  });

  describe('readiness handler', () => {
    let readinessHandler: Function;

    beforeEach(async () => {
      await healthRoutes(mockFastify as FastifyInstance);
      const readyCall = getSpy.mock.calls.find((call) => call[0] === '/health/ready');
      readinessHandler = readyCall[2];
    });

    it('should return 200 when all checks pass', async () => {
      mockCheckDatabaseHealth.mockResolvedValue(true);
      mockGetRedisConfig.mockReturnValue({ host: 'localhost' });

      await readinessHandler(mockRequest, mockReply);

      expect(mockStatus).toHaveBeenCalledWith(200);
    });

    it('should return healthy status when all checks pass', async () => {
      mockCheckDatabaseHealth.mockResolvedValue(true);

      await readinessHandler(mockRequest, mockReply);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          status: expect.stringMatching(/healthy|degraded/),
        })
      );
    });

    it('should include health checks', async () => {
      await readinessHandler(mockRequest, mockReply);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          checks: expect.objectContaining({
            database: expect.any(Object),
            redis: expect.any(Object),
            memory: expect.any(Object),
          }),
        })
      );
    });

    it('should return 503 when database check fails', async () => {
      mockCheckDatabaseHealth.mockResolvedValue(false);

      await readinessHandler(mockRequest, mockReply);

      expect(mockStatus).toHaveBeenCalledWith(503);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'unhealthy',
        })
      );
    });

    it('should return degraded when checks have warnings', async () => {
      mockCheckDatabaseHealth.mockResolvedValue(true);
      mockGetPoolStats.mockReturnValue({
        size: 10,
        pending: 9,
        idle: 1,
        used: 9,
      });

      await readinessHandler(mockRequest, mockReply);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'degraded',
        })
      );
    });

    it('should check database health', async () => {
      await readinessHandler(mockRequest, mockReply);

      expect(mockCheckDatabaseHealth).toHaveBeenCalled();
    });

    it('should check redis config', async () => {
      await readinessHandler(mockRequest, mockReply);

      expect(mockGetRedisConfig).toHaveBeenCalled();
    });

    it('should include timestamp', async () => {
      await readinessHandler(mockRequest, mockReply);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(String),
        })
      );
    });
  });

  describe('detailed health handler', () => {
    let detailedHandler: Function;

    beforeEach(async () => {
      await healthRoutes(mockFastify as FastifyInstance);
      const detailsCall = getSpy.mock.calls.find((call) => call[0] === '/health/details');
      detailedHandler = detailsCall[2];
    });

    it('should return 200 status', async () => {
      await detailedHandler(mockRequest, mockReply);

      expect(mockStatus).toHaveBeenCalledWith(200);
    });

    it('should include memory usage', async () => {
      await detailedHandler(mockRequest, mockReply);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          memory: expect.objectContaining({
            heapUsed: expect.any(Number),
            heapTotal: expect.any(Number),
            external: expect.any(Number),
            rss: expect.any(Number),
          }),
        })
      );
    });

    it('should include node information', async () => {
      await detailedHandler(mockRequest, mockReply);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          node: expect.objectContaining({
            version: expect.any(String),
            platform: expect.any(String),
            arch: expect.any(String),
          }),
        })
      );
    });

    it('should include database pool stats', async () => {
      await detailedHandler(mockRequest, mockReply);

      expect(mockGetPoolStats).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          database: expect.objectContaining({
            poolStats: expect.any(Object),
          }),
        })
      );
    });

    it('should include environment', async () => {
      await detailedHandler(mockRequest, mockReply);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: expect.any(String),
        })
      );
    });

    it('should include service metadata', async () => {
      await detailedHandler(mockRequest, mockReply);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          service: 'integration-service',
          version: expect.any(String),
          uptime: expect.any(Number),
        })
      );
    });
  });

  describe('health alias', () => {
    it('should use same handler as liveness', async () => {
      await healthRoutes(mockFastify as FastifyInstance);

      const liveCall = getSpy.mock.calls.find((call) => call[0] === '/health/live');
      const healthCall = getSpy.mock.calls.find((call) => call[0] === '/health');

      expect(liveCall[2]).toBe(healthCall[2]);
    });

    it('should hide schema for alias route', async () => {
      await healthRoutes(mockFastify as FastifyInstance);

      const healthCall = getSpy.mock.calls.find((call) => call[0] === '/health');
      expect(healthCall[1].schema).toHaveProperty('hide', true);
    });
  });
});

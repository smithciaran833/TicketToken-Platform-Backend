// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/routes/health.routes.ts
 */

jest.mock('../../../src/config/database');

describe('src/routes/health.routes.ts - Comprehensive Unit Tests', () => {
  let healthRoutes: any;
  let getPool: any;
  let mockFastify: any;
  let mockRequest: any;
  let mockReply: any;
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock pool
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
    };

    // Import mocked modules
    ({ getPool } = require('../../../src/config/database'));
    getPool.mockReturnValue(mockPool);

    // Mock Fastify instance
    const routes: Map<string, any> = new Map();
    mockFastify = {
      get: jest.fn((path, handler) => {
        routes.set(path, handler);
      }),
      _routes: routes,
    };

    // Mock request
    mockRequest = {
      headers: {},
      url: '/health',
    };

    // Mock reply
    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    // Import module under test
    healthRoutes = require('../../../src/routes/health.routes').default;
  });

  // =============================================================================
  // Route Registration
  // =============================================================================

  describe('Route Registration', () => {
    it('should register GET /health route', async () => {
      await healthRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledWith('/health', expect.any(Function));
    });

    it('should register GET /health/db route', async () => {
      await healthRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledWith('/health/db', expect.any(Function));
    });

    it('should register exactly 2 routes', async () => {
      await healthRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledTimes(2);
    });
  });

  // =============================================================================
  // GET /health
  // =============================================================================

  describe('GET /health', () => {
    it('should return status ok', async () => {
      await healthRoutes(mockFastify);
      const handler = mockFastify._routes.get('/health');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'ok',
        service: 'scanning-service',
      });
    });

    it('should not call database', async () => {
      await healthRoutes(mockFastify);
      const handler = mockFastify._routes.get('/health');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should always return 200 status', async () => {
      await healthRoutes(mockFastify);
      const handler = mockFastify._routes.get('/health');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled(); // Default 200
    });

    it('should return consistent response structure', async () => {
      await healthRoutes(mockFastify);
      const handler = mockFastify._routes.get('/health');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: expect.any(String),
          service: expect.any(String),
        })
      );
    });
  });

  // =============================================================================
  // GET /health/db - Success Cases
  // =============================================================================

  describe('GET /health/db - Success Cases', () => {
    it('should return status ok when database connected', async () => {
      await healthRoutes(mockFastify);
      const handler = mockFastify._routes.get('/health/db');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'ok',
        database: 'connected',
        service: 'scanning-service',
      });
    });

    it('should execute database query', async () => {
      await healthRoutes(mockFastify);
      const handler = mockFastify._routes.get('/health/db');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should get database pool', async () => {
      await healthRoutes(mockFastify);
      const handler = mockFastify._routes.get('/health/db');

      await handler(mockRequest, mockReply);

      expect(getPool).toHaveBeenCalled();
    });

    it('should not call status method on success', async () => {
      await healthRoutes(mockFastify);
      const handler = mockFastify._routes.get('/health/db');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled(); // Default 200
    });

    it('should return consistent success structure', async () => {
      await healthRoutes(mockFastify);
      const handler = mockFastify._routes.get('/health/db');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ok',
          database: 'connected',
          service: 'scanning-service',
        })
      );
    });
  });

  // =============================================================================
  // GET /health/db - Error Cases
  // =============================================================================

  describe('GET /health/db - Error Cases', () => {
    it('should return 503 when database query fails', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection failed'));

      await healthRoutes(mockFastify);
      const handler = mockFastify._routes.get('/health/db');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
    });

    it('should return error status when database disconnected', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection timeout'));

      await healthRoutes(mockFastify);
      const handler = mockFastify._routes.get('/health/db');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'error',
        database: 'disconnected',
        error: 'Connection timeout',
        service: 'scanning-service',
      });
    });

    it('should include error message in response', async () => {
      const dbError = new Error('Database is down');
      mockPool.query.mockRejectedValue(dbError);

      await healthRoutes(mockFastify);
      const handler = mockFastify._routes.get('/health/db');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Database is down',
        })
      );
    });

    it('should handle connection refused error', async () => {
      mockPool.query.mockRejectedValue(new Error('ECONNREFUSED'));

      await healthRoutes(mockFastify);
      const handler = mockFastify._routes.get('/health/db');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          database: 'disconnected',
          error: 'ECONNREFUSED',
        })
      );
    });

    it('should handle timeout error', async () => {
      mockPool.query.mockRejectedValue(new Error('Query timeout'));

      await healthRoutes(mockFastify);
      const handler = mockFastify._routes.get('/health/db');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Query timeout',
        })
      );
    });

    it('should handle pool connection error', async () => {
      mockPool.query.mockRejectedValue(new Error('Pool exhausted'));

      await healthRoutes(mockFastify);
      const handler = mockFastify._routes.get('/health/db');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error: 'Pool exhausted',
        })
      );
    });

    it('should return consistent error structure', async () => {
      mockPool.query.mockRejectedValue(new Error('Test error'));

      await healthRoutes(mockFastify);
      const handler = mockFastify._routes.get('/health/db');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          database: 'disconnected',
          error: expect.any(String),
          service: 'scanning-service',
        })
      );
    });
  });

  // =============================================================================
  // Integration Tests
  // =============================================================================

  describe('Integration Tests', () => {
    it('should handle both routes independently', async () => {
      await healthRoutes(mockFastify);

      const basicHandler = mockFastify._routes.get('/health');
      const dbHandler = mockFastify._routes.get('/health/db');

      await basicHandler(mockRequest, mockReply);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ok' })
      );

      mockReply.send.mockClear();

      await dbHandler(mockRequest, mockReply);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ database: 'connected' })
      );
    });

    it('should have consistent service name across routes', async () => {
      await healthRoutes(mockFastify);

      const basicHandler = mockFastify._routes.get('/health');
      const dbHandler = mockFastify._routes.get('/health/db');

      await basicHandler(mockRequest, mockReply);
      const basicResponse = mockReply.send.mock.calls[0][0];

      mockReply.send.mockClear();

      await dbHandler(mockRequest, mockReply);
      const dbResponse = mockReply.send.mock.calls[0][0];

      expect(basicResponse.service).toBe('scanning-service');
      expect(dbResponse.service).toBe('scanning-service');
    });

    it('should not affect basic health when database fails', async () => {
      mockPool.query.mockRejectedValue(new Error('DB down'));

      await healthRoutes(mockFastify);

      const basicHandler = mockFastify._routes.get('/health');
      await basicHandler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'ok',
        service: 'scanning-service',
      });
    });
  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle non-Error objects thrown', async () => {
      mockPool.query.mockRejectedValue('String error');

      await healthRoutes(mockFastify);
      const handler = mockFastify._routes.get('/health/db');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
    });

    it('should handle null error', async () => {
      mockPool.query.mockRejectedValue(null);

      await healthRoutes(mockFastify);
      const handler = mockFastify._routes.get('/health/db');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
    });

    it('should handle undefined pool', async () => {
      getPool.mockReturnValue(undefined);

      await healthRoutes(mockFastify);
      const handler = mockFastify._routes.get('/health/db');

      await expect(handler(mockRequest, mockReply)).rejects.toThrow();
    });

    it('should handle slow database query', async () => {
      mockPool.query.mockImplementation(() => 
        new Promise((resolve) => setTimeout(() => resolve({ rows: [] }), 100))
      );

      await healthRoutes(mockFastify);
      const handler = mockFastify._routes.get('/health/db');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ database: 'connected' })
      );
    });
  });
});

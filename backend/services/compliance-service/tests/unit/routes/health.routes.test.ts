/**
 * Unit Tests for Health Routes
 *
 * Tests health check endpoints: /health/live, /health/ready, /health, /ready, /health/deep
 * Validates event loop monitoring, dependency checks, and shutdown handling
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createMockRequest, createMockReply } from '../../setup';

// =============================================================================
// MOCKS
// =============================================================================

const mockDbQuery = jest.fn();
jest.mock('../../../src/services/database.service', () => ({
  db: {
    query: mockDbQuery
  }
}));

const mockRedisClient = {
  ping: jest.fn()
};
const mockRedis = {
  getClient: jest.fn(() => mockRedisClient)
};
jest.mock('../../../src/services/redis.service', () => ({
  redis: mockRedis
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};
jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger
}));

// =============================================================================
// MOCK FASTIFY INSTANCE
// =============================================================================

function createMockFastify() {
  const routes: Record<string, Function> = {};

  return {
    post: jest.fn((path: string, opts: any, handler?: Function) => {
      routes[`POST:${path}`] = handler || opts;
    }),
    get: jest.fn((path: string, opts: any, handler?: Function) => {
      routes[`GET:${path}`] = handler || opts;
    }),
    routes,
    getHandler: (method: string, path: string) => routes[`${method}:${path}`]
  };
}

// =============================================================================
// IMPORT AND SETUP
// =============================================================================

import { healthRoutes, setShuttingDown } from '../../../src/routes/health.routes';

// =============================================================================
// TESTS
// =============================================================================

describe('Health Routes', () => {
  let mockFastify: ReturnType<typeof createMockFastify>;
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFastify = createMockFastify();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
    mockDbQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    mockRedisClient.ping.mockResolvedValue('PONG');
    mockRedis.getClient.mockReturnValue(mockRedisClient);
    setShuttingDown(false);

    // Register routes
    await healthRoutes(mockFastify as any);
  });

  afterEach(() => {
    setShuttingDown(false);
  });

  // ===========================================================================
  // Route Registration Tests
  // ===========================================================================

  describe('route registration', () => {
    it('should register GET /health/live', async () => {
      expect(mockFastify.get).toHaveBeenCalledWith('/health/live', expect.any(Function));
    });

    it('should register GET /health/ready', async () => {
      expect(mockFastify.get).toHaveBeenCalledWith('/health/ready', expect.any(Function));
    });

    it('should register GET /health', async () => {
      expect(mockFastify.get).toHaveBeenCalledWith('/health', expect.any(Function));
    });

    it('should register GET /ready', async () => {
      expect(mockFastify.get).toHaveBeenCalledWith('/ready', expect.any(Function));
    });

    it('should register GET /health/deep', async () => {
      expect(mockFastify.get).toHaveBeenCalledWith('/health/deep', expect.any(Function));
    });
  });

  // ===========================================================================
  // setShuttingDown Tests
  // ===========================================================================

  describe('setShuttingDown', () => {
    it('should be a function', () => {
      expect(typeof setShuttingDown).toBe('function');
    });

    it('should affect liveness check when set to true', async () => {
      setShuttingDown(true);
      const handler = mockFastify.getHandler('GET', '/health/live');

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'shutting_down',
        message: 'Service is shutting down'
      });
    });
  });

  // ===========================================================================
  // GET /health/live Tests (Kubernetes Liveness Probe)
  // ===========================================================================

  describe('GET /health/live', () => {
    let handler: Function;

    beforeEach(() => {
      handler = mockFastify.getHandler('GET', '/health/live');
    });

    describe('when service is healthy', () => {
      it('should return alive status', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'alive'
          })
        );
      });

      it('should include eventLoopLag', async () => {
        await handler(mockRequest, mockReply);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.eventLoopLag).toBeDefined();
        expect(typeof response.eventLoopLag).toBe('number');
      });

      it('should include uptime', async () => {
        await handler(mockRequest, mockReply);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.uptime).toBeDefined();
        expect(typeof response.uptime).toBe('number');
        expect(response.uptime).toBeGreaterThanOrEqual(0);
      });

      it('should include timestamp in ISO format', async () => {
        await handler(mockRequest, mockReply);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });

      it('should not set error status code', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.code).not.toHaveBeenCalled();
      });
    });

    describe('when service is shutting down', () => {
      beforeEach(() => {
        setShuttingDown(true);
      });

      it('should return 503 status', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(503);
      });

      it('should return shutting_down status', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith({
          status: 'shutting_down',
          message: 'Service is shutting down'
        });
      });
    });
  });

  // ===========================================================================
  // GET /health/ready Tests (Kubernetes Readiness Probe)
  // ===========================================================================

  describe('GET /health/ready', () => {
    let handler: Function;

    beforeEach(() => {
      handler = mockFastify.getHandler('GET', '/health/ready');
    });

    describe('when all dependencies are healthy', () => {
      beforeEach(() => {
        mockDbQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
        mockRedisClient.ping.mockResolvedValue('PONG');
      });

      it('should return 200 status', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(200);
      });

      it('should return ready status', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'ready',
            ready: true
          })
        );
      });

      it('should include checks object with all ok', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            checks: expect.objectContaining({
              database: 'ok',
              redis: 'ok'
            })
          })
        );
      });

      it('should include latency information', async () => {
        await handler(mockRequest, mockReply);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.latency).toBeDefined();
        expect(response.latency.database).toBeDefined();
        expect(response.latency.redis).toBeDefined();
      });

      it('should include timestamp', async () => {
        await handler(mockRequest, mockReply);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });
    });

    describe('when database is down', () => {
      beforeEach(() => {
        mockDbQuery.mockRejectedValue(new Error('Connection refused'));
        mockRedisClient.ping.mockResolvedValue('PONG');
      });

      it('should return 503 status', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(503);
      });

      it('should return not_ready status', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'not_ready',
            ready: false
          })
        );
      });

      it('should show database check as fail', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            checks: expect.objectContaining({
              database: 'fail'
            })
          })
        );
      });
    });

    describe('when redis is down', () => {
      beforeEach(() => {
        mockDbQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
        mockRedisClient.ping.mockRejectedValue(new Error('Connection refused'));
      });

      it('should return 503 status', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(503);
      });

      it('should show redis check as fail', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            checks: expect.objectContaining({
              redis: 'fail'
            })
          })
        );
      });
    });

    describe('when redis client is null', () => {
      beforeEach(() => {
        mockRedis.getClient.mockReturnValue(null);
      });

      it('should show redis check as fail', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            checks: expect.objectContaining({
              redis: 'fail'
            })
          })
        );
      });
    });

    describe('when service is shutting down', () => {
      beforeEach(() => {
        setShuttingDown(true);
      });

      it('should return 503 status', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(503);
      });

      it('should return shutting_down status', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith({
          status: 'shutting_down',
          ready: false
        });
      });
    });
  });

  // ===========================================================================
  // GET /health Tests (Legacy Simple Health)
  // ===========================================================================

  describe('GET /health', () => {
    let handler: Function;

    beforeEach(() => {
      handler = mockFastify.getHandler('GET', '/health');
    });

    it('should return healthy status', async () => {
      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          service: 'compliance-service'
        })
      );
    });

    it('should include version', async () => {
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.version).toBeDefined();
    });

    it('should include uptime', async () => {
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.uptime).toBeDefined();
      expect(typeof response.uptime).toBe('number');
    });

    it('should include timestamp', async () => {
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  // ===========================================================================
  // GET /ready Tests (Legacy Readiness)
  // ===========================================================================

  describe('GET /ready', () => {
    let handler: Function;

    beforeEach(() => {
      handler = mockFastify.getHandler('GET', '/ready');
    });

    describe('when all dependencies are healthy', () => {
      beforeEach(() => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // DB check
          .mockResolvedValue({ rows: [{ count: '100', last_update: new Date() }] }); // OFAC check
        mockRedisClient.ping.mockResolvedValue('PONG');
      });

      it('should return 200 status', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(200);
      });

      it('should return ready: true', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            ready: true
          })
        );
      });

      it('should include checks object', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            checks: expect.objectContaining({
              database: true,
              redis: true
            })
          })
        );
      });
    });

    describe('when database is down', () => {
      beforeEach(() => {
        mockDbQuery.mockRejectedValue(new Error('Connection refused'));
      });

      it('should return 503 status', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(503);
      });

      it('should return ready: false', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            ready: false
          })
        );
      });
    });

    describe('OFAC data check', () => {
      beforeEach(() => {
        mockDbQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // DB check
        mockRedisClient.ping.mockResolvedValue('PONG');
      });

      it('should check ofac_sdn_list table', async () => {
        mockDbQuery.mockResolvedValue({ rows: [{ count: '100' }] });

        await handler(mockRequest, mockReply);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('ofac_sdn_list')
        );
      });

      it('should set ofacData to true when records exist', async () => {
        mockDbQuery.mockResolvedValue({ rows: [{ count: '100' }] });

        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            checks: expect.objectContaining({
              ofacData: true
            })
          })
        );
      });

      it('should set ofacData to false when no records', async () => {
        mockDbQuery.mockResolvedValue({ rows: [{ count: '0' }] });

        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            checks: expect.objectContaining({
              ofacData: false
            })
          })
        );
      });
    });
  });

  // ===========================================================================
  // GET /health/deep Tests (Comprehensive Health)
  // ===========================================================================

  describe('GET /health/deep', () => {
    let handler: Function;

    beforeEach(() => {
      handler = mockFastify.getHandler('GET', '/health/deep');
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // DB check
        .mockResolvedValue({ rows: [{ count: '100' }] }); // OFAC check
    });

    describe('when all checks pass', () => {
      it('should return 200 status', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(200);
      });

      it('should return healthy status', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'healthy'
          })
        );
      });

      it('should include service info', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            service: 'compliance-service'
          })
        );
      });

      it('should include node version', async () => {
        await handler(mockRequest, mockReply);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.node).toBeDefined();
        expect(response.node).toMatch(/^v\d+/);
      });

      it('should include memory usage', async () => {
        await handler(mockRequest, mockReply);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.memory).toBeDefined();
        expect(response.memory.heapUsed).toBeDefined();
        expect(response.memory.heapTotal).toBeDefined();
        expect(response.memory.rss).toBeDefined();
      });

      it('should include detailed checks', async () => {
        await handler(mockRequest, mockReply);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.checks.database).toBeDefined();
        expect(response.checks.database.status).toBe('healthy');
        expect(response.checks.redis).toBeDefined();
        expect(response.checks.eventLoop).toBeDefined();
        expect(response.checks.ofacData).toBeDefined();
      });

      it('should include latency for database', async () => {
        await handler(mockRequest, mockReply);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.checks.database.latencyMs).toBeDefined();
        expect(typeof response.checks.database.latencyMs).toBe('number');
      });

      it('should include totalCheckTimeMs', async () => {
        await handler(mockRequest, mockReply);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.totalCheckTimeMs).toBeDefined();
        expect(typeof response.totalCheckTimeMs).toBe('number');
      });
    });

    describe('when database is unhealthy', () => {
      beforeEach(() => {
        mockDbQuery.mockReset();
        mockDbQuery.mockRejectedValue(new Error('DB error'));
      });

      it('should return 503 status', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(503);
      });

      it('should return unhealthy status', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'unhealthy'
          })
        );
      });

      it('should show database check as unhealthy', async () => {
        await handler(mockRequest, mockReply);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.checks.database.status).toBe('unhealthy');
      });
    });

    describe('OFAC data status', () => {
      it('should show healthy when OFAC records exist', async () => {
        mockDbQuery.mockReset();
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
          .mockResolvedValueOnce({ rows: [{ count: '1000' }] });

        await handler(mockRequest, mockReply);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.checks.ofacData.status).toBe('healthy');
        expect(response.checks.ofacData.records).toBe(1000);
      });

      it('should show warning when no OFAC records', async () => {
        mockDbQuery.mockReset();
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
          .mockResolvedValueOnce({ rows: [{ count: '0' }] });

        await handler(mockRequest, mockReply);

        const response = (mockReply.send as jest.Mock).mock.calls[0][0];
        expect(response.checks.ofacData.status).toBe('warning');
        expect(response.checks.ofacData.records).toBe(0);
      });
    });
  });
});

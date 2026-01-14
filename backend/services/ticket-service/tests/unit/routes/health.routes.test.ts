import { FastifyInstance } from 'fastify';

// Mock dependencies
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    isHealthy: jest.fn().mockResolvedValue(true),
    initialize: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../../src/services/redisService', () => ({
  RedisService: {
    isHealthy: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../../../src/services/queueService', () => ({
  QueueService: {
    isConnected: jest.fn().mockReturnValue(true),
  },
}));

jest.mock('../../../src/middleware/auth', () => ({
  authMiddleware: jest.fn((req, reply, done) => done ? done() : Promise.resolve()),
  requireRole: jest.fn(() => (req: any, reply: any, done: any) => done ? done() : Promise.resolve()),
}));

jest.mock('../../../src/utils/metrics', () => ({
  metricsHandler: jest.fn((req, reply) => reply.send('metrics')),
}));

jest.mock('../../../src/utils/resilience', () => ({
  degradedService: {
    getOverallStatus: jest.fn().mockReturnValue({}),
  },
  CircuitBreaker: jest.fn(),
}));

jest.mock('../../../src/config', () => ({
  config: {
    database: { statementTimeout: 5000 },
    env: 'test',
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

jest.mock('../../../src/middleware/errorHandler', () => ({
  getErrorSummary: jest.fn().mockReturnValue({ totalErrors: 0 }),
}));

import healthRoutes, {
  registerCircuitBreaker,
  startEventLoopMonitoring,
  stopEventLoopMonitoring,
  getEventLoopMetrics,
} from '../../../src/routes/health.routes';
import { DatabaseService } from '../../../src/services/databaseService';
import { RedisService } from '../../../src/services/redisService';

describe('Health Routes', () => {
  let mockFastify: Partial<FastifyInstance>;
  let routes: Record<string, { handler: Function; preHandler?: any[] }>;

  beforeEach(() => {
    jest.clearAllMocks();
    routes = {};

    mockFastify = {
      get: jest.fn((path, opts, handler) => {
        const h = handler || opts;
        routes[`GET ${path}`] = { handler: h, preHandler: opts?.preHandler };
      }),
      post: jest.fn((path, opts, handler) => {
        const h = handler || opts;
        routes[`POST ${path}`] = { handler: h, preHandler: opts?.preHandler };
      }),
    };
  });

  afterEach(() => {
    stopEventLoopMonitoring();
  });

  it('should register all health routes', async () => {
    await healthRoutes(mockFastify as FastifyInstance);

    expect(mockFastify.get).toHaveBeenCalledWith('/health', expect.any(Function));
    expect(mockFastify.get).toHaveBeenCalledWith('/health/live', expect.any(Function));
    expect(mockFastify.get).toHaveBeenCalledWith('/health/ready', expect.any(Function));
    expect(mockFastify.get).toHaveBeenCalledWith('/metrics', expect.any(Function));
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      await healthRoutes(mockFastify as FastifyInstance);

      const mockReply = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      await routes['GET /health'].handler({}, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          service: 'ticket-service',
        })
      );
    });
  });

  describe('GET /health/live', () => {
    it('should return alive status', async () => {
      await healthRoutes(mockFastify as FastifyInstance);

      const mockReply = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      routes['GET /health/live'].handler({}, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({ status: 'alive' });
    });
  });

  describe('GET /health/ready', () => {
    it('should return ready when database is healthy', async () => {
      (DatabaseService.isHealthy as jest.Mock).mockResolvedValue(true);
      (RedisService.isHealthy as jest.Mock).mockResolvedValue(true);

      await healthRoutes(mockFastify as FastifyInstance);

      const mockReply = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      await routes['GET /health/ready'].handler({}, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ready' })
      );
    });

    it('should return not ready when database is unhealthy', async () => {
      (DatabaseService.isHealthy as jest.Mock).mockResolvedValue(false);

      await healthRoutes(mockFastify as FastifyInstance);

      const mockReply = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      await routes['GET /health/ready'].handler({}, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
    });
  });

  describe('Event Loop Monitoring', () => {
    it('should start and stop monitoring', () => {
      startEventLoopMonitoring();
      const metrics = getEventLoopMetrics();

      expect(metrics).toHaveProperty('lag');
      expect(metrics).toHaveProperty('utilization');
      expect(metrics).toHaveProperty('status');

      stopEventLoopMonitoring();
    });

    it('should return healthy status initially', () => {
      const metrics = getEventLoopMetrics();
      expect(metrics.status).toBe('healthy');
    });
  });

  describe('Circuit Breaker Registry', () => {
    it('should register circuit breakers', () => {
      const mockBreaker = {
        getState: jest.fn().mockReturnValue({
          state: 'closed',
          failureCount: 0,
          successCount: 10,
          lastFailureTime: 0,
          lastStateChange: Date.now(),
        }),
      };

      registerCircuitBreaker('test-breaker', mockBreaker as any, 'Test circuit breaker');
    });
  });
});

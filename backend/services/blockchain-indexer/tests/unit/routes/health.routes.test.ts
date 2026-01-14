/**
 * Comprehensive Unit Tests for src/routes/health.routes.ts
 *
 * Tests health check routes with various states
 */

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../../../src/utils/logger', () => ({
  default: mockLogger,
  __esModule: true,
}));

// Mock database
const mockDb = {
  query: jest.fn(),
};
jest.mock('../../../src/utils/database', () => ({
  default: mockDb,
  __esModule: true,
}));

// Mock metrics
const mockIsHealthy = {
  set: jest.fn(),
};
jest.mock('../../../src/utils/metrics', () => ({
  isHealthy: mockIsHealthy,
}));

// Mock cache
const mockCache = {
  set: jest.fn(),
  get: jest.fn(),
};
const mockGetCache = jest.fn(() => mockCache);
jest.mock('../../../src/utils/cache', () => ({
  getCache: mockGetCache,
  CacheManager: jest.fn(),
}));

// Mock mongodb
const mockMongoose = {
  connection: {
    readyState: 1,
    db: {
      admin: jest.fn(() => ({
        ping: jest.fn().mockResolvedValue({}),
      })),
    },
  },
};
jest.mock('../../../src/config/mongodb', () => ({
  mongoose: mockMongoose,
}));

import healthRoutes from '../../../src/routes/health.routes';

describe('src/routes/health.routes.ts - Comprehensive Unit Tests', () => {
  let mockApp: any;
  let routes: Map<string, any>;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    routes = new Map();

    process.env = {
      ...originalEnv,
      HEALTH_CHECK_TIMEOUT_MS: '5000',
      SERVICE_NAME: 'blockchain-indexer',
      npm_package_version: '1.0.0',
    };

    mockApp = {
      get: jest.fn((path: string, handler: any) => {
        routes.set(path, handler);
      }),
      setIndexer: null as any,
    };

    // Reset mocks
    mockDb.query.mockResolvedValue({ rows: [] });
    mockMongoose.connection.readyState = 1;
    mockMongoose.connection.db.admin().ping.mockResolvedValue({});
    mockCache.set.mockResolvedValue(undefined);
    mockCache.get.mockResolvedValue('ok');
    mockGetCache.mockReturnValue(mockCache);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =============================================================================
  // ROUTE REGISTRATION
  // =============================================================================

  describe('Route Registration', () => {
    it('should register all health routes', async () => {
      await healthRoutes(mockApp);

      expect(mockApp.get).toHaveBeenCalledWith('/live', expect.any(Function));
      expect(mockApp.get).toHaveBeenCalledWith('/startup', expect.any(Function));
      expect(mockApp.get).toHaveBeenCalledWith('/ready', expect.any(Function));
      expect(mockApp.get).toHaveBeenCalledWith('/health', expect.any(Function));
    });

    it('should set up setIndexer method', async () => {
      await healthRoutes(mockApp);

      expect(mockApp.setIndexer).toBeDefined();
      expect(typeof mockApp.setIndexer).toBe('function');
    });
  });

  // =============================================================================
  // /live ENDPOINT
  // =============================================================================

  describe('GET /live', () => {
    it('should return alive status', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/live');

      const result = await handler({}, {});

      expect(result).toEqual({
        status: 'alive',
        service: 'blockchain-indexer',
      });
    });

    it('should always return 200', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/live');

      // Even if other services are down
      mockDb.query.mockRejectedValue(new Error('DB down'));

      const result = await handler({}, {});

      expect(result.status).toBe('alive');
    });
  });

  // =============================================================================
  // /startup ENDPOINT
  // =============================================================================

  describe('GET /startup', () => {
    it('should return started when postgres and mongo are ok', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/startup');

      mockDb.query.mockResolvedValue({ rows: [{ result: 1 }] });

      const result = await handler({}, {});

      expect(result).toEqual({
        status: 'started',
        service: 'blockchain-indexer',
        checks: {
          postgresql: expect.objectContaining({ status: 'ok' }),
          mongodb: expect.objectContaining({ status: 'ok' }),
        },
      });
    });

    it('should return 503 when postgres is down', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/startup');

      mockDb.query.mockRejectedValue(new Error('Connection failed'));

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler({}, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'starting',
        })
      );
    });

    it('should return 503 when mongodb is down', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/startup');

      mockDb.query.mockResolvedValue({ rows: [{ result: 1 }] });
      mockMongoose.connection.readyState = 0;

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler({}, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
    });

    it('should handle startup check errors', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/startup');

      mockDb.query.mockRejectedValue(new Error('Unexpected error'));

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler({}, mockReply);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Startup check failed'
      );
      expect(mockReply.code).toHaveBeenCalledWith(503);
    });
  });

  // =============================================================================
  // /ready ENDPOINT
  // =============================================================================

  describe('GET /ready', () => {
    it('should return ready when all services are ok', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/ready');

      mockDb.query.mockResolvedValue({ rows: [{ result: 1 }] });

      const result = await handler({}, {});

      expect(result).toEqual({
        status: 'ready',
        service: 'blockchain-indexer',
        checks: {
          postgresql: expect.objectContaining({ status: 'ok' }),
          mongodb: expect.objectContaining({ status: 'ok' }),
          redis: expect.objectContaining({ status: 'ok' }),
        },
      });

      expect(mockIsHealthy.set).toHaveBeenCalledWith(1);
    });

    it('should return ready when redis is degraded', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/ready');

      mockDb.query.mockResolvedValue({ rows: [{ result: 1 }] });
      mockGetCache.mockImplementation(() => {
        throw new Error('Cache not initialized');
      });

      const result = await handler({}, {});

      expect(result.status).toBe('ready');
      expect(result.checks.redis.status).toBe('degraded');
    });

    it('should return 503 when postgres is down', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/ready');

      mockDb.query.mockRejectedValue(new Error('DB down'));

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler({}, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockIsHealthy.set).toHaveBeenCalledWith(0);
    });

    it('should return 503 when mongodb is down', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/ready');

      mockDb.query.mockResolvedValue({ rows: [{ result: 1 }] });
      mockMongoose.connection.readyState = 0;

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler({}, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
    });

    it('should return 503 when redis has failed', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/ready');

      mockDb.query.mockResolvedValue({ rows: [{ result: 1 }] });
      mockCache.set.mockRejectedValue(new Error('Redis error'));

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler({}, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
    });

    it('should handle readiness check errors', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/ready');

      mockDb.query.mockRejectedValue(new Error('Unexpected error'));

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler({}, mockReply);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Readiness check failed'
      );
      expect(mockIsHealthy.set).toHaveBeenCalledWith(0);
    });
  });

  // =============================================================================
  // /health ENDPOINT
  // =============================================================================

  describe('GET /health', () => {
    it('should return healthy status when all checks pass', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/health');

      mockDb.query.mockResolvedValueOnce({ rows: [{ result: 1 }] });
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          last_processed_slot: 12345,
          last_processed_signature: 'sig123',
          indexer_version: '1.0.0',
          is_running: true,
          started_at: new Date(),
          updated_at: new Date(),
        }],
      });

      const mockIndexer = {
        isRunning: true,
        syncStats: { lag: 5 },
      };
      mockApp.setIndexer(mockIndexer);

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler({}, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          service: 'blockchain-indexer',
          version: '1.0.0',
          checks: {
            postgresql: expect.objectContaining({ status: 'ok' }),
            mongodb: expect.objectContaining({ status: 'ok' }),
            redis: expect.objectContaining({ status: 'ok' }),
            indexer: expect.objectContaining({ status: 'ok' }),
          },
          indexer: {
            lastProcessedSlot: 12345,
            lag: 5,
            isRunning: true,
          },
        })
      );

      expect(mockIsHealthy.set).toHaveBeenCalledWith(1);
    });

    it('should return degraded when redis is down but others ok', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/health');

      mockDb.query.mockResolvedValue({ rows: [] });
      mockCache.set.mockRejectedValue(new Error('Redis error'));

      const mockIndexer = {
        isRunning: true,
        syncStats: { lag: 5 },
      };
      mockApp.setIndexer(mockIndexer);

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler({}, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'degraded',
        })
      );
    });

    it('should return unhealthy when postgres is down', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/health');

      mockDb.query.mockRejectedValue(new Error('DB down'));

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler({}, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'unhealthy',
        })
      );

      expect(mockIsHealthy.set).toHaveBeenCalledWith(0);
    });

    it('should return unhealthy when mongodb is down', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/health');

      mockDb.query.mockResolvedValue({ rows: [] });
      mockMongoose.connection.readyState = 0;

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler({}, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
    });

    it('should handle indexer high lag as degraded', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/health');

      mockDb.query.mockResolvedValue({ rows: [] });

      const mockIndexer = {
        isRunning: true,
        syncStats: { lag: 15000 },
      };
      mockApp.setIndexer(mockIndexer);

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler({}, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'degraded',
          checks: expect.objectContaining({
            indexer: expect.objectContaining({
              status: 'degraded',
              error: expect.stringContaining('High lag'),
            }),
          }),
        })
      );
    });

    it('should handle indexer not running', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/health');

      mockDb.query.mockResolvedValue({ rows: [] });

      const mockIndexer = {
        isRunning: false,
        syncStats: { lag: 5 },
      };
      mockApp.setIndexer(mockIndexer);

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler({}, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          checks: expect.objectContaining({
            indexer: expect.objectContaining({
              status: 'failed',
              error: 'Indexer not running',
            }),
          }),
        })
      );
    });

    it('should handle indexer not initialized', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/health');

      mockDb.query.mockResolvedValue({ rows: [] });
      // Don't set indexer

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler({}, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          checks: expect.objectContaining({
            indexer: expect.objectContaining({
              status: 'failed',
              error: 'Indexer not initialized',
            }),
          }),
        })
      );
    });

    it('should handle errors getting indexer state', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/health');

      mockDb.query.mockResolvedValueOnce({ rows: [{ result: 1 }] });
      mockDb.query.mockRejectedValueOnce(new Error('State query failed'));

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler({}, mockReply);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Failed to get indexer state'
      );
    });

    it('should handle overall health check errors', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/health');

      mockDb.query.mockRejectedValue(new Error('Catastrophic failure'));

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler({}, mockReply);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Health check error'
      );

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'unhealthy',
          error: 'Catastrophic failure',
        })
      );
    });

    it('should include response times in checks', async () => {
      await healthRoutes(mockApp);
      const handler = routes.get('/health');

      mockDb.query.mockResolvedValue({ rows: [] });

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler({}, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          checks: {
            postgresql: expect.objectContaining({
              responseTimeMs: expect.any(Number),
            }),
            mongodb: expect.objectContaining({
              responseTimeMs: expect.any(Number),
            }),
            redis: expect.objectContaining({
              responseTimeMs: expect.any(Number),
            }),
            indexer: expect.any(Object),
          },
        })
      );
    });
  });

  // =============================================================================
  // SET INDEXER
  // =============================================================================

  describe('setIndexer()', () => {
    it('should allow setting indexer reference', async () => {
      await healthRoutes(mockApp);

      const mockIndexer = {
        isRunning: true,
        syncStats: { lag: 10 },
      };

      mockApp.setIndexer(mockIndexer);

      // Verify it's used in health check
      const handler = routes.get('/health');
      mockDb.query.mockResolvedValue({ rows: [] });

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await handler({}, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          checks: expect.objectContaining({
            indexer: expect.objectContaining({
              status: 'ok',
            }),
          }),
        })
      );
    });
  });

  // =============================================================================
  // CONFIGURATION
  // =============================================================================

  describe('Configuration', () => {
    it('should use custom service name from env', async () => {
      process.env.SERVICE_NAME = 'custom-indexer';

      await healthRoutes(mockApp);
      const handler = routes.get('/live');

      const result = await handler({}, {});

      expect(result.service).toBe('custom-indexer');
    });

    it('should use default service name if not set', async () => {
      delete process.env.SERVICE_NAME;

      await healthRoutes(mockApp);
      const handler = routes.get('/live');

      const result = await handler({}, {});

      expect(result.service).toBe('blockchain-indexer');
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('Exports', () => {
    it('should export health routes function', () => {
      expect(typeof healthRoutes).toBe('function');
    });
  });
});

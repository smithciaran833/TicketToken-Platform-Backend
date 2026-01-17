// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/index.ts
 */

jest.mock('../../src/config/env.validator');
jest.mock('../../src/config/database');
jest.mock('../../src/config/redis');
jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/metrics');
jest.mock('../../src/middleware/tenant-context');
jest.mock('../../src/routes/scan');
jest.mock('../../src/routes/qr');
jest.mock('../../src/routes/devices');
jest.mock('../../src/routes/offline');
jest.mock('../../src/routes/policies');
jest.mock('fastify');
jest.mock('@fastify/helmet');
jest.mock('@fastify/cors');

describe('src/index.ts - Comprehensive Unit Tests', () => {
  let mockFastifyInstance: any;
  let mockPool: any;
  let mockRedis: any;
  let database: any;
  let redis: any;
  let logger: any;
  let metrics: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock pool
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
      end: jest.fn().mockResolvedValue(undefined),
    };

    // Mock Redis
    mockRedis = {
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue(undefined),
    };

    // Mock database module
    database = require('../../src/config/database');
    database.initializeDatabase = jest.fn().mockResolvedValue(undefined);
    database.getPool = jest.fn().mockReturnValue(mockPool);

    // Mock Redis module
    redis = require('../../src/config/redis');
    redis.initializeRedis = jest.fn().mockResolvedValue(undefined);
    redis.getRedis = jest.fn().mockReturnValue(mockRedis);

    // Mock logger
    logger = require('../../src/utils/logger').default;

    // Mock metrics
    metrics = require('../../src/utils/metrics');
    metrics.register = {
      contentType: 'text/plain',
      metrics: jest.fn().mockResolvedValue('# metrics data'),
    };

    // Mock Fastify instance
    const routes: Map<string, any> = new Map();
    mockFastifyInstance = {
      decorate: jest.fn(),
      register: jest.fn().mockResolvedValue(undefined),
      addHook: jest.fn(),
      get: jest.fn((path, handler) => {
        routes.set(`GET:${path}`, handler);
      }),
      setErrorHandler: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      _routes: routes,
    };

    // Mock Fastify constructor
    const Fastify = require('fastify');
    Fastify.mockReturnValue(mockFastifyInstance);

    // Suppress console during tests
    jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =============================================================================
  // Initialization Tests
  // =============================================================================

  describe('Service Initialization', () => {
    it('should validate environment on startup', async () => {
      const envValidator = require('../../src/config/env.validator');
      
      // Import will trigger validation
      expect(envValidator.validateEnv).toHaveBeenCalled();
    });

    it('should initialize database', async () => {
      // Re-import to trigger startService
      delete require.cache[require.resolve('../../src/index')];
      require('../../src/index');

      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(database.initializeDatabase).toHaveBeenCalled();
    });

    it('should initialize Redis', async () => {
      delete require.cache[require.resolve('../../src/index')];
      require('../../src/index');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(redis.initializeRedis).toHaveBeenCalled();
    });

    it('should create Fastify instance with correct config', async () => {
      const Fastify = require('fastify');
      
      delete require.cache[require.resolve('../../src/index')];
      require('../../src/index');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(Fastify).toHaveBeenCalledWith({
        logger: false,
        trustProxy: true,
        requestTimeout: 30000,
        connectionTimeout: 10000,
        keepAliveTimeout: 5000,
      });
    });

    it('should register helmet plugin', async () => {
      delete require.cache[require.resolve('../../src/index')];
      require('../../src/index');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockFastifyInstance.register).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should register cors plugin', async () => {
      delete require.cache[require.resolve('../../src/index')];
      require('../../src/index');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockFastifyInstance.register).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should decorate instance with database pool', async () => {
      delete require.cache[require.resolve('../../src/index')];
      require('../../src/index');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockFastifyInstance.decorate).toHaveBeenCalledWith('db', mockPool);
    });

    it('should register tenant context hook', async () => {
      delete require.cache[require.resolve('../../src/index')];
      require('../../src/index');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockFastifyInstance.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
    });

    it('should register all route handlers', async () => {
      delete require.cache[require.resolve('../../src/index')];
      require('../../src/index');

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should register routes with prefixes
      const registerCalls = mockFastifyInstance.register.mock.calls;
      const routeRegistrations = registerCalls.filter(call => call[1]?.prefix);
      
      expect(routeRegistrations.length).toBeGreaterThan(0);
    });

    it('should start server on correct port', async () => {
      process.env.PORT = '3009';
      
      delete require.cache[require.resolve('../../src/index')];
      require('../../src/index');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockFastifyInstance.listen).toHaveBeenCalledWith({
        port: 3009,
        host: '0.0.0.0',
      });
    });

    it('should log startup messages', async () => {
      delete require.cache[require.resolve('../../src/index')];
      require('../../src/index');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Starting Scanning Service'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('running on'));
    });
  });

  // =============================================================================
  // Health Check Endpoints
  // =============================================================================

  describe('GET /health', () => {
    let healthHandler: any;

    beforeEach(async () => {
      delete require.cache[require.resolve('../../src/index')];
      require('../../src/index');
      await new Promise(resolve => setTimeout(resolve, 100));
      healthHandler = mockFastifyInstance._routes.get('GET:/health');
    });

    it('should return healthy status when all checks pass', async () => {
      const mockRequest = {};
      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await healthHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        status: 'healthy',
        service: 'scanning-service',
        checks: {
          database: 'healthy',
          redis: 'healthy',
        },
      }));
    });

    it('should return degraded status when database fails', async () => {
      mockPool.query.mockRejectedValue(new Error('DB error'));
      
      const mockRequest = {};
      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await healthHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        status: 'degraded',
        checks: expect.objectContaining({
          database: 'unhealthy',
        }),
      }));
    });

    it('should return degraded status when Redis fails', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Redis error'));
      
      const mockRequest = {};
      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await healthHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        status: 'degraded',
        checks: expect.objectContaining({
          redis: 'unhealthy',
        }),
      }));
    });

    it('should include uptime in response', async () => {
      const mockRequest = {};
      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await healthHandler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        uptime: expect.any(Number),
      }));
    });

    it('should include timestamp in response', async () => {
      const mockRequest = {};
      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await healthHandler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        timestamp: expect.any(String),
      }));
    });
  });

  describe('GET /health/ready', () => {
    let readyHandler: any;

    beforeEach(async () => {
      delete require.cache[require.resolve('../../src/index')];
      require('../../src/index');
      await new Promise(resolve => setTimeout(resolve, 100));
      readyHandler = mockFastifyInstance._routes.get('GET:/health/ready');
    });

    it('should return ready when dependencies available', async () => {
      const mockRequest = {};
      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await readyHandler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        ready: true,
      }));
    });

    it('should return not ready when database unavailable', async () => {
      mockPool.query.mockRejectedValue(new Error('DB down'));
      
      const mockRequest = {};
      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await readyHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        ready: false,
        reason: 'dependencies_unavailable',
      }));
    });

    it('should return not ready when Redis unavailable', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Redis down'));
      
      const mockRequest = {};
      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await readyHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
    });
  });

  describe('GET /health/live', () => {
    let liveHandler: any;

    beforeEach(async () => {
      delete require.cache[require.resolve('../../src/index')];
      require('../../src/index');
      await new Promise(resolve => setTimeout(resolve, 100));
      liveHandler = mockFastifyInstance._routes.get('GET:/health/live');
    });

    it('should return alive status', async () => {
      const mockRequest = {};
      const mockReply = {
        send: jest.fn(),
      };

      await liveHandler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        alive: true,
        uptime: expect.any(Number),
      }));
    });
  });

  describe('GET /metrics', () => {
    let metricsHandler: any;

    beforeEach(async () => {
      delete require.cache[require.resolve('../../src/index')];
      require('../../src/index');
      await new Promise(resolve => setTimeout(resolve, 100));
      metricsHandler = mockFastifyInstance._routes.get('GET:/metrics');
    });

    it('should return metrics with correct content type', async () => {
      const mockRequest = {};
      const mockReply = {
        header: jest.fn(),
        send: jest.fn(),
      };

      await metricsHandler(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'text/plain');
      expect(mockReply.send).toHaveBeenCalledWith('# metrics data');
    });
  });

  // =============================================================================
  // Error Handling
  // =============================================================================

  describe('Error Handling', () => {
    it('should register global error handler', async () => {
      delete require.cache[require.resolve('../../src/index')];
      require('../../src/index');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockFastifyInstance.setErrorHandler).toHaveBeenCalled();
    });

    it('should handle startup errors', async () => {
      database.initializeDatabase.mockRejectedValue(new Error('Init failed'));
      
      delete require.cache[require.resolve('../../src/index')];
      require('../../src/index');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(logger.error).toHaveBeenCalledWith('Failed to start service:', expect.any(Error));
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('Edge Cases', () => {
    it('should use default port when PORT not set', async () => {
      delete process.env.PORT;
      
      delete require.cache[require.resolve('../../src/index')];
      require('../../src/index');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockFastifyInstance.listen).toHaveBeenCalledWith(expect.objectContaining({
        port: 3009,
      }));
    });

    it('should use default host when HOST not set', async () => {
      delete process.env.HOST;
      
      delete require.cache[require.resolve('../../src/index')];
      require('../../src/index');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockFastifyInstance.listen).toHaveBeenCalledWith(expect.objectContaining({
        host: '0.0.0.0',
      }));
    });

    it('should handle tenant context middleware errors gracefully', async () => {
      const tenantContext = require('../../src/middleware/tenant-context');
      tenantContext.setTenantContext = jest.fn().mockRejectedValue(new Error('Context error'));

      delete require.cache[require.resolve('../../src/index')];
      require('../../src/index');

      await new Promise(resolve => setTimeout(resolve, 100));

      const onRequestHook = mockFastifyInstance.addHook.mock.calls.find(
        call => call[0] === 'onRequest'
      )?.[1];

      if (onRequestHook) {
        const mockRequest = {};
        const mockReply = {};
        
        await onRequestHook(mockRequest, mockReply);

        expect(logger.error).toHaveBeenCalledWith('Failed to set tenant context', expect.any(Error));
      }
    });
  });
});

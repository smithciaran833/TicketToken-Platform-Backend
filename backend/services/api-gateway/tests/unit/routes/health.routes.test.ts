import { FastifyInstance } from 'fastify';
import healthRoutes, { markInitialized } from '../../../src/routes/health.routes';
import { AuthServiceClient } from '../../../src/clients/AuthServiceClient';
import { VenueServiceClient } from '../../../src/clients/VenueServiceClient';

jest.mock('../../../src/clients/AuthServiceClient');
jest.mock('../../../src/clients/VenueServiceClient');

describe('health.routes', () => {
  let mockServer: any;
  let getHandler: jest.Mock;
  let routes: Map<string, any>;

  beforeEach(() => {
    jest.clearAllMocks();
    routes = new Map();

    getHandler = jest.fn((path: string, ...args: any[]) => {
      const handler = args[args.length - 1];
      routes.set(path, { handler, options: args.length > 1 ? args[0] : {} });
    });

    mockServer = {
      get: getHandler,
      log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
      redis: {
        ping: jest.fn().mockResolvedValue('PONG'),
      },
      circuitBreakers: new Map(),
    };
  });

  describe('route registration', () => {
    it('registers all health check routes', async () => {
      await healthRoutes(mockServer);

      expect(getHandler).toHaveBeenCalledWith('/health', expect.any(Object), expect.any(Function));
      expect(getHandler).toHaveBeenCalledWith('/health/live', expect.any(Function));
      expect(getHandler).toHaveBeenCalledWith('/health/ready', expect.any(Object), expect.any(Function));
      expect(getHandler).toHaveBeenCalledWith('/health/startup', expect.any(Function));
      expect(getHandler).toHaveBeenCalledWith('/ready', expect.any(Function));
      expect(getHandler).toHaveBeenCalledWith('/live', expect.any(Function));
    });
  });

  describe('GET /health', () => {
    let handler: Function;

    beforeEach(async () => {
      await healthRoutes(mockServer);
      handler = routes.get('/health')!.handler;
    });

    it('returns ok status with system metrics', async () => {
      const mockRequest = {};

      const result = await handler(mockRequest);

      expect(result).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        memory: expect.any(Object),
        pid: expect.any(Number),
        version: expect.any(String),
        circuitBreakers: expect.any(Object),
      });
    });

    it('includes circuit breaker states when present', async () => {
      const mockBreaker = {
        opened: false,
        stats: { fires: 10, failures: 2 },
      };

      mockServer.circuitBreakers.set('auth-service', mockBreaker);

      const result = await handler({});

      expect(result.circuitBreakers).toEqual({
        'auth-service': {
          state: 'CLOSED',
          stats: { fires: 10, failures: 2 },
        },
      });
    });

    it('shows OPEN state for opened circuit breakers', async () => {
      const mockBreaker = {
        opened: true,
        stats: { fires: 20, failures: 15 },
      };

      mockServer.circuitBreakers.set('payment-service', mockBreaker);

      const result = await handler({});

      expect(result.circuitBreakers['payment-service'].state).toBe('OPEN');
    });

    it('handles missing circuit breakers gracefully', async () => {
      delete mockServer.circuitBreakers;

      const result = await handler({});

      expect(result.circuitBreakers).toEqual({});
    });

    it('uses version from environment or defaults to 1.0.0', async () => {
      const originalVersion = process.env.npm_package_version;

      process.env.npm_package_version = '2.3.4';
      let result = await handler({});
      expect(result.version).toBe('2.3.4');

      delete process.env.npm_package_version;
      result = await handler({});
      expect(result.version).toBe('1.0.0');

      if (originalVersion) {
        process.env.npm_package_version = originalVersion;
      }
    });
  });

  describe('GET /health/live', () => {
    let handler: Function;

    beforeEach(async () => {
      await healthRoutes(mockServer);
      handler = routes.get('/health/live')!.handler;
    });

    it('returns ok status', async () => {
      const result = await handler();

      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('GET /health/ready', () => {
    let handler: Function;
    let mockReply: any;

    beforeEach(async () => {
      await healthRoutes(mockServer);
      handler = routes.get('/health/ready')!.handler;

      mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };

      (AuthServiceClient as jest.Mock).mockImplementation(() => ({
        healthCheck: jest.fn().mockResolvedValue(true),
      }));

      (VenueServiceClient as jest.Mock).mockImplementation(() => ({
        healthCheck: jest.fn().mockResolvedValue(true),
      }));
    });

    it('returns ready status when all checks pass', async () => {
      const result = await handler({}, mockReply);

      expect(result).toMatchObject({
        status: 'ready',
        checks: expect.any(Object),
      });
    });

    it('checks memory usage', async () => {
      const result = await handler({}, mockReply);

      expect(result.checks.memory).toBeDefined();
      expect(['ok', 'warning']).toContain(result.checks.memory);
    });

    it('checks Redis connectivity', async () => {
      const result = await handler({}, mockReply);

      expect(mockServer.redis.ping).toHaveBeenCalled();
      expect(result.checks.redis).toBe('ok');
    });

    it('marks Redis as slow when ping takes too long', async () => {
      mockServer.redis.ping.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve('PONG'), 150))
      );

      const result = await handler({}, mockReply);

      expect(result.checks.redis).toBe('slow');
    });

    it('returns 503 when Redis is down', async () => {
      mockServer.redis.ping.mockRejectedValue(new Error('Connection refused'));

      await handler({}, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'not ready',
          error: 'One or more critical dependencies are unavailable',
          checks: expect.objectContaining({
            redis: 'error',
          }),
        })
      );
    });

    it('checks circuit breaker states', async () => {
      const mockBreaker = {
        opened: false,
        stats: {},
      };

      mockServer.circuitBreakers.set('auth-service', mockBreaker);
      mockServer.circuitBreakers.set('venue-service', mockBreaker);

      const result = await handler({}, mockReply);

      expect(result.checks.circuitBreakers).toEqual({
        'auth-service': 'CLOSED',
        'venue-service': 'CLOSED',
      });
    });

    it('returns 503 when critical circuit breaker is open', async () => {
      const openBreaker = {
        opened: true,
        stats: {},
      };

      mockServer.circuitBreakers.set('auth-service', openBreaker);

      await handler({}, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'not ready',
          checks: expect.objectContaining({
            circuitBreakers: expect.objectContaining({
              'auth-service': 'OPEN',
            }),
          }),
        })
      );
    });

    it('checks auth service health', async () => {
      const result = await handler({}, mockReply);

      const authClientInstance = (AuthServiceClient as jest.Mock).mock.results[0].value;
      expect(authClientInstance.healthCheck).toHaveBeenCalled();
      expect(result.checks.authService).toBe('ok');
    });

    it('returns 503 when auth service is unreachable', async () => {
      (AuthServiceClient as jest.Mock).mockImplementation(() => ({
        healthCheck: jest.fn().mockResolvedValue(false),
      }));

      await handler({}, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          checks: expect.objectContaining({
            authService: 'error',
          }),
        })
      );
    });

    it('returns 503 when auth service throws error', async () => {
      (AuthServiceClient as jest.Mock).mockImplementation(() => ({
        healthCheck: jest.fn().mockRejectedValue(new Error('Connection failed')),
      }));

      await handler({}, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockServer.log.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Auth service health check failed'
      );
    });

    it('checks venue service health', async () => {
      const result = await handler({}, mockReply);

      const venueClientInstance = (VenueServiceClient as jest.Mock).mock.results[0].value;
      expect(venueClientInstance.healthCheck).toHaveBeenCalled();
      expect(result.checks.venueService).toBe('ok');
    });

    it('returns 503 when venue service is unreachable', async () => {
      (VenueServiceClient as jest.Mock).mockImplementation(() => ({
        healthCheck: jest.fn().mockResolvedValue(false),
      }));

      await handler({}, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          checks: expect.objectContaining({
            venueService: 'error',
          }),
        })
      );
    });

    it('times out health checks after 2 seconds', async () => {
      jest.useFakeTimers();

      (AuthServiceClient as jest.Mock).mockImplementation(() => ({
        healthCheck: jest.fn().mockImplementation(() =>
          new Promise(resolve => setTimeout(() => resolve(true), 5000))
        ),
      }));

      const promise = handler({}, mockReply);

      // Run all timers asynchronously to execute both the timeout and the slow health check
      await jest.runAllTimersAsync();

      await promise;

      expect(mockReply.code).toHaveBeenCalledWith(503);

      jest.useRealTimers();
    });

    it('handles multiple failing checks', async () => {
      mockServer.redis.ping.mockRejectedValue(new Error('Redis down'));

      (AuthServiceClient as jest.Mock).mockImplementation(() => ({
        healthCheck: jest.fn().mockResolvedValue(false),
      }));

      const openBreaker = { opened: true, stats: {} };
      mockServer.circuitBreakers.set('venue-service', openBreaker);

      await handler({}, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          checks: expect.objectContaining({
            redis: 'error',
            authService: 'error',
            circuitBreakers: expect.objectContaining({
              'venue-service': 'OPEN',
            }),
          }),
        })
      );
    });
  });

  describe('GET /health/startup', () => {
    let handler: Function;
    let mockReply: any;

    beforeEach(async () => {
      await healthRoutes(mockServer);
      handler = routes.get('/health/startup')!.handler;

      mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };
    });

    it('returns 503 when not initialized', async () => {
      // Reset initialization state
      jest.resetModules();

      await handler({}, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'starting',
        message: 'Service is still initializing',
        initialized: false,
      });
    });

    it('returns ok when initialized', async () => {
      markInitialized();

      const result = await handler({}, mockReply);

      expect(result).toEqual({
        status: 'ok',
        initialized: true,
        uptime: expect.any(Number),
      });
    });
  });

  describe('GET /ready (legacy)', () => {
    let handler: Function;
    let mockReply: any;

    beforeEach(async () => {
      await healthRoutes(mockServer);
      handler = routes.get('/ready')!.handler;

      mockReply = {
        redirect: jest.fn(),
      };
    });

    it('redirects to /health/ready', async () => {
      await handler({}, mockReply);

      expect(mockReply.redirect).toHaveBeenCalledWith('/health/ready');
    });
  });

  describe('GET /live (legacy)', () => {
    let handler: Function;

    beforeEach(async () => {
      await healthRoutes(mockServer);
      handler = routes.get('/live')!.handler;
    });

    it('returns alive status', async () => {
      const result = await handler();

      expect(result).toEqual({ status: 'alive' });
    });
  });

  describe('markInitialized', () => {
    it('marks service as initialized', async () => {
      markInitialized();

      await healthRoutes(mockServer);
      const handler = routes.get('/health/startup')!.handler;
      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };

      const result = await handler({}, mockReply);

      expect(result.initialized).toBe(true);
    });
  });
});

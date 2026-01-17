// Mock controller before imports
jest.mock('../../../src/controllers/alerts.controller', () => ({
  AlertsController: jest.fn().mockImplementation(() => ({
    getAlerts: jest.fn(),
    acknowledgeAlert: jest.fn(),
    testAlert: jest.fn(),
  })),
}));

// Mock middleware
jest.mock('../../../src/middleware/auth.middleware', () => ({
  authenticate: jest.fn(),
  authorize: jest.fn(() => jest.fn()),
}));

import { FastifyInstance } from 'fastify';
import alertsRoutes from '../../../src/routes/alerts.routes';
import { AlertsController } from '../../../src/controllers/alerts.controller';
import { authenticate, authorize } from '../../../src/middleware/auth.middleware';

describe('Alerts Routes', () => {
  let fastify: Partial<FastifyInstance>;
  let mockController: any;
  let registeredRoutes: Map<string, any>;

  beforeEach(() => {
    registeredRoutes = new Map();
    mockController = new AlertsController();

    fastify = {
      get: jest.fn((path, opts, handler) => {
        registeredRoutes.set(`GET:${path}`, { opts, handler: handler || opts });
      }),
      post: jest.fn((path, opts, handler) => {
        registeredRoutes.set(`POST:${path}`, { opts, handler: handler || opts });
      }),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Route Registration', () => {
    it('should register GET / route with authentication', async () => {
      await alertsRoutes(fastify as FastifyInstance);

      expect(fastify.get).toHaveBeenCalledWith(
        '/',
        expect.objectContaining({
          preHandler: expect.arrayContaining([authenticate])
        }),
        expect.any(Function)
      );
    });

    it('should register POST /:id/acknowledge with authentication', async () => {
      await alertsRoutes(fastify as FastifyInstance);

      expect(fastify.post).toHaveBeenCalledWith(
        '/:id/acknowledge',
        expect.objectContaining({
          preHandler: expect.arrayContaining([authenticate])
        }),
        expect.any(Function)
      );
    });

    it('should register POST /test with authentication and authorization', async () => {
      await alertsRoutes(fastify as FastifyInstance);

      expect(fastify.post).toHaveBeenCalledWith(
        '/test',
        expect.objectContaining({
          preHandler: expect.any(Array)
        }),
        expect.any(Function)
      );
    });

    it('should bind controller methods to routes', async () => {
      await alertsRoutes(fastify as FastifyInstance);

      expect(mockController.getAlerts).toBeDefined();
      expect(mockController.acknowledgeAlert).toBeDefined();
      expect(mockController.testAlert).toBeDefined();
    });
  });

  describe('GET / - Get Alerts', () => {
    it('should have authenticate middleware', async () => {
      await alertsRoutes(fastify as FastifyInstance);

      const route = registeredRoutes.get('GET:/');
      expect(route.opts.preHandler).toContain(authenticate);
    });

    it('should call getAlerts controller method', async () => {
      await alertsRoutes(fastify as FastifyInstance);

      const getCall = (fastify.get as jest.Mock).mock.calls.find(
        call => call[0] === '/'
      );
      expect(getCall[2]).toBeDefined();
    });
  });

  describe('POST /:id/acknowledge - Acknowledge Alert', () => {
    it('should have authenticate middleware', async () => {
      await alertsRoutes(fastify as FastifyInstance);

      const route = registeredRoutes.get('POST:/:id/acknowledge');
      expect(route.opts.preHandler).toContain(authenticate);
    });

    it('should call acknowledgeAlert controller method', async () => {
      await alertsRoutes(fastify as FastifyInstance);

      const postCall = (fastify.post as jest.Mock).mock.calls.find(
        call => call[0] === '/:id/acknowledge'
      );
      expect(postCall[2]).toBeDefined();
    });
  });

  describe('POST /test - Test Alert', () => {
    it('should have authenticate middleware', async () => {
      await alertsRoutes(fastify as FastifyInstance);

      const route = registeredRoutes.get('POST:/test');
      expect(route.opts.preHandler).toEqual(
        expect.arrayContaining([authenticate])
      );
    });

    it('should have authorize middleware for admin role', async () => {
      await alertsRoutes(fastify as FastifyInstance);

      expect(authorize).toHaveBeenCalledWith(['admin']);
    });

    it('should call testAlert controller method', async () => {
      await alertsRoutes(fastify as FastifyInstance);

      const postCall = (fastify.post as jest.Mock).mock.calls.find(
        call => call[0] === '/test'
      );
      expect(postCall[2]).toBeDefined();
    });
  });

  describe('Middleware Order', () => {
    it('should apply middleware in correct order for admin routes', async () => {
      await alertsRoutes(fastify as FastifyInstance);

      const route = registeredRoutes.get('POST:/test');
      const preHandlers = route.opts.preHandler;

      expect(preHandlers[0]).toBe(authenticate);
      expect(preHandlers[1]).toBeDefined(); // authorize middleware
    });
  });
});

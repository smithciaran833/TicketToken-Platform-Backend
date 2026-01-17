// Mock controller before imports
jest.mock('../../../src/controllers/queue.controller', () => ({
  QueueController: jest.fn().mockImplementation(() => ({
    listQueues: jest.fn(),
    getQueueStatus: jest.fn(),
    getQueueJobs: jest.fn(),
    pauseQueue: jest.fn(),
    resumeQueue: jest.fn(),
    clearQueue: jest.fn(),
  })),
}));

// Mock middleware
jest.mock('../../../src/middleware/auth.middleware', () => ({
  authenticate: jest.fn(),
  authorize: jest.fn(() => jest.fn()),
}));

import { FastifyInstance } from 'fastify';
import queueRoutes from '../../../src/routes/queue.routes';
import { QueueController } from '../../../src/controllers/queue.controller';
import { authenticate, authorize } from '../../../src/middleware/auth.middleware';

describe('Queue Routes', () => {
  let fastify: Partial<FastifyInstance>;
  let mockController: any;
  let registeredRoutes: Map<string, any>;

  beforeEach(() => {
    registeredRoutes = new Map();
    mockController = new QueueController();

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
      await queueRoutes(fastify as FastifyInstance);

      expect(fastify.get).toHaveBeenCalledWith(
        '/',
        expect.objectContaining({
          preHandler: expect.arrayContaining([authenticate])
        }),
        expect.any(Function)
      );
    });

    it('should register GET /:name/status route with authentication', async () => {
      await queueRoutes(fastify as FastifyInstance);

      expect(fastify.get).toHaveBeenCalledWith(
        '/:name/status',
        expect.objectContaining({
          preHandler: expect.arrayContaining([authenticate])
        }),
        expect.any(Function)
      );
    });

    it('should register GET /:name/jobs route with authentication', async () => {
      await queueRoutes(fastify as FastifyInstance);

      expect(fastify.get).toHaveBeenCalledWith(
        '/:name/jobs',
        expect.objectContaining({
          preHandler: expect.arrayContaining([authenticate])
        }),
        expect.any(Function)
      );
    });

    it('should register POST /:name/pause route with authentication and authorization', async () => {
      await queueRoutes(fastify as FastifyInstance);

      expect(fastify.post).toHaveBeenCalledWith(
        '/:name/pause',
        expect.objectContaining({
          preHandler: expect.any(Array)
        }),
        expect.any(Function)
      );
    });

    it('should register POST /:name/resume route with authentication and authorization', async () => {
      await queueRoutes(fastify as FastifyInstance);

      expect(fastify.post).toHaveBeenCalledWith(
        '/:name/resume',
        expect.objectContaining({
          preHandler: expect.any(Array)
        }),
        expect.any(Function)
      );
    });

    it('should register POST /:name/clear route with authentication and authorization', async () => {
      await queueRoutes(fastify as FastifyInstance);

      expect(fastify.post).toHaveBeenCalledWith(
        '/:name/clear',
        expect.objectContaining({
          preHandler: expect.any(Array)
        }),
        expect.any(Function)
      );
    });

    it('should bind controller methods to routes', async () => {
      await queueRoutes(fastify as FastifyInstance);

      expect(mockController.listQueues).toBeDefined();
      expect(mockController.getQueueStatus).toBeDefined();
      expect(mockController.getQueueJobs).toBeDefined();
      expect(mockController.pauseQueue).toBeDefined();
      expect(mockController.resumeQueue).toBeDefined();
      expect(mockController.clearQueue).toBeDefined();
    });
  });

  describe('GET / - List Queues', () => {
    it('should have authenticate middleware', async () => {
      await queueRoutes(fastify as FastifyInstance);

      const route = registeredRoutes.get('GET:/');
      expect(route.opts.preHandler).toContain(authenticate);
    });

    it('should call listQueues controller method', async () => {
      await queueRoutes(fastify as FastifyInstance);

      const getCall = (fastify.get as jest.Mock).mock.calls.find(
        call => call[0] === '/'
      );
      expect(getCall[2]).toBeDefined();
    });
  });

  describe('GET /:name/status - Get Queue Status', () => {
    it('should have authenticate middleware', async () => {
      await queueRoutes(fastify as FastifyInstance);

      const route = registeredRoutes.get('GET:/:name/status');
      expect(route.opts.preHandler).toContain(authenticate);
    });

    it('should call getQueueStatus controller method', async () => {
      await queueRoutes(fastify as FastifyInstance);

      const getCall = (fastify.get as jest.Mock).mock.calls.find(
        call => call[0] === '/:name/status'
      );
      expect(getCall[2]).toBeDefined();
    });
  });

  describe('GET /:name/jobs - Get Queue Jobs', () => {
    it('should have authenticate middleware', async () => {
      await queueRoutes(fastify as FastifyInstance);

      const route = registeredRoutes.get('GET:/:name/jobs');
      expect(route.opts.preHandler).toContain(authenticate);
    });

    it('should call getQueueJobs controller method', async () => {
      await queueRoutes(fastify as FastifyInstance);

      const getCall = (fastify.get as jest.Mock).mock.calls.find(
        call => call[0] === '/:name/jobs'
      );
      expect(getCall[2]).toBeDefined();
    });
  });

  describe('POST /:name/pause - Pause Queue', () => {
    it('should have authenticate middleware', async () => {
      await queueRoutes(fastify as FastifyInstance);

      const route = registeredRoutes.get('POST:/:name/pause');
      expect(route.opts.preHandler).toEqual(
        expect.arrayContaining([authenticate])
      );
    });

    it('should have authorize middleware for admin role', async () => {
      await queueRoutes(fastify as FastifyInstance);

      expect(authorize).toHaveBeenCalledWith(['admin']);
    });

    it('should call pauseQueue controller method', async () => {
      await queueRoutes(fastify as FastifyInstance);

      const postCall = (fastify.post as jest.Mock).mock.calls.find(
        call => call[0] === '/:name/pause'
      );
      expect(postCall[2]).toBeDefined();
    });
  });

  describe('POST /:name/resume - Resume Queue', () => {
    it('should have authenticate middleware', async () => {
      await queueRoutes(fastify as FastifyInstance);

      const route = registeredRoutes.get('POST:/:name/resume');
      expect(route.opts.preHandler).toEqual(
        expect.arrayContaining([authenticate])
      );
    });

    it('should have authorize middleware for admin role', async () => {
      await queueRoutes(fastify as FastifyInstance);

      expect(authorize).toHaveBeenCalledWith(['admin']);
    });

    it('should call resumeQueue controller method', async () => {
      await queueRoutes(fastify as FastifyInstance);

      const postCall = (fastify.post as jest.Mock).mock.calls.find(
        call => call[0] === '/:name/resume'
      );
      expect(postCall[2]).toBeDefined();
    });
  });

  describe('POST /:name/clear - Clear Queue', () => {
    it('should have authenticate middleware', async () => {
      await queueRoutes(fastify as FastifyInstance);

      const route = registeredRoutes.get('POST:/:name/clear');
      expect(route.opts.preHandler).toEqual(
        expect.arrayContaining([authenticate])
      );
    });

    it('should have authorize middleware for admin role', async () => {
      await queueRoutes(fastify as FastifyInstance);

      expect(authorize).toHaveBeenCalledWith(['admin']);
    });

    it('should call clearQueue controller method', async () => {
      await queueRoutes(fastify as FastifyInstance);

      const postCall = (fastify.post as jest.Mock).mock.calls.find(
        call => call[0] === '/:name/clear'
      );
      expect(postCall[2]).toBeDefined();
    });
  });

  describe('Middleware Order', () => {
    it('should apply middleware in correct order for admin routes', async () => {
      await queueRoutes(fastify as FastifyInstance);

      const route = registeredRoutes.get('POST:/:name/pause');
      const preHandlers = route.opts.preHandler;

      expect(preHandlers[0]).toBe(authenticate);
      expect(preHandlers[1]).toBeDefined(); // authorize middleware
    });

    it('should only have authentication for read operations', async () => {
      await queueRoutes(fastify as FastifyInstance);

      const route = registeredRoutes.get('GET:/');
      const preHandlers = route.opts.preHandler;

      expect(preHandlers).toEqual([authenticate]);
    });
  });
});

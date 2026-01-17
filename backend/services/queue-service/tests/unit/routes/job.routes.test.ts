// Mock controller before imports
jest.mock('../../../src/controllers/job.controller', () => ({
  JobController: jest.fn().mockImplementation(() => ({
    addJob: jest.fn(),
    getJob: jest.fn(),
    retryJob: jest.fn(),
    cancelJob: jest.fn(),
    addBatchJobs: jest.fn(),
  })),
  addJobSchema: {
    validateAsync: jest.fn(),
  },
}));

// Mock middleware
jest.mock('../../../src/middleware/auth.middleware', () => ({
  authenticate: jest.fn(),
  authorize: jest.fn(() => jest.fn()),
}));

jest.mock('../../../src/middleware/validation.middleware', () => ({
  validateBody: jest.fn(() => jest.fn()),
}));

import { FastifyInstance } from 'fastify';
import jobRoutes from '../../../src/routes/job.routes';
import { JobController } from '../../../src/controllers/job.controller';
import { authenticate, authorize } from '../../../src/middleware/auth.middleware';
import { validateBody } from '../../../src/middleware/validation.middleware';

describe('Job Routes', () => {
  let fastify: Partial<FastifyInstance>;
  let mockController: any;
  let registeredRoutes: Map<string, any>;

  beforeEach(() => {
    registeredRoutes = new Map();
    mockController = new JobController();

    fastify = {
      get: jest.fn((path, opts, handler) => {
        registeredRoutes.set(`GET:${path}`, { opts, handler: handler || opts });
      }),
      post: jest.fn((path, opts, handler) => {
        registeredRoutes.set(`POST:${path}`, { opts, handler: handler || opts });
      }),
      delete: jest.fn((path, opts, handler) => {
        registeredRoutes.set(`DELETE:${path}`, { opts, handler: handler || opts });
      }),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Route Registration', () => {
    it('should register POST / route with authentication and validation', async () => {
      await jobRoutes(fastify as FastifyInstance);

      expect(fastify.post).toHaveBeenCalledWith(
        '/',
        expect.objectContaining({
          preHandler: expect.any(Array)
        }),
        expect.any(Function)
      );
    });

    it('should register GET /:id route with authentication', async () => {
      await jobRoutes(fastify as FastifyInstance);

      expect(fastify.get).toHaveBeenCalledWith(
        '/:id',
        expect.objectContaining({
          preHandler: expect.arrayContaining([authenticate])
        }),
        expect.any(Function)
      );
    });

    it('should register POST /:id/retry route with authentication and authorization', async () => {
      await jobRoutes(fastify as FastifyInstance);

      expect(fastify.post).toHaveBeenCalledWith(
        '/:id/retry',
        expect.objectContaining({
          preHandler: expect.any(Array)
        }),
        expect.any(Function)
      );
    });

    it('should register DELETE /:id route with authentication and authorization', async () => {
      await jobRoutes(fastify as FastifyInstance);

      expect(fastify.delete).toHaveBeenCalledWith(
        '/:id',
        expect.objectContaining({
          preHandler: expect.any(Array)
        }),
        expect.any(Function)
      );
    });

    it('should register POST /batch route with authentication and authorization', async () => {
      await jobRoutes(fastify as FastifyInstance);

      expect(fastify.post).toHaveBeenCalledWith(
        '/batch',
        expect.objectContaining({
          preHandler: expect.any(Array)
        }),
        expect.any(Function)
      );
    });

    it('should bind controller methods to routes', async () => {
      await jobRoutes(fastify as FastifyInstance);

      expect(mockController.addJob).toBeDefined();
      expect(mockController.getJob).toBeDefined();
      expect(mockController.retryJob).toBeDefined();
      expect(mockController.cancelJob).toBeDefined();
      expect(mockController.addBatchJobs).toBeDefined();
    });
  });

  describe('POST / - Add Job', () => {
    it('should have authenticate middleware', async () => {
      await jobRoutes(fastify as FastifyInstance);

      const route = registeredRoutes.get('POST:/');
      expect(route.opts.preHandler).toEqual(
        expect.arrayContaining([authenticate])
      );
    });

    it('should have validateBody middleware', async () => {
      await jobRoutes(fastify as FastifyInstance);

      expect(validateBody).toHaveBeenCalled();
    });

    it('should call addJob controller method', async () => {
      await jobRoutes(fastify as FastifyInstance);

      const postCall = (fastify.post as jest.Mock).mock.calls.find(
        call => call[0] === '/'
      );
      expect(postCall[2]).toBeDefined();
    });
  });

  describe('GET /:id - Get Job', () => {
    it('should have authenticate middleware', async () => {
      await jobRoutes(fastify as FastifyInstance);

      const route = registeredRoutes.get('GET:/:id');
      expect(route.opts.preHandler).toContain(authenticate);
    });

    it('should call getJob controller method', async () => {
      await jobRoutes(fastify as FastifyInstance);

      const getCall = (fastify.get as jest.Mock).mock.calls.find(
        call => call[0] === '/:id'
      );
      expect(getCall[2]).toBeDefined();
    });
  });

  describe('POST /:id/retry - Retry Job', () => {
    it('should have authenticate middleware', async () => {
      await jobRoutes(fastify as FastifyInstance);

      const route = registeredRoutes.get('POST:/:id/retry');
      expect(route.opts.preHandler).toEqual(
        expect.arrayContaining([authenticate])
      );
    });

    it('should have authorize middleware for admin and venue_admin roles', async () => {
      await jobRoutes(fastify as FastifyInstance);

      expect(authorize).toHaveBeenCalledWith(['admin', 'venue_admin']);
    });

    it('should call retryJob controller method', async () => {
      await jobRoutes(fastify as FastifyInstance);

      const postCall = (fastify.post as jest.Mock).mock.calls.find(
        call => call[0] === '/:id/retry'
      );
      expect(postCall[2]).toBeDefined();
    });
  });

  describe('DELETE /:id - Cancel Job', () => {
    it('should have authenticate middleware', async () => {
      await jobRoutes(fastify as FastifyInstance);

      const route = registeredRoutes.get('DELETE:/:id');
      expect(route.opts.preHandler).toEqual(
        expect.arrayContaining([authenticate])
      );
    });

    it('should have authorize middleware for admin and venue_admin roles', async () => {
      await jobRoutes(fastify as FastifyInstance);

      expect(authorize).toHaveBeenCalledWith(['admin', 'venue_admin']);
    });

    it('should call cancelJob controller method', async () => {
      await jobRoutes(fastify as FastifyInstance);

      const deleteCall = (fastify.delete as jest.Mock).mock.calls.find(
        call => call[0] === '/:id'
      );
      expect(deleteCall[2]).toBeDefined();
    });
  });

  describe('POST /batch - Add Batch Jobs', () => {
    it('should have authenticate middleware', async () => {
      await jobRoutes(fastify as FastifyInstance);

      const route = registeredRoutes.get('POST:/batch');
      expect(route.opts.preHandler).toEqual(
        expect.arrayContaining([authenticate])
      );
    });

    it('should have authorize middleware for admin and venue_admin roles', async () => {
      await jobRoutes(fastify as FastifyInstance);

      expect(authorize).toHaveBeenCalledWith(['admin', 'venue_admin']);
    });

    it('should call addBatchJobs controller method', async () => {
      await jobRoutes(fastify as FastifyInstance);

      const postCall = (fastify.post as jest.Mock).mock.calls.find(
        call => call[0] === '/batch'
      );
      expect(postCall[2]).toBeDefined();
    });
  });

  describe('Middleware Order', () => {
    it('should apply middleware in correct order for admin routes', async () => {
      await jobRoutes(fastify as FastifyInstance);

      const route = registeredRoutes.get('POST:/:id/retry');
      const preHandlers = route.opts.preHandler;

      expect(preHandlers[0]).toBe(authenticate);
      expect(preHandlers[1]).toBeDefined(); // authorize middleware
    });

    it('should apply validation before controller on add job', async () => {
      await jobRoutes(fastify as FastifyInstance);

      const route = registeredRoutes.get('POST:/');
      const preHandlers = route.opts.preHandler;

      expect(preHandlers[0]).toBe(authenticate);
      expect(preHandlers[1]).toBeDefined(); // validateBody middleware
    });
  });
});

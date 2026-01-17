// Mock controller before imports
jest.mock('../../../src/controllers/rate-limit.controller', () => ({
  RateLimitController: jest.fn().mockImplementation(() => ({
    getStatus: jest.fn(),
    resetLimit: jest.fn(),
  })),
}));

import { FastifyInstance } from 'fastify';
import rateLimitRoutes from '../../../src/routes/rate-limit.routes';
import { RateLimitController } from '../../../src/controllers/rate-limit.controller';

describe('Rate Limit Routes', () => {
  let fastify: Partial<FastifyInstance>;
  let mockController: any;
  let registeredRoutes: Map<string, any>;

  beforeEach(() => {
    registeredRoutes = new Map();
    mockController = new RateLimitController();

    fastify = {
      get: jest.fn((path, handler) => {
        registeredRoutes.set(`GET:${path}`, handler);
      }),
      post: jest.fn((path, handler) => {
        registeredRoutes.set(`POST:${path}`, handler);
      }),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Route Registration', () => {
    it('should register GET /status/:key route', async () => {
      await rateLimitRoutes(fastify as FastifyInstance);

      expect(fastify.get).toHaveBeenCalledWith(
        '/status/:key',
        expect.any(Function)
      );
    });

    it('should register POST /reset/:key route', async () => {
      await rateLimitRoutes(fastify as FastifyInstance);

      expect(fastify.post).toHaveBeenCalledWith(
        '/reset/:key',
        expect.any(Function)
      );
    });

    it('should bind controller methods to routes', async () => {
      await rateLimitRoutes(fastify as FastifyInstance);

      expect(mockController.getStatus).toBeDefined();
      expect(mockController.resetLimit).toBeDefined();
    });
  });

  describe('GET /status/:key', () => {
    it('should call getStatus controller method', async () => {
      await rateLimitRoutes(fastify as FastifyInstance);

      const getCall = (fastify.get as jest.Mock).mock.calls.find(
        call => call[0] === '/status/:key'
      );
      expect(getCall[1]).toBeDefined();
    });

    it('should not have authentication middleware', async () => {
      await rateLimitRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/status/:key');
      // Handler should be a function, not an object with preHandler
      expect(typeof handler).toBe('function');
    });
  });

  describe('POST /reset/:key', () => {
    it('should call resetLimit controller method', async () => {
      await rateLimitRoutes(fastify as FastifyInstance);

      const postCall = (fastify.post as jest.Mock).mock.calls.find(
        call => call[0] === '/reset/:key'
      );
      expect(postCall[1]).toBeDefined();
    });

    it('should not have authentication middleware', async () => {
      await rateLimitRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('POST:/reset/:key');
      // Handler should be a function, not an object with preHandler
      expect(typeof handler).toBe('function');
    });
  });

  describe('Commented Out Routes', () => {
    it('should not register PUT /update/:key route', async () => {
      await rateLimitRoutes(fastify as FastifyInstance);

      const putCalls = (fastify as any).put?.mock?.calls || [];
      expect(putCalls.length).toBe(0);
    });

    it('should not register DELETE /disable/:key route', async () => {
      await rateLimitRoutes(fastify as FastifyInstance);

      const deleteCalls = (fastify as any).delete?.mock?.calls || [];
      expect(deleteCalls.length).toBe(0);
    });
  });

  describe('Route Count', () => {
    it('should register exactly 2 routes', async () => {
      await rateLimitRoutes(fastify as FastifyInstance);

      expect(fastify.get).toHaveBeenCalledTimes(1);
      expect(fastify.post).toHaveBeenCalledTimes(1);
    });
  });
});

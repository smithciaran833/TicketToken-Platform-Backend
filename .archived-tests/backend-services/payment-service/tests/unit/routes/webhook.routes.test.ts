import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import webhookRoutes from '../../../src/routes/webhook.routes';
import { WebhookController } from '../../../src/controllers/webhook.controller';

// =============================================================================
// MOCKS
// =============================================================================

jest.mock('../../../src/controllers/webhook.controller');

// =============================================================================
// TEST SUITE
// =============================================================================

describe('webhookRoutes', () => {
  let mockFastify: any;
  let mockController: jest.Mocked<WebhookController>;
  let registeredRoutes: any[];

  beforeEach(() => {
    jest.clearAllMocks();
    registeredRoutes = [];

    // Mock Fastify instance
    mockFastify = {
      post: jest.fn((path, options, handler) => {
        registeredRoutes.push({ method: 'POST', path, options, handler });
      }),
    };

    // Mock controller
    mockController = {
      handleStripeWebhook: jest.fn(),
    } as any;

    (WebhookController as jest.MockedClass<typeof WebhookController>).mockImplementation(
      () => mockController
    );
  });

  // ===========================================================================
  // Route Registration - 4 test cases
  // ===========================================================================

  describe('Route Registration', () => {
    it('should register POST /stripe route', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      expect(mockFastify.post).toHaveBeenCalledWith(
        '/stripe',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should create WebhookController instance', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      expect(WebhookController).toHaveBeenCalledTimes(1);
    });

    it('should register exactly one route', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      expect(registeredRoutes).toHaveLength(1);
    });

    it('should register route with correct path', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      expect(registeredRoutes[0].path).toBe('/stripe');
      expect(registeredRoutes[0].method).toBe('POST');
    });
  });

  // ===========================================================================
  // Route Handler - 3 test cases
  // ===========================================================================

  describe('Route Handler', () => {
    it('should call controller handleStripeWebhook method', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes[0].handler;
      const mockRequest = {} as FastifyRequest;
      const mockReply = {} as FastifyReply;

      await handler(mockRequest, mockReply);

      expect(mockController.handleStripeWebhook).toHaveBeenCalledWith(
        mockRequest,
        mockReply
      );
    });

    it('should pass request to controller', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes[0].handler;
      const mockRequest = { body: { test: 'data' } } as any;
      const mockReply = {} as FastifyReply;

      await handler(mockRequest, mockReply);

      expect(mockController.handleStripeWebhook).toHaveBeenCalledWith(
        mockRequest,
        expect.any(Object)
      );
    });

    it('should pass reply to controller', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes[0].handler;
      const mockRequest = {} as FastifyRequest;
      const mockReply = { send: jest.fn() } as any;

      await handler(mockRequest, mockReply);

      expect(mockController.handleStripeWebhook).toHaveBeenCalledWith(
        expect.any(Object),
        mockReply
      );
    });
  });

  // ===========================================================================
  // Route Configuration - 2 test cases
  // ===========================================================================

  describe('Route Configuration', () => {
    it('should have route options object', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      expect(registeredRoutes[0].options).toBeDefined();
      expect(typeof registeredRoutes[0].options).toBe('object');
    });

    it('should return handler result', async () => {
      const expectedResult = { success: true };
      mockController.handleStripeWebhook.mockResolvedValue(expectedResult as any);

      await webhookRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes[0].handler;
      const mockRequest = {} as FastifyRequest;
      const mockReply = {} as FastifyReply;

      const result = await handler(mockRequest, mockReply);

      expect(result).toEqual(expectedResult);
    });
  });
});

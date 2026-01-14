import { FastifyInstance } from 'fastify';
import crypto from 'crypto';

// Mock dependencies
const mockProcessPaymentSuccess = jest.fn();
const mockProcessPaymentFailure = jest.fn();

jest.mock('../../../src/services/queueListener', () => ({
  QueueListener: {
    processPaymentSuccess: mockProcessPaymentSuccess,
    processPaymentFailure: mockProcessPaymentFailure,
  },
}));

const mockPoolQuery = jest.fn();
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    getPool: jest.fn(() => ({
      query: mockPoolQuery,
    })),
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

// Set env before import
process.env.NODE_ENV = 'development';
process.env.INTERNAL_WEBHOOK_SECRET = 'test-webhook-secret';

import webhookRoutes from '../../../src/routes/webhookRoutes';

describe('Webhook Routes', () => {
  let mockFastify: Partial<FastifyInstance>;
  let routes: Record<string, { handler: Function; preHandler?: Function[] }>;

  beforeEach(() => {
    jest.clearAllMocks();
    routes = {};

    mockFastify = {
      post: jest.fn((path, opts, handler) => {
        routes[`POST ${path}`] = { handler, preHandler: opts?.preHandler };
      }),
    };

    // Mock successful nonce check
    mockPoolQuery.mockResolvedValue({ rows: [] });
  });

  it('should register webhook routes', async () => {
    await webhookRoutes(mockFastify as FastifyInstance);

    expect(mockFastify.post).toHaveBeenCalledWith(
      '/payment-success',
      expect.any(Object),
      expect.any(Function)
    );
    expect(mockFastify.post).toHaveBeenCalledWith(
      '/payment-failed',
      expect.any(Object),
      expect.any(Function)
    );
  });

  describe('POST /payment-success', () => {
    it('should process payment success', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      mockProcessPaymentSuccess.mockResolvedValue(undefined);

      const mockReply = { send: jest.fn(), status: jest.fn().mockReturnThis() };
      const mockRequest = {
        body: {
          orderId: 'order-123',
          paymentId: 'payment-456',
          tenantId: 'tenant-789',
        },
        webhookMetadata: { nonce: 'test-nonce' },
      };

      await routes['POST /payment-success'].handler(mockRequest, mockReply);

      expect(mockProcessPaymentSuccess).toHaveBeenCalledWith('order-123', 'payment-456');
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ processed: true })
      );
    });

    it('should return 400 for missing fields', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      const mockReply = { send: jest.fn(), status: jest.fn().mockReturnThis() };
      const mockRequest = {
        body: {},
        webhookMetadata: {},
      };

      await routes['POST /payment-success'].handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should return 500 on processing failure', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      mockProcessPaymentSuccess.mockRejectedValue(new Error('Processing failed'));

      const mockReply = { send: jest.fn(), status: jest.fn().mockReturnThis() };
      const mockRequest = {
        body: {
          orderId: 'order-123',
          paymentId: 'payment-456',
        },
        webhookMetadata: {},
      };

      await routes['POST /payment-success'].handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('POST /payment-failed', () => {
    it('should process payment failure', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      mockProcessPaymentFailure.mockResolvedValue(undefined);

      const mockReply = { send: jest.fn(), status: jest.fn().mockReturnThis() };
      const mockRequest = {
        body: {
          orderId: 'order-123',
          reason: 'Card declined',
          tenantId: 'tenant-789',
        },
        webhookMetadata: { nonce: 'test-nonce' },
      };

      await routes['POST /payment-failed'].handler(mockRequest, mockReply);

      expect(mockProcessPaymentFailure).toHaveBeenCalledWith('order-123', 'Card declined');
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ processed: true })
      );
    });

    it('should return 400 for missing orderId', async () => {
      await webhookRoutes(mockFastify as FastifyInstance);

      const mockReply = { send: jest.fn(), status: jest.fn().mockReturnThis() };
      const mockRequest = {
        body: { reason: 'Card declined' },
        webhookMetadata: {},
      };

      await routes['POST /payment-failed'].handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });
});

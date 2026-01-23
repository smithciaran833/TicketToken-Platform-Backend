// @ts-nocheck
/**
 * Internal Routes Unit Tests - payment-service
 *
 * Tests for the internal routes endpoints:
 * - POST /internal/payment-complete
 * - POST /internal/payment-intents
 * - POST /internal/payment-intents/:paymentIntentId/confirm
 * - POST /internal/payment-intents/:paymentIntentId/cancel
 * - GET /internal/payment-intents/:paymentIntentId/status
 * - POST /internal/refunds
 * - GET /internal/royalties/order/:orderId
 * - POST /internal/royalties/reverse
 *
 * Phase A HMAC Standardization - Decision #2 Implementation
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';

// Mock environment
process.env.INTERNAL_HMAC_SECRET = 'test-secret-key-must-be-32-chars-long';
process.env.USE_NEW_HMAC = 'false'; // Disable HMAC for route logic tests
process.env.NODE_ENV = 'test';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

// Mock Stripe
const mockStripe = {
  paymentIntents: {
    create: jest.fn(),
    confirm: jest.fn(),
    cancel: jest.fn(),
    retrieve: jest.fn(),
  },
  refunds: {
    create: jest.fn(),
  },
};

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => mockStripe);
});

// Mock the database (knex)
const mockDb = jest.fn();
mockDb.mockReturnValue({
  where: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  first: jest.fn().mockResolvedValue(null),
  returning: jest.fn().mockResolvedValue([]),
});

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

// Mock internal auth middleware
jest.mock('../../../src/middleware/internal-auth', () => ({
  internalAuth: jest.fn(async (request, reply) => {
    // Pass through without validation for testing
    (request as any).internalService = request.headers['x-internal-service'];
  }),
}));

// Mock config to prevent initialization errors - must be before logger mock
jest.mock('../../../src/config', () => ({
  config: {
    server: {
      env: 'test',
    },
  },
}));

// Mock logger - the logger module initializes pino, so we mock it completely
const mockChildLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
  trace: jest.fn(),
  child: jest.fn(),
  setRequestContext: jest.fn(),
  setPaymentContext: jest.fn(),
  clearContext: jest.fn(),
  getCorrelationId: jest.fn(),
  paymentCreated: jest.fn(),
  paymentSucceeded: jest.fn(),
  paymentFailed: jest.fn(),
  refundProcessed: jest.fn(),
  transferCreated: jest.fn(),
  webhookReceived: jest.fn(),
  securityEvent: jest.fn(),
};
mockChildLogger.child = jest.fn(() => mockChildLogger);

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => mockChildLogger),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    trace: jest.fn(),
    setRequestContext: jest.fn(),
    setPaymentContext: jest.fn(),
    clearContext: jest.fn(),
    getCorrelationId: jest.fn(),
  },
  pinoLogger: {
    child: jest.fn(() => mockChildLogger),
  },
  createRequestLogger: jest.fn(() => mockChildLogger),
  getLogLevel: jest.fn(() => 'info'),
}));

import internalRoutes from '../../../src/routes/internal.routes';

describe('Internal Routes - payment-service', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    // Note: internal.routes.ts already defines routes with /internal prefix
    await app.register(internalRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.mockClear();
    mockDb.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
      returning: jest.fn().mockResolvedValue([]),
    });
  });

  // =========================================================================
  // POST /internal/payment-complete
  // =========================================================================

  describe('POST /internal/payment-complete', () => {
    test('should mark payment as completed', async () => {
      const mockTransaction = {
        id: 'payment-123',
        order_id: 'order-456',
        status: 'completed',
      };

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([mockTransaction]),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/internal/payment-complete',
        payload: {
          orderId: 'order-456',
          paymentId: 'payment-123',
        },
        headers: {
          'x-internal-service': 'order-service',
          'x-trace-id': 'trace-123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.orderId).toBe('order-456');
      expect(body.paymentId).toBe('payment-123');
    });
  });

  // =========================================================================
  // POST /internal/payment-intents
  // =========================================================================

  describe('POST /internal/payment-intents', () => {
    test('should create a payment intent', async () => {
      const mockPaymentIntent = {
        id: 'pi_test_123',
        client_secret: 'pi_test_123_secret',
        amount: 10000,
        currency: 'usd',
        status: 'requires_payment_method',
      };

      mockStripe.paymentIntents.create.mockResolvedValue(mockPaymentIntent);
      mockDb.mockReturnValue({
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'pi_test_123' }]),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/internal/payment-intents',
        payload: {
          amount: 10000,
          currency: 'USD',
          orderId: 'order-789',
          customerId: 'cus_test',
        },
        headers: {
          'x-internal-service': 'order-service',
          'x-trace-id': 'trace-456',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.paymentIntent).toBeDefined();
      expect(body.paymentIntent.id).toBe('pi_test_123');
      expect(body.paymentIntent.amount).toBe(10000);
    });

    test('should handle Stripe errors gracefully', async () => {
      mockStripe.paymentIntents.create.mockRejectedValue(new Error('Card declined'));

      const response = await app.inject({
        method: 'POST',
        url: '/internal/payment-intents',
        payload: {
          amount: 10000,
          currency: 'USD',
          orderId: 'order-error',
        },
        headers: {
          'x-internal-service': 'order-service',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Failed to create payment intent');
    });
  });

  // =========================================================================
  // POST /internal/payment-intents/:paymentIntentId/confirm
  // =========================================================================

  describe('POST /internal/payment-intents/:paymentIntentId/confirm', () => {
    test('should confirm a payment intent', async () => {
      const mockPaymentIntent = {
        id: 'pi_test_456',
        status: 'succeeded',
        amount: 10000,
      };

      mockStripe.paymentIntents.confirm.mockResolvedValue(mockPaymentIntent);
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/internal/payment-intents/pi_test_456/confirm',
        payload: {
          paymentMethodId: 'pm_test_123',
        },
        headers: {
          'x-internal-service': 'order-service',
          'x-trace-id': 'trace-789',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.paymentIntent.status).toBe('succeeded');
    });
  });

  // =========================================================================
  // POST /internal/payment-intents/:paymentIntentId/cancel
  // =========================================================================

  describe('POST /internal/payment-intents/:paymentIntentId/cancel', () => {
    test('should cancel a payment intent', async () => {
      const mockPaymentIntent = {
        id: 'pi_test_789',
        status: 'canceled',
      };

      mockStripe.paymentIntents.cancel.mockResolvedValue(mockPaymentIntent);
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/internal/payment-intents/pi_test_789/cancel',
        payload: {
          cancellationReason: 'requested_by_customer',
        },
        headers: {
          'x-internal-service': 'order-service',
          'x-trace-id': 'trace-abc',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.paymentIntent.status).toBe('canceled');
    });
  });

  // =========================================================================
  // GET /internal/payment-intents/:paymentIntentId/status
  // =========================================================================

  describe('GET /internal/payment-intents/:paymentIntentId/status', () => {
    test('should return payment intent status', async () => {
      const mockPaymentIntent = {
        id: 'pi_test_status',
        status: 'succeeded',
        amount: 15000,
        currency: 'usd',
        amount_received: 15000,
        metadata: { orderId: 'order-123' },
      };

      const mockTransaction = {
        id: 'tx_123',
        order_id: 'order-123',
        status: 'completed',
      };

      mockStripe.paymentIntents.retrieve.mockResolvedValue(mockPaymentIntent);
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockTransaction),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/payment-intents/pi_test_status/status',
        headers: {
          'x-internal-service': 'order-service',
          'x-trace-id': 'trace-def',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.paymentIntent.id).toBe('pi_test_status');
      expect(body.paymentIntent.status).toBe('succeeded');
      expect(body.transaction).toBeDefined();
      expect(body.transaction.localStatus).toBe('completed');
    });
  });

  // =========================================================================
  // POST /internal/refunds
  // =========================================================================

  describe('POST /internal/refunds', () => {
    test('should process a refund', async () => {
      const mockPaymentIntent = {
        id: 'pi_refund_test',
        latest_charge: 'ch_test_123',
      };

      const mockRefund = {
        id: 're_test_123',
        amount: 5000,
        status: 'succeeded',
        currency: 'usd',
      };

      mockStripe.paymentIntents.retrieve.mockResolvedValue(mockPaymentIntent);
      mockStripe.refunds.create.mockResolvedValue(mockRefund);
      mockDb.mockReturnValue({
        insert: jest.fn().mockResolvedValue([{ id: 're_test_123' }]),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/internal/refunds',
        payload: {
          paymentIntentId: 'pi_refund_test',
          amount: 5000,
          reason: 'requested_by_customer',
        },
        headers: {
          'x-internal-service': 'order-service',
          'x-trace-id': 'trace-refund',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.refund.id).toBe('re_test_123');
      expect(body.refund.amount).toBe(5000);
    });

    test('should return 400 when no charge found', async () => {
      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_no_charge',
        latest_charge: null,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/internal/refunds',
        payload: {
          paymentIntentId: 'pi_no_charge',
        },
        headers: {
          'x-internal-service': 'order-service',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('no charge found');
    });
  });

  // =========================================================================
  // GET /internal/royalties/order/:orderId
  // =========================================================================

  describe('GET /internal/royalties/order/:orderId', () => {
    test('should return royalty distributions for order', async () => {
      const mockDistributions = [
        { id: 'd1', recipient_id: 'artist-1', amount: 500, currency: 'USD', status: 'completed', created_at: new Date() },
        { id: 'd2', recipient_id: 'venue-1', amount: 300, currency: 'USD', status: 'completed', created_at: new Date() },
      ];

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(mockDistributions),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/royalties/order/order-royalty-123',
        headers: {
          'x-internal-service': 'order-service',
          'x-trace-id': 'trace-royalty',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.orderId).toBe('order-royalty-123');
      expect(body.distributions).toHaveLength(2);
      expect(body.summary.totalDistributions).toBe(2);
      expect(body.summary.totalAmount).toBe(800);
    });

    test('should return empty distributions for order with none', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue([]),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/royalties/order/order-no-royalties',
        headers: {
          'x-internal-service': 'order-service',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.distributions).toHaveLength(0);
      expect(body.summary.totalAmount).toBe(0);
    });
  });

  // =========================================================================
  // POST /internal/royalties/reverse
  // =========================================================================

  describe('POST /internal/royalties/reverse', () => {
    test('should reverse royalty distributions for refund', async () => {
      const mockOriginalDistributions = [
        { id: 'd1', recipient_id: 'artist-1', amount: 500, status: 'completed' },
        { id: 'd2', recipient_id: 'venue-1', amount: 300, status: 'completed' },
      ];

      const mockReversals = [
        { id: 'r1', original_distribution_id: 'd1', recipient_id: 'artist-1', original_amount: 500, reversal_amount: 500 },
        { id: 'r2', original_distribution_id: 'd2', recipient_id: 'venue-1', original_amount: 300, reversal_amount: 300 },
      ];

      let reversalCallCount = 0;
      let distCallCount = 0;
      mockDb.mockImplementation((table: string) => {
        if (table === 'royalty_reversals') {
          return {
            insert: jest.fn().mockReturnThis(),
            returning: jest.fn().mockResolvedValue([mockReversals[reversalCallCount++] || mockReversals[0]]),
          };
        }
        if (table === 'royalty_distributions') {
          distCallCount++;
          // First call: get original distributions
          // Subsequent calls: update distribution status
          if (distCallCount === 1) {
            return {
              where: jest.fn().mockImplementation(() => ({
                where: jest.fn().mockResolvedValue(mockOriginalDistributions),
              })),
            };
          } else {
            return {
              where: jest.fn().mockReturnThis(),
              update: jest.fn().mockResolvedValue(1),
            };
          }
        }
        return {
          where: jest.fn().mockReturnThis(),
        };
      });

      const response = await app.inject({
        method: 'POST',
        url: '/internal/royalties/reverse',
        payload: {
          orderId: 'order-reverse-123',
          refundId: 'refund-456',
          refundAmount: 800,
          reason: 'customer_refund',
        },
        headers: {
          'x-internal-service': 'order-service',
          'x-trace-id': 'trace-reverse',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.reversals).toBeDefined();
    });

    test('should return success with empty reversals if none to reverse', async () => {
      mockDb.mockImplementation((table: string) => {
        if (table === 'royalty_distributions') {
          return {
            where: jest.fn().mockImplementation(() => ({
              where: jest.fn().mockResolvedValue([]), // No distributions
            })),
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
        };
      });

      const response = await app.inject({
        method: 'POST',
        url: '/internal/royalties/reverse',
        payload: {
          orderId: 'order-no-royalties',
          refundId: 'refund-789',
          refundAmount: 1000,
        },
        headers: {
          'x-internal-service': 'order-service',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('No royalty distributions to reverse');
    });
  });

  // =========================================================================
  // Error Handling Tests
  // =========================================================================

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockRejectedValue(new Error('Database connection failed')),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/internal/payment-complete',
        payload: {
          orderId: 'order-error',
          paymentId: 'payment-error',
        },
        headers: {
          'x-internal-service': 'order-service',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Failed to complete payment');
    });

    test('should handle Stripe errors on status lookup', async () => {
      mockStripe.paymentIntents.retrieve.mockRejectedValue(new Error('Invalid payment intent'));

      const response = await app.inject({
        method: 'GET',
        url: '/internal/payment-intents/invalid/status',
        headers: {
          'x-internal-service': 'order-service',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Failed to get payment intent status');
    });
  });
});

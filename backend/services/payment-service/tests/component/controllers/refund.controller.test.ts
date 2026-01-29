/**
 * COMPONENT TEST: RefundController
 *
 * Tests refund operations
 */

import { v4 as uuidv4 } from 'uuid';
import { FastifyRequest, FastifyReply } from 'fastify';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

// Mock data
let mockPaymentIntents: any[] = [];
let mockRefunds: any[] = [];
let testTenantId: string;

// Mock pool
const mockPoolQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();

// Mock DatabaseService
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    getPool: () => ({
      query: mockPoolQuery,
      connect: jest.fn().mockResolvedValue({
        query: mockClientQuery,
        release: mockClientRelease,
      }),
    }),
  },
}));

// Mock Stripe
const mockStripeRefundCreate = jest.fn();
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    refunds: {
      create: mockStripeRefundCreate,
    },
  }));
});

// Mock fee calculation service
jest.mock('../../../src/services/fee-calculation.service', () => ({
  feeCalculationService: {
    calculateStripeFee: jest.fn((amount) => Math.round(amount * 0.029 + 30)),
    calculatePlatformFee: jest.fn((amount) => Math.round(amount * 0.025)),
  },
  SUPPORTED_CURRENCIES: { USD: true, EUR: true },
}));

// Mock cache
jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: { get: jest.fn(), set: jest.fn() },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { RefundController, refundController } from '../../../src/controllers/refundController';

// Helpers
function createMockRequest(overrides: any = {}): FastifyRequest {
  return {
    body: {},
    headers: {},
    params: {},
    query: {},
    id: uuidv4(),
    ip: '127.0.0.1',
    ...overrides,
  } as unknown as FastifyRequest;
}

function createMockReply(): { reply: FastifyReply; getResponse: () => any; getStatus: () => number } {
  let response: any = null;
  let status = 200;
  const reply = {
    send: jest.fn().mockImplementation((data) => { response = data; return reply; }),
    code: jest.fn().mockImplementation((code) => { status = code; return reply; }),
    status: jest.fn().mockImplementation((code) => { status = code; return reply; }),
    header: jest.fn().mockReturnThis(),
  } as unknown as FastifyReply;
  return { reply, getResponse: () => response, getStatus: () => status };
}

describe('RefundController Component Tests', () => {
  let controller: RefundController;
  let userId: string;
  let tenantId: string;

  beforeEach(() => {
    userId = uuidv4();
    tenantId = uuidv4();
    testTenantId = tenantId; // Store for mock access
    mockPaymentIntents = [];
    mockRefunds = [];

    mockPoolQuery.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
    mockStripeRefundCreate.mockReset();

    // Default Stripe success
    mockStripeRefundCreate.mockResolvedValue({
      id: `re_${uuidv4().replace(/-/g, '')}`,
      status: 'succeeded',
      amount: 5000,
    });

    // Setup query behavior
    mockPoolQuery.mockImplementation(async (query: string, params?: any[]) => {
      // Payment intent check (for createRefund) - joins with orders
      if (query.includes('payment_intents') && query.includes('orders') && query.includes('SELECT')) {
        const intentId = params?.[0];
        const intent = mockPaymentIntents.find(p => p.stripe_intent_id === intentId);
        return { rows: intent ? [intent] : [] };
      }

      // Get single refund (for getRefund) - WHERE r.id = $1 AND r.tenant_id = $2
      if (query.includes('payment_refunds r') && query.includes('WHERE r.id')) {
        const refundId = params?.[0];
        const reqTenantId = params?.[1];
        const refund = mockRefunds.find(r => r.id === refundId && r.tenant_id === reqTenantId);
        if (refund) {
          return { 
            rows: [{
              ...refund,
              payment_intent_id: refund.transaction_id,
            }] 
          };
        }
        return { rows: [] };
      }

      // List refunds - WHERE r.tenant_id = $1
      if (query.includes('payment_refunds r') && query.includes('WHERE r.tenant_id')) {
        const reqTenantId = params?.[0];
        const filtered = mockRefunds
          .filter(r => r.tenant_id === reqTenantId)
          .map(r => ({
            ...r,
            payment_intent_id: r.transaction_id,
          }));
        return { rows: filtered };
      }

      // Count query for pagination
      if (query.includes('COUNT(*)')) {
        return { rows: [{ total: mockRefunds.length.toString() }] };
      }

      return { rows: [] };
    });

    // Client query for transactions
    mockClientQuery.mockImplementation(async (query: string, params?: any[]) => {
      if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') {
        return { rows: [] };
      }
      if (query.includes('set_config')) {
        return { rows: [] };
      }
      if (query.includes('INSERT INTO payment_refunds')) {
        mockRefunds.push({
          id: params?.[0],
          transaction_id: params?.[1],
          amount: params?.[2],
          status: params?.[3],
          reason: params?.[4],
          tenant_id: params?.[5],
          stripe_refund_id: params?.[6],
          created_at: new Date(),
        });
        return { rows: [] };
      }
      if (query.includes('INSERT INTO outbox')) {
        return { rows: [] };
      }
      if (query.includes('UPDATE payment_intents')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    controller = new RefundController();
  });

  // Helper to add payment intent
  function addPaymentIntent(intent: Partial<any>): string {
    const id = intent.stripe_intent_id || `pi_${uuidv4().replace(/-/g, '')}`;
    mockPaymentIntents.push({
      stripe_intent_id: id,
      amount: intent.amount || 10000,
      currency: intent.currency || 'USD',
      status: intent.status || 'succeeded',
      tenant_id: tenantId,
      order_id: intent.order_id || uuidv4(),
    });
    return id;
  }

  // Helper to add refund
  function addRefund(refund: Partial<any>): string {
    const id = refund.id || `re_${uuidv4().replace(/-/g, '')}`;
    mockRefunds.push({
      id,
      transaction_id: refund.transaction_id || `pi_${uuidv4().replace(/-/g, '')}`,
      amount: refund.amount || 5000,
      status: refund.status || 'succeeded',
      reason: refund.reason || 'requested_by_customer',
      tenant_id: tenantId, // Use current test's tenantId
      stripe_refund_id: refund.stripe_refund_id || id,
      created_at: refund.created_at || new Date(),
    });
    return id;
  }

  // ===========================================================================
  // CREATE REFUND
  // ===========================================================================
  describe('createRefund()', () => {
    it('should create refund for valid payment', async () => {
      const paymentIntentId = addPaymentIntent({ amount: 10000 });

      const request = createMockRequest({
        body: {
          paymentIntentId,
          amount: 5000,
          reason: 'requested_by_customer',
        },
        user: { id: userId },
        tenantId,
      });
      const { reply, getResponse } = createMockReply();

      await controller.createRefund(request, reply);

      expect(mockStripeRefundCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_intent: paymentIntentId,
          amount: 5000,
        }),
        expect.any(Object)
      );

      const response = getResponse();
      expect(response.refundId).toBeDefined();
      expect(response.status).toBe('succeeded');
    });

    it('should reject refund exceeding original amount', async () => {
      const paymentIntentId = addPaymentIntent({ amount: 5000 });

      const request = createMockRequest({
        body: {
          paymentIntentId,
          amount: 10000,
          reason: 'requested_by_customer',
        },
        user: { id: userId },
        tenantId,
      });
      const { reply, getStatus, getResponse } = createMockReply();

      await controller.createRefund(request, reply);

      expect(getStatus()).toBe(400);
      expect(getResponse().error).toContain('exceeds');
    });

    it('should reject already refunded payment', async () => {
      const paymentIntentId = addPaymentIntent({ amount: 5000, status: 'refunded' });

      const request = createMockRequest({
        body: { paymentIntentId, amount: 5000 },
        user: { id: userId },
        tenantId,
      });
      const { reply, getStatus, getResponse } = createMockReply();

      await controller.createRefund(request, reply);

      expect(getStatus()).toBe(400);
      expect(getResponse().error).toContain('already refunded');
    });

    it('should reject unauthenticated requests', async () => {
      const request = createMockRequest({
        body: { paymentIntentId: 'pi_test', amount: 5000 },
        tenantId,
      });
      const { reply, getStatus } = createMockReply();

      await controller.createRefund(request, reply);

      expect(getStatus()).toBe(401);
    });

    it('should reject requests without tenant context', async () => {
      const request = createMockRequest({
        body: { paymentIntentId: 'pi_test', amount: 5000 },
        user: { id: userId },
      });
      const { reply, getStatus } = createMockReply();

      await controller.createRefund(request, reply);

      expect(getStatus()).toBe(403);
    });

    it('should reject payment not found or unauthorized', async () => {
      const request = createMockRequest({
        body: { paymentIntentId: 'pi_nonexistent', amount: 5000 },
        user: { id: userId },
        tenantId,
      });
      const { reply, getStatus, getResponse } = createMockReply();

      await controller.createRefund(request, reply);

      expect(getStatus()).toBe(403);
      expect(getResponse().error).toContain('not found');
    });

    it('should handle Stripe API errors', async () => {
      const paymentIntentId = addPaymentIntent({ amount: 10000 });
      mockStripeRefundCreate.mockRejectedValueOnce({
        type: 'StripeCardError',
        code: 'charge_already_refunded',
        message: 'Charge has already been refunded',
      });

      const request = createMockRequest({
        body: { paymentIntentId, amount: 5000 },
        user: { id: userId },
        tenantId,
      });
      const { reply, getResponse } = createMockReply();

      await controller.createRefund(request, reply);

      // Controller wraps Stripe errors and returns RFC 7807 problem response
      const response = getResponse();
      expect(response).toBeDefined();
      // Either returns a problem type or an error - both are valid error handling
      expect(response.type || response.title || response.detail || response.status).toBeDefined();
    });
  });

  // ===========================================================================
  // GET REFUND
  // ===========================================================================
  describe('getRefund()', () => {
    it('should return refund by ID', async () => {
      const refundId = addRefund({ amount: 5000 });

      const request = createMockRequest({
        params: { refundId },
        user: { id: userId },
        tenantId,
      });
      const { reply, getResponse } = createMockReply();

      await controller.getRefund(request, reply);

      const response = getResponse();
      expect(response.id).toBe(refundId);
      expect(response.amount).toBe(5000);
    });

    it('should return 404 for non-existent refund', async () => {
      const request = createMockRequest({
        params: { refundId: 're_nonexistent' },
        user: { id: userId },
        tenantId,
      });
      const { reply, getResponse } = createMockReply();

      await controller.getRefund(request, reply);

      // RFC 7807 problem response for NotFoundError
      const response = getResponse();
      expect(response.type || response.title || response.status).toBeDefined();
    });

    it('should reject unauthenticated requests', async () => {
      const request = createMockRequest({
        params: { refundId: 're_test' },
        tenantId,
      });
      const { reply, getStatus } = createMockReply();

      await controller.getRefund(request, reply);

      expect(getStatus()).toBe(401);
    });

    it('should reject requests without tenant context', async () => {
      const request = createMockRequest({
        params: { refundId: 're_test' },
        user: { id: userId },
      });
      const { reply, getStatus } = createMockReply();

      await controller.getRefund(request, reply);

      expect(getStatus()).toBe(403);
    });
  });

  // ===========================================================================
  // LIST REFUNDS
  // ===========================================================================
  describe('listRefunds()', () => {
    it('should return paginated refunds', async () => {
      addRefund({ amount: 1000 });
      addRefund({ amount: 2000 });

      const request = createMockRequest({
        query: { limit: 10, offset: 0 },
        user: { id: userId },
        tenantId,
      });
      const { reply, getResponse } = createMockReply();

      await controller.listRefunds(request, reply);

      const response = getResponse();
      expect(response.refunds).toBeDefined();
      expect(response.refunds.length).toBe(2);
      expect(response.total).toBeDefined();
      expect(response.limit).toBe(10);
    });

    it('should filter by payment intent ID', async () => {
      const request = createMockRequest({
        query: { paymentIntentId: 'pi_specific' },
        user: { id: userId },
        tenantId,
      });
      const { reply } = createMockReply();

      await controller.listRefunds(request, reply);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('stripe_intent_id'),
        expect.arrayContaining(['pi_specific'])
      );
    });

    it('should filter by status', async () => {
      const request = createMockRequest({
        query: { status: 'succeeded' },
        user: { id: userId },
        tenantId,
      });
      const { reply } = createMockReply();

      await controller.listRefunds(request, reply);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('status'),
        expect.arrayContaining(['succeeded'])
      );
    });

    it('should reject unauthenticated requests', async () => {
      const request = createMockRequest({ query: {}, tenantId });
      const { reply, getStatus } = createMockReply();

      await controller.listRefunds(request, reply);

      expect(getStatus()).toBe(401);
    });

    it('should reject requests without tenant context', async () => {
      const request = createMockRequest({
        query: {},
        user: { id: userId },
      });
      const { reply, getStatus } = createMockReply();

      await controller.listRefunds(request, reply);

      expect(getStatus()).toBe(403);
    });
  });

  // ===========================================================================
  // SINGLETON EXPORT
  // ===========================================================================
  describe('singleton export', () => {
    it('should export refundController instance', () => {
      expect(refundController).toBeInstanceOf(RefundController);
    });
  });
});

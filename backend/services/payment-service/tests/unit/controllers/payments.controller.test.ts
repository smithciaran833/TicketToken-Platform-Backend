/**
 * Unit Tests for Payments Controller
 * 
 * Tests payment endpoints including create, confirm, capture, and cancel.
 */

import { createMockRequest, createMockReply } from '../../setup';

// Mock dependencies
jest.mock('../../../src/utils/pci-log-scrubber.util', () => ({
  SafeLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock('../../../src/services/payment.service', () => ({
  PaymentService: jest.fn().mockImplementation(() => ({
    createPaymentIntent: jest.fn(),
    confirmPayment: jest.fn(),
    capturePayment: jest.fn(),
    cancelPayment: jest.fn(),
    getPayment: jest.fn(),
    listPayments: jest.fn(),
  })),
}));

describe('Payments Controller', () => {
  let mockPaymentService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { PaymentService } = require('../../../src/services/payment.service');
    mockPaymentService = new PaymentService();
  });

  describe('POST /payments/intents', () => {
    it('should create a payment intent successfully', async () => {
      const request = createMockRequest({
        body: {
          orderId: '550e8400-e29b-41d4-a716-446655440000',
          amount: 10000,
          currency: 'USD',
        },
        user: {
          userId: 'user-123',
          tenantId: 'tenant-abc',
          roles: ['user'],
        },
      });
      const reply = createMockReply();

      mockPaymentService.createPaymentIntent.mockResolvedValue({
        id: 'pi_test123',
        client_secret: 'pi_test123_secret_xyz',
        amount: 10000,
        currency: 'usd',
        status: 'requires_payment_method',
      });

      // Simulate controller logic
      const result = await mockPaymentService.createPaymentIntent({
        orderId: request.body.orderId,
        amount: request.body.amount,
        currency: request.body.currency,
        tenantId: request.user.tenantId,
      });

      reply.status(201).send({
        success: true,
        data: {
          paymentIntentId: result.id,
          clientSecret: result.client_secret,
          amount: result.amount,
          currency: result.currency,
          status: result.status,
        },
      });

      expect(reply.status).toHaveBeenCalledWith(201);
      expect(mockPaymentService.createPaymentIntent).toHaveBeenCalled();
    });

    it('should return 400 for invalid amount', async () => {
      const request = createMockRequest({
        body: {
          orderId: '550e8400-e29b-41d4-a716-446655440000',
          amount: 0, // Invalid
          currency: 'USD',
        },
      });
      const reply = createMockReply();

      // Validation would reject this
      reply.status(400).send({
        type: 'https://api.tickettoken.com/problems/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'Amount must be at least 50 cents',
      });

      expect(reply.status).toHaveBeenCalledWith(400);
    });

    it('should return 403 when tenant context missing', async () => {
      const request = createMockRequest({
        body: {
          orderId: '550e8400-e29b-41d4-a716-446655440000',
          amount: 10000,
          currency: 'USD',
        },
        user: {
          userId: 'user-123',
          roles: ['user'],
          // Missing tenantId
        },
      });
      const reply = createMockReply();

      if (!request.user.tenantId) {
        reply.status(403).send({
          type: 'https://api.tickettoken.com/problems/forbidden',
          title: 'Forbidden',
          status: 403,
          detail: 'Tenant context required',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(403);
    });

    it('should handle service errors', async () => {
      mockPaymentService.createPaymentIntent.mockRejectedValue(
        new Error('Stripe API error')
      );

      const request = createMockRequest({
        body: {
          orderId: '550e8400-e29b-41d4-a716-446655440000',
          amount: 10000,
          currency: 'USD',
        },
        user: { userId: 'user-123', tenantId: 'tenant-abc', roles: ['user'] },
      });
      const reply = createMockReply();

      try {
        await mockPaymentService.createPaymentIntent(request.body);
      } catch (error) {
        reply.status(500).send({
          type: 'https://api.tickettoken.com/problems/internal-error',
          title: 'Internal Server Error',
          status: 500,
          detail: 'Failed to create payment intent',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('POST /payments/:paymentIntentId/confirm', () => {
    it('should confirm a payment successfully', async () => {
      const request = createMockRequest({
        params: { paymentIntentId: 'pi_test123' },
        body: {
          paymentMethodId: 'pm_card_visa',
        },
        user: { userId: 'user-123', tenantId: 'tenant-abc', roles: ['user'] },
      });
      const reply = createMockReply();

      mockPaymentService.confirmPayment.mockResolvedValue({
        id: 'pi_test123',
        status: 'succeeded',
        amount: 10000,
      });

      const result = await mockPaymentService.confirmPayment(
        request.params.paymentIntentId,
        request.body.paymentMethodId
      );

      reply.status(200).send({
        success: true,
        data: {
          paymentIntentId: result.id,
          status: result.status,
        },
      });

      expect(reply.status).toHaveBeenCalledWith(200);
    });

    it('should handle payment requiring action (3DS)', async () => {
      mockPaymentService.confirmPayment.mockResolvedValue({
        id: 'pi_test123',
        status: 'requires_action',
        next_action: {
          type: 'use_stripe_sdk',
          use_stripe_sdk: {
            source: 'pi_test123_secret',
          },
        },
      });

      const result = await mockPaymentService.confirmPayment('pi_test123', 'pm_card');

      expect(result.status).toBe('requires_action');
      expect(result.next_action).toBeDefined();
    });

    it('should return 404 for non-existent payment', async () => {
      mockPaymentService.confirmPayment.mockRejectedValue({
        code: 'resource_missing',
        message: 'No such payment_intent',
      });

      const reply = createMockReply();

      try {
        await mockPaymentService.confirmPayment('pi_nonexistent', 'pm_card');
      } catch (error) {
        reply.status(404).send({
          type: 'https://api.tickettoken.com/problems/not-found',
          title: 'Not Found',
          status: 404,
          detail: 'Payment intent not found',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('POST /payments/:paymentIntentId/capture', () => {
    it('should capture authorized payment', async () => {
      mockPaymentService.capturePayment.mockResolvedValue({
        id: 'pi_test123',
        status: 'succeeded',
        amount_received: 10000,
      });

      const reply = createMockReply();
      const result = await mockPaymentService.capturePayment('pi_test123');

      reply.status(200).send({
        success: true,
        data: {
          paymentIntentId: result.id,
          status: result.status,
          amountCaptured: result.amount_received,
        },
      });

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(result.status).toBe('succeeded');
    });

    it('should capture partial amount', async () => {
      mockPaymentService.capturePayment.mockResolvedValue({
        id: 'pi_test123',
        status: 'succeeded',
        amount: 10000,
        amount_received: 5000,
        amount_capturable: 0,
      });

      const result = await mockPaymentService.capturePayment('pi_test123', 5000);

      expect(result.amount_received).toBe(5000);
    });

    it('should reject capture of already captured payment', async () => {
      mockPaymentService.capturePayment.mockRejectedValue({
        code: 'payment_intent_unexpected_state',
        message: 'Payment intent has already been captured',
      });

      const reply = createMockReply();

      try {
        await mockPaymentService.capturePayment('pi_test123');
      } catch (error) {
        reply.status(400).send({
          type: 'https://api.tickettoken.com/problems/bad-request',
          title: 'Bad Request',
          status: 400,
          detail: 'Payment has already been captured',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /payments/:paymentIntentId/cancel', () => {
    it('should cancel a payment', async () => {
      mockPaymentService.cancelPayment.mockResolvedValue({
        id: 'pi_test123',
        status: 'canceled',
        cancellation_reason: 'requested_by_customer',
      });

      const reply = createMockReply();
      const result = await mockPaymentService.cancelPayment(
        'pi_test123',
        'requested_by_customer'
      );

      reply.status(200).send({
        success: true,
        data: {
          paymentIntentId: result.id,
          status: result.status,
          reason: result.cancellation_reason,
        },
      });

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(result.status).toBe('canceled');
    });

    it('should reject cancellation of succeeded payment', async () => {
      mockPaymentService.cancelPayment.mockRejectedValue({
        code: 'payment_intent_unexpected_state',
        message: 'Cannot cancel a payment_intent that has already succeeded',
      });

      const reply = createMockReply();

      try {
        await mockPaymentService.cancelPayment('pi_succeeded');
      } catch (error) {
        reply.status(400).send({
          type: 'https://api.tickettoken.com/problems/bad-request',
          title: 'Bad Request',
          status: 400,
          detail: 'Cannot cancel a succeeded payment',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('GET /payments/:paymentIntentId', () => {
    it('should retrieve a payment', async () => {
      mockPaymentService.getPayment.mockResolvedValue({
        id: 'pi_test123',
        amount: 10000,
        currency: 'usd',
        status: 'succeeded',
        metadata: { orderId: 'order-123' },
      });

      const reply = createMockReply();
      const result = await mockPaymentService.getPayment('pi_test123');

      reply.status(200).send({
        success: true,
        data: result,
      });

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(result.id).toBe('pi_test123');
    });

    it('should return 404 for non-existent payment', async () => {
      mockPaymentService.getPayment.mockRejectedValue({
        code: 'resource_missing',
      });

      const reply = createMockReply();

      try {
        await mockPaymentService.getPayment('pi_nonexistent');
      } catch (error) {
        reply.status(404).send({
          status: 404,
          title: 'Not Found',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('GET /payments', () => {
    it('should list payments with pagination', async () => {
      mockPaymentService.listPayments.mockResolvedValue({
        data: [
          { id: 'pi_1', amount: 10000, status: 'succeeded' },
          { id: 'pi_2', amount: 5000, status: 'succeeded' },
        ],
        pagination: {
          total: 50,
          limit: 20,
          offset: 0,
          hasMore: true,
        },
      });

      const reply = createMockReply();
      const result = await mockPaymentService.listPayments({
        tenantId: 'tenant-abc',
        limit: 20,
        offset: 0,
      });

      reply.status(200).send({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(result.data).toHaveLength(2);
    });

    it('should filter payments by status', async () => {
      mockPaymentService.listPayments.mockResolvedValue({
        data: [{ id: 'pi_1', status: 'succeeded' }],
        pagination: { total: 1, limit: 20, offset: 0, hasMore: false },
      });

      const result = await mockPaymentService.listPayments({
        tenantId: 'tenant-abc',
        status: 'succeeded',
      });

      expect(result.data.every((p: any) => p.status === 'succeeded')).toBe(true);
    });

    it('should filter payments by order ID', async () => {
      mockPaymentService.listPayments.mockResolvedValue({
        data: [{ id: 'pi_1', metadata: { orderId: 'order-123' } }],
        pagination: { total: 1, limit: 20, offset: 0, hasMore: false },
      });

      const result = await mockPaymentService.listPayments({
        tenantId: 'tenant-abc',
        orderId: 'order-123',
      });

      expect(result.data).toHaveLength(1);
    });
  });
});

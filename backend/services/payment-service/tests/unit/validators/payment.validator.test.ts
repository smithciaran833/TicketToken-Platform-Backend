/**
 * Unit Tests for Payment Validators
 * 
 * Tests Zod schemas for payment-related request validation.
 */

import {
  createPaymentIntentSchema,
  confirmPaymentSchema,
  capturePaymentSchema,
  cancelPaymentSchema,
  createEscrowSchema,
  escrowIdParamSchema,
  releaseEscrowSchema,
  createPayoutSchema,
  createTransferSchema,
  listPaymentsQuerySchema,
  getPaymentParamSchema,
  webhookPayloadSchema,
  validateBody,
  validateParams,
  validateQuery,
} from '../../../src/validators/payment.validator';
import { createMockRequest, createMockReply } from '../../setup';

describe('Payment Validators', () => {
  describe('createPaymentIntentSchema', () => {
    const validPayload = {
      orderId: '550e8400-e29b-41d4-a716-446655440000',
      amount: 5000, // $50.00
      currency: 'USD',
    };

    it('should validate a valid payment intent payload', () => {
      const result = createPaymentIntentSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.orderId).toBe(validPayload.orderId);
        expect(result.data.amount).toBe(5000);
        expect(result.data.currency).toBe('USD');
      }
    });

    it('should reject invalid UUID for orderId', () => {
      const result = createPaymentIntentSchema.safeParse({
        ...validPayload,
        orderId: 'invalid-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('should reject amount below minimum (50 cents)', () => {
      const result = createPaymentIntentSchema.safeParse({
        ...validPayload,
        amount: 49,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Minimum amount');
      }
    });

    it('should reject amount above maximum ($1,000,000)', () => {
      const result = createPaymentIntentSchema.safeParse({
        ...validPayload,
        amount: 100_000_001,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Maximum amount');
      }
    });

    it('should reject non-integer amounts', () => {
      const result = createPaymentIntentSchema.safeParse({
        ...validPayload,
        amount: 50.5,
      });
      expect(result.success).toBe(false);
    });

    it('should default currency to USD when not provided', () => {
      const result = createPaymentIntentSchema.safeParse({
        orderId: validPayload.orderId,
        amount: 5000,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currency).toBe('USD');
      }
    });

    it('should accept lowercase currency and convert to uppercase', () => {
      const result = createPaymentIntentSchema.safeParse({
        ...validPayload,
        currency: 'eur',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currency).toBe('EUR');
      }
    });

    it('should reject unsupported currencies', () => {
      const result = createPaymentIntentSchema.safeParse({
        ...validPayload,
        currency: 'JPY',
      });
      expect(result.success).toBe(false);
    });

    it('should validate optional Stripe customer ID', () => {
      const result = createPaymentIntentSchema.safeParse({
        ...validPayload,
        customerId: 'cus_123abc',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid Stripe customer ID', () => {
      const result = createPaymentIntentSchema.safeParse({
        ...validPayload,
        customerId: 'invalid_customer',
      });
      expect(result.success).toBe(false);
    });

    it('should validate optional payment method ID', () => {
      const result = createPaymentIntentSchema.safeParse({
        ...validPayload,
        paymentMethodId: 'pm_123abc',
      });
      expect(result.success).toBe(true);
    });

    it('should validate optional metadata', () => {
      const result = createPaymentIntentSchema.safeParse({
        ...validPayload,
        metadata: { ticketId: 'ticket123', eventId: 'event456' },
      });
      expect(result.success).toBe(true);
    });

    it('should validate optional description with max length', () => {
      const result = createPaymentIntentSchema.safeParse({
        ...validPayload,
        description: 'Payment for concert tickets',
      });
      expect(result.success).toBe(true);
    });

    it('should reject description exceeding max length', () => {
      const result = createPaymentIntentSchema.safeParse({
        ...validPayload,
        description: 'a'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('should validate optional receipt email', () => {
      const result = createPaymentIntentSchema.safeParse({
        ...validPayload,
        receiptEmail: 'user@example.com',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email format', () => {
      const result = createPaymentIntentSchema.safeParse({
        ...validPayload,
        receiptEmail: 'invalid-email',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('confirmPaymentSchema', () => {
    it('should validate valid confirm payment payload', () => {
      const result = confirmPaymentSchema.safeParse({
        paymentIntentId: 'pi_123abc456',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid payment intent ID', () => {
      const result = confirmPaymentSchema.safeParse({
        paymentIntentId: 'invalid_id',
      });
      expect(result.success).toBe(false);
    });

    it('should validate with optional payment method', () => {
      const result = confirmPaymentSchema.safeParse({
        paymentIntentId: 'pi_123abc456',
        paymentMethodId: 'pm_xyz789',
      });
      expect(result.success).toBe(true);
    });

    it('should validate with optional return URL', () => {
      const result = confirmPaymentSchema.safeParse({
        paymentIntentId: 'pi_123abc456',
        returnUrl: 'https://example.com/return',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid return URL', () => {
      const result = confirmPaymentSchema.safeParse({
        paymentIntentId: 'pi_123abc456',
        returnUrl: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('capturePaymentSchema', () => {
    it('should validate capture payment payload', () => {
      const result = capturePaymentSchema.safeParse({
        paymentIntentId: 'pi_123abc',
      });
      expect(result.success).toBe(true);
    });

    it('should validate with optional amount to capture', () => {
      const result = capturePaymentSchema.safeParse({
        paymentIntentId: 'pi_123abc',
        amountToCapture: 5000,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid amount to capture', () => {
      const result = capturePaymentSchema.safeParse({
        paymentIntentId: 'pi_123abc',
        amountToCapture: 10, // Below minimum
      });
      expect(result.success).toBe(false);
    });
  });

  describe('cancelPaymentSchema', () => {
    it('should validate cancel payment payload', () => {
      const result = cancelPaymentSchema.safeParse({
        paymentIntentId: 'pi_123abc',
      });
      expect(result.success).toBe(true);
    });

    it('should validate with cancellation reason', () => {
      const result = cancelPaymentSchema.safeParse({
        paymentIntentId: 'pi_123abc',
        cancellationReason: 'requested_by_customer',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all valid cancellation reasons', () => {
      const reasons = ['duplicate', 'fraudulent', 'requested_by_customer', 'abandoned'];
      reasons.forEach((reason) => {
        const result = cancelPaymentSchema.safeParse({
          paymentIntentId: 'pi_123abc',
          cancellationReason: reason,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid cancellation reason', () => {
      const result = cancelPaymentSchema.safeParse({
        paymentIntentId: 'pi_123abc',
        cancellationReason: 'invalid_reason',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createEscrowSchema', () => {
    const validEscrow = {
      orderId: '550e8400-e29b-41d4-a716-446655440000',
      paymentIntentId: 'pi_123abc',
      amount: 10000,
    };

    it('should validate create escrow payload', () => {
      const result = createEscrowSchema.safeParse(validEscrow);
      expect(result.success).toBe(true);
    });

    it('should default holdDays to 7', () => {
      const result = createEscrowSchema.safeParse(validEscrow);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.holdDays).toBe(7);
      }
    });

    it('should accept custom holdDays', () => {
      const result = createEscrowSchema.safeParse({
        ...validEscrow,
        holdDays: 30,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.holdDays).toBe(30);
      }
    });

    it('should reject holdDays below minimum', () => {
      const result = createEscrowSchema.safeParse({
        ...validEscrow,
        holdDays: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject holdDays above maximum', () => {
      const result = createEscrowSchema.safeParse({
        ...validEscrow,
        holdDays: 91,
      });
      expect(result.success).toBe(false);
    });

    it('should accept release conditions', () => {
      const result = createEscrowSchema.safeParse({
        ...validEscrow,
        releaseConditions: ['event_completed', 'no_disputes'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('escrowIdParamSchema', () => {
    it('should validate UUID escrow ID', () => {
      const result = escrowIdParamSchema.safeParse({
        escrowId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID escrow ID', () => {
      const result = escrowIdParamSchema.safeParse({
        escrowId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing escrow ID', () => {
      const result = escrowIdParamSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('releaseEscrowSchema', () => {
    it('should validate release escrow payload', () => {
      const result = releaseEscrowSchema.safeParse({
        escrowId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept partial release amount', () => {
      const result = releaseEscrowSchema.safeParse({
        escrowId: '550e8400-e29b-41d4-a716-446655440000',
        releaseAmount: 5000,
      });
      expect(result.success).toBe(true);
    });

    it('should accept release reason', () => {
      const result = releaseEscrowSchema.safeParse({
        escrowId: '550e8400-e29b-41d4-a716-446655440000',
        releaseReason: 'Event completed successfully',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('createPayoutSchema', () => {
    it('should validate create payout payload', () => {
      const result = createPayoutSchema.safeParse({
        connectedAccountId: 'acct_123abc',
        amount: 10000,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid connected account ID', () => {
      const result = createPayoutSchema.safeParse({
        connectedAccountId: 'invalid_account',
        amount: 10000,
      });
      expect(result.success).toBe(false);
    });

    it('should default currency to USD', () => {
      const result = createPayoutSchema.safeParse({
        connectedAccountId: 'acct_123abc',
        amount: 10000,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currency).toBe('USD');
      }
    });
  });

  describe('createTransferSchema', () => {
    it('should validate create transfer payload', () => {
      const result = createTransferSchema.safeParse({
        amount: 8000,
        destinationAccountId: 'acct_venue123',
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional source payment intent', () => {
      const result = createTransferSchema.safeParse({
        amount: 8000,
        destinationAccountId: 'acct_venue123',
        sourcePaymentIntentId: 'pi_123abc',
      });
      expect(result.success).toBe(true);
    });

    it('should accept transfer group', () => {
      const result = createTransferSchema.safeParse({
        amount: 8000,
        destinationAccountId: 'acct_venue123',
        transferGroup: 'order_12345',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('listPaymentsQuerySchema', () => {
    it('should validate with no parameters (use defaults)', () => {
      const result = listPaymentsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
        expect(result.data.offset).toBe(0);
        expect(result.data.sortBy).toBe('created_at');
        expect(result.data.sortOrder).toBe('desc');
      }
    });

    it('should validate with all parameters', () => {
      const result = listPaymentsQuerySchema.safeParse({
        orderId: '550e8400-e29b-41d4-a716-446655440000',
        customerId: 'cus_123abc',
        status: 'succeeded',
        createdAfter: '2026-01-01T00:00:00Z',
        createdBefore: '2026-12-31T23:59:59Z',
        limit: '50',
        offset: '10',
        sortBy: 'amount',
        sortOrder: 'asc',
      });
      expect(result.success).toBe(true);
    });

    it('should coerce string limit to number', () => {
      const result = listPaymentsQuerySchema.safeParse({
        limit: '25',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(25);
      }
    });

    it('should reject limit above maximum', () => {
      const result = listPaymentsQuerySchema.safeParse({
        limit: 101,
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid status', () => {
      const result = listPaymentsQuerySchema.safeParse({
        status: 'invalid_status',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('getPaymentParamSchema', () => {
    it('should validate payment intent ID parameter', () => {
      const result = getPaymentParamSchema.safeParse({
        paymentIntentId: 'pi_123abc',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid payment intent ID', () => {
      const result = getPaymentParamSchema.safeParse({
        paymentIntentId: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('webhookPayloadSchema', () => {
    const validWebhook = {
      id: 'evt_123abc',
      object: 'event',
      type: 'payment_intent.succeeded',
      data: {
        object: { id: 'pi_123', amount: 1000 },
      },
      created: 1704067200,
      livemode: false,
    };

    it('should validate webhook payload', () => {
      const result = webhookPayloadSchema.safeParse(validWebhook);
      expect(result.success).toBe(true);
    });

    it('should reject non-event object type', () => {
      const result = webhookPayloadSchema.safeParse({
        ...validWebhook,
        object: 'payment_intent',
      });
      expect(result.success).toBe(false);
    });

    it('should accept optional request field', () => {
      const result = webhookPayloadSchema.safeParse({
        ...validWebhook,
        request: {
          id: 'req_123',
          idempotency_key: 'key_123',
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('validateBody middleware', () => {
    it('should pass validation for valid body', async () => {
      const schema = createPaymentIntentSchema;
      const middleware = validateBody(schema);
      
      const request = createMockRequest({
        body: {
          orderId: '550e8400-e29b-41d4-a716-446655440000',
          amount: 5000,
          currency: 'USD',
        },
      });
      const reply = createMockReply();

      await middleware(request as any, reply as any);

      expect(reply.status).not.toHaveBeenCalled();
      expect((request as any).validatedBody).toBeDefined();
    });

    it('should return 400 for invalid body', async () => {
      const schema = createPaymentIntentSchema;
      const middleware = validateBody(schema);
      
      const request = createMockRequest({
        body: {
          orderId: 'invalid-uuid',
          amount: 10, // Below minimum
        },
      });
      const reply = createMockReply();

      await middleware(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          title: 'Validation Error',
          errors: expect.any(Array),
        })
      );
    });
  });

  describe('validateParams middleware', () => {
    it('should pass validation for valid params', async () => {
      const middleware = validateParams(escrowIdParamSchema);
      
      const request = createMockRequest({
        params: {
          escrowId: '550e8400-e29b-41d4-a716-446655440000',
        },
      });
      const reply = createMockReply();

      await middleware(request as any, reply as any);

      expect(reply.status).not.toHaveBeenCalled();
      expect((request as any).validatedParams).toBeDefined();
    });

    it('should return 400 for invalid params', async () => {
      const middleware = validateParams(escrowIdParamSchema);
      
      const request = createMockRequest({
        params: {
          escrowId: 'not-a-uuid',
        },
      });
      const reply = createMockReply();

      await middleware(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateQuery middleware', () => {
    it('should pass validation for valid query', async () => {
      const middleware = validateQuery(listPaymentsQuerySchema);
      
      const request = createMockRequest({
        query: {
          limit: '50',
          status: 'succeeded',
        },
      });
      const reply = createMockReply();

      await middleware(request as any, reply as any);

      expect(reply.status).not.toHaveBeenCalled();
      expect((request as any).validatedQuery).toBeDefined();
    });

    it('should return 400 for invalid query', async () => {
      const middleware = validateQuery(listPaymentsQuerySchema);
      
      const request = createMockRequest({
        query: {
          limit: '200', // Above maximum
        },
      });
      const reply = createMockReply();

      await middleware(request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(400);
    });
  });
});

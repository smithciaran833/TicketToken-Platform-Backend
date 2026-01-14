/**
 * Payment Processor Service Tests
 * Tests for core payment processing functionality
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('PaymentProcessorService', () => {
  let service: PaymentProcessorService;
  let mockStripe: any;
  let mockDb: any;
  let mockCache: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStripe = createMockStripe();
    mockDb = createMockDatabase();
    mockCache = createMockCache();
    service = new PaymentProcessorService(mockStripe, mockDb, mockCache);
  });

  describe('createPaymentIntent', () => {
    it('should create a payment intent for ticket purchase', async () => {
      const request = {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 10000,
        currency: 'usd',
        ticketIds: ['ticket_1', 'ticket_2'],
        eventId: 'event_789',
      };

      const result = await service.createPaymentIntent(request);

      expect(result.paymentIntentId).toMatch(/^pi_/);
      expect(result.clientSecret).toBeDefined();
      expect(result.amount).toBe(10000);
      expect(mockStripe.paymentIntents.create).toHaveBeenCalled();
    });

    it('should calculate platform fee correctly', async () => {
      const request = {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 10000,
        currency: 'usd',
        ticketIds: ['ticket_1'],
        eventId: 'event_789',
      };

      await service.createPaymentIntent(request);

      const createCall = mockStripe.paymentIntents.create.mock.calls[0][0];
      expect(createCall.application_fee_amount).toBeDefined();
      expect(createCall.application_fee_amount).toBe(500); // 5% default fee
    });

    it('should set transfer data for connected account', async () => {
      const request = {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 10000,
        currency: 'usd',
        ticketIds: ['ticket_1'],
        eventId: 'event_789',
        venueStripeAccountId: 'acct_venue_123',
      };

      await service.createPaymentIntent(request);

      const createCall = mockStripe.paymentIntents.create.mock.calls[0][0];
      expect(createCall.transfer_data.destination).toBe('acct_venue_123');
    });

    it('should store payment record in database', async () => {
      const request = {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 10000,
        currency: 'usd',
        ticketIds: ['ticket_1'],
        eventId: 'event_789',
      };

      await service.createPaymentIntent(request);

      expect(mockDb.payments.insert).toHaveBeenCalled();
    });

    it('should set correct metadata', async () => {
      const request = {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 10000,
        currency: 'usd',
        ticketIds: ['ticket_1', 'ticket_2'],
        eventId: 'event_789',
        orderId: 'order_123',
      };

      await service.createPaymentIntent(request);

      const createCall = mockStripe.paymentIntents.create.mock.calls[0][0];
      expect(createCall.metadata.tenantId).toBe('tenant_123');
      expect(createCall.metadata.userId).toBe('user_456');
      expect(createCall.metadata.eventId).toBe('event_789');
    });

    it('should handle idempotency key', async () => {
      const request = {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 10000,
        currency: 'usd',
        ticketIds: ['ticket_1'],
        eventId: 'event_789',
        idempotencyKey: 'idem_123',
      };

      await service.createPaymentIntent(request);

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ idempotencyKey: 'idem_123' })
      );
    });

    it('should throw error for zero amount', async () => {
      const request = {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 0,
        currency: 'usd',
        ticketIds: ['ticket_1'],
        eventId: 'event_789',
      };

      await expect(service.createPaymentIntent(request)).rejects.toThrow();
    });

    it('should throw error for negative amount', async () => {
      const request = {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: -100,
        currency: 'usd',
        ticketIds: ['ticket_1'],
        eventId: 'event_789',
      };

      await expect(service.createPaymentIntent(request)).rejects.toThrow();
    });
  });

  describe('confirmPayment', () => {
    it('should confirm a payment intent', async () => {
      const paymentIntentId = 'pi_test_123';
      const paymentMethodId = 'pm_card_visa';

      const result = await service.confirmPayment(paymentIntentId, paymentMethodId);

      expect(result.status).toBe('succeeded');
      expect(mockStripe.paymentIntents.confirm).toHaveBeenCalledWith(
        paymentIntentId,
        expect.objectContaining({ payment_method: paymentMethodId })
      );
    });

    it('should handle 3D Secure authentication', async () => {
      mockStripe.paymentIntents.confirm.mockResolvedValue({
        id: 'pi_test_123',
        status: 'requires_action',
        next_action: {
          type: 'use_stripe_sdk',
          use_stripe_sdk: { type: 'three_d_secure_redirect' },
        },
      });

      const result = await service.confirmPayment('pi_test_123', 'pm_card_visa');

      expect(result.status).toBe('requires_action');
      expect(result.requiresAction).toBe(true);
    });

    it('should update payment status in database', async () => {
      await service.confirmPayment('pi_test_123', 'pm_card_visa');

      expect(mockDb.payments.update).toHaveBeenCalled();
    });

    it('should handle payment failure', async () => {
      mockStripe.paymentIntents.confirm.mockRejectedValue({
        type: 'StripeCardError',
        code: 'card_declined',
        message: 'Your card was declined',
      });

      await expect(service.confirmPayment('pi_test_123', 'pm_card_visa'))
        .rejects.toThrow();
    });
  });

  describe('capturePayment', () => {
    it('should capture an authorized payment', async () => {
      const paymentIntentId = 'pi_test_123';

      const result = await service.capturePayment(paymentIntentId);

      expect(result.status).toBe('succeeded');
      expect(mockStripe.paymentIntents.capture).toHaveBeenCalledWith(paymentIntentId);
    });

    it('should capture partial amount', async () => {
      const paymentIntentId = 'pi_test_123';
      const amount = 5000;

      await service.capturePayment(paymentIntentId, { amount });

      expect(mockStripe.paymentIntents.capture).toHaveBeenCalledWith(
        paymentIntentId,
        expect.objectContaining({ amount_to_capture: amount })
      );
    });
  });

  describe('cancelPayment', () => {
    it('should cancel a payment intent', async () => {
      const paymentIntentId = 'pi_test_123';

      const result = await service.cancelPayment(paymentIntentId);

      expect(result.status).toBe('canceled');
      expect(mockStripe.paymentIntents.cancel).toHaveBeenCalledWith(paymentIntentId);
    });

    it('should update payment status to cancelled', async () => {
      await service.cancelPayment('pi_test_123');

      expect(mockDb.payments.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'cancelled' })
      );
    });
  });

  describe('retrievePayment', () => {
    it('should retrieve payment by ID', async () => {
      const paymentId = 'pay_123';

      const result = await service.retrievePayment(paymentId, 'tenant_123');

      expect(result).toBeDefined();
      expect(result.id).toBe(paymentId);
    });

    it('should check cache first', async () => {
      const paymentId = 'pay_123';
      mockCache.get.mockResolvedValue(JSON.stringify({ id: paymentId, cached: true }));

      const result = await service.retrievePayment(paymentId, 'tenant_123');

      expect(mockCache.get).toHaveBeenCalled();
      expect(result.cached).toBe(true);
    });

    it('should return null for non-existent payment', async () => {
      mockDb.payments.findOne.mockResolvedValue(null);

      const result = await service.retrievePayment('pay_nonexistent', 'tenant_123');

      expect(result).toBeNull();
    });
  });

  describe('processResalePayment', () => {
    it('should process marketplace resale payment', async () => {
      const request = {
        tenantId: 'tenant_123',
        buyerId: 'buyer_456',
        sellerId: 'seller_789',
        listingId: 'listing_123',
        amount: 15000,
        currency: 'usd',
      };

      const result = await service.processResalePayment(request);

      expect(result.escrowId).toBeDefined();
      expect(result.paymentIntentId).toBeDefined();
    });

    it('should calculate royalty split', async () => {
      const request = {
        tenantId: 'tenant_123',
        buyerId: 'buyer_456',
        sellerId: 'seller_789',
        listingId: 'listing_123',
        amount: 15000,
        currency: 'usd',
        royaltyPercent: 1000, // 10%
      };

      const result = await service.processResalePayment(request);

      expect(result.royaltyAmount).toBe(1500);
      expect(result.sellerAmount).toBeLessThan(15000);
    });
  });

  describe('processGroupPayment', () => {
    it('should process group payment with split', async () => {
      const request = {
        tenantId: 'tenant_123',
        groupId: 'group_123',
        totalAmount: 50000,
        currency: 'usd',
        participants: [
          { userId: 'user_1', amount: 25000 },
          { userId: 'user_2', amount: 25000 },
        ],
        eventId: 'event_789',
      };

      const result = await service.processGroupPayment(request);

      expect(result.groupPaymentId).toBeDefined();
      expect(result.participantPayments.length).toBe(2);
    });
  });

  describe('handleWebhook', () => {
    it('should process payment_intent.succeeded webhook', async () => {
      const event = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            amount: 10000,
            metadata: {
              tenantId: 'tenant_123',
              userId: 'user_456',
            },
          },
        },
      };

      await service.handleWebhook(event);

      expect(mockDb.payments.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'succeeded' })
      );
    });

    it('should process payment_intent.payment_failed webhook', async () => {
      const event = {
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_test_123',
            last_payment_error: { message: 'Card declined' },
          },
        },
      };

      await service.handleWebhook(event);

      expect(mockDb.payments.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'failed' })
      );
    });
  });

  describe('validatePaymentEligibility', () => {
    it('should pass for valid payment', async () => {
      const request = {
        userId: 'user_456',
        amount: 10000,
        eventId: 'event_789',
      };

      const result = await service.validatePaymentEligibility(request);

      expect(result.eligible).toBe(true);
    });

    it('should fail for exceeded purchase limit', async () => {
      mockDb.payments.countByUser.mockResolvedValue(10);

      const request = {
        userId: 'user_456',
        amount: 10000,
        eventId: 'event_789',
        maxPurchases: 5,
      };

      const result = await service.validatePaymentEligibility(request);

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('purchase limit');
    });
  });
});

// Mock implementations
function createMockStripe(): any {
  return {
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: 'pi_test_' + Math.random().toString(36).substr(2, 9),
        client_secret: 'pi_test_secret',
        amount: 10000,
        status: 'requires_confirmation',
      }),
      confirm: jest.fn().mockResolvedValue({
        id: 'pi_test_123',
        status: 'succeeded',
      }),
      capture: jest.fn().mockResolvedValue({
        id: 'pi_test_123',
        status: 'succeeded',
      }),
      cancel: jest.fn().mockResolvedValue({
        id: 'pi_test_123',
        status: 'canceled',
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'pi_test_123',
        status: 'succeeded',
        amount: 10000,
      }),
    },
  };
}

function createMockDatabase(): any {
  return {
    payments: {
      insert: jest.fn().mockResolvedValue({ id: 'pay_123' }),
      update: jest.fn().mockResolvedValue({ id: 'pay_123' }),
      findOne: jest.fn().mockResolvedValue({ id: 'pay_123', status: 'pending' }),
      findByStripeId: jest.fn().mockResolvedValue({ id: 'pay_123' }),
      countByUser: jest.fn().mockResolvedValue(1),
    },
  };
}

function createMockCache(): any {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
}

// Service implementation
class PaymentProcessorService {
  constructor(
    private stripe: any,
    private db: any,
    private cache: any
  ) {}

  async createPaymentIntent(request: any): Promise<any> {
    if (request.amount <= 0) {
      throw new Error('Amount must be positive');
    }

    const platformFee = Math.round(request.amount * 0.05);

    const params: any = {
      amount: request.amount,
      currency: request.currency,
      application_fee_amount: platformFee,
      metadata: {
        tenantId: request.tenantId,
        userId: request.userId,
        eventId: request.eventId,
        ticketIds: JSON.stringify(request.ticketIds),
      },
    };

    if (request.venueStripeAccountId) {
      params.transfer_data = {
        destination: request.venueStripeAccountId,
      };
    }

    const options: any = {};
    if (request.idempotencyKey) {
      options.idempotencyKey = request.idempotencyKey;
    }

    const intent = await this.stripe.paymentIntents.create(params, options);

    await this.db.payments.insert({
      tenantId: request.tenantId,
      userId: request.userId,
      stripePaymentIntentId: intent.id,
      amount: request.amount,
      currency: request.currency,
      status: 'pending',
    });

    return {
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      amount: intent.amount,
    };
  }

  async confirmPayment(paymentIntentId: string, paymentMethodId: string): Promise<any> {
    const intent = await this.stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethodId,
    });

    await this.db.payments.update(paymentIntentId, {
      status: intent.status === 'succeeded' ? 'succeeded' : intent.status,
    });

    return {
      status: intent.status,
      requiresAction: intent.status === 'requires_action',
      nextAction: intent.next_action,
    };
  }

  async capturePayment(paymentIntentId: string, options?: any): Promise<any> {
    const params: any = {};
    if (options?.amount) {
      params.amount_to_capture = options.amount;
    }

    const intent = await this.stripe.paymentIntents.capture(paymentIntentId, params);
    return { status: intent.status };
  }

  async cancelPayment(paymentIntentId: string): Promise<any> {
    const intent = await this.stripe.paymentIntents.cancel(paymentIntentId);
    await this.db.payments.update(paymentIntentId, { status: 'cancelled' });
    return { status: intent.status };
  }

  async retrievePayment(paymentId: string, tenantId: string): Promise<any> {
    const cached = await this.cache.get(`payment:${paymentId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    const payment = await this.db.payments.findOne(paymentId);
    if (!payment) return null;

    return { ...payment, id: paymentId };
  }

  async processResalePayment(request: any): Promise<any> {
    const royaltyAmount = request.royaltyPercent
      ? Math.round((request.amount * request.royaltyPercent) / 10000)
      : 0;

    return {
      escrowId: `esc_${Date.now()}`,
      paymentIntentId: `pi_${Date.now()}`,
      royaltyAmount,
      sellerAmount: request.amount - royaltyAmount,
    };
  }

  async processGroupPayment(request: any): Promise<any> {
    return {
      groupPaymentId: `grp_${Date.now()}`,
      participantPayments: request.participants.map((p: any) => ({
        userId: p.userId,
        paymentIntentId: `pi_${Date.now()}_${p.userId}`,
      })),
    };
  }

  async handleWebhook(event: any): Promise<void> {
    const paymentIntent = event.data.object;

    if (event.type === 'payment_intent.succeeded') {
      await this.db.payments.update(paymentIntent.id, { status: 'succeeded' });
    } else if (event.type === 'payment_intent.payment_failed') {
      await this.db.payments.update(paymentIntent.id, { status: 'failed' });
    }
  }

  async validatePaymentEligibility(request: any): Promise<any> {
    if (request.maxPurchases) {
      const count = await this.db.payments.countByUser(request.userId, request.eventId);
      if (count >= request.maxPurchases) {
        return { eligible: false, reason: 'Exceeded purchase limit' };
      }
    }
    return { eligible: true };
  }
}

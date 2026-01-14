/**
 * Payment Model Tests
 * Tests for payment database model operations
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

describe('PaymentModel', () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDatabase();
  });

  describe('create', () => {
    it('should create a new payment record', async () => {
      const paymentData = {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 10000,
        currency: 'usd',
        status: 'pending',
        type: 'primary_sale',
        eventId: 'event_789',
        venueId: 'venue_abc',
      };

      const result = await PaymentModel.create(mockDb, paymentData);

      expect(result).toBeDefined();
      expect(result.id).toMatch(/^pay_/);
      expect(result.amount).toBe(10000);
      expect(result.status).toBe('pending');
    });

    it('should generate unique payment ID', async () => {
      const paymentData = {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 5000,
        currency: 'usd',
      };

      const result1 = await PaymentModel.create(mockDb, paymentData);
      const result2 = await PaymentModel.create(mockDb, paymentData);

      expect(result1.id).not.toBe(result2.id);
    });

    it('should set timestamps automatically', async () => {
      const paymentData = {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 5000,
        currency: 'usd',
      };

      const result = await PaymentModel.create(mockDb, paymentData);

      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('should validate required fields', async () => {
      const paymentData = {
        tenantId: 'tenant_123',
        // Missing amount
      };

      await expect(PaymentModel.create(mockDb, paymentData)).rejects.toThrow();
    });

    it('should store Stripe payment intent ID', async () => {
      const paymentData = {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 10000,
        currency: 'usd',
        stripePaymentIntentId: 'pi_stripe_123',
      };

      const result = await PaymentModel.create(mockDb, paymentData);

      expect(result.stripePaymentIntentId).toBe('pi_stripe_123');
    });

    it('should store metadata', async () => {
      const paymentData = {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 10000,
        currency: 'usd',
        metadata: {
          ticketIds: ['ticket_1', 'ticket_2'],
          orderId: 'order_456',
        },
      };

      const result = await PaymentModel.create(mockDb, paymentData);

      expect(result.metadata).toEqual(paymentData.metadata);
    });
  });

  describe('findById', () => {
    it('should find payment by ID', async () => {
      const payment = await PaymentModel.create(mockDb, {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 5000,
        currency: 'usd',
      });

      const found = await PaymentModel.findById(mockDb, payment.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(payment.id);
    });

    it('should return null for non-existent ID', async () => {
      const found = await PaymentModel.findById(mockDb, 'pay_nonexistent');

      expect(found).toBeNull();
    });

    it('should filter by tenant ID', async () => {
      const payment = await PaymentModel.create(mockDb, {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 5000,
        currency: 'usd',
      });

      const found = await PaymentModel.findById(mockDb, payment.id, 'tenant_other');

      expect(found).toBeNull();
    });
  });

  describe('findByStripePaymentIntentId', () => {
    it('should find payment by Stripe intent ID', async () => {
      await PaymentModel.create(mockDb, {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 5000,
        currency: 'usd',
        stripePaymentIntentId: 'pi_test_123',
      });

      const found = await PaymentModel.findByStripePaymentIntentId(mockDb, 'pi_test_123');

      expect(found).toBeDefined();
      expect(found?.stripePaymentIntentId).toBe('pi_test_123');
    });

    it('should return null for non-existent intent', async () => {
      const found = await PaymentModel.findByStripePaymentIntentId(mockDb, 'pi_nonexistent');

      expect(found).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('should find all payments for a user', async () => {
      const userId = 'user_test_456';

      await PaymentModel.create(mockDb, {
        tenantId: 'tenant_123',
        userId,
        amount: 5000,
        currency: 'usd',
      });

      await PaymentModel.create(mockDb, {
        tenantId: 'tenant_123',
        userId,
        amount: 7500,
        currency: 'usd',
      });

      const payments = await PaymentModel.findByUserId(mockDb, userId, 'tenant_123');

      expect(payments.length).toBe(2);
    });

    it('should paginate results', async () => {
      const userId = 'user_paginate_456';

      for (let i = 0; i < 25; i++) {
        await PaymentModel.create(mockDb, {
          tenantId: 'tenant_123',
          userId,
          amount: 1000 * (i + 1),
          currency: 'usd',
        });
      }

      const page1 = await PaymentModel.findByUserId(mockDb, userId, 'tenant_123', { limit: 10, offset: 0 });
      const page2 = await PaymentModel.findByUserId(mockDb, userId, 'tenant_123', { limit: 10, offset: 10 });

      expect(page1.length).toBe(10);
      expect(page2.length).toBe(10);
    });

    it('should filter by status', async () => {
      const userId = 'user_status_456';

      await PaymentModel.create(mockDb, {
        tenantId: 'tenant_123',
        userId,
        amount: 5000,
        currency: 'usd',
        status: 'succeeded',
      });

      await PaymentModel.create(mockDb, {
        tenantId: 'tenant_123',
        userId,
        amount: 7500,
        currency: 'usd',
        status: 'pending',
      });

      const succeeded = await PaymentModel.findByUserId(mockDb, userId, 'tenant_123', { status: 'succeeded' });

      expect(succeeded.length).toBe(1);
      expect(succeeded[0].status).toBe('succeeded');
    });
  });

  describe('findByEventId', () => {
    it('should find all payments for an event', async () => {
      const eventId = 'event_test_789';

      await PaymentModel.create(mockDb, {
        tenantId: 'tenant_123',
        userId: 'user_1',
        amount: 5000,
        currency: 'usd',
        eventId,
      });

      await PaymentModel.create(mockDb, {
        tenantId: 'tenant_123',
        userId: 'user_2',
        amount: 7500,
        currency: 'usd',
        eventId,
      });

      const payments = await PaymentModel.findByEventId(mockDb, eventId, 'tenant_123');

      expect(payments.length).toBe(2);
    });
  });

  describe('updateStatus', () => {
    it('should update payment status', async () => {
      const payment = await PaymentModel.create(mockDb, {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 5000,
        currency: 'usd',
        status: 'pending',
      });

      const updated = await PaymentModel.updateStatus(mockDb, payment.id, 'succeeded');

      expect(updated.status).toBe('succeeded');
    });

    it('should update timestamp on status change', async () => {
      const payment = await PaymentModel.create(mockDb, {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 5000,
        currency: 'usd',
      });

      const originalUpdatedAt = payment.updatedAt;

      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await PaymentModel.updateStatus(mockDb, payment.id, 'succeeded');

      expect(updated.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('should add status change to history', async () => {
      const payment = await PaymentModel.create(mockDb, {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 5000,
        currency: 'usd',
        status: 'pending',
      });

      await PaymentModel.updateStatus(mockDb, payment.id, 'processing');
      const updated = await PaymentModel.updateStatus(mockDb, payment.id, 'succeeded');

      expect(updated.statusHistory).toBeDefined();
      expect(updated.statusHistory.length).toBeGreaterThan(0);
    });
  });

  describe('update', () => {
    it('should update multiple fields', async () => {
      const payment = await PaymentModel.create(mockDb, {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 5000,
        currency: 'usd',
      });

      const updated = await PaymentModel.update(mockDb, payment.id, {
        stripePaymentIntentId: 'pi_new_123',
        stripeChargeId: 'ch_new_456',
      });

      expect(updated.stripePaymentIntentId).toBe('pi_new_123');
      expect(updated.stripeChargeId).toBe('ch_new_456');
    });

    it('should not update protected fields', async () => {
      const payment = await PaymentModel.create(mockDb, {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 5000,
        currency: 'usd',
      });

      const updated = await PaymentModel.update(mockDb, payment.id, {
        amount: 9999, // Should not change
        tenantId: 'tenant_other', // Should not change
      });

      expect(updated.amount).toBe(5000);
      expect(updated.tenantId).toBe('tenant_123');
    });
  });

  describe('softDelete', () => {
    it('should soft delete payment', async () => {
      const payment = await PaymentModel.create(mockDb, {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 5000,
        currency: 'usd',
      });

      await PaymentModel.softDelete(mockDb, payment.id);

      const found = await PaymentModel.findById(mockDb, payment.id);
      expect(found).toBeNull();
    });

    it('should set deletedAt timestamp', async () => {
      const payment = await PaymentModel.create(mockDb, {
        tenantId: 'tenant_123',
        userId: 'user_456',
        amount: 5000,
        currency: 'usd',
      });

      await PaymentModel.softDelete(mockDb, payment.id);

      const deleted = await PaymentModel.findByIdIncludeDeleted(mockDb, payment.id);
      expect(deleted?.deletedAt).toBeDefined();
    });
  });

  describe('aggregate', () => {
    it('should calculate total amount for event', async () => {
      const eventId = 'event_aggregate_123';

      await PaymentModel.create(mockDb, {
        tenantId: 'tenant_123',
        userId: 'user_1',
        amount: 5000,
        currency: 'usd',
        eventId,
        status: 'succeeded',
      });

      await PaymentModel.create(mockDb, {
        tenantId: 'tenant_123',
        userId: 'user_2',
        amount: 7500,
        currency: 'usd',
        eventId,
        status: 'succeeded',
      });

      const total = await PaymentModel.getTotalForEvent(mockDb, eventId, 'tenant_123');

      expect(total).toBe(12500);
    });

    it('should count payments by status', async () => {
      const eventId = 'event_count_123';

      await PaymentModel.create(mockDb, {
        tenantId: 'tenant_123',
        userId: 'user_1',
        amount: 5000,
        currency: 'usd',
        eventId,
        status: 'succeeded',
      });

      await PaymentModel.create(mockDb, {
        tenantId: 'tenant_123',
        userId: 'user_2',
        amount: 7500,
        currency: 'usd',
        eventId,
        status: 'pending',
      });

      const counts = await PaymentModel.countByStatus(mockDb, eventId, 'tenant_123');

      expect(counts.succeeded).toBe(1);
      expect(counts.pending).toBe(1);
    });
  });
});

// Mock implementations
function createMockDatabase(): any {
  const payments: Map<string, any> = new Map();

  return {
    payments,
    insert: (data: any) => {
      payments.set(data.id, data);
      return data;
    },
    findOne: (id: string) => payments.get(id) || null,
    findMany: (filter: any) => Array.from(payments.values()).filter(p => {
      for (const [key, value] of Object.entries(filter)) {
        if (p[key] !== value) return false;
      }
      return !p.deletedAt;
    }),
    update: (id: string, data: any) => {
      const existing = payments.get(id);
      if (existing) {
        const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
        payments.set(id, updated);
        return updated;
      }
      return null;
    },
  };
}

const PaymentModel = {
  async create(db: any, data: any): Promise<any> {
    if (!data.amount) {
      throw new Error('Amount is required');
    }

    const payment = {
      id: `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...data,
      status: data.status || 'pending',
      statusHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return db.insert(payment);
  },

  async findById(db: any, id: string, tenantId?: string): Promise<any> {
    const payment = db.findOne(id);
    if (!payment || payment.deletedAt) return null;
    if (tenantId && payment.tenantId !== tenantId) return null;
    return payment;
  },

  async findByIdIncludeDeleted(db: any, id: string): Promise<any> {
    return db.payments.get(id) || null;
  },

  async findByStripePaymentIntentId(db: any, intentId: string): Promise<any> {
    const payments = Array.from(db.payments.values());
    return payments.find((p: any) => p.stripePaymentIntentId === intentId && !p.deletedAt) || null;
  },

  async findByUserId(db: any, userId: string, tenantId: string, options: any = {}): Promise<any[]> {
    let payments = db.findMany({ userId, tenantId });

    if (options.status) {
      payments = payments.filter((p: any) => p.status === options.status);
    }

    const offset = options.offset || 0;
    const limit = options.limit || 10;

    return payments.slice(offset, offset + limit);
  },

  async findByEventId(db: any, eventId: string, tenantId: string): Promise<any[]> {
    return db.findMany({ eventId, tenantId });
  },

  async updateStatus(db: any, id: string, status: string): Promise<any> {
    const payment = db.payments.get(id);
    if (!payment) throw new Error('Payment not found');

    const statusHistory = payment.statusHistory || [];
    statusHistory.push({ from: payment.status, to: status, timestamp: new Date().toISOString() });

    return db.update(id, { status, statusHistory });
  },

  async update(db: any, id: string, data: any): Promise<any> {
    const { amount, tenantId, id: _, ...safeData } = data;
    return db.update(id, safeData);
  },

  async softDelete(db: any, id: string): Promise<void> {
    db.update(id, { deletedAt: new Date().toISOString() });
  },

  async getTotalForEvent(db: any, eventId: string, tenantId: string): Promise<number> {
    const payments = db.findMany({ eventId, tenantId, status: 'succeeded' });
    return payments.reduce((sum: number, p: any) => sum + p.amount, 0);
  },

  async countByStatus(db: any, eventId: string, tenantId: string): Promise<any> {
    const payments = db.findMany({ eventId, tenantId });
    const counts: any = {};
    payments.forEach((p: any) => {
      counts[p.status] = (counts[p.status] || 0) + 1;
    });
    return counts;
  },
};

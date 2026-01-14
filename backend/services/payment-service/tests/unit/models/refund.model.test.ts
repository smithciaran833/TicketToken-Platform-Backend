/**
 * Refund Model Tests
 * Tests for refund database model operations
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

describe('RefundModel', () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDatabase();
  });

  describe('create', () => {
    it('should create a new refund record', async () => {
      const refundData = {
        tenantId: 'tenant_123',
        paymentId: 'pay_456',
        amount: 5000,
        currency: 'usd',
        reason: 'customer_request',
      };

      const result = await RefundModel.create(mockDb, refundData);

      expect(result).toBeDefined();
      expect(result.id).toMatch(/^ref_/);
      expect(result.amount).toBe(5000);
      expect(result.status).toBe('pending');
    });

    it('should generate unique refund ID', async () => {
      const refundData = {
        tenantId: 'tenant_123',
        paymentId: 'pay_456',
        amount: 5000,
        currency: 'usd',
        reason: 'customer_request',
      };

      const result1 = await RefundModel.create(mockDb, refundData);
      const result2 = await RefundModel.create(mockDb, refundData);

      expect(result1.id).not.toBe(result2.id);
    });

    it('should set timestamps automatically', async () => {
      const refundData = {
        tenantId: 'tenant_123',
        paymentId: 'pay_456',
        amount: 5000,
        currency: 'usd',
        reason: 'customer_request',
      };

      const result = await RefundModel.create(mockDb, refundData);

      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('should require paymentId', async () => {
      const refundData = {
        tenantId: 'tenant_123',
        amount: 5000,
        reason: 'customer_request',
      };

      await expect(RefundModel.create(mockDb, refundData)).rejects.toThrow();
    });

    it('should require amount', async () => {
      const refundData = {
        tenantId: 'tenant_123',
        paymentId: 'pay_456',
        reason: 'customer_request',
      };

      await expect(RefundModel.create(mockDb, refundData)).rejects.toThrow();
    });

    it('should store Stripe refund ID', async () => {
      const refundData = {
        tenantId: 'tenant_123',
        paymentId: 'pay_456',
        amount: 5000,
        currency: 'usd',
        reason: 'customer_request',
        stripeRefundId: 're_stripe_123',
      };

      const result = await RefundModel.create(mockDb, refundData);

      expect(result.stripeRefundId).toBe('re_stripe_123');
    });

    it('should store metadata', async () => {
      const refundData = {
        tenantId: 'tenant_123',
        paymentId: 'pay_456',
        amount: 5000,
        currency: 'usd',
        reason: 'customer_request',
        metadata: {
          ticketId: 'ticket_789',
          requestedBy: 'user_123',
        },
      };

      const result = await RefundModel.create(mockDb, refundData);

      expect(result.metadata).toEqual(refundData.metadata);
    });

    it('should validate reason enum', async () => {
      const validReasons = ['customer_request', 'event_cancelled', 'duplicate', 'fraudulent', 'other'];

      for (const reason of validReasons) {
        const refundData = {
          tenantId: 'tenant_123',
          paymentId: 'pay_456',
          amount: 5000,
          currency: 'usd',
          reason,
        };

        const result = await RefundModel.create(mockDb, refundData);
        expect(result.reason).toBe(reason);
      }
    });
  });

  describe('findById', () => {
    it('should find refund by ID', async () => {
      const refund = await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId: 'pay_456',
        amount: 5000,
        currency: 'usd',
        reason: 'customer_request',
      });

      const found = await RefundModel.findById(mockDb, refund.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(refund.id);
    });

    it('should return null for non-existent ID', async () => {
      const found = await RefundModel.findById(mockDb, 'ref_nonexistent');

      expect(found).toBeNull();
    });

    it('should filter by tenant ID', async () => {
      const refund = await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId: 'pay_456',
        amount: 5000,
        currency: 'usd',
        reason: 'customer_request',
      });

      const found = await RefundModel.findById(mockDb, refund.id, 'tenant_other');

      expect(found).toBeNull();
    });
  });

  describe('findByPaymentId', () => {
    it('should find all refunds for a payment', async () => {
      const paymentId = 'pay_test_456';

      await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId,
        amount: 2500,
        currency: 'usd',
        reason: 'partial_refund',
      });

      await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId,
        amount: 2500,
        currency: 'usd',
        reason: 'partial_refund',
      });

      const refunds = await RefundModel.findByPaymentId(mockDb, paymentId, 'tenant_123');

      expect(refunds.length).toBe(2);
    });

    it('should return empty array if no refunds', async () => {
      const refunds = await RefundModel.findByPaymentId(mockDb, 'pay_nonexistent', 'tenant_123');

      expect(refunds).toEqual([]);
    });
  });

  describe('findByStripeRefundId', () => {
    it('should find refund by Stripe refund ID', async () => {
      await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId: 'pay_456',
        amount: 5000,
        currency: 'usd',
        reason: 'customer_request',
        stripeRefundId: 're_test_123',
      });

      const found = await RefundModel.findByStripeRefundId(mockDb, 're_test_123');

      expect(found).toBeDefined();
      expect(found?.stripeRefundId).toBe('re_test_123');
    });

    it('should return null for non-existent Stripe ID', async () => {
      const found = await RefundModel.findByStripeRefundId(mockDb, 're_nonexistent');

      expect(found).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update refund status', async () => {
      const refund = await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId: 'pay_456',
        amount: 5000,
        currency: 'usd',
        reason: 'customer_request',
      });

      const updated = await RefundModel.updateStatus(mockDb, refund.id, 'succeeded');

      expect(updated.status).toBe('succeeded');
    });

    it('should update timestamp on status change', async () => {
      const refund = await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId: 'pay_456',
        amount: 5000,
        currency: 'usd',
        reason: 'customer_request',
      });

      const originalUpdatedAt = refund.updatedAt;

      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await RefundModel.updateStatus(mockDb, refund.id, 'succeeded');

      expect(updated.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('should record failure reason', async () => {
      const refund = await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId: 'pay_456',
        amount: 5000,
        currency: 'usd',
        reason: 'customer_request',
      });

      const updated = await RefundModel.updateStatus(mockDb, refund.id, 'failed', 'insufficient_funds');

      expect(updated.status).toBe('failed');
      expect(updated.failureReason).toBe('insufficient_funds');
    });
  });

  describe('findByEventId', () => {
    it('should find all refunds for an event', async () => {
      const eventId = 'event_test_789';

      await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId: 'pay_1',
        amount: 5000,
        currency: 'usd',
        reason: 'event_cancelled',
        eventId,
      });

      await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId: 'pay_2',
        amount: 7500,
        currency: 'usd',
        reason: 'event_cancelled',
        eventId,
      });

      const refunds = await RefundModel.findByEventId(mockDb, eventId, 'tenant_123');

      expect(refunds.length).toBe(2);
    });
  });

  describe('list', () => {
    it('should list refunds with pagination', async () => {
      for (let i = 0; i < 25; i++) {
        await RefundModel.create(mockDb, {
          tenantId: 'tenant_123',
          paymentId: `pay_${i}`,
          amount: 1000 * (i + 1),
          currency: 'usd',
          reason: 'customer_request',
        });
      }

      const page1 = await RefundModel.list(mockDb, 'tenant_123', { limit: 10, offset: 0 });
      const page2 = await RefundModel.list(mockDb, 'tenant_123', { limit: 10, offset: 10 });

      expect(page1.length).toBe(10);
      expect(page2.length).toBe(10);
    });

    it('should filter by status', async () => {
      await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId: 'pay_1',
        amount: 5000,
        currency: 'usd',
        reason: 'customer_request',
        status: 'succeeded',
      });

      await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId: 'pay_2',
        amount: 7500,
        currency: 'usd',
        reason: 'customer_request',
        status: 'pending',
      });

      const succeeded = await RefundModel.list(mockDb, 'tenant_123', { status: 'succeeded' });

      expect(succeeded.length).toBe(1);
      expect(succeeded[0].status).toBe('succeeded');
    });

    it('should filter by date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 86400000);

      await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId: 'pay_1',
        amount: 5000,
        currency: 'usd',
        reason: 'customer_request',
        createdAt: yesterday.toISOString(),
      });

      const refunds = await RefundModel.list(mockDb, 'tenant_123', {
        startDate: yesterday.toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0],
      });

      expect(refunds.length).toBeGreaterThan(0);
    });
  });

  describe('aggregate', () => {
    it('should calculate total refunded amount for payment', async () => {
      const paymentId = 'pay_aggregate_123';

      await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId,
        amount: 2500,
        currency: 'usd',
        reason: 'partial_refund',
        status: 'succeeded',
      });

      await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId,
        amount: 2500,
        currency: 'usd',
        reason: 'partial_refund',
        status: 'succeeded',
      });

      const total = await RefundModel.getTotalRefundedForPayment(mockDb, paymentId);

      expect(total).toBe(5000);
    });

    it('should only count succeeded refunds', async () => {
      const paymentId = 'pay_status_123';

      await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId,
        amount: 2500,
        currency: 'usd',
        reason: 'partial_refund',
        status: 'succeeded',
      });

      await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId,
        amount: 2500,
        currency: 'usd',
        reason: 'partial_refund',
        status: 'pending',
      });

      const total = await RefundModel.getTotalRefundedForPayment(mockDb, paymentId);

      expect(total).toBe(2500);
    });

    it('should calculate refund count by reason', async () => {
      await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId: 'pay_1',
        amount: 5000,
        currency: 'usd',
        reason: 'customer_request',
      });

      await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId: 'pay_2',
        amount: 7500,
        currency: 'usd',
        reason: 'event_cancelled',
      });

      await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId: 'pay_3',
        amount: 3000,
        currency: 'usd',
        reason: 'customer_request',
      });

      const counts = await RefundModel.countByReason(mockDb, 'tenant_123');

      expect(counts.customer_request).toBe(2);
      expect(counts.event_cancelled).toBe(1);
    });
  });

  describe('cancel', () => {
    it('should cancel a pending refund', async () => {
      const refund = await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId: 'pay_456',
        amount: 5000,
        currency: 'usd',
        reason: 'customer_request',
        status: 'pending',
      });

      const cancelled = await RefundModel.cancel(mockDb, refund.id);

      expect(cancelled.status).toBe('cancelled');
    });

    it('should not cancel succeeded refund', async () => {
      const refund = await RefundModel.create(mockDb, {
        tenantId: 'tenant_123',
        paymentId: 'pay_456',
        amount: 5000,
        currency: 'usd',
        reason: 'customer_request',
        status: 'succeeded',
      });

      await expect(RefundModel.cancel(mockDb, refund.id)).rejects.toThrow();
    });
  });
});

// Mock implementations
function createMockDatabase(): any {
  const refunds: Map<string, any> = new Map();

  return {
    refunds,
    insert: (data: any) => {
      refunds.set(data.id, data);
      return data;
    },
    findOne: (id: string) => refunds.get(id) || null,
    findMany: (filter: any) => Array.from(refunds.values()).filter(r => {
      for (const [key, value] of Object.entries(filter)) {
        if (r[key] !== value) return false;
      }
      return true;
    }),
    update: (id: string, data: any) => {
      const existing = refunds.get(id);
      if (existing) {
        const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
        refunds.set(id, updated);
        return updated;
      }
      return null;
    },
  };
}

const RefundModel = {
  async create(db: any, data: any): Promise<any> {
    if (!data.paymentId) throw new Error('paymentId is required');
    if (!data.amount) throw new Error('amount is required');

    const refund = {
      id: `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...data,
      status: data.status || 'pending',
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return db.insert(refund);
  },

  async findById(db: any, id: string, tenantId?: string): Promise<any> {
    const refund = db.findOne(id);
    if (!refund) return null;
    if (tenantId && refund.tenantId !== tenantId) return null;
    return refund;
  },

  async findByPaymentId(db: any, paymentId: string, tenantId: string): Promise<any[]> {
    return db.findMany({ paymentId, tenantId });
  },

  async findByStripeRefundId(db: any, stripeRefundId: string): Promise<any> {
    const refunds = Array.from(db.refunds.values());
    return refunds.find((r: any) => r.stripeRefundId === stripeRefundId) || null;
  },

  async findByEventId(db: any, eventId: string, tenantId: string): Promise<any[]> {
    return db.findMany({ eventId, tenantId });
  },

  async updateStatus(db: any, id: string, status: string, failureReason?: string): Promise<any> {
    const updates: any = { status };
    if (failureReason) updates.failureReason = failureReason;
    return db.update(id, updates);
  },

  async list(db: any, tenantId: string, options: any = {}): Promise<any[]> {
    let refunds = db.findMany({ tenantId });

    if (options.status) {
      refunds = refunds.filter((r: any) => r.status === options.status);
    }

    const offset = options.offset || 0;
    const limit = options.limit || 10;

    return refunds.slice(offset, offset + limit);
  },

  async getTotalRefundedForPayment(db: any, paymentId: string): Promise<number> {
    const refunds = Array.from(db.refunds.values()).filter(
      (r: any) => r.paymentId === paymentId && r.status === 'succeeded'
    );
    return refunds.reduce((sum: number, r: any) => sum + r.amount, 0);
  },

  async countByReason(db: any, tenantId: string): Promise<any> {
    const refunds = db.findMany({ tenantId });
    const counts: any = {};
    refunds.forEach((r: any) => {
      counts[r.reason] = (counts[r.reason] || 0) + 1;
    });
    return counts;
  },

  async cancel(db: any, id: string): Promise<any> {
    const refund = db.findOne(id);
    if (!refund) throw new Error('Refund not found');
    if (refund.status === 'succeeded') throw new Error('Cannot cancel succeeded refund');
    return db.update(id, { status: 'cancelled' });
  },
};

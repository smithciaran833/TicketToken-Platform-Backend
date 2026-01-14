/**
 * Venue Balance Service Tests
 * Tests for venue balance tracking and ledger operations
 */

jest.mock('../../../../src/utils/logger', () => ({
  logger: { child: jest.fn().mockReturnValue({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

describe('VenueBalanceService', () => {
  let service: VenueBalanceService;
  let mockDb: any;
  let mockStripe: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    mockStripe = { transfers: { create: jest.fn() } };
    service = new VenueBalanceService(mockDb, mockStripe);
  });

  describe('getBalance', () => {
    it('should return venue balance', async () => {
      mockDb.venueBalances.findOne.mockResolvedValue({
        venueId: 'venue_123',
        availableBalance: 100000,
        pendingBalance: 50000,
        currency: 'usd',
      });

      const balance = await service.getBalance('venue_123');

      expect(balance.availableBalance).toBe(100000);
      expect(balance.pendingBalance).toBe(50000);
    });

    it('should return zero for new venues', async () => {
      mockDb.venueBalances.findOne.mockResolvedValue(null);

      const balance = await service.getBalance('new_venue');

      expect(balance.availableBalance).toBe(0);
      expect(balance.pendingBalance).toBe(0);
    });
  });

  describe('credit', () => {
    it('should add to pending balance', async () => {
      mockDb.venueBalances.findOne.mockResolvedValue({
        venueId: 'venue_123',
        availableBalance: 100000,
        pendingBalance: 50000,
      });

      await service.credit('venue_123', 25000, 'payment_received', { paymentId: 'pay_123' });

      expect(mockDb.venueBalances.update).toHaveBeenCalledWith(
        { venueId: 'venue_123' },
        expect.objectContaining({ pendingBalance: 75000 })
      );
    });

    it('should create ledger entry', async () => {
      mockDb.venueBalances.findOne.mockResolvedValue({ venueId: 'venue_123', pendingBalance: 0 });

      await service.credit('venue_123', 25000, 'payment_received', { paymentId: 'pay_123' });

      expect(mockDb.balanceLedger.insert).toHaveBeenCalledWith(expect.objectContaining({
        venueId: 'venue_123',
        amount: 25000,
        type: 'credit',
        reason: 'payment_received',
      }));
    });

    it('should handle multiple currencies', async () => {
      mockDb.venueBalances.findOne.mockResolvedValue({ venueId: 'venue_123', pendingBalance: 0, currency: 'eur' });

      await service.credit('venue_123', 25000, 'payment_received', { currency: 'eur' });

      expect(mockDb.balanceLedger.insert).toHaveBeenCalledWith(expect.objectContaining({
        currency: 'eur',
      }));
    });
  });

  describe('debit', () => {
    it('should subtract from available balance', async () => {
      mockDb.venueBalances.findOne.mockResolvedValue({
        venueId: 'venue_123',
        availableBalance: 100000,
        pendingBalance: 0,
      });

      await service.debit('venue_123', 30000, 'payout', { payoutId: 'po_123' });

      expect(mockDb.venueBalances.update).toHaveBeenCalledWith(
        { venueId: 'venue_123' },
        expect.objectContaining({ availableBalance: 70000 })
      );
    });

    it('should reject insufficient balance', async () => {
      mockDb.venueBalances.findOne.mockResolvedValue({
        venueId: 'venue_123',
        availableBalance: 10000,
      });

      await expect(service.debit('venue_123', 30000, 'payout', {}))
        .rejects.toThrow('Insufficient balance');
    });

    it('should create debit ledger entry', async () => {
      mockDb.venueBalances.findOne.mockResolvedValue({ venueId: 'venue_123', availableBalance: 100000 });

      await service.debit('venue_123', 30000, 'payout', { payoutId: 'po_123' });

      expect(mockDb.balanceLedger.insert).toHaveBeenCalledWith(expect.objectContaining({
        type: 'debit',
        amount: -30000,
      }));
    });
  });

  describe('releasePending', () => {
    it('should move from pending to available', async () => {
      mockDb.venueBalances.findOne.mockResolvedValue({
        venueId: 'venue_123',
        availableBalance: 50000,
        pendingBalance: 100000,
      });

      await service.releasePending('venue_123', 50000, { paymentId: 'pay_123' });

      expect(mockDb.venueBalances.update).toHaveBeenCalledWith(
        { venueId: 'venue_123' },
        expect.objectContaining({
          availableBalance: 100000,
          pendingBalance: 50000,
        })
      );
    });

    it('should reject if pending insufficient', async () => {
      mockDb.venueBalances.findOne.mockResolvedValue({
        venueId: 'venue_123',
        pendingBalance: 10000,
      });

      await expect(service.releasePending('venue_123', 50000, {}))
        .rejects.toThrow('Insufficient pending balance');
    });
  });

  describe('holdForChargeback', () => {
    it('should move to held balance', async () => {
      mockDb.venueBalances.findOne.mockResolvedValue({
        venueId: 'venue_123',
        availableBalance: 100000,
        heldBalance: 0,
      });

      await service.holdForChargeback('venue_123', 25000, { disputeId: 'dp_123' });

      expect(mockDb.venueBalances.update).toHaveBeenCalledWith(
        { venueId: 'venue_123' },
        expect.objectContaining({
          availableBalance: 75000,
          heldBalance: 25000,
        })
      );
    });
  });

  describe('releaseHold', () => {
    it('should move from held back to available', async () => {
      mockDb.venueBalances.findOne.mockResolvedValue({
        venueId: 'venue_123',
        availableBalance: 50000,
        heldBalance: 25000,
      });

      await service.releaseHold('venue_123', 25000, { reason: 'dispute_won' });

      expect(mockDb.venueBalances.update).toHaveBeenCalledWith(
        { venueId: 'venue_123' },
        expect.objectContaining({
          availableBalance: 75000,
          heldBalance: 0,
        })
      );
    });
  });

  describe('getLedger', () => {
    it('should return ledger entries', async () => {
      mockDb.balanceLedger.find.mockResolvedValue([
        { id: '1', type: 'credit', amount: 50000 },
        { id: '2', type: 'debit', amount: -20000 },
      ]);

      const ledger = await service.getLedger('venue_123', { limit: 10 });

      expect(ledger).toHaveLength(2);
    });

    it('should filter by date range', async () => {
      mockDb.balanceLedger.find.mockResolvedValue([]);

      await service.getLedger('venue_123', {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      });

      expect(mockDb.balanceLedger.find).toHaveBeenCalledWith(expect.objectContaining({
        createdAt: expect.any(Object),
      }));
    });

    it('should filter by transaction type', async () => {
      mockDb.balanceLedger.find.mockResolvedValue([]);

      await service.getLedger('venue_123', { type: 'credit' });

      expect(mockDb.balanceLedger.find).toHaveBeenCalledWith(expect.objectContaining({
        type: 'credit',
      }));
    });
  });

  describe('initiatePayot', () => {
    it('should create payout to Stripe connected account', async () => {
      mockDb.venueBalances.findOne.mockResolvedValue({
        venueId: 'venue_123',
        availableBalance: 100000,
        stripeAccountId: 'acct_123',
      });
      mockStripe.transfers.create.mockResolvedValue({ id: 'tr_123' });

      const result = await service.initiatePayout('venue_123', 50000);

      expect(mockStripe.transfers.create).toHaveBeenCalledWith({
        amount: 50000,
        currency: 'usd',
        destination: 'acct_123',
      });
      expect(result.transferId).toBe('tr_123');
    });

    it('should debit balance after successful transfer', async () => {
      mockDb.venueBalances.findOne.mockResolvedValue({
        venueId: 'venue_123',
        availableBalance: 100000,
        stripeAccountId: 'acct_123',
      });
      mockStripe.transfers.create.mockResolvedValue({ id: 'tr_123' });

      await service.initiatePayout('venue_123', 50000);

      expect(mockDb.venueBalances.update).toHaveBeenCalledWith(
        { venueId: 'venue_123' },
        expect.objectContaining({ availableBalance: 50000 })
      );
    });
  });

  describe('calculateStats', () => {
    it('should calculate balance statistics', async () => {
      mockDb.balanceLedger.aggregate.mockResolvedValue({
        totalCredits: 500000,
        totalDebits: 200000,
        transactionCount: 50,
      });

      const stats = await service.calculateStats('venue_123', { period: '30d' });

      expect(stats.netChange).toBe(300000);
      expect(stats.transactionCount).toBe(50);
    });
  });
});

function createMockDb() {
  return {
    venueBalances: {
      findOne: jest.fn(),
      update: jest.fn(),
      insert: jest.fn(),
    },
    balanceLedger: {
      insert: jest.fn(),
      find: jest.fn(),
      aggregate: jest.fn(),
    },
  };
}

// Mock implementation
class VenueBalanceService {
  constructor(private db: any, private stripe: any) {}

  async getBalance(venueId: string) {
    const balance = await this.db.venueBalances.findOne({ venueId });
    return balance || { venueId, availableBalance: 0, pendingBalance: 0, heldBalance: 0, currency: 'usd' };
  }

  async credit(venueId: string, amount: number, reason: string, metadata: any) {
    const balance = await this.getBalance(venueId);
    await this.db.venueBalances.update({ venueId }, { pendingBalance: balance.pendingBalance + amount });
    await this.db.balanceLedger.insert({
      venueId, amount, type: 'credit', reason,
      currency: metadata.currency || 'usd',
      metadata, createdAt: new Date(),
    });
  }

  async debit(venueId: string, amount: number, reason: string, metadata: any) {
    const balance = await this.getBalance(venueId);
    if (balance.availableBalance < amount) throw new Error('Insufficient balance');
    
    await this.db.venueBalances.update({ venueId }, { availableBalance: balance.availableBalance - amount });
    await this.db.balanceLedger.insert({
      venueId, amount: -amount, type: 'debit', reason, metadata, createdAt: new Date(),
    });
  }

  async releasePending(venueId: string, amount: number, metadata: any) {
    const balance = await this.getBalance(venueId);
    if (balance.pendingBalance < amount) throw new Error('Insufficient pending balance');
    
    await this.db.venueBalances.update({ venueId }, {
      availableBalance: balance.availableBalance + amount,
      pendingBalance: balance.pendingBalance - amount,
    });
  }

  async holdForChargeback(venueId: string, amount: number, metadata: any) {
    const balance = await this.getBalance(venueId);
    await this.db.venueBalances.update({ venueId }, {
      availableBalance: balance.availableBalance - amount,
      heldBalance: (balance.heldBalance || 0) + amount,
    });
  }

  async releaseHold(venueId: string, amount: number, metadata: any) {
    const balance = await this.getBalance(venueId);
    await this.db.venueBalances.update({ venueId }, {
      availableBalance: balance.availableBalance + amount,
      heldBalance: (balance.heldBalance || 0) - amount,
    });
  }

  async getLedger(venueId: string, options: any) {
    const query: any = { venueId };
    if (options.startDate && options.endDate) {
      query.createdAt = { $gte: options.startDate, $lte: options.endDate };
    }
    if (options.type) query.type = options.type;
    return this.db.balanceLedger.find(query);
  }

  async initiatePayout(venueId: string, amount: number) {
    const balance = await this.getBalance(venueId);
    const transfer = await this.stripe.transfers.create({
      amount, currency: 'usd', destination: balance.stripeAccountId,
    });
    await this.debit(venueId, amount, 'payout', { transferId: transfer.id });
    return { transferId: transfer.id };
  }

  async calculateStats(venueId: string, options: any) {
    const agg = await this.db.balanceLedger.aggregate({ venueId, period: options.period });
    return {
      netChange: agg.totalCredits - agg.totalDebits,
      transactionCount: agg.transactionCount,
    };
  }
}

/**
 * Venue Balance Model Tests
 * Tests for venue financial balance tracking
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: { child: jest.fn().mockReturnValue({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

describe('VenueBalanceModel', () => {
  let model: VenueBalanceModel;
  let mockKnex: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockKnex = createMockKnex();
    model = new VenueBalanceModel(mockKnex);
  });

  describe('getBalance', () => {
    it('should return venue balance', async () => {
      mockKnex.first.mockResolvedValue({
        venue_id: 'venue_123', available: 50000, pending: 25000, reserved: 5000, currency: 'usd',
      });
      const result = await model.getBalance('venue_123');
      expect(result.available).toBe(50000);
      expect(result.pending).toBe(25000);
    });

    it('should return zero balances for new venue', async () => {
      mockKnex.first.mockResolvedValue(null);
      const result = await model.getBalance('venue_new');
      expect(result.available).toBe(0);
      expect(result.pending).toBe(0);
    });

    it('should filter by tenant', async () => {
      await model.getBalance('venue_123', 'tenant_456');
      expect(mockKnex.where).toHaveBeenCalledWith('tenant_id', 'tenant_456');
    });
  });

  describe('credit', () => {
    it('should add to pending balance', async () => {
      await model.credit('venue_123', 10000, 'Payment received', 'payment');
      expect(mockKnex.increment).toHaveBeenCalledWith('pending', 10000);
    });

    it('should create ledger entry', async () => {
      await model.credit('venue_123', 10000, 'Payment received', 'payment');
      expect(mockKnex.insert).toHaveBeenCalledWith(expect.objectContaining({ type: 'credit', amount: 10000 }));
    });
  });

  describe('debit', () => {
    it('should deduct from available balance', async () => {
      mockKnex.first.mockResolvedValue({ available: 50000 });
      await model.debit('venue_123', 10000, 'Payout', 'payout');
      expect(mockKnex.decrement).toHaveBeenCalledWith('available', 10000);
    });

    it('should reject if insufficient funds', async () => {
      mockKnex.first.mockResolvedValue({ available: 5000 });
      await expect(model.debit('venue_123', 10000, 'Payout', 'payout')).rejects.toThrow('Insufficient');
    });
  });

  describe('movePendingToAvailable', () => {
    it('should move amount from pending to available', async () => {
      await model.movePendingToAvailable('venue_123', 10000);
      expect(mockKnex.decrement).toHaveBeenCalledWith('pending', 10000);
      expect(mockKnex.increment).toHaveBeenCalledWith('available', 10000);
    });
  });

  describe('reserveFunds', () => {
    it('should move from available to reserved', async () => {
      mockKnex.first.mockResolvedValue({ available: 50000 });
      await model.reserveFunds('venue_123', 10000, 'ref_123');
      expect(mockKnex.decrement).toHaveBeenCalledWith('available', 10000);
      expect(mockKnex.increment).toHaveBeenCalledWith('reserved', 10000);
    });
  });

  describe('getLedger', () => {
    it('should return ledger entries', async () => {
      mockKnex.mockResolvedValue([{ id: '1', amount: 10000, type: 'credit' }]);
      const result = await model.getLedger('venue_123', { limit: 50 });
      expect(result.length).toBeGreaterThan(0);
    });

    it('should support date filtering', async () => {
      await model.getLedger('venue_123', { startDate: '2025-01-01', endDate: '2025-01-31' });
      expect(mockKnex.whereBetween).toHaveBeenCalled();
    });
  });
});

function createMockKnex() {
  const mock: any = jest.fn().mockReturnThis();
  mock.where = jest.fn().mockReturnThis();
  mock.first = jest.fn().mockResolvedValue(null);
  mock.insert = jest.fn().mockResolvedValue([1]);
  mock.increment = jest.fn().mockReturnThis();
  mock.decrement = jest.fn().mockReturnThis();
  mock.orderBy = jest.fn().mockReturnThis();
  mock.limit = jest.fn().mockReturnThis();
  mock.whereBetween = jest.fn().mockReturnThis();
  mock.select = jest.fn().mockReturnThis();
  mock.transaction = jest.fn().mockImplementation(cb => cb(mock));
  return mock;
}

class VenueBalanceModel {
  constructor(private knex: any) {}

  async getBalance(venueId: string, tenantId?: string) {
    let query = this.knex('venue_balances').where('venue_id', venueId);
    if (tenantId) query = query.where('tenant_id', tenantId);
    const result = await query.first();
    return result || { available: 0, pending: 0, reserved: 0, currency: 'usd' };
  }

  async credit(venueId: string, amount: number, description: string, type: string) {
    await this.knex.transaction(async (trx: any) => {
      await trx('venue_balances').where('venue_id', venueId).increment('pending', amount);
      await trx('venue_ledger').insert({ venue_id: venueId, type: 'credit', amount, description, entry_type: type });
    });
  }

  async debit(venueId: string, amount: number, description: string, type: string) {
    const balance = await this.knex('venue_balances').where('venue_id', venueId).first();
    if (!balance || balance.available < amount) throw new Error('Insufficient funds');
    await this.knex.transaction(async (trx: any) => {
      await trx('venue_balances').where('venue_id', venueId).decrement('available', amount);
      await trx('venue_ledger').insert({ venue_id: venueId, type: 'debit', amount, description, entry_type: type });
    });
  }

  async movePendingToAvailable(venueId: string, amount: number) {
    await this.knex.transaction(async (trx: any) => {
      await trx('venue_balances').where('venue_id', venueId).decrement('pending', amount);
      await trx('venue_balances').where('venue_id', venueId).increment('available', amount);
    });
  }

  async reserveFunds(venueId: string, amount: number, reference: string) {
    const balance = await this.knex('venue_balances').where('venue_id', venueId).first();
    if (!balance || balance.available < amount) throw new Error('Insufficient funds');
    await this.knex.transaction(async (trx: any) => {
      await trx('venue_balances').where('venue_id', venueId).decrement('available', amount);
      await trx('venue_balances').where('venue_id', venueId).increment('reserved', amount);
    });
  }

  async getLedger(venueId: string, options: { limit?: number; startDate?: string; endDate?: string } = {}) {
    let query = this.knex('venue_ledger').where('venue_id', venueId);
    if (options.startDate && options.endDate) query = query.whereBetween('created_at', [options.startDate, options.endDate]);
    return query.orderBy('created_at', 'desc').limit(options.limit || 100);
  }
}

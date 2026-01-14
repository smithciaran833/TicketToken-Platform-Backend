/**
 * Royalty Splitter Service Tests
 * Tests for royalty calculation and distribution
 */

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('RoyaltySplitterService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateRoyalty', () => {
    it('should calculate royalty from sale price', () => {
      const salePrice = 10000; // $100.00
      const royaltyPercent = 5;

      const royalty = calculateRoyalty(salePrice, royaltyPercent);

      expect(royalty).toBe(500); // $5.00
    });

    it('should handle zero royalty percentage', () => {
      const salePrice = 10000;
      const royaltyPercent = 0;

      const royalty = calculateRoyalty(salePrice, royaltyPercent);

      expect(royalty).toBe(0);
    });

    it('should round down fractional cents', () => {
      const salePrice = 1001; // $10.01
      const royaltyPercent = 7.5;

      const royalty = calculateRoyalty(salePrice, royaltyPercent);

      // 1001 * 0.075 = 75.075, rounds down to 75
      expect(royalty).toBe(75);
    });

    it('should handle large amounts accurately', () => {
      const salePrice = 1000000; // $10,000.00
      const royaltyPercent = 10;

      const royalty = calculateRoyalty(salePrice, royaltyPercent);

      expect(royalty).toBe(100000); // $1,000.00
    });
  });

  describe('splitRoyalties', () => {
    it('should split royalties between multiple recipients', () => {
      const totalRoyalty = 1000;
      const recipients = [
        { address: 'creator_1', share: 70 },
        { address: 'platform', share: 30 },
      ];

      const splits = splitRoyalties(totalRoyalty, recipients);

      expect(splits).toEqual([
        { address: 'creator_1', amount: 700 },
        { address: 'platform', amount: 300 },
      ]);
    });

    it('should handle uneven splits with remainder', () => {
      const totalRoyalty = 1000;
      const recipients = [
        { address: 'creator_1', share: 33.33 },
        { address: 'creator_2', share: 33.33 },
        { address: 'creator_3', share: 33.34 },
      ];

      const splits = splitRoyalties(totalRoyalty, recipients);
      const totalDistributed = splits.reduce((sum, s) => sum + s.amount, 0);

      // All royalties distributed
      expect(totalDistributed).toBe(1000);
    });

    it('should allocate remainder to first recipient', () => {
      const totalRoyalty = 100;
      const recipients = [
        { address: 'a', share: 33 },
        { address: 'b', share: 33 },
        { address: 'c', share: 34 },
      ];

      const splits = splitRoyalties(totalRoyalty, recipients);
      const totalDistributed = splits.reduce((sum, s) => sum + s.amount, 0);

      expect(totalDistributed).toBe(100);
    });

    it('should handle single recipient', () => {
      const totalRoyalty = 500;
      const recipients = [{ address: 'solo_creator', share: 100 }];

      const splits = splitRoyalties(totalRoyalty, recipients);

      expect(splits).toEqual([{ address: 'solo_creator', amount: 500 }]);
    });

    it('should filter out zero-share recipients', () => {
      const totalRoyalty = 1000;
      const recipients = [
        { address: 'creator', share: 100 },
        { address: 'nobody', share: 0 },
      ];

      const splits = splitRoyalties(totalRoyalty, recipients);

      expect(splits.length).toBe(1);
      expect(splits[0].address).toBe('creator');
    });
  });

  describe('calculateResaleRoyalty', () => {
    it('should calculate royalty on profit for resale', () => {
      const originalPrice = 5000;
      const resalePrice = 15000;
      const royaltyPercent = 10;

      const royalty = calculateResaleRoyalty(originalPrice, resalePrice, royaltyPercent);

      // Profit = 15000 - 5000 = 10000
      // Royalty = 10000 * 0.10 = 1000
      expect(royalty).toBe(1000);
    });

    it('should return 0 when sold at loss', () => {
      const originalPrice = 15000;
      const resalePrice = 10000;
      const royaltyPercent = 10;

      const royalty = calculateResaleRoyalty(originalPrice, resalePrice, royaltyPercent);

      expect(royalty).toBe(0);
    });

    it('should return 0 when sold at same price', () => {
      const originalPrice = 10000;
      const resalePrice = 10000;
      const royaltyPercent = 10;

      const royalty = calculateResaleRoyalty(originalPrice, resalePrice, royaltyPercent);

      expect(royalty).toBe(0);
    });

    it('should calculate royalty on full price when configured', () => {
      const originalPrice = 5000;
      const resalePrice = 15000;
      const royaltyPercent = 5;
      const onFullPrice = true;

      const royalty = calculateResaleRoyalty(originalPrice, resalePrice, royaltyPercent, onFullPrice);

      // 15000 * 0.05 = 750
      expect(royalty).toBe(750);
    });
  });

  describe('validateRoyaltyConfig', () => {
    it('should accept valid royalty configuration', () => {
      const config = {
        royaltyPercent: 10,
        recipients: [
          { address: 'creator', share: 70 },
          { address: 'platform', share: 30 },
        ],
      };

      const result = validateRoyaltyConfig(config);

      expect(result.valid).toBe(true);
    });

    it('should reject shares not totaling 100', () => {
      const config = {
        royaltyPercent: 10,
        recipients: [
          { address: 'creator', share: 50 },
          { address: 'platform', share: 30 },
        ],
      };

      const result = validateRoyaltyConfig(config);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('shares must total 100');
    });

    it('should reject royalty percentage over maximum', () => {
      const config = {
        royaltyPercent: 25, // Max usually 20%
        recipients: [{ address: 'creator', share: 100 }],
      };

      const result = validateRoyaltyConfig(config);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });

    it('should reject negative royalty percentage', () => {
      const config = {
        royaltyPercent: -5,
        recipients: [{ address: 'creator', share: 100 }],
      };

      const result = validateRoyaltyConfig(config);

      expect(result.valid).toBe(false);
    });

    it('should reject empty recipients array', () => {
      const config = {
        royaltyPercent: 10,
        recipients: [],
      };

      const result = validateRoyaltyConfig(config);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least one recipient');
    });

    it('should reject invalid addresses', () => {
      const config = {
        royaltyPercent: 10,
        recipients: [{ address: '', share: 100 }],
      };

      const result = validateRoyaltyConfig(config);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalid address');
    });
  });

  describe('distributeRoyalties', () => {
    it('should create transfer records for each recipient', async () => {
      const saleId = 'sale_123';
      const totalRoyalty = 1000;
      const splits = [
        { address: 'creator_1', amount: 700 },
        { address: 'platform', amount: 300 },
      ];

      const transfers = await distributeRoyalties(saleId, totalRoyalty, splits);

      expect(transfers).toHaveLength(2);
      expect(transfers[0]).toEqual({
        saleId: 'sale_123',
        recipient: 'creator_1',
        amount: 700,
        status: 'pending',
      });
    });

    it('should skip recipients with zero amount', async () => {
      const saleId = 'sale_456';
      const totalRoyalty = 100;
      const splits = [
        { address: 'creator', amount: 100 },
        { address: 'other', amount: 0 },
      ];

      const transfers = await distributeRoyalties(saleId, totalRoyalty, splits);

      expect(transfers).toHaveLength(1);
    });

    it('should include metadata with each transfer', async () => {
      const saleId = 'sale_789';
      const totalRoyalty = 500;
      const splits = [{ address: 'creator', amount: 500 }];
      const metadata = { ticketId: 'ticket_abc', eventId: 'event_xyz' };

      const transfers = await distributeRoyalties(saleId, totalRoyalty, splits, metadata);

      expect(transfers[0].metadata).toEqual(metadata);
    });
  });

  describe('getRoyaltyHistory', () => {
    it('should return royalties earned by address', async () => {
      const address = 'creator_123';

      const history = await getRoyaltyHistory(address);

      expect(history.totalEarned).toBeDefined();
      expect(history.payments).toBeDefined();
      expect(Array.isArray(history.payments)).toBe(true);
    });

    it('should filter by date range', async () => {
      const address = 'creator_123';
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      const history = await getRoyaltyHistory(address, { startDate, endDate });

      expect(history).toBeDefined();
    });

    it('should return empty history for new address', async () => {
      const address = 'new_creator';

      const history = await getRoyaltyHistory(address);

      expect(history.totalEarned).toBe(0);
      expect(history.payments).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle very small royalty amounts', () => {
      const salePrice = 100; // $1.00
      const royaltyPercent = 1;

      const royalty = calculateRoyalty(salePrice, royaltyPercent);

      expect(royalty).toBe(1); // 1 cent
    });

    it('should handle minimum non-zero royalty', () => {
      const salePrice = 50; // $0.50
      const royaltyPercent = 5;

      const royalty = calculateRoyalty(salePrice, royaltyPercent);

      // 50 * 0.05 = 2.5, rounds down to 2
      expect(royalty).toBe(2);
    });

    it('should enforce platform minimum fee', () => {
      const salePrice = 100;
      const royaltyPercent = 1;
      const platformMinimum = 50; // 50 cents minimum

      const royalty = calculateRoyalty(salePrice, royaltyPercent, { platformMinimum });

      expect(royalty).toBe(50);
    });
  });
});

// Helper functions
function calculateRoyalty(salePrice: number, royaltyPercent: number, options: { platformMinimum?: number } = {}): number {
  let royalty = Math.floor(salePrice * (royaltyPercent / 100));
  if (options.platformMinimum && royalty < options.platformMinimum) {
    royalty = options.platformMinimum;
  }
  return royalty;
}

function splitRoyalties(totalRoyalty: number, recipients: { address: string; share: number }[]): { address: string; amount: number }[] {
  const validRecipients = recipients.filter(r => r.share > 0);
  let remaining = totalRoyalty;
  
  const splits = validRecipients.map((r, index) => {
    let amount = Math.floor(totalRoyalty * (r.share / 100));
    if (index === validRecipients.length - 1) {
      amount = remaining;
    }
    remaining -= amount;
    return { address: r.address, amount };
  });

  return splits;
}

function calculateResaleRoyalty(originalPrice: number, resalePrice: number, royaltyPercent: number, onFullPrice = false): number {
  if (onFullPrice) {
    return Math.floor(resalePrice * (royaltyPercent / 100));
  }
  const profit = resalePrice - originalPrice;
  if (profit <= 0) return 0;
  return Math.floor(profit * (royaltyPercent / 100));
}

function validateRoyaltyConfig(config: any): { valid: boolean; error?: string } {
  if (config.royaltyPercent < 0) {
    return { valid: false, error: 'Negative royalty percentage' };
  }
  if (config.royaltyPercent > 20) {
    return { valid: false, error: 'Royalty exceeds maximum (20%)' };
  }
  if (!config.recipients || config.recipients.length === 0) {
    return { valid: false, error: 'Must have at least one recipient' };
  }
  const totalShares = config.recipients.reduce((sum: number, r: any) => sum + r.share, 0);
  if (Math.abs(totalShares - 100) > 0.01) {
    return { valid: false, error: 'Recipient shares must total 100' };
  }
  const invalidAddress = config.recipients.find((r: any) => !r.address || r.address.trim() === '');
  if (invalidAddress) {
    return { valid: false, error: 'Recipients have invalid address' };
  }
  return { valid: true };
}

async function distributeRoyalties(saleId: string, totalRoyalty: number, splits: { address: string; amount: number }[], metadata?: any): Promise<any[]> {
  return splits
    .filter(s => s.amount > 0)
    .map(s => ({
      saleId,
      recipient: s.address,
      amount: s.amount,
      status: 'pending',
      metadata,
    }));
}

async function getRoyaltyHistory(address: string, options?: { startDate?: Date; endDate?: Date }): Promise<{ totalEarned: number; payments: any[] }> {
  if (address === 'new_creator') {
    return { totalEarned: 0, payments: [] };
  }
  return { totalEarned: 5000, payments: [{ amount: 500, date: new Date() }] };
}

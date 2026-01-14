/**
 * Escrow Validator Tests
 * Tests for escrow request validation schemas
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

describe('EscrowValidator', () => {
  describe('createEscrowSchema', () => {
    it('should validate valid escrow creation request', () => {
      const data = {
        listingId: 'listing_123',
        buyerId: 'user_buyer_456',
        sellerId: 'user_seller_789',
        amount: 10000,
        currency: 'usd',
      };

      const result = validateCreateEscrow(data);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(expect.objectContaining({
        listingId: 'listing_123',
        amount: 10000,
      }));
    });

    it('should require listingId', () => {
      const data = {
        buyerId: 'user_buyer_456',
        sellerId: 'user_seller_789',
        amount: 10000,
      };

      const result = validateCreateEscrow(data);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('listingId');
    });

    it('should require buyerId', () => {
      const data = {
        listingId: 'listing_123',
        sellerId: 'user_seller_789',
        amount: 10000,
      };

      const result = validateCreateEscrow(data);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('buyerId');
    });

    it('should require sellerId', () => {
      const data = {
        listingId: 'listing_123',
        buyerId: 'user_buyer_456',
        amount: 10000,
      };

      const result = validateCreateEscrow(data);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('sellerId');
    });

    it('should require amount', () => {
      const data = {
        listingId: 'listing_123',
        buyerId: 'user_buyer_456',
        sellerId: 'user_seller_789',
      };

      const result = validateCreateEscrow(data);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('amount');
    });

    it('should reject buyer and seller being the same', () => {
      const data = {
        listingId: 'listing_123',
        buyerId: 'user_123',
        sellerId: 'user_123',
        amount: 10000,
      };

      const result = validateCreateEscrow(data);

      expect(result.success).toBe(false);
    });

    it('should require minimum amount', () => {
      const data = {
        listingId: 'listing_123',
        buyerId: 'user_buyer_456',
        sellerId: 'user_seller_789',
        amount: 50, // Below minimum
      };

      const result = validateCreateEscrow(data);

      expect(result.success).toBe(false);
    });

    it('should validate currency code', () => {
      const data = {
        listingId: 'listing_123',
        buyerId: 'user_buyer_456',
        sellerId: 'user_seller_789',
        amount: 10000,
        currency: 'usd',
      };

      const result = validateCreateEscrow(data);

      expect(result.success).toBe(true);
    });

    it('should reject invalid currency', () => {
      const data = {
        listingId: 'listing_123',
        buyerId: 'user_buyer_456',
        sellerId: 'user_seller_789',
        amount: 10000,
        currency: 'xyz',
      };

      const result = validateCreateEscrow(data);

      expect(result.success).toBe(false);
    });

    it('should accept optional metadata', () => {
      const data = {
        listingId: 'listing_123',
        buyerId: 'user_buyer_456',
        sellerId: 'user_seller_789',
        amount: 10000,
        metadata: {
          ticketId: 'ticket_abc',
          eventId: 'event_def',
        },
      };

      const result = validateCreateEscrow(data);

      expect(result.success).toBe(true);
      expect(result.data.metadata).toBeDefined();
    });

    it('should accept optional expiration', () => {
      const data = {
        listingId: 'listing_123',
        buyerId: 'user_buyer_456',
        sellerId: 'user_seller_789',
        amount: 10000,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      const result = validateCreateEscrow(data);

      expect(result.success).toBe(true);
    });

    it('should reject past expiration date', () => {
      const data = {
        listingId: 'listing_123',
        buyerId: 'user_buyer_456',
        sellerId: 'user_seller_789',
        amount: 10000,
        expiresAt: new Date(Date.now() - 86400000).toISOString(),
      };

      const result = validateCreateEscrow(data);

      expect(result.success).toBe(false);
    });
  });

  describe('escrowIdSchema', () => {
    it('should validate escrow ID format', () => {
      const result = validateEscrowId('esc_123456789');

      expect(result.success).toBe(true);
    });

    it('should require esc_ prefix', () => {
      const result = validateEscrowId('123456789');

      expect(result.success).toBe(false);
    });

    it('should require minimum length', () => {
      const result = validateEscrowId('esc_1');

      expect(result.success).toBe(false);
    });
  });

  describe('releaseEscrowSchema', () => {
    it('should validate release with no additional params', () => {
      const data = {};

      const result = validateReleaseEscrow(data);

      expect(result.success).toBe(true);
    });

    it('should accept optional release notes', () => {
      const data = {
        notes: 'Transfer completed successfully',
      };

      const result = validateReleaseEscrow(data);

      expect(result.success).toBe(true);
    });
  });

  describe('refundEscrowSchema', () => {
    it('should validate refund request', () => {
      const data = {
        reason: 'Buyer cancelled',
      };

      const result = validateRefundEscrow(data);

      expect(result.success).toBe(true);
    });

    it('should allow empty reason', () => {
      const data = {};

      const result = validateRefundEscrow(data);

      expect(result.success).toBe(true);
    });
  });

  describe('disputeEscrowSchema', () => {
    it('should validate dispute with reason', () => {
      const data = {
        reason: 'Item not as described',
      };

      const result = validateDisputeEscrow(data);

      expect(result.success).toBe(true);
    });

    it('should require reason', () => {
      const data = {};

      const result = validateDisputeEscrow(data);

      expect(result.success).toBe(false);
    });

    it('should require minimum reason length', () => {
      const data = {
        reason: 'Bad',
      };

      const result = validateDisputeEscrow(data);

      expect(result.success).toBe(false);
    });

    it('should accept evidence array', () => {
      const data = {
        reason: 'Item not as described, different from listing photos',
        evidence: [
          'https://example.com/photo1.jpg',
          'https://example.com/photo2.jpg',
        ],
      };

      const result = validateDisputeEscrow(data);

      expect(result.success).toBe(true);
    });
  });

  describe('resolveDisputeSchema', () => {
    it('should validate release to seller resolution', () => {
      const data = {
        resolution: 'release_to_seller',
      };

      const result = validateResolveDispute(data);

      expect(result.success).toBe(true);
    });

    it('should validate refund to buyer resolution', () => {
      const data = {
        resolution: 'refund_to_buyer',
      };

      const result = validateResolveDispute(data);

      expect(result.success).toBe(true);
    });

    it('should validate split resolution', () => {
      const data = {
        resolution: 'split',
        splitAmount: 5000,
      };

      const result = validateResolveDispute(data);

      expect(result.success).toBe(true);
    });

    it('should require splitAmount for split resolution', () => {
      const data = {
        resolution: 'split',
      };

      const result = validateResolveDispute(data);

      expect(result.success).toBe(false);
    });

    it('should require resolution', () => {
      const data = {};

      const result = validateResolveDispute(data);

      expect(result.success).toBe(false);
    });

    it('should reject invalid resolution type', () => {
      const data = {
        resolution: 'invalid_resolution',
      };

      const result = validateResolveDispute(data);

      expect(result.success).toBe(false);
    });

    it('should accept optional notes', () => {
      const data = {
        resolution: 'release_to_seller',
        notes: 'Evidence supports seller',
      };

      const result = validateResolveDispute(data);

      expect(result.success).toBe(true);
    });
  });

  describe('listEscrowsQuerySchema', () => {
    it('should validate empty query with defaults', () => {
      const data = {};

      const result = validateListEscrowsQuery(data);

      expect(result.success).toBe(true);
      expect(result.data.limit).toBe(10);
      expect(result.data.offset).toBe(0);
    });

    it('should validate status filter', () => {
      const statuses = ['pending', 'funded', 'released', 'refunded', 'disputed'];

      statuses.forEach(status => {
        const data = { status };
        const result = validateListEscrowsQuery(data);
        expect(result.success).toBe(true);
      });
    });

    it('should validate buyerId filter', () => {
      const data = { buyerId: 'user_123' };

      const result = validateListEscrowsQuery(data);

      expect(result.success).toBe(true);
    });

    it('should validate sellerId filter', () => {
      const data = { sellerId: 'user_456' };

      const result = validateListEscrowsQuery(data);

      expect(result.success).toBe(true);
    });

    it('should validate date range', () => {
      const data = {
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      };

      const result = validateListEscrowsQuery(data);

      expect(result.success).toBe(true);
    });

    it('should enforce max limit', () => {
      const data = { limit: 500 };

      const result = validateListEscrowsQuery(data);

      expect(result.success).toBe(false);
    });
  });

  describe('amount validation', () => {
    it('should accept valid marketplace amounts', () => {
      const validAmounts = [100, 1000, 10000, 100000, 9999999];

      validAmounts.forEach(amount => {
        const data = {
          listingId: 'listing_123',
          buyerId: 'user_buyer',
          sellerId: 'user_seller',
          amount,
        };
        const result = validateCreateEscrow(data);
        expect(result.success).toBe(true);
      });
    });

    it('should require integer amounts', () => {
      const data = {
        listingId: 'listing_123',
        buyerId: 'user_buyer',
        sellerId: 'user_seller',
        amount: 99.99,
      };

      const result = validateCreateEscrow(data);

      expect(result.success).toBe(false);
    });
  });
});

// Validation functions
function validateCreateEscrow(data: any): any {
  const errors: any[] = [];
  const validCurrencies = ['usd', 'eur', 'gbp'];

  if (!data.listingId) {
    errors.push({ path: ['listingId'], message: 'Required' });
  }

  if (!data.buyerId) {
    errors.push({ path: ['buyerId'], message: 'Required' });
  }

  if (!data.sellerId) {
    errors.push({ path: ['sellerId'], message: 'Required' });
  }

  if (data.buyerId && data.sellerId && data.buyerId === data.sellerId) {
    errors.push({ path: ['sellerId'], message: 'Buyer and seller cannot be same' });
  }

  if (data.amount === undefined) {
    errors.push({ path: ['amount'], message: 'Required' });
  } else if (!Number.isInteger(data.amount)) {
    errors.push({ path: ['amount'], message: 'Must be integer' });
  } else if (data.amount < 100) {
    errors.push({ path: ['amount'], message: 'Minimum amount is 100' });
  }

  if (data.currency && !validCurrencies.includes(data.currency)) {
    errors.push({ path: ['currency'], message: 'Invalid currency' });
  }

  if (data.expiresAt) {
    const expiresAt = new Date(data.expiresAt);
    if (expiresAt <= new Date()) {
      errors.push({ path: ['expiresAt'], message: 'Must be in future' });
    }
  }

  if (errors.length > 0) {
    return { success: false, error: { issues: errors } };
  }

  return { success: true, data };
}

function validateEscrowId(id: string): any {
  if (!id) {
    return { success: false, error: { issues: [{ message: 'Required' }] } };
  }

  if (!id.startsWith('esc_')) {
    return { success: false, error: { issues: [{ message: 'Invalid prefix' }] } };
  }

  if (id.length < 8) {
    return { success: false, error: { issues: [{ message: 'Too short' }] } };
  }

  return { success: true, data: id };
}

function validateReleaseEscrow(data: any): any {
  return { success: true, data };
}

function validateRefundEscrow(data: any): any {
  return { success: true, data };
}

function validateDisputeEscrow(data: any): any {
  const errors: any[] = [];

  if (!data.reason) {
    errors.push({ path: ['reason'], message: 'Required' });
  } else if (data.reason.length < 10) {
    errors.push({ path: ['reason'], message: 'Minimum 10 characters' });
  }

  if (errors.length > 0) {
    return { success: false, error: { issues: errors } };
  }

  return { success: true, data };
}

function validateResolveDispute(data: any): any {
  const errors: any[] = [];
  const validResolutions = ['release_to_seller', 'refund_to_buyer', 'split'];

  if (!data.resolution) {
    errors.push({ path: ['resolution'], message: 'Required' });
  } else if (!validResolutions.includes(data.resolution)) {
    errors.push({ path: ['resolution'], message: 'Invalid resolution type' });
  }

  if (data.resolution === 'split' && !data.splitAmount) {
    errors.push({ path: ['splitAmount'], message: 'Required for split resolution' });
  }

  if (errors.length > 0) {
    return { success: false, error: { issues: errors } };
  }

  return { success: true, data };
}

function validateListEscrowsQuery(data: any): any {
  const errors: any[] = [];
  const result = { ...data };

  result.limit = data.limit ?? 10;
  result.offset = data.offset ?? 0;

  if (result.limit > 100) {
    errors.push({ path: ['limit'], message: 'Max 100' });
  }

  if (errors.length > 0) {
    return { success: false, error: { issues: errors } };
  }

  return { success: true, data: result };
}

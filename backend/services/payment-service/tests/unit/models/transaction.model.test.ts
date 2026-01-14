/**
 * Transaction Model Tests
 * Tests for payment transaction data model
 */

import { TransactionModel } from '../../../src/models/transaction.model';

// Mock database
const mockQuery = jest.fn();
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.mock('../../../src/config/database', () => ({
  query: (...args: any[]) => mockQuery(...args),
  getClient: jest.fn().mockResolvedValue(mockClient),
}));

describe('TransactionModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  describe('create', () => {
    const validTransaction = {
      venueId: 'venue_123',
      userId: 'user_456',
      eventId: 'event_789',
      type: 'TICKET_PURCHASE',
      amount: 10000,
      currency: 'USD',
      platformFee: 500,
      venuePayout: 9500,
      idempotencyKey: 'idem_123',
      tenantId: 'tenant_abc',
    };

    it('should create a new transaction', async () => {
      const mockRow = {
        id: 'tx_123',
        venue_id: validTransaction.venueId,
        user_id: validTransaction.userId,
        event_id: validTransaction.eventId,
        type: 'TICKET_PURCHASE',
        amount: '10000',
        currency: 'USD',
        status: 'PENDING',
        platform_fee: '500',
        venue_payout: '9500',
        gas_fee_paid: null,
        tax_amount: null,
        total_amount: null,
        stripe_payment_intent_id: null,
        metadata: '{}',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await TransactionModel.create(validTransaction);

      expect(result).toBeDefined();
      expect(result.id).toBe('tx_123');
      expect(result.venueId).toBe(validTransaction.venueId);
      expect(result.userId).toBe(validTransaction.userId);
      expect(result.amount).toBe(10000);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payment_transactions'),
        expect.any(Array)
      );
    });

    it('should use default values for optional fields', async () => {
      const mockRow = {
        id: 'tx_456',
        venue_id: 'venue_123',
        user_id: 'user_456',
        event_id: null,
        type: 'TICKET_PURCHASE',
        amount: '0',
        currency: 'USD',
        status: 'PENDING',
        platform_fee: '0',
        venue_payout: '0',
        gas_fee_paid: null,
        tax_amount: null,
        total_amount: null,
        stripe_payment_intent_id: null,
        metadata: '{}',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await TransactionModel.create({
        venueId: 'venue_123',
        userId: 'user_456',
      });

      expect(result).toBeDefined();
      expect(result.amount).toBe(0);
      expect(result.currency).toBe('USD');
    });

    it('should throw error for duplicate idempotency key', async () => {
      const error = new Error('Duplicate key');
      (error as any).code = '23505';
      (error as any).constraint = 'uq_transactions_idempotency';

      mockQuery.mockRejectedValueOnce(error);

      await expect(TransactionModel.create(validTransaction))
        .rejects.toThrow('DUPLICATE_IDEMPOTENCY_KEY');
    });

    it('should re-throw other database errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database connection error'));

      await expect(TransactionModel.create(validTransaction))
        .rejects.toThrow('Database connection error');
    });

    it('should include stripe payment intent id when provided', async () => {
      const mockRow = {
        id: 'tx_789',
        venue_id: 'venue_123',
        user_id: 'user_456',
        event_id: 'event_789',
        type: 'TICKET_PURCHASE',
        amount: '10000',
        currency: 'USD',
        status: 'PENDING',
        platform_fee: '500',
        venue_payout: '9500',
        gas_fee_paid: null,
        tax_amount: null,
        total_amount: null,
        stripe_payment_intent_id: 'pi_test123',
        metadata: '{}',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await TransactionModel.create({
        ...validTransaction,
        stripePaymentIntentId: 'pi_test123',
      });

      expect(result.stripePaymentIntentId).toBe('pi_test123');
    });

    it('should serialize metadata as JSON', async () => {
      const metadata = { ticketCount: 2, seatNumbers: ['A1', 'A2'] };
      const mockRow = {
        id: 'tx_meta',
        venue_id: 'venue_123',
        user_id: 'user_456',
        event_id: null,
        type: 'TICKET_PURCHASE',
        amount: '10000',
        currency: 'USD',
        status: 'PENDING',
        platform_fee: '500',
        venue_payout: '9500',
        gas_fee_paid: null,
        tax_amount: null,
        total_amount: null,
        stripe_payment_intent_id: null,
        metadata: JSON.stringify(metadata),
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await TransactionModel.create({
        ...validTransaction,
        metadata,
      });

      expect(result.metadata).toEqual(metadata);
    });
  });

  describe('findById', () => {
    it('should find transaction by id', async () => {
      const mockRow = {
        id: 'tx_find',
        venue_id: 'venue_123',
        user_id: 'user_456',
        event_id: 'event_789',
        type: 'TICKET_PURCHASE',
        amount: '15000',
        currency: 'USD',
        status: 'COMPLETED',
        platform_fee: '750',
        venue_payout: '14250',
        gas_fee_paid: '100',
        tax_amount: null,
        total_amount: null,
        stripe_payment_intent_id: 'pi_123',
        metadata: '{"note": "test"}',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await TransactionModel.findById('tx_find');

      expect(result).toBeDefined();
      expect(result?.id).toBe('tx_find');
      expect(result?.amount).toBe(15000);
      expect(result?.gasFeePaid).toBe(100);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM payment_transactions WHERE id = $1'),
        ['tx_find']
      );
    });

    it('should return null when transaction not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await TransactionModel.findById('nonexistent');

      expect(result).toBeNull();
    });

    it('should parse JSON metadata', async () => {
      const metadata = { key: 'value', nested: { a: 1 } };
      const mockRow = {
        id: 'tx_json',
        venue_id: 'venue_123',
        user_id: 'user_456',
        event_id: null,
        type: 'TICKET_PURCHASE',
        amount: '10000',
        currency: 'USD',
        status: 'PENDING',
        platform_fee: '500',
        venue_payout: '9500',
        gas_fee_paid: null,
        tax_amount: null,
        total_amount: null,
        stripe_payment_intent_id: null,
        metadata: JSON.stringify(metadata),
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await TransactionModel.findById('tx_json');

      expect(result?.metadata).toEqual(metadata);
    });

    it('should handle already parsed metadata object', async () => {
      const metadata = { key: 'value' };
      const mockRow = {
        id: 'tx_obj',
        venue_id: 'venue_123',
        user_id: 'user_456',
        event_id: null,
        type: 'TICKET_PURCHASE',
        amount: '10000',
        currency: 'USD',
        status: 'PENDING',
        platform_fee: '500',
        venue_payout: '9500',
        gas_fee_paid: null,
        tax_amount: null,
        total_amount: null,
        stripe_payment_intent_id: null,
        metadata: metadata, // Already an object
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await TransactionModel.findById('tx_obj');

      expect(result?.metadata).toEqual(metadata);
    });
  });

  describe('findByPaymentIntentId', () => {
    it('should find transaction by Stripe payment intent id', async () => {
      const mockRow = {
        id: 'tx_pi',
        venue_id: 'venue_123',
        user_id: 'user_456',
        event_id: 'event_789',
        type: 'TICKET_PURCHASE',
        amount: '20000',
        currency: 'USD',
        status: 'COMPLETED',
        platform_fee: '1000',
        venue_payout: '19000',
        gas_fee_paid: null,
        tax_amount: null,
        total_amount: null,
        stripe_payment_intent_id: 'pi_abc123',
        metadata: '{}',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await TransactionModel.findByPaymentIntentId('pi_abc123');

      expect(result).toBeDefined();
      expect(result?.stripePaymentIntentId).toBe('pi_abc123');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE stripe_payment_intent_id = $1'),
        ['pi_abc123']
      );
    });

    it('should return null when payment intent not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await TransactionModel.findByPaymentIntentId('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update transaction status', async () => {
      const mockRow = {
        id: 'tx_status',
        venue_id: 'venue_123',
        user_id: 'user_456',
        event_id: null,
        type: 'TICKET_PURCHASE',
        amount: '10000',
        currency: 'USD',
        status: 'COMPLETED',
        platform_fee: '500',
        venue_payout: '9500',
        gas_fee_paid: null,
        tax_amount: null,
        total_amount: null,
        stripe_payment_intent_id: null,
        metadata: '{}',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await TransactionModel.updateStatus('tx_status', 'COMPLETED' as any);

      expect(result.status).toBe('COMPLETED');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE payment_transactions'),
        ['tx_status', 'COMPLETED']
      );
    });

    it('should throw error when transaction not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(TransactionModel.updateStatus('nonexistent', 'COMPLETED' as any))
        .rejects.toThrow('Transaction not found: nonexistent');
    });
  });

  describe('update', () => {
    it('should update multiple fields', async () => {
      const mockRow = {
        id: 'tx_update',
        venue_id: 'venue_123',
        user_id: 'user_456',
        event_id: null,
        type: 'TICKET_PURCHASE',
        amount: '15000',
        currency: 'USD',
        status: 'COMPLETED',
        platform_fee: '750',
        venue_payout: '14250',
        gas_fee_paid: '100',
        tax_amount: null,
        total_amount: null,
        stripe_payment_intent_id: null,
        metadata: '{"updated": true}',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await TransactionModel.update('tx_update', {
        status: 'COMPLETED' as any,
        amount: 15000,
        platformFee: 750,
        venuePayout: 14250,
        gasFeePaid: 100,
        metadata: { updated: true },
      });

      expect(result.amount).toBe(15000);
      expect(result.status).toBe('COMPLETED');
      expect(result.gasFeePaid).toBe(100);
    });

    it('should throw error when no fields to update', async () => {
      await expect(TransactionModel.update('tx_123', {}))
        .rejects.toThrow('No fields to update');
    });

    it('should throw error when transaction not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(TransactionModel.update('nonexistent', { amount: 100 }))
        .rejects.toThrow('Transaction not found: nonexistent');
    });

    it('should update only status', async () => {
      const mockRow = {
        id: 'tx_single',
        venue_id: 'venue_123',
        user_id: 'user_456',
        event_id: null,
        type: 'TICKET_PURCHASE',
        amount: '10000',
        currency: 'USD',
        status: 'FAILED',
        platform_fee: '500',
        venue_payout: '9500',
        gas_fee_paid: null,
        tax_amount: null,
        total_amount: null,
        stripe_payment_intent_id: null,
        metadata: '{}',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await TransactionModel.update('tx_single', {
        status: 'FAILED' as any,
      });

      expect(result.status).toBe('FAILED');
    });

    it('should update only amount', async () => {
      const mockRow = {
        id: 'tx_amount',
        venue_id: 'venue_123',
        user_id: 'user_456',
        event_id: null,
        type: 'TICKET_PURCHASE',
        amount: '20000',
        currency: 'USD',
        status: 'PENDING',
        platform_fee: '500',
        venue_payout: '9500',
        gas_fee_paid: null,
        tax_amount: null,
        total_amount: null,
        stripe_payment_intent_id: null,
        metadata: '{}',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await TransactionModel.update('tx_amount', { amount: 20000 });

      expect(result.amount).toBe(20000);
    });

    it('should serialize metadata when updating', async () => {
      const mockRow = {
        id: 'tx_meta_update',
        venue_id: 'venue_123',
        user_id: 'user_456',
        event_id: null,
        type: 'TICKET_PURCHASE',
        amount: '10000',
        currency: 'USD',
        status: 'PENDING',
        platform_fee: '500',
        venue_payout: '9500',
        gas_fee_paid: null,
        tax_amount: null,
        total_amount: null,
        stripe_payment_intent_id: null,
        metadata: '{"key":"value"}',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      await TransactionModel.update('tx_meta_update', {
        metadata: { key: 'value' },
      });

      const callArgs = mockQuery.mock.calls[0][1];
      expect(callArgs).toContain('{"key":"value"}');
    });
  });

  describe('findByUserId', () => {
    it('should find transactions by user id', async () => {
      const mockRows = [
        {
          id: 'tx_user_1',
          venue_id: 'venue_123',
          user_id: 'user_test',
          event_id: 'event_1',
          type: 'TICKET_PURCHASE',
          amount: '10000',
          currency: 'USD',
          status: 'COMPLETED',
          platform_fee: '500',
          venue_payout: '9500',
          gas_fee_paid: null,
          tax_amount: null,
          total_amount: null,
          stripe_payment_intent_id: null,
          metadata: '{}',
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'tx_user_2',
          venue_id: 'venue_456',
          user_id: 'user_test',
          event_id: 'event_2',
          type: 'TICKET_PURCHASE',
          amount: '20000',
          currency: 'USD',
          status: 'PENDING',
          platform_fee: '1000',
          venue_payout: '19000',
          gas_fee_paid: null,
          tax_amount: null,
          total_amount: null,
          stripe_payment_intent_id: null,
          metadata: '{}',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await TransactionModel.findByUserId('user_test');

      expect(result).toHaveLength(2);
      expect(result[0].userId).toBe('user_test');
      expect(result[1].userId).toBe('user_test');
    });

    it('should use default pagination', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await TransactionModel.findByUserId('user_123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2 OFFSET $3'),
        ['user_123', 50, 0]
      );
    });

    it('should support custom pagination', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await TransactionModel.findByUserId('user_123', 10, 20);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['user_123', 10, 20]
      );
    });

    it('should order by created_at DESC', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await TransactionModel.findByUserId('user_123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.any(Array)
      );
    });

    it('should return empty array when no transactions', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await TransactionModel.findByUserId('user_no_tx');

      expect(result).toEqual([]);
    });
  });

  describe('findByVenueId', () => {
    it('should find transactions by venue id', async () => {
      const mockRows = [
        {
          id: 'tx_venue_1',
          venue_id: 'venue_test',
          user_id: 'user_1',
          event_id: 'event_1',
          type: 'TICKET_PURCHASE',
          amount: '10000',
          currency: 'USD',
          status: 'COMPLETED',
          platform_fee: '500',
          venue_payout: '9500',
          gas_fee_paid: null,
          tax_amount: null,
          total_amount: null,
          stripe_payment_intent_id: null,
          metadata: '{}',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await TransactionModel.findByVenueId('venue_test');

      expect(result).toHaveLength(1);
      expect(result[0].venueId).toBe('venue_test');
    });

    it('should use default pagination', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await TransactionModel.findByVenueId('venue_123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2 OFFSET $3'),
        ['venue_123', 50, 0]
      );
    });

    it('should support custom pagination', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await TransactionModel.findByVenueId('venue_123', 25, 50);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['venue_123', 25, 50]
      );
    });

    it('should order by created_at DESC', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await TransactionModel.findByVenueId('venue_123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.any(Array)
      );
    });

    it('should return empty array when no transactions', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await TransactionModel.findByVenueId('venue_no_tx');

      expect(result).toEqual([]);
    });
  });

  describe('mapRow', () => {
    it('should correctly map all fields from database row', async () => {
      const now = new Date();
      const mockRow = {
        id: 'tx_map_test',
        venue_id: 'venue_999',
        user_id: 'user_999',
        event_id: 'event_999',
        type: 'RESALE',
        amount: '50000',
        currency: 'EUR',
        status: 'COMPLETED',
        platform_fee: '2500',
        venue_payout: '47500',
        gas_fee_paid: '150',
        tax_amount: '500',
        total_amount: '50650',
        stripe_payment_intent_id: 'pi_map_test',
        metadata: '{"test": "value"}',
        created_at: now,
        updated_at: now,
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await TransactionModel.findById('tx_map_test');

      expect(result).toEqual({
        id: 'tx_map_test',
        venueId: 'venue_999',
        userId: 'user_999',
        eventId: 'event_999',
        type: 'RESALE',
        amount: 50000,
        currency: 'EUR',
        status: 'COMPLETED',
        platformFee: 2500,
        venuePayout: 47500,
        gasFeePaid: 150,
        taxAmount: 500,
        totalAmount: 50650,
        stripePaymentIntentId: 'pi_map_test',
        metadata: { test: 'value' },
        createdAt: now,
        updatedAt: now,
      });
    });

    it('should handle undefined optional numeric fields', async () => {
      const mockRow = {
        id: 'tx_optional',
        venue_id: 'venue_123',
        user_id: 'user_456',
        event_id: null,
        type: 'TICKET_PURCHASE',
        amount: '10000',
        currency: 'USD',
        status: 'PENDING',
        platform_fee: '500',
        venue_payout: '9500',
        gas_fee_paid: null,
        tax_amount: null,
        total_amount: null,
        stripe_payment_intent_id: null,
        metadata: '{}',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await TransactionModel.findById('tx_optional');

      expect(result?.gasFeePaid).toBeUndefined();
      expect(result?.taxAmount).toBeUndefined();
      expect(result?.totalAmount).toBeUndefined();
    });
  });
});

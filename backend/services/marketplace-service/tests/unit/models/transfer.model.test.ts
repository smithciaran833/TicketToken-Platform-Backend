/**
 * Unit Tests for Transfer Model
 * Tests marketplace transfer database operations
 */

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-456')
}));

// Mock database
const mockDbChain = {
  insert: jest.fn().mockReturnThis(),
  returning: jest.fn(),
  where: jest.fn().mockReturnThis(),
  first: jest.fn(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  offset: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  count: jest.fn().mockReturnThis(),
  sum: jest.fn().mockReturnThis()
};

jest.mock('../../../src/config/database', () => ({
  db: jest.fn(() => mockDbChain)
}));

import { TransferModel, transferModel, CreateTransferInput } from '../../../src/models/transfer.model';

describe('TransferModel', () => {
  const mockTransferRow = {
    id: 'transfer-123',
    listing_id: 'listing-456',
    buyer_id: 'buyer-789',
    seller_id: 'seller-111',
    event_id: 'event-222',
    venue_id: 'venue-333',
    buyer_wallet: 'buyer-wallet-abc',
    seller_wallet: 'seller-wallet-xyz',
    transfer_signature: 'sig-123456',
    block_height: 123456789,
    payment_currency: 'USDC',
    payment_amount: 5000,
    usd_value: 5000,
    status: 'initiated',
    initiated_at: new Date('2024-01-01'),
    completed_at: null,
    failed_at: null,
    failure_reason: null,
    network_fee: 5000,
    network_fee_usd: 100,
    payment_method: 'crypto',
    fiat_currency: null,
    stripe_payment_intent_id: null,
    stripe_transfer_id: null,
    stripe_application_fee_amount: null,
    created_at: new Date('2024-01-01')
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockDbChain).forEach(mock => {
      if (jest.isMockFunction(mock)) {
        mock.mockClear();
        mock.mockReturnThis();
      }
    });
  });

  describe('create', () => {
    const createInput: CreateTransferInput = {
      listingId: 'listing-456',
      buyerId: 'buyer-789',
      sellerId: 'seller-111',
      eventId: 'event-222',
      venueId: 'venue-333',
      buyerWallet: 'buyer-wallet-abc',
      sellerWallet: 'seller-wallet-xyz',
      paymentCurrency: 'USDC',
      paymentAmount: 5000,
      usdValue: 5000
    };

    it('should create a new transfer', async () => {
      mockDbChain.returning.mockResolvedValue([mockTransferRow]);
      
      const result = await transferModel.create(createInput);
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid-456',
          listing_id: 'listing-456',
          buyer_id: 'buyer-789',
          seller_id: 'seller-111',
          event_id: 'event-222',
          venue_id: 'venue-333',
          buyer_wallet: 'buyer-wallet-abc',
          seller_wallet: 'seller-wallet-xyz',
          payment_currency: 'USDC',
          payment_amount: 5000,
          usd_value: 5000,
          status: 'initiated',
          payment_method: 'crypto',
          transfer_signature: ''
        })
      );
      expect(result.id).toBe('transfer-123');
      expect(result.listingId).toBe('listing-456');
    });

    it('should create fiat transfer with Stripe details', async () => {
      const fiatTransfer = {
        ...mockTransferRow,
        payment_method: 'fiat',
        fiat_currency: 'usd',
        stripe_payment_intent_id: 'pi_123',
        stripe_application_fee_amount: 250
      };
      mockDbChain.returning.mockResolvedValue([fiatTransfer]);
      
      const result = await transferModel.create({
        ...createInput,
        paymentMethod: 'fiat',
        fiatCurrency: 'usd',
        stripePaymentIntentId: 'pi_123',
        stripeApplicationFeeAmount: 250
      });
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_method: 'fiat',
          fiat_currency: 'usd',
          stripe_payment_intent_id: 'pi_123',
          stripe_application_fee_amount: 250
        })
      );
      expect(result.paymentMethod).toBe('fiat');
    });

    it('should default payment method to crypto', async () => {
      mockDbChain.returning.mockResolvedValue([mockTransferRow]);
      
      await transferModel.create(createInput);
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_method: 'crypto'
        })
      );
    });
  });

  describe('findById', () => {
    it('should find transfer by ID', async () => {
      mockDbChain.first.mockResolvedValue(mockTransferRow);
      
      const result = await transferModel.findById('transfer-123');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ id: 'transfer-123' });
      expect(result).not.toBeNull();
      expect(result!.id).toBe('transfer-123');
    });

    it('should return null when transfer not found', async () => {
      mockDbChain.first.mockResolvedValue(null);
      
      const result = await transferModel.findById('nonexistent');
      
      expect(result).toBeNull();
    });
  });

  describe('findByListingId', () => {
    it('should find transfer by listing ID', async () => {
      mockDbChain.first.mockResolvedValue(mockTransferRow);
      
      const result = await transferModel.findByListingId('listing-456');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ listing_id: 'listing-456' });
      expect(mockDbChain.orderBy).toHaveBeenCalledWith('created_at', 'desc');
      expect(result).not.toBeNull();
      expect(result!.listingId).toBe('listing-456');
    });

    it('should return null when no transfer found', async () => {
      mockDbChain.first.mockResolvedValue(null);
      
      const result = await transferModel.findByListingId('nonexistent');
      
      expect(result).toBeNull();
    });
  });

  describe('findByStripePaymentIntentId', () => {
    it('should find transfer by Stripe payment intent ID', async () => {
      const fiatTransfer = { ...mockTransferRow, stripe_payment_intent_id: 'pi_123' };
      mockDbChain.first.mockResolvedValue(fiatTransfer);
      
      const result = await transferModel.findByStripePaymentIntentId('pi_123');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ stripe_payment_intent_id: 'pi_123' });
      expect(result).not.toBeNull();
      expect(result!.stripePaymentIntentId).toBe('pi_123');
    });

    it('should return null when not found', async () => {
      mockDbChain.first.mockResolvedValue(null);
      
      const result = await transferModel.findByStripePaymentIntentId('nonexistent');
      
      expect(result).toBeNull();
    });
  });

  describe('findByBuyerId', () => {
    it('should find transfers by buyer ID', async () => {
      const transfers = [mockTransferRow, { ...mockTransferRow, id: 'transfer-124' }];
      mockDbChain.offset.mockResolvedValue(transfers);
      
      const result = await transferModel.findByBuyerId('buyer-789');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ buyer_id: 'buyer-789' });
      expect(mockDbChain.orderBy).toHaveBeenCalledWith('created_at', 'desc');
      expect(mockDbChain.limit).toHaveBeenCalledWith(20);
      expect(mockDbChain.offset).toHaveBeenCalledWith(0);
      expect(result).toHaveLength(2);
    });

    it('should apply pagination', async () => {
      mockDbChain.offset.mockResolvedValue([]);
      
      await transferModel.findByBuyerId('buyer-789', 10, 50);
      
      expect(mockDbChain.limit).toHaveBeenCalledWith(10);
      expect(mockDbChain.offset).toHaveBeenCalledWith(50);
    });
  });

  describe('findBySellerId', () => {
    it('should find transfers by seller ID', async () => {
      mockDbChain.offset.mockResolvedValue([mockTransferRow]);
      
      const result = await transferModel.findBySellerId('seller-111');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ seller_id: 'seller-111' });
      expect(mockDbChain.orderBy).toHaveBeenCalledWith('created_at', 'desc');
      expect(result).toHaveLength(1);
    });

    it('should apply pagination', async () => {
      mockDbChain.offset.mockResolvedValue([]);
      
      await transferModel.findBySellerId('seller-111', 5, 25);
      
      expect(mockDbChain.limit).toHaveBeenCalledWith(5);
      expect(mockDbChain.offset).toHaveBeenCalledWith(25);
    });
  });

  describe('updateStatus', () => {
    it('should update status to completed with timestamp', async () => {
      mockDbChain.returning.mockResolvedValue([{ ...mockTransferRow, status: 'completed' }]);
      
      const result = await transferModel.updateStatus('transfer-123', 'completed');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ id: 'transfer-123' });
      expect(mockDbChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          completed_at: expect.any(Date)
        })
      );
      expect(result!.status).toBe('completed');
    });

    it('should update status to failed with timestamp and reason', async () => {
      mockDbChain.returning.mockResolvedValue([{ 
        ...mockTransferRow, 
        status: 'failed',
        failure_reason: 'Insufficient funds'
      }]);
      
      const result = await transferModel.updateStatus('transfer-123', 'failed', {
        failureReason: 'Insufficient funds'
      });
      
      expect(mockDbChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          failed_at: expect.any(Date),
          failure_reason: 'Insufficient funds'
        })
      );
      expect(result!.status).toBe('failed');
    });

    it('should update to pending without timestamp', async () => {
      mockDbChain.returning.mockResolvedValue([{ ...mockTransferRow, status: 'pending' }]);
      
      await transferModel.updateStatus('transfer-123', 'pending');
      
      expect(mockDbChain.update).toHaveBeenCalledWith({ status: 'pending' });
    });

    it('should include additional data', async () => {
      mockDbChain.returning.mockResolvedValue([mockTransferRow]);
      
      await transferModel.updateStatus('transfer-123', 'completed', {
        stripe_transfer_id: 'tr_123'
      });
      
      expect(mockDbChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          stripe_transfer_id: 'tr_123'
        })
      );
    });

    it('should return null when transfer not found', async () => {
      mockDbChain.returning.mockResolvedValue([]);
      
      const result = await transferModel.updateStatus('nonexistent', 'completed');
      
      expect(result).toBeNull();
    });
  });

  describe('updateBlockchainData', () => {
    it('should update blockchain data', async () => {
      mockDbChain.returning.mockResolvedValue([{
        ...mockTransferRow,
        transfer_signature: 'new-sig-789',
        block_height: 987654321
      }]);
      
      const result = await transferModel.updateBlockchainData(
        'transfer-123',
        'new-sig-789',
        987654321,
        10000,
        200
      );
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ id: 'transfer-123' });
      expect(mockDbChain.update).toHaveBeenCalledWith({
        transfer_signature: 'new-sig-789',
        block_height: 987654321,
        network_fee: 10000,
        network_fee_usd: 200
      });
      expect(result).not.toBeNull();
      expect(result!.transferSignature).toBe('new-sig-789');
    });

    it('should update without network fees', async () => {
      mockDbChain.returning.mockResolvedValue([mockTransferRow]);
      
      await transferModel.updateBlockchainData(
        'transfer-123',
        'sig-123',
        123456789
      );
      
      expect(mockDbChain.update).toHaveBeenCalledWith({
        transfer_signature: 'sig-123',
        block_height: 123456789,
        network_fee: undefined,
        network_fee_usd: undefined
      });
    });

    it('should return null when transfer not found', async () => {
      mockDbChain.returning.mockResolvedValue([]);
      
      const result = await transferModel.updateBlockchainData(
        'nonexistent',
        'sig-123',
        123456
      );
      
      expect(result).toBeNull();
    });
  });

  describe('countByEventId', () => {
    it('should count transfers by event ID', async () => {
      mockDbChain.first.mockResolvedValue({ count: '25' });
      
      const result = await transferModel.countByEventId('event-222');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ event_id: 'event-222' });
      expect(mockDbChain.count).toHaveBeenCalledWith('* as count');
      expect(result).toBe(25);
    });

    it('should filter by status when provided', async () => {
      mockDbChain.first.mockResolvedValue({ count: '10' });
      
      const result = await transferModel.countByEventId('event-222', 'completed');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ status: 'completed' });
      expect(result).toBe(10);
    });

    it('should return 0 when no results', async () => {
      mockDbChain.first.mockResolvedValue(null);
      
      const result = await transferModel.countByEventId('nonexistent');
      
      expect(result).toBe(0);
    });
  });

  describe('getTotalVolumeByVenueId', () => {
    it('should get total volume by venue ID', async () => {
      mockDbChain.first.mockResolvedValue({ total: '150000' });
      
      const result = await transferModel.getTotalVolumeByVenueId('venue-333');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({
        venue_id: 'venue-333',
        status: 'completed'
      });
      expect(mockDbChain.sum).toHaveBeenCalledWith('usd_value as total');
      expect(result).toBe(150000);
    });

    it('should return 0 when no completed transfers', async () => {
      mockDbChain.first.mockResolvedValue({ total: null });
      
      const result = await transferModel.getTotalVolumeByVenueId('venue-333');
      
      expect(result).toBe(0);
    });

    it('should return 0 when result is undefined', async () => {
      mockDbChain.first.mockResolvedValue(null);
      
      const result = await transferModel.getTotalVolumeByVenueId('nonexistent');
      
      expect(result).toBe(0);
    });
  });

  describe('mapToTransfer', () => {
    it('should correctly map database row to transfer object', async () => {
      mockDbChain.first.mockResolvedValue(mockTransferRow);
      
      const result = await transferModel.findById('transfer-123');
      
      expect(result).toEqual({
        id: 'transfer-123',
        listingId: 'listing-456',
        buyerId: 'buyer-789',
        sellerId: 'seller-111',
        eventId: 'event-222',
        venueId: 'venue-333',
        buyerWallet: 'buyer-wallet-abc',
        sellerWallet: 'seller-wallet-xyz',
        transferSignature: 'sig-123456',
        blockHeight: 123456789,
        paymentCurrency: 'USDC',
        paymentAmount: 5000,
        usdValue: 5000,
        status: 'initiated',
        initiatedAt: expect.any(Date),
        completedAt: null,
        failedAt: null,
        failureReason: null,
        networkFee: 5000,
        networkFeeUsd: 100,
        paymentMethod: 'crypto',
        fiatCurrency: null,
        stripePaymentIntentId: null,
        stripeTransferId: null,
        stripeApplicationFeeAmount: undefined,
        createdAt: expect.any(Date)
      });
    });

    it('should parse numeric fields as integers', async () => {
      mockDbChain.first.mockResolvedValue({
        ...mockTransferRow,
        payment_amount: '5000',
        usd_value: '5000',
        network_fee: '5000',
        network_fee_usd: '100'
      });
      
      const result = await transferModel.findById('transfer-123');
      
      expect(typeof result!.paymentAmount).toBe('number');
      expect(typeof result!.usdValue).toBe('number');
      expect(typeof result!.networkFee).toBe('number');
      expect(typeof result!.networkFeeUsd).toBe('number');
    });

    it('should handle undefined optional fields', async () => {
      mockDbChain.first.mockResolvedValue({
        ...mockTransferRow,
        payment_amount: null,
        network_fee: null,
        network_fee_usd: null,
        stripe_application_fee_amount: null
      });
      
      const result = await transferModel.findById('transfer-123');
      
      expect(result!.paymentAmount).toBeUndefined();
      expect(result!.networkFee).toBeUndefined();
      expect(result!.networkFeeUsd).toBeUndefined();
      expect(result!.stripeApplicationFeeAmount).toBeUndefined();
    });

    it('should default payment method to crypto', async () => {
      mockDbChain.first.mockResolvedValue({
        ...mockTransferRow,
        payment_method: null
      });
      
      const result = await transferModel.findById('transfer-123');
      
      expect(result!.paymentMethod).toBe('crypto');
    });
  });

  describe('transferModel export', () => {
    it('should export singleton instance', () => {
      expect(transferModel).toBeInstanceOf(TransferModel);
    });
  });
});

/**
 * Unit Tests for Fee Model
 * Tests platform fee database operations
 */

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-789')
}));

// Mock shared library
jest.mock('@tickettoken/shared', () => ({
  percentOfCents: jest.fn((cents: number, bps: number) => Math.floor(cents * bps / 10000))
}));

// Mock database
const mockDbChain = {
  insert: jest.fn().mockReturnThis(),
  returning: jest.fn(),
  where: jest.fn().mockReturnThis(),
  first: jest.fn(),
  update: jest.fn().mockReturnThis(),
  sum: jest.fn().mockReturnThis(),
  join: jest.fn().mockReturnThis()
};

jest.mock('../../../src/config/database', () => ({
  db: jest.fn(() => mockDbChain)
}));

import { FeeModel, feeModel, CreateFeeInput } from '../../../src/models/fee.model';

describe('FeeModel', () => {
  const mockFeeRow = {
    id: 'fee-123',
    transfer_id: 'transfer-456',
    sale_price: 10000,
    platform_fee_amount: 500,
    platform_fee_percentage: 5.00,
    venue_fee_amount: 500,
    venue_fee_percentage: 5.00,
    seller_payout: 9000,
    platform_fee_wallet: 'platform-wallet',
    platform_fee_signature: 'platform-sig',
    venue_fee_wallet: 'venue-wallet',
    venue_fee_signature: 'venue-sig',
    platform_fee_collected: false,
    venue_fee_paid: false,
    seller_transfer_id: null,
    venue_transfer_id: null,
    venue_received_cents: null,
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
    const createInput: CreateFeeInput = {
      transferId: 'transfer-456',
      salePrice: 10000
    };

    it('should create a new fee record with default percentages', async () => {
      mockDbChain.returning.mockResolvedValue([mockFeeRow]);
      
      const result = await feeModel.create(createInput);
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid-789',
          transfer_id: 'transfer-456',
          sale_price: 10000,
          platform_fee_percentage: 5.00,
          venue_fee_percentage: 5.00,
          platform_fee_collected: false,
          venue_fee_paid: false
        })
      );
      expect(result.id).toBe('fee-123');
      expect(result.transferId).toBe('transfer-456');
    });

    it('should create fee with custom percentages', async () => {
      mockDbChain.returning.mockResolvedValue([mockFeeRow]);
      
      await feeModel.create({
        ...createInput,
        platformFeePercentage: 3.00,
        venueFeePercentage: 7.00
      });
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          platform_fee_percentage: 3.00,
          venue_fee_percentage: 7.00
        })
      );
    });

    it('should calculate fees using percentOfCents', async () => {
      mockDbChain.returning.mockResolvedValue([mockFeeRow]);
      
      await feeModel.create(createInput);
      
      // Should call insert with calculated fee amounts
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          platform_fee_amount: expect.any(Number),
          venue_fee_amount: expect.any(Number),
          seller_payout: expect.any(Number)
        })
      );
    });
  });

  describe('findById', () => {
    it('should find fee by ID', async () => {
      mockDbChain.first.mockResolvedValue(mockFeeRow);
      
      const result = await feeModel.findById('fee-123');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ id: 'fee-123' });
      expect(result).not.toBeNull();
      expect(result!.id).toBe('fee-123');
    });

    it('should return null when fee not found', async () => {
      mockDbChain.first.mockResolvedValue(null);
      
      const result = await feeModel.findById('nonexistent');
      
      expect(result).toBeNull();
    });
  });

  describe('findByTransferId', () => {
    it('should find fee by transfer ID', async () => {
      mockDbChain.first.mockResolvedValue(mockFeeRow);
      
      const result = await feeModel.findByTransferId('transfer-456');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ transfer_id: 'transfer-456' });
      expect(result).not.toBeNull();
      expect(result!.transferId).toBe('transfer-456');
    });

    it('should return null when not found', async () => {
      mockDbChain.first.mockResolvedValue(null);
      
      const result = await feeModel.findByTransferId('nonexistent');
      
      expect(result).toBeNull();
    });
  });

  describe('updateFeeCollection', () => {
    it('should update platform fee collected status', async () => {
      mockDbChain.returning.mockResolvedValue([{ ...mockFeeRow, platform_fee_collected: true }]);
      
      const result = await feeModel.updateFeeCollection('fee-123', true);
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ id: 'fee-123' });
      expect(mockDbChain.update).toHaveBeenCalledWith({
        platform_fee_collected: true
      });
      expect(result!.platformFeeCollected).toBe(true);
    });

    it('should update venue fee collected status', async () => {
      mockDbChain.returning.mockResolvedValue([{ ...mockFeeRow, venue_fee_paid: true }]);
      
      await feeModel.updateFeeCollection('fee-123', undefined, true);
      
      expect(mockDbChain.update).toHaveBeenCalledWith({
        venue_fee_paid: true
      });
    });

    it('should update signatures', async () => {
      mockDbChain.returning.mockResolvedValue([mockFeeRow]);
      
      await feeModel.updateFeeCollection(
        'fee-123',
        undefined,
        undefined,
        'platform-sig-new',
        'venue-sig-new'
      );
      
      expect(mockDbChain.update).toHaveBeenCalledWith({
        platform_fee_signature: 'platform-sig-new',
        venue_fee_signature: 'venue-sig-new'
      });
    });

    it('should update transfer IDs', async () => {
      mockDbChain.returning.mockResolvedValue([mockFeeRow]);
      
      await feeModel.updateFeeCollection(
        'fee-123',
        undefined,
        undefined,
        undefined,
        undefined,
        'tr_seller_123',
        'tr_venue_456'
      );
      
      expect(mockDbChain.update).toHaveBeenCalledWith({
        seller_transfer_id: 'tr_seller_123',
        venue_transfer_id: 'tr_venue_456'
      });
    });

    it('should update venue received cents', async () => {
      mockDbChain.returning.mockResolvedValue([mockFeeRow]);
      
      await feeModel.updateFeeCollection(
        'fee-123',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        450
      );
      
      expect(mockDbChain.update).toHaveBeenCalledWith({
        venue_received_cents: 450
      });
    });

    it('should return null when fee not found', async () => {
      mockDbChain.returning.mockResolvedValue([]);
      
      const result = await feeModel.updateFeeCollection('nonexistent', true);
      
      expect(result).toBeNull();
    });
  });

  describe('recordTransferIds', () => {
    it('should record seller transfer ID and mark platform fee collected', async () => {
      mockDbChain.returning.mockResolvedValue([{
        ...mockFeeRow,
        seller_transfer_id: 'tr_seller_123',
        platform_fee_collected: true
      }]);
      
      const result = await feeModel.recordTransferIds(
        'fee-123',
        'tr_seller_123',
        null,
        0
      );
      
      expect(mockDbChain.update).toHaveBeenCalledWith({
        seller_transfer_id: 'tr_seller_123',
        platform_fee_collected: true
      });
      expect(result!.sellerTransferId).toBe('tr_seller_123');
    });

    it('should record venue transfer ID and mark venue fee paid', async () => {
      mockDbChain.returning.mockResolvedValue([{
        ...mockFeeRow,
        seller_transfer_id: 'tr_seller_123',
        venue_transfer_id: 'tr_venue_456',
        venue_received_cents: 500,
        venue_fee_paid: true
      }]);
      
      const result = await feeModel.recordTransferIds(
        'fee-123',
        'tr_seller_123',
        'tr_venue_456',
        500
      );
      
      expect(mockDbChain.update).toHaveBeenCalledWith({
        seller_transfer_id: 'tr_seller_123',
        platform_fee_collected: true,
        venue_transfer_id: 'tr_venue_456',
        venue_received_cents: 500,
        venue_fee_paid: true
      });
      expect(result!.venueTransferId).toBe('tr_venue_456');
      expect(result!.venueReceivedCents).toBe(500);
    });

    it('should not include venue fields when venue transfer is null', async () => {
      mockDbChain.returning.mockResolvedValue([mockFeeRow]);
      
      await feeModel.recordTransferIds('fee-123', 'tr_seller_123', null, 0);
      
      const updateCall = mockDbChain.update.mock.calls[0][0];
      expect(updateCall.venue_transfer_id).toBeUndefined();
      expect(updateCall.venue_received_cents).toBeUndefined();
      expect(updateCall.venue_fee_paid).toBeUndefined();
    });

    it('should return null when fee not found', async () => {
      mockDbChain.returning.mockResolvedValue([]);
      
      const result = await feeModel.recordTransferIds(
        'nonexistent',
        'tr_123',
        null,
        0
      );
      
      expect(result).toBeNull();
    });
  });

  describe('getTotalPlatformFees', () => {
    it('should get total platform fees', async () => {
      mockDbChain.first.mockResolvedValue({ total: '50000' });
      
      const result = await feeModel.getTotalPlatformFees();
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ platform_fee_collected: true });
      expect(mockDbChain.sum).toHaveBeenCalledWith('platform_fee_amount as total');
      expect(result).toBe(50000);
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      mockDbChain.first.mockResolvedValue({ total: '25000' });
      
      const result = await feeModel.getTotalPlatformFees(startDate, endDate);
      
      expect(mockDbChain.where).toHaveBeenCalledWith('created_at', '>=', startDate);
      expect(mockDbChain.where).toHaveBeenCalledWith('created_at', '<=', endDate);
      expect(result).toBe(25000);
    });

    it('should return 0 when no fees', async () => {
      mockDbChain.first.mockResolvedValue({ total: null });
      
      const result = await feeModel.getTotalPlatformFees();
      
      expect(result).toBe(0);
    });

    it('should return 0 when result is undefined', async () => {
      mockDbChain.first.mockResolvedValue(null);
      
      const result = await feeModel.getTotalPlatformFees();
      
      expect(result).toBe(0);
    });
  });

  describe('getTotalVenueFees', () => {
    it('should get total venue fees with join', async () => {
      mockDbChain.first.mockResolvedValue({ total: '75000' });
      
      const result = await feeModel.getTotalVenueFees('venue-123');
      
      expect(mockDbChain.join).toHaveBeenCalledWith(
        'marketplace_transfers',
        'platform_fees.transfer_id',
        'marketplace_transfers.id'
      );
      expect(mockDbChain.where).toHaveBeenCalledWith({
        'marketplace_transfers.venue_id': 'venue-123',
        'platform_fees.venue_fee_paid': true
      });
      expect(mockDbChain.sum).toHaveBeenCalledWith('platform_fees.venue_fee_amount as total');
      expect(result).toBe(75000);
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      mockDbChain.first.mockResolvedValue({ total: '30000' });
      
      const result = await feeModel.getTotalVenueFees('venue-123', startDate, endDate);
      
      expect(mockDbChain.where).toHaveBeenCalledWith(
        'platform_fees.created_at',
        '>=',
        startDate
      );
      expect(mockDbChain.where).toHaveBeenCalledWith(
        'platform_fees.created_at',
        '<=',
        endDate
      );
      expect(result).toBe(30000);
    });

    it('should return 0 when no venue fees', async () => {
      mockDbChain.first.mockResolvedValue({ total: null });
      
      const result = await feeModel.getTotalVenueFees('venue-123');
      
      expect(result).toBe(0);
    });
  });

  describe('mapToFee', () => {
    it('should correctly map database row to fee object', async () => {
      mockDbChain.first.mockResolvedValue(mockFeeRow);
      
      const result = await feeModel.findById('fee-123');
      
      expect(result).toEqual({
        id: 'fee-123',
        transferId: 'transfer-456',
        salePrice: 10000,
        platformFeeAmount: 500,
        platformFeePercentage: 5.00,
        venueFeeAmount: 500,
        venueFeePercentage: 5.00,
        sellerPayout: 9000,
        platformFeeWallet: 'platform-wallet',
        platformFeeSignature: 'platform-sig',
        venueFeeWallet: 'venue-wallet',
        venueFeeSignature: 'venue-sig',
        platformFeeCollected: false,
        venueFeeCollected: false,
        sellerTransferId: null,
        venueTransferId: null,
        venueReceivedCents: undefined,
        createdAt: expect.any(Date)
      });
    });

    it('should parse numeric fields as integers', async () => {
      mockDbChain.first.mockResolvedValue({
        ...mockFeeRow,
        sale_price: '10000',
        platform_fee_amount: '500',
        venue_fee_amount: '500',
        seller_payout: '9000'
      });
      
      const result = await feeModel.findById('fee-123');
      
      expect(typeof result!.salePrice).toBe('number');
      expect(typeof result!.platformFeeAmount).toBe('number');
      expect(typeof result!.venueFeeAmount).toBe('number');
      expect(typeof result!.sellerPayout).toBe('number');
    });

    it('should parse percentage as float', async () => {
      mockDbChain.first.mockResolvedValue({
        ...mockFeeRow,
        platform_fee_percentage: '5.50',
        venue_fee_percentage: '3.25'
      });
      
      const result = await feeModel.findById('fee-123');
      
      expect(result!.platformFeePercentage).toBe(5.5);
      expect(result!.venueFeePercentage).toBe(3.25);
    });

    it('should handle venue_received_cents when present', async () => {
      mockDbChain.first.mockResolvedValue({
        ...mockFeeRow,
        venue_received_cents: '450'
      });
      
      const result = await feeModel.findById('fee-123');
      
      expect(result!.venueReceivedCents).toBe(450);
    });
  });

  describe('feeModel export', () => {
    it('should export singleton instance', () => {
      expect(feeModel).toBeInstanceOf(FeeModel);
    });
  });
});

/**
 * Unit Tests for Venue Settings Model
 * Tests venue marketplace settings database operations
 */

// Mock database
const mockDbChain = {
  insert: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  first: jest.fn(),
  update: jest.fn().mockReturnThis(),
  returning: jest.fn(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  offset: jest.fn()
};

jest.mock('../../../src/config/database', () => ({
  db: jest.fn(() => mockDbChain)
}));

import { VenueSettingsModel, venueSettingsModel } from '../../../src/models/venue-settings.model';

describe('VenueSettingsModel', () => {
  const mockDbRow = {
    venue_id: 'venue-123',
    max_resale_multiplier: '3.0',
    min_price_multiplier: '1.0',
    allow_below_face: false,
    transfer_cutoff_hours: 4,
    listing_advance_hours: 720,
    auto_expire_on_event_start: true,
    max_listings_per_user_per_event: 8,
    max_listings_per_user_total: 50,
    require_listing_approval: false,
    auto_approve_verified_sellers: true,
    royalty_percentage: '5.00',
    royalty_wallet_address: 'wallet123abc',
    minimum_royalty_payout: '100',
    allow_international_sales: true,
    blocked_countries: ['KP', 'IR'],
    require_kyc_for_high_value: true,
    high_value_threshold: '100000',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01')
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
    it('should create venue settings with defaults', async () => {
      mockDbChain.returning.mockResolvedValue([mockDbRow]);
      
      const result = await venueSettingsModel.create({
        venueId: 'venue-123',
        royaltyWalletAddress: 'wallet123abc'
      });
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: 'venue-123',
          royalty_wallet_address: 'wallet123abc',
          max_resale_multiplier: 3.0,
          min_price_multiplier: 1.0,
          allow_below_face: false,
          transfer_cutoff_hours: 4,
          listing_advance_hours: 720,
          max_listings_per_user_per_event: 8,
          max_listings_per_user_total: 50,
          require_listing_approval: false,
          royalty_percentage: 5.00
        })
      );
      expect(result.venueId).toBe('venue-123');
      expect(result.maxResaleMultiplier).toBe(3.0);
    });

    it('should create with custom values', async () => {
      mockDbChain.returning.mockResolvedValue([mockDbRow]);
      
      const result = await venueSettingsModel.create({
        venueId: 'venue-123',
        royaltyWalletAddress: 'wallet123abc',
        maxResaleMultiplier: 2.5,
        minPriceMultiplier: 0.8,
        allowBelowFace: true,
        transferCutoffHours: 2,
        royaltyPercentage: 7.5
      });
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          max_resale_multiplier: 2.5,
          min_price_multiplier: 0.8,
          allow_below_face: true,
          transfer_cutoff_hours: 2,
          royalty_percentage: 7.5
        })
      );
      expect(result).toBeDefined();
    });
  });

  describe('findByVenueId', () => {
    it('should return settings for venue', async () => {
      mockDbChain.first.mockResolvedValue(mockDbRow);
      
      const result = await venueSettingsModel.findByVenueId('venue-123');
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ venue_id: 'venue-123' });
      expect(result).toBeDefined();
      expect(result?.venueId).toBe('venue-123');
      expect(result?.maxResaleMultiplier).toBe(3.0);
      expect(result?.royaltyPercentage).toBe(5.0);
      expect(result?.highValueThreshold).toBe(100000);  // INTEGER CENTS
    });

    it('should return null when not found', async () => {
      mockDbChain.first.mockResolvedValue(null);
      
      const result = await venueSettingsModel.findByVenueId('nonexistent');
      
      expect(result).toBeNull();
    });

    it('should parse numeric fields correctly', async () => {
      mockDbChain.first.mockResolvedValue(mockDbRow);
      
      const result = await venueSettingsModel.findByVenueId('venue-123');
      
      expect(typeof result?.maxResaleMultiplier).toBe('number');
      expect(typeof result?.minPriceMultiplier).toBe('number');
      expect(typeof result?.royaltyPercentage).toBe('number');
      expect(typeof result?.minimumRoyaltyPayout).toBe('number');
    });
  });

  describe('findOrCreateDefault', () => {
    it('should return existing settings', async () => {
      mockDbChain.first.mockResolvedValue(mockDbRow);
      
      const result = await venueSettingsModel.findOrCreateDefault('venue-123', 'wallet123');
      
      expect(result.venueId).toBe('venue-123');
      expect(mockDbChain.insert).not.toHaveBeenCalled();
    });

    it('should create default settings if not exists', async () => {
      mockDbChain.first.mockResolvedValue(null);
      mockDbChain.returning.mockResolvedValue([mockDbRow]);
      
      const result = await venueSettingsModel.findOrCreateDefault('venue-123', 'wallet123');
      
      expect(mockDbChain.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update specific fields', async () => {
      mockDbChain.returning.mockResolvedValue([mockDbRow]);
      
      const result = await venueSettingsModel.update('venue-123', {
        maxResaleMultiplier: 2.0,
        royaltyPercentage: 10.0
      });
      
      expect(mockDbChain.where).toHaveBeenCalledWith({ venue_id: 'venue-123' });
      expect(mockDbChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          max_resale_multiplier: 2.0,
          royalty_percentage: 10.0,
          updated_at: expect.any(Date)
        })
      );
      expect(result).toBeDefined();
    });

    it('should update boolean fields', async () => {
      mockDbChain.returning.mockResolvedValue([mockDbRow]);
      
      await venueSettingsModel.update('venue-123', {
        allowBelowFace: true,
        requireListingApproval: true,
        requireKycForHighValue: false
      });
      
      expect(mockDbChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          allow_below_face: true,
          require_listing_approval: true,
          require_kyc_for_high_value: false
        })
      );
    });

    it('should update international settings', async () => {
      mockDbChain.returning.mockResolvedValue([mockDbRow]);
      
      await venueSettingsModel.update('venue-123', {
        allowInternationalSales: false,
        blockedCountries: ['KP', 'IR', 'SY']
      });
      
      expect(mockDbChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          allow_international_sales: false,
          blocked_countries: ['KP', 'IR', 'SY']
        })
      );
    });

    it('should update high value threshold', async () => {
      mockDbChain.returning.mockResolvedValue([mockDbRow]);
      
      await venueSettingsModel.update('venue-123', {
        highValueThreshold: 500000  // $5,000.00 in cents
      });
      
      expect(mockDbChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          high_value_threshold: 500000
        })
      );
    });

    it('should return null when venue not found', async () => {
      mockDbChain.returning.mockResolvedValue([]);
      
      const result = await venueSettingsModel.update('nonexistent', {
        maxResaleMultiplier: 2.0
      });
      
      expect(result).toBeNull();
    });

    it('should update royalty wallet address', async () => {
      mockDbChain.returning.mockResolvedValue([mockDbRow]);
      
      await venueSettingsModel.update('venue-123', {
        royaltyWalletAddress: 'new-wallet-address'
      });
      
      expect(mockDbChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          royalty_wallet_address: 'new-wallet-address'
        })
      );
    });
  });

  describe('getAllSettings', () => {
    it('should return paginated settings', async () => {
      mockDbChain.offset.mockResolvedValue([mockDbRow, { ...mockDbRow, venue_id: 'venue-456' }]);
      
      const result = await venueSettingsModel.getAllSettings(10, 0);
      
      expect(mockDbChain.orderBy).toHaveBeenCalledWith('created_at', 'desc');
      expect(mockDbChain.limit).toHaveBeenCalledWith(10);
      expect(mockDbChain.offset).toHaveBeenCalledWith(0);
      expect(result).toHaveLength(2);
    });

    it('should use default pagination values', async () => {
      mockDbChain.offset.mockResolvedValue([mockDbRow]);
      
      await venueSettingsModel.getAllSettings();
      
      expect(mockDbChain.limit).toHaveBeenCalledWith(100);
      expect(mockDbChain.offset).toHaveBeenCalledWith(0);
    });

    it('should return empty array when no settings', async () => {
      mockDbChain.offset.mockResolvedValue([]);
      
      const result = await venueSettingsModel.getAllSettings();
      
      expect(result).toEqual([]);
    });
  });

  describe('mapToSettings', () => {
    it('should map database row to settings object', async () => {
      mockDbChain.first.mockResolvedValue(mockDbRow);
      
      const result = await venueSettingsModel.findByVenueId('venue-123');
      
      expect(result).toEqual(expect.objectContaining({
        venueId: 'venue-123',
        maxResaleMultiplier: 3.0,
        minPriceMultiplier: 1.0,
        allowBelowFace: false,
        transferCutoffHours: 4,
        listingAdvanceHours: 720,
        autoExpireOnEventStart: true,
        maxListingsPerUserPerEvent: 8,
        maxListingsPerUserTotal: 50,
        requireListingApproval: false,
        autoApproveVerifiedSellers: true,
        royaltyPercentage: 5.0,
        royaltyWalletAddress: 'wallet123abc',
        minimumRoyaltyPayout: 100,
        allowInternationalSales: true,
        blockedCountries: ['KP', 'IR'],
        requireKycForHighValue: true,
        highValueThreshold: 100000
      }));
    });

    it('should handle null blocked_countries', async () => {
      mockDbChain.first.mockResolvedValue({
        ...mockDbRow,
        blocked_countries: null
      });
      
      const result = await venueSettingsModel.findByVenueId('venue-123');
      
      expect(result?.blockedCountries).toEqual([]);
    });

    it('should handle null minimum_royalty_payout', async () => {
      mockDbChain.first.mockResolvedValue({
        ...mockDbRow,
        minimum_royalty_payout: null
      });
      
      const result = await venueSettingsModel.findByVenueId('venue-123');
      
      expect(result?.minimumRoyaltyPayout).toBe(0);
    });
  });

  describe('venueSettingsModel export', () => {
    it('should export singleton instance', () => {
      expect(venueSettingsModel).toBeInstanceOf(VenueSettingsModel);
    });
  });
});

/**
 * Unit Tests for VenueSettingsController
 * Tests HTTP handlers for venue marketplace settings operations
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { venueSettingsController } from '../../../src/controllers/venue-settings.controller';
import { db } from '../../../src/config/database';

// Mock dependencies
jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

describe('VenueSettingsController', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      params: {},
      query: {},
      body: {},
    };

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis(),
    };
  });

  describe('getSettings', () => {
    it('should return venue settings', async () => {
      const mockSettings = {
        venue_id: 'venue-123',
        max_resale_multiplier: '3.0',
        min_price_multiplier: '0.5',
        allow_below_face: true,
        transfer_cutoff_hours: 24,
        listing_advance_hours: 168,
        require_listing_approval: false,
        auto_approve_verified_sellers: true,
        royalty_percentage: '5.0',
        royalty_wallet_address: 'wallet123abc',
        minimum_royalty_payout: 1000,
        allow_international_sales: true,
        blocked_countries: ['NK'],
        require_kyc_for_high_value: true,
        high_value_threshold: 100000,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockRequest.params = { venueId: 'venue-123' };

      const mockFirst = jest.fn().mockResolvedValue(mockSettings);
      const mockWhere = jest.fn().mockReturnValue({ first: mockFirst });
      (db as unknown as jest.Mock).mockReturnValue({ where: mockWhere });

      await venueSettingsController.getSettings(
        mockRequest as FastifyRequest<{ Params: { venueId: string } }>,
        mockReply as FastifyReply
      );

      expect(db).toHaveBeenCalledWith('venue_marketplace_settings');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        settings: expect.objectContaining({
          venueId: 'venue-123',
          maxResaleMultiplier: 3.0,
          minPriceMultiplier: 0.5,
          allowBelowFace: true,
        }),
      });
    });

    it('should return 400 if venue ID is missing', async () => {
      mockRequest.params = { venueId: '' };

      await venueSettingsController.getSettings(
        mockRequest as FastifyRequest<{ Params: { venueId: string } }>,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Venue ID is required' });
    });

    it('should return 404 if settings not found', async () => {
      mockRequest.params = { venueId: 'non-existent' };

      const mockFirst = jest.fn().mockResolvedValue(null);
      const mockWhere = jest.fn().mockReturnValue({ first: mockFirst });
      (db as unknown as jest.Mock).mockReturnValue({ where: mockWhere });

      await venueSettingsController.getSettings(
        mockRequest as FastifyRequest<{ Params: { venueId: string } }>,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Venue settings not found' });
    });

    it('should propagate database errors', async () => {
      mockRequest.params = { venueId: 'venue-123' };

      const mockFirst = jest.fn().mockRejectedValue(new Error('Database error'));
      const mockWhere = jest.fn().mockReturnValue({ first: mockFirst });
      (db as unknown as jest.Mock).mockReturnValue({ where: mockWhere });

      await expect(
        venueSettingsController.getSettings(
          mockRequest as FastifyRequest<{ Params: { venueId: string } }>,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Database error');
    });
  });

  describe('updateSettings', () => {
    it('should update settings successfully', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.body = {
        maxResaleMultiplier: 2.5,
        royaltyPercentage: 7.5,
      };

      const mockFirst = jest.fn().mockResolvedValue({ venue_id: 'venue-123' });
      const mockUpdate = jest.fn().mockResolvedValue(1);
      const mockWhere = jest.fn().mockReturnValue({
        first: mockFirst,
        update: mockUpdate,
      });
      (db as unknown as jest.Mock).mockReturnValue({ where: mockWhere });

      await venueSettingsController.updateSettings(
        mockRequest as FastifyRequest<{ Params: { venueId: string }; Body: any }>,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Settings updated successfully',
      });
    });

    it('should return 400 if venue ID is missing', async () => {
      mockRequest.params = { venueId: '' };
      mockRequest.body = { maxResaleMultiplier: 2.0 };

      await venueSettingsController.updateSettings(
        mockRequest as FastifyRequest<{ Params: { venueId: string }; Body: any }>,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Venue ID is required' });
    });

    it('should return 404 if settings not found', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.body = { maxResaleMultiplier: 2.0 };

      const mockFirst = jest.fn().mockResolvedValue(null);
      const mockWhere = jest.fn().mockReturnValue({ first: mockFirst });
      (db as unknown as jest.Mock).mockReturnValue({ where: mockWhere });

      await venueSettingsController.updateSettings(
        mockRequest as FastifyRequest<{ Params: { venueId: string }; Body: any }>,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Venue settings not found' });
    });

    it('should return 400 if maxResaleMultiplier is out of range', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.body = { maxResaleMultiplier: 15.0 }; // > 10.0

      const mockFirst = jest.fn().mockResolvedValue({ venue_id: 'venue-123' });
      const mockWhere = jest.fn().mockReturnValue({ first: mockFirst });
      (db as unknown as jest.Mock).mockReturnValue({ where: mockWhere });

      await venueSettingsController.updateSettings(
        mockRequest as FastifyRequest<{ Params: { venueId: string }; Body: any }>,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'maxResaleMultiplier must be between 1.0 and 10.0',
      });
    });

    it('should return 400 if minPriceMultiplier is out of range', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.body = { minPriceMultiplier: 0.05 }; // < 0.1

      const mockFirst = jest.fn().mockResolvedValue({ venue_id: 'venue-123' });
      const mockWhere = jest.fn().mockReturnValue({ first: mockFirst });
      (db as unknown as jest.Mock).mockReturnValue({ where: mockWhere });

      await venueSettingsController.updateSettings(
        mockRequest as FastifyRequest<{ Params: { venueId: string }; Body: any }>,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'minPriceMultiplier must be between 0.1 and 1.0',
      });
    });

    it('should return 400 if royaltyPercentage exceeds 20%', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.body = { royaltyPercentage: 25.0 };

      const mockFirst = jest.fn().mockResolvedValue({ venue_id: 'venue-123' });
      const mockWhere = jest.fn().mockReturnValue({ first: mockFirst });
      (db as unknown as jest.Mock).mockReturnValue({ where: mockWhere });

      await venueSettingsController.updateSettings(
        mockRequest as FastifyRequest<{ Params: { venueId: string }; Body: any }>,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'royaltyPercentage must be between 0 and 20.0',
      });
    });

    it('should return 400 if transferCutoffHours exceeds maximum', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.body = { transferCutoffHours: 200 }; // > 168

      const mockFirst = jest.fn().mockResolvedValue({ venue_id: 'venue-123' });
      const mockWhere = jest.fn().mockReturnValue({ first: mockFirst });
      (db as unknown as jest.Mock).mockReturnValue({ where: mockWhere });

      await venueSettingsController.updateSettings(
        mockRequest as FastifyRequest<{ Params: { venueId: string }; Body: any }>,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'transferCutoffHours must be between 0 and 168 (7 days)',
      });
    });

    it('should return 400 if royaltyWalletAddress is invalid', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.body = { royaltyWalletAddress: 'invalid' };

      const mockFirst = jest.fn().mockResolvedValue({ venue_id: 'venue-123' });
      const mockWhere = jest.fn().mockReturnValue({ first: mockFirst });
      (db as unknown as jest.Mock).mockReturnValue({ where: mockWhere });

      await venueSettingsController.updateSettings(
        mockRequest as FastifyRequest<{ Params: { venueId: string }; Body: any }>,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Invalid royalty wallet address format',
      });
    });
  });

  describe('getVenueListings', () => {
    it('should return venue listings with pagination', async () => {
      const mockListings = [
        {
          id: 'listing-1',
          ticket_id: 'ticket-1',
          seller_id: 'seller-1',
          event_id: 'event-1',
          price: 10000,
          original_face_value: 8000,
          price_multiplier: '1.25',
          status: 'active',
          listed_at: new Date(),
          expires_at: new Date(),
          view_count: 10,
          favorite_count: 2,
          accepts_fiat_payment: true,
          accepts_crypto_payment: true,
          created_at: new Date(),
        },
      ];

      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = { status: 'active', limit: '20', offset: '0' };

      const mockOffset = jest.fn().mockResolvedValue(mockListings);
      const mockLimit = jest.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockSelect = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockModify = jest.fn().mockReturnValue({ count: jest.fn().mockResolvedValue([{ count: '1' }]) });
      const mockWhereNull = jest.fn().mockReturnValue({
        select: mockSelect,
        modify: mockModify,
      });
      const mockWhere = jest.fn().mockReturnValue({ whereNull: mockWhereNull });
      (db as unknown as jest.Mock).mockReturnValue({ where: mockWhere });

      await venueSettingsController.getVenueListings(
        mockRequest as FastifyRequest<{ Params: { venueId: string }; Querystring: any }>,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalled();
    });

    it('should return 400 if venue ID is missing', async () => {
      mockRequest.params = { venueId: '' };
      mockRequest.query = {};

      await venueSettingsController.getVenueListings(
        mockRequest as FastifyRequest<{ Params: { venueId: string }; Querystring: any }>,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Venue ID is required' });
    });
  });

  describe('getSalesReport', () => {
    it('should return sales report for venue', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = {
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      };

      const mockSalesData = {
        total_sales: '10',
        total_volume: '150000',
        avg_sale_price: '15000',
        min_sale_price: '8000',
        max_sale_price: '25000',
      };

      const mockFeeData = {
        total_venue_fees: '7500',
        total_platform_fees: '4500',
      };

      const mockDailyBreakdown = [
        { date: '2025-01-15', sales_count: '5', volume: '75000' },
        { date: '2025-01-20', sales_count: '5', volume: '75000' },
      ];

      // Mock for sales data
      const mockSalesFirst = jest.fn().mockResolvedValue(mockSalesData);
      const mockSalesSelect = jest.fn().mockReturnValue({ first: mockSalesFirst });
      const mockSalesBetween = jest.fn().mockReturnValue({ select: mockSalesSelect });
      const mockSalesWhere = jest.fn().mockReturnValue({ whereBetween: mockSalesBetween });

      // Mock for fee data
      const mockFeeFirst = jest.fn().mockResolvedValue(mockFeeData);
      const mockFeeSelect = jest.fn().mockReturnValue({ first: mockFeeFirst });
      const mockFeeBetween = jest.fn().mockReturnValue({ select: mockFeeSelect });
      const mockFeeWhere2 = jest.fn().mockReturnValue({ whereBetween: mockFeeBetween });
      const mockFeeWhere = jest.fn().mockReturnValue({ where: mockFeeWhere2 });
      const mockJoin = jest.fn().mockReturnValue({ where: mockFeeWhere });

      // Mock for daily breakdown
      const mockOrderBy = jest.fn().mockResolvedValue(mockDailyBreakdown);
      const mockGroupBy = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockDailySelect = jest.fn().mockReturnValue({ groupByRaw: mockGroupBy });
      const mockDailyBetween = jest.fn().mockReturnValue({ select: mockDailySelect });
      const mockDailyWhere = jest.fn().mockReturnValue({ whereBetween: mockDailyBetween });

      let callCount = 0;
      (db as unknown as jest.Mock).mockImplementation((table: string) => {
        callCount++;
        if (table === 'marketplace_transfers') {
          if (callCount === 1) {
            return { where: mockSalesWhere };
          }
          return { where: mockDailyWhere };
        }
        if (table === 'platform_fees') {
          return { join: mockJoin };
        }
        return {};
      });

      await venueSettingsController.getSalesReport(
        mockRequest as FastifyRequest<{ Params: { venueId: string }; Querystring: any }>,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalled();
    });

    it('should return 400 if venue ID is missing', async () => {
      mockRequest.params = { venueId: '' };
      mockRequest.query = {};

      await venueSettingsController.getSalesReport(
        mockRequest as FastifyRequest<{ Params: { venueId: string }; Querystring: any }>,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Venue ID is required' });
    });
  });
});

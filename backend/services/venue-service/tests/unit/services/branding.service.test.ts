/**
 * Unit tests for BrandingService
 */

// Create mock chain - ALL methods return this for chaining
const mockChain: any = {
  where: jest.fn().mockReturnThis(),
  whereIn: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  first: jest.fn().mockResolvedValue(null),
  insert: jest.fn().mockReturnThis(),  // Returns this so .returning() works
  update: jest.fn().mockReturnThis(),  // Returns this so .returning() works
  returning: jest.fn().mockResolvedValue([{ id: 'test-id' }]),
  then: jest.fn((cb: any) => cb([])),
};

const mockDb: any = jest.fn(() => mockChain);
mockDb._mockChain = mockChain;

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { BrandingService, brandingService } from '../../../src/services/branding.service';

describe('BrandingService', () => {
  let service: BrandingService;
  const mockVenueId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to defaults
    mockChain.first.mockResolvedValue(null);
    mockChain.returning.mockResolvedValue([{ id: 'test-id' }]);
    service = new BrandingService();
  });

  describe('getBrandingByVenueId', () => {
    it('should return branding configuration when found', async () => {
      const mockBranding = {
        venue_id: mockVenueId,
        primary_color: '#FF0000',
      };
      mockChain.first.mockResolvedValue(mockBranding);

      const result = await service.getBrandingByVenueId(mockVenueId);

      expect(result).toEqual(mockBranding);
    });

    it('should return default branding when not found', async () => {
      mockChain.first.mockResolvedValue(null);

      const result = await service.getBrandingByVenueId(mockVenueId);

      expect(result.primary_color).toBe('#667eea');
    });

    it('should handle database errors', async () => {
      mockChain.first.mockRejectedValue(new Error('DB Error'));

      await expect(service.getBrandingByVenueId(mockVenueId)).rejects.toThrow('DB Error');
    });
  });

  describe('getBrandingByDomain', () => {
    it('should return venue and branding when domain found', async () => {
      const mockVenue = { id: mockVenueId, name: 'Test Venue' };
      const mockBranding = { primary_color: '#123456' };
      mockChain.first
        .mockResolvedValueOnce(mockVenue)
        .mockResolvedValueOnce(mockBranding);

      const result = await service.getBrandingByDomain('custom.example.com');

      expect(result?.venue).toEqual(mockVenue);
    });

    it('should return null when domain not found', async () => {
      mockChain.first.mockResolvedValue(null);

      const result = await service.getBrandingByDomain('unknown.domain.com');

      expect(result).toBeNull();
    });
  });

  describe('upsertBranding', () => {
    it('should update existing branding', async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: mockVenueId, pricing_tier: 'white_label' })
        .mockResolvedValueOnce({ id: 'branding-1' });
      mockChain.returning.mockResolvedValue([{ id: 'branding-1' }]);

      const result = await service.upsertBranding({
        venueId: mockVenueId,
        primaryColor: '#FF0000',
      });

      expect(result).toHaveProperty('id');
      expect(mockChain.update).toHaveBeenCalled();
    });

    it('should create new branding when not exists', async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: mockVenueId, pricing_tier: 'enterprise' })
        .mockResolvedValueOnce(null);
      mockChain.returning.mockResolvedValue([{ id: 'branding-new' }]);

      const result = await service.upsertBranding({
        venueId: mockVenueId,
        primaryColor: '#0000FF',
      });

      expect(result).toHaveProperty('id');
      expect(mockChain.insert).toHaveBeenCalled();
    });

    it('should throw error when venue not found', async () => {
      mockChain.first.mockResolvedValue(null);

      await expect(
        service.upsertBranding({ venueId: mockVenueId, primaryColor: '#FF0000' })
      ).rejects.toThrow('Venue not found');
    });

    it('should reject standard tier venues', async () => {
      mockChain.first.mockResolvedValue({ id: mockVenueId, pricing_tier: 'standard' });

      await expect(
        service.upsertBranding({ venueId: mockVenueId, primaryColor: '#FF0000' })
      ).rejects.toThrow('requires white-label or enterprise tier');
    });

    it('should validate hex color format', async () => {
      mockChain.first.mockResolvedValue({ id: mockVenueId, pricing_tier: 'white_label' });

      await expect(
        service.upsertBranding({ venueId: mockVenueId, primaryColor: 'invalid-color' })
      ).rejects.toThrow('Invalid hex color');
    });

    it('should accept valid hex colors', async () => {
      mockChain.first
        .mockResolvedValueOnce({ id: mockVenueId, pricing_tier: 'white_label' })
        .mockResolvedValueOnce(null);
      mockChain.returning.mockResolvedValue([{ id: 'branding-1' }]);

      const result = await service.upsertBranding({
        venueId: mockVenueId,
        primaryColor: '#AABBCC',
      });

      expect(result).toHaveProperty('id');
    });
  });

  describe('getPricingTier', () => {
    it('should return tier configuration', async () => {
      const mockTier = { tier_name: 'white_label', monthly_fee: 99 };
      mockChain.first.mockResolvedValue(mockTier);

      const result = await service.getPricingTier('white_label');

      expect(result).toEqual(mockTier);
    });
  });

  describe('getAllPricingTiers', () => {
    it('should return all tiers ordered by price', async () => {
      const mockTiers = [
        { tier_name: 'standard', monthly_fee: 0 },
        { tier_name: 'white_label', monthly_fee: 99 },
      ];
      mockChain.then.mockImplementation((cb: any) => cb(mockTiers));

      const result = await service.getAllPricingTiers();

      expect(result).toHaveLength(2);
    });
  });

  describe('changeTier', () => {
    it('should change venue tier successfully', async () => {
      mockChain.first
        .mockResolvedValueOnce({ tier_name: 'white_label', hide_platform_branding: true })
        .mockResolvedValueOnce({ id: mockVenueId, pricing_tier: 'standard' });

      await expect(
        service.changeTier(mockVenueId, 'white_label', 'admin-123')
      ).resolves.not.toThrow();
    });

    it('should throw error for invalid tier', async () => {
      mockChain.first.mockResolvedValue(null);

      await expect(
        service.changeTier(mockVenueId, 'invalid_tier', 'admin-123')
      ).rejects.toThrow('Invalid pricing tier');
    });

    it('should throw error when venue not found', async () => {
      mockChain.first
        .mockResolvedValueOnce({ tier_name: 'white_label' })
        .mockResolvedValueOnce(null);

      await expect(
        service.changeTier(mockVenueId, 'white_label', 'admin-123')
      ).rejects.toThrow('Venue not found');
    });
  });

  describe('generateCssVariables', () => {
    it('should generate CSS with branding values', () => {
      const branding = {
        primary_color: '#FF0000',
        secondary_color: '#00FF00',
        font_family: 'Roboto',
        heading_font: 'Poppins',
      };

      const css = service.generateCssVariables(branding);

      expect(css).toContain('--brand-primary: #FF0000');
      expect(css).toContain('--brand-font: Roboto');
    });

    it('should use default values for missing properties', () => {
      const css = service.generateCssVariables({});

      expect(css).toContain('--brand-primary: #667eea');
    });
  });

  describe('brandingService singleton', () => {
    it('should export singleton instance', () => {
      expect(brandingService).toBeInstanceOf(BrandingService);
    });
  });
});

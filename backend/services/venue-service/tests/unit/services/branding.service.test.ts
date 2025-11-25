import { BrandingService } from '../../../src/services/branding.service';

// Mock the database module
jest.mock('../../../src/config/database', () => ({
  db: jest.fn()
}));

// Mock the logger module
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

describe('Branding Service', () => {
  let brandingService: BrandingService;
  let mockDb: any;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Suppress console errors
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Setup mock database
    mockDb = jest.fn();
    mockDb.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      first: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      orderBy: jest.fn().mockReturnThis()
    });

    const { db } = require('../../../src/config/database');
    db.mockImplementation(() => mockDb());

    brandingService = new BrandingService();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // =============================================================================
  // Get Venue Branding Tests
  // =============================================================================

  describe('getBrandingByVenueId', () => {
    it('should return branding when found', async () => {
      const mockBranding = {
        venue_id: 'venue-123',
        primary_color: '#FF0000',
        secondary_color: '#00FF00',
        logo_url: 'https://example.com/logo.png'
      };

      const { db } = require('../../../src/config/database');
      const mockChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockBranding)
      };
      db.mockReturnValue(mockChain);

      const result = await brandingService.getBrandingByVenueId('venue-123');

      expect(result).toEqual(mockBranding);
      expect(mockChain.where).toHaveBeenCalledWith('venue_id', 'venue-123');
    });

    it('should return default branding when none found', async () => {
      const { db } = require('../../../src/config/database');
      const mockChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      };
      db.mockReturnValue(mockChain);

      const result = await brandingService.getBrandingByVenueId('venue-123');

      expect(result).toHaveProperty('primary_color', '#667eea');
      expect(result).toHaveProperty('email_from_name', 'TicketToken');
    });

    it('should handle database errors', async () => {
      const { db } = require('../../../src/config/database');
      const mockChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockRejectedValue(new Error('DB Error'))
      };
      db.mockReturnValue(mockChain);

      await expect(
        brandingService.getBrandingByVenueId('venue-123')
      ).rejects.toThrow('DB Error');
    });
  });

  // =============================================================================
  // Get Branding by Domain Tests
  // =============================================================================

  describe('getBrandingByDomain', () => {
    it('should return venue and branding for custom domain', async () => {
      const mockVenue = { id: 'venue-123', custom_domain: 'custom.com' };
      const mockBranding = { venue_id: 'venue-123', primary_color: '#FF0000' };

      const { db } = require('../../../src/config/database');
      let callCount = 0;
      db.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call - get venue
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(mockVenue)
          };
        } else {
          // Second call - get branding
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(mockBranding)
          };
        }
      });

      const result = await brandingService.getBrandingByDomain('custom.com');

      expect(result).toHaveProperty('venue', mockVenue);
      expect(result).toHaveProperty('branding', mockBranding);
    });

    it('should return null when domain not found', async () => {
      const { db } = require('../../../src/config/database');
      const mockChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      };
      db.mockReturnValue(mockChain);

      const result = await brandingService.getBrandingByDomain('nonexistent.com');

      expect(result).toBeNull();
    });
  });

  // =============================================================================
  // Upsert Branding Tests
  // =============================================================================

  describe('upsertBranding', () => {
    it('should create new branding when none exists', async () => {
      const config = {
        venueId: 'venue-123',
        primaryColor: '#FF0000',
        secondaryColor: '#00FF00'
      };

      const mockVenue = { id: 'venue-123', pricing_tier: 'white_label' };
      const mockResult = [{ venue_id: 'venue-123', ...config }];

      const { db } = require('../../../src/config/database');
      let callCount = 0;
      db.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Check venue exists
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(mockVenue)
          };
        } else if (callCount === 2) {
          // Check if branding exists
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(null)
          };
        } else {
          // Insert new branding
          return {
            insert: jest.fn().mockReturnThis(),
            returning: jest.fn().mockResolvedValue(mockResult)
          };
        }
      });

      const result = await brandingService.upsertBranding(config);

      expect(result).toBeDefined();
    });

    it('should update existing branding', async () => {
      const config = {
        venueId: 'venue-123',
        primaryColor: '#FF0000'
      };

      const mockVenue = { id: 'venue-123', pricing_tier: 'white_label' };
      const mockExisting = { venue_id: 'venue-123' };
      const mockResult = [{ venue_id: 'venue-123', primary_color: '#FF0000' }];

      const { db } = require('../../../src/config/database');
      let callCount = 0;
      db.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(mockVenue)
          };
        } else if (callCount === 2) {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(mockExisting)
          };
        } else {
          return {
            where: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            returning: jest.fn().mockResolvedValue(mockResult)
          };
        }
      });

      const result = await brandingService.upsertBranding(config);

      expect(result).toBeDefined();
    });

    it('should throw error when venue not found', async () => {
      const config = {
        venueId: 'nonexistent',
        primaryColor: '#FF0000'
      };

      const { db } = require('../../../src/config/database');
      const mockChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      };
      db.mockReturnValue(mockChain);

      await expect(
        brandingService.upsertBranding(config)
      ).rejects.toThrow('Venue not found');
    });

    it('should throw error for standard tier venues', async () => {
      const config = {
        venueId: 'venue-123',
        primaryColor: '#FF0000'
      };

      const mockVenue = { id: 'venue-123', pricing_tier: 'standard' };

      const { db } = require('../../../src/config/database');
      const mockChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockVenue)
      };
      db.mockReturnValue(mockChain);

      await expect(
        brandingService.upsertBranding(config)
      ).rejects.toThrow('requires white-label or enterprise tier');
    });

    it('should validate hex colors', async () => {
      const config = {
        venueId: 'venue-123',
        primaryColor: 'invalid-color'
      };

      const mockVenue = { id: 'venue-123', pricing_tier: 'white_label' };

      const { db } = require('../../../src/config/database');
      const mockChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockVenue)
      };
      db.mockReturnValue(mockChain);

      await expect(
        brandingService.upsertBranding(config)
      ).rejects.toThrow('Invalid hex color');
    });
  });

  // =============================================================================
  // Pricing Tier Tests
  // =============================================================================

  describe('getPricingTier', () => {
    it('should return tier details', async () => {
      const mockTier = {
        tier_name: 'white_label',
        monthly_fee: 99,
        hide_platform_branding: true
      };

      const { db } = require('../../../src/config/database');
      const mockChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockTier)
      };
      db.mockReturnValue(mockChain);

      const result = await brandingService.getPricingTier('white_label');

      expect(result).toEqual(mockTier);
    });
  });

  describe('getAllPricingTiers', () => {
    it('should return all tiers ordered by price', async () => {
      const mockTiers = [
        { tier_name: 'standard', monthly_fee: 0 },
        { tier_name: 'white_label', monthly_fee: 99 },
        { tier_name: 'enterprise', monthly_fee: 499 }
      ];

      const { db } = require('../../../src/config/database');
      const mockChain = {
        orderBy: jest.fn().mockResolvedValue(mockTiers)
      };
      db.mockReturnValue(mockChain);

      const result = await brandingService.getAllPricingTiers();

      expect(result).toEqual(mockTiers);
      expect(mockChain.orderBy).toHaveBeenCalledWith('monthly_fee', 'asc');
    });
  });

  // =============================================================================
  // Change Tier Tests
  // =============================================================================

  describe('changeTier', () => {
    it('should upgrade venue tier', async () => {
      const mockTier = { tier_name: 'white_label', hide_platform_branding: true };
      const mockVenue = { id: 'venue-123', pricing_tier: 'standard' };

      const { db } = require('../../../src/config/database');
      let callCount = 0;
      db.mockImplementation(() => {
        callCount++;
        if (callCount === 1 || callCount === 2) {
          return {
            where:jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(callCount === 1 ? mockTier : mockVenue)
          };
        } else if (callCount === 3) {
          return {
            where: jest.fn().mockReturnThis(),
            update: jest.fn().mockResolvedValue(undefined)
          };
        } else {
          return {
            insert: jest.fn().mockResolvedValue(undefined)
          };
        }
      });

      await brandingService.changeTier('venue-123', 'white_label', 'admin-123', 'Upgrade');

      expect(db).toHaveBeenCalled();
    });

    it('should throw error for invalid tier', async () => {
      const { db } = require('../../../src/config/database');
      const mockChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      };
      db.mockReturnValue(mockChain);

      await expect(
        brandingService.changeTier('venue-123', 'invalid', 'admin-123')
      ).rejects.toThrow('Invalid pricing tier');
    });
  });

  // =============================================================================
  // CSS Generation Tests
  // =============================================================================

  describe('generateCssVariables', () => {
    it('should generate CSS variables from branding', () => {
      const branding = {
        primary_color: '#FF0000',
        secondary_color: '#00FF00',
        font_family: 'Arial',
        custom_css: 'body { margin: 0; }'
      };

      const css = brandingService.generateCssVariables(branding);

      expect(css).toContain('--brand-primary: #FF0000');
      expect(css).toContain('--brand-secondary: #00FF00');
      expect(css).toContain('--brand-font: Arial');
      expect(css).toContain('body { margin: 0; }');
    });

    it('should use default values when not provided', () => {
      const branding = {};

      const css = brandingService.generateCssVariables(branding);

      expect(css).toContain('--brand-primary: #667eea');
      expect(css).toContain('--brand-font: Inter');
    });
  });
});

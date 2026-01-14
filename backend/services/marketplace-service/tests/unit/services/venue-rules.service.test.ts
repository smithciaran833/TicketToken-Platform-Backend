/**
 * Unit Tests for venue-rules.service.ts
 * Tests venue-specific resale rules and fee configurations
 */

import { venueRulesService } from '../../../src/services/venue-rules.service';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database', () => {
  const mockDb = jest.fn(() => mockDb);
  Object.assign(mockDb, {
    where: jest.fn().mockReturnThis(),
    first: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    select: jest.fn().mockReturnThis(),
  });
  return { db: mockDb };
});

jest.mock('../../../src/config/redis', () => ({
  getRedis: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  })),
}));

import { db } from '../../../src/config/database';
import { getRedis } from '../../../src/config/redis';

describe('VenueRulesService', () => {
  const mockDb = db as jest.MockedFunction<any>;
  const mockRedis = getRedis() as jest.Mocked<any>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getVenueRules', () => {
    it('should return venue rules by ID', async () => {
      const mockRules = {
        venue_id: 'venue-123',
        resale_allowed: true,
        max_markup_percentage: 200,
        platform_fee_percentage: 500,
        royalty_percentage: 1000,
      };

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(mockRules),
        }),
      });

      const rules = await venueRulesService.getVenueRules('venue-123');

      expect(rules).toBeDefined();
      expect(rules!.resale_allowed).toBe(true);
      expect(rules!.max_markup_percentage).toBe(200);
    });

    it('should return null if no rules exist', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null),
        }),
      });

      const rules = await venueRulesService.getVenueRules('non-existent');

      expect(rules).toBeNull();
    });

    it('should use cache when available', async () => {
      const cachedRules = {
        venue_id: 'venue-123',
        resale_allowed: true,
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedRules));

      const rules = await venueRulesService.getVenueRules('venue-123');

      expect(rules).toBeDefined();
      expect(mockDb).not.toHaveBeenCalled();
    });

    it('should cache rules after fetching from DB', async () => {
      const mockRules = {
        venue_id: 'venue-123',
        resale_allowed: true,
      };

      mockRedis.get.mockResolvedValue(null);
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(mockRules),
        }),
      });

      await venueRulesService.getVenueRules('venue-123');

      expect(mockRedis.set).toHaveBeenCalled();
    });
  });

  describe('isResaleAllowed', () => {
    it('should return true if resale is allowed', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({
            venue_id: 'venue-123',
            resale_allowed: true,
          }),
        }),
      });

      const allowed = await venueRulesService.isResaleAllowed('venue-123');

      expect(allowed).toBe(true);
    });

    it('should return false if resale is not allowed', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({
            venue_id: 'venue-123',
            resale_allowed: false,
          }),
        }),
      });

      const allowed = await venueRulesService.isResaleAllowed('venue-123');

      expect(allowed).toBe(false);
    });

    it('should return true by default if no rules exist', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null),
        }),
      });

      const allowed = await venueRulesService.isResaleAllowed('venue-123');

      expect(allowed).toBe(true); // Default behavior
    });
  });

  describe('getMaxMarkupPercentage', () => {
    it('should return venue-specific markup limit', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({
            venue_id: 'venue-123',
            max_markup_percentage: 150,
          }),
        }),
      });

      const markup = await venueRulesService.getMaxMarkupPercentage('venue-123');

      expect(markup).toBe(150);
    });

    it('should return default markup if no venue rules', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null),
        }),
      });

      const markup = await venueRulesService.getMaxMarkupPercentage('venue-123');

      expect(markup).toBe(300); // Default 300%
    });
  });

  describe('getVenueRoyaltyPercentage', () => {
    it('should return venue royalty percentage', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({
            venue_id: 'venue-123',
            royalty_percentage: 1000, // 10%
          }),
        }),
      });

      const royalty = await venueRulesService.getVenueRoyaltyPercentage('venue-123');

      expect(royalty).toBe(1000);
    });

    it('should return 0 if no royalty configured', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({
            venue_id: 'venue-123',
            royalty_percentage: null,
          }),
        }),
      });

      const royalty = await venueRulesService.getVenueRoyaltyPercentage('venue-123');

      expect(royalty).toBe(0);
    });
  });

  describe('validatePriceAgainstRules', () => {
    it('should return valid for price within markup limit', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({
            venue_id: 'venue-123',
            max_markup_percentage: 200,
          }),
        }),
      });

      const result = await venueRulesService.validatePriceAgainstRules(
        'venue-123',
        10000, // Original price
        25000  // 150% markup
      );

      expect(result.valid).toBe(true);
    });

    it('should return invalid for price exceeding markup limit', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({
            venue_id: 'venue-123',
            max_markup_percentage: 100,
          }),
        }),
      });

      const result = await venueRulesService.validatePriceAgainstRules(
        'venue-123',
        10000, // Original price
        25000  // 150% markup exceeds 100% limit
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('markup');
    });

    it('should handle zero original price', async () => {
      const result = await venueRulesService.validatePriceAgainstRules(
        'venue-123',
        0,
        5000
      );

      expect(result.valid).toBe(false);
    });
  });

  describe('updateVenueRules', () => {
    it('should update venue rules', async () => {
      const updateMock = jest.fn().mockResolvedValue(1);
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          update: updateMock,
        }),
      });

      await venueRulesService.updateVenueRules('venue-123', {
        resale_allowed: false,
        max_markup_percentage: 100,
      });

      expect(updateMock).toHaveBeenCalled();
    });

    it('should invalidate cache on update', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          update: jest.fn().mockResolvedValue(1),
        }),
      });

      await venueRulesService.updateVenueRules('venue-123', {
        resale_allowed: false,
      });

      expect(mockRedis.del).toHaveBeenCalled();
    });
  });

  describe('createVenueRules', () => {
    it('should create venue rules', async () => {
      const insertMock = jest.fn().mockResolvedValue([1]);
      mockDb.mockReturnValue({
        insert: insertMock,
      });

      await venueRulesService.createVenueRules({
        venue_id: 'venue-123',
        resale_allowed: true,
        max_markup_percentage: 200,
        royalty_percentage: 500,
      });

      expect(insertMock).toHaveBeenCalled();
    });

    it('should use default values for missing fields', async () => {
      const insertMock = jest.fn().mockResolvedValue([1]);
      mockDb.mockReturnValue({
        insert: insertMock,
      });

      await venueRulesService.createVenueRules({
        venue_id: 'venue-123',
      });

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          resale_allowed: true,
          max_markup_percentage: 300,
        })
      );
    });
  });

  describe('Service export', () => {
    it('should export venueRulesService object', () => {
      expect(venueRulesService).toBeDefined();
      expect(venueRulesService.getVenueRules).toBeDefined();
      expect(venueRulesService.isResaleAllowed).toBeDefined();
      expect(venueRulesService.getMaxMarkupPercentage).toBeDefined();
    });
  });
});

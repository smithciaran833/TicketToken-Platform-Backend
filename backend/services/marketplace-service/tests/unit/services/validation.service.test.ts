/**
 * Unit Tests for validation.service.ts
 * Tests listing creation validation, transfer validation, and price validation
 */

import { ValidationService, validationService } from '../../../src/services/validation.service';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

jest.mock('../../../src/models/listing.model', () => ({
  listingModel: {
    findByTicketId: jest.fn(),
    findById: jest.fn(),
    countByUserId: jest.fn(),
  },
}));

jest.mock('../../../src/models/venue-settings.model', () => ({
  venueSettingsModel: {
    findByVenueId: jest.fn(),
  },
}));

jest.mock('../../../src/config', () => ({
  constants: {
    LISTING_CONSTRAINTS: {
      MIN_PRICE: 100, // $1.00 in cents
      MAX_PRICE: 100000000, // $1,000,000 in cents
    },
  },
}));

import { listingModel } from '../../../src/models/listing.model';
import { venueSettingsModel } from '../../../src/models/venue-settings.model';

describe('ValidationService', () => {
  let service: ValidationService;

  const defaultVenueSettings = {
    minPriceMultiplier: 0.5,
    maxResaleMultiplier: 2.0,
    allowBelowFace: true,
    listingAdvanceHours: 24,
    transferCutoffHours: 2,
    maxListingsPerUserPerEvent: 10,
    maxListingsPerUserTotal: 50,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ValidationService();
  });

  describe('validatePrice', () => {
    it('should validate price within range', () => {
      const result = service.validatePrice(5000, 5000, 0.5, 2.0, true);

      expect(result.valid).toBe(true);
      expect(result.priceMultiplier).toBe(1.0);
    });

    it('should reject price below minimum when not allowed', () => {
      const result = service.validatePrice(4000, 5000, 0.5, 2.0, false);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('below face value');
    });

    it('should allow price below face value when allowed', () => {
      const result = service.validatePrice(4000, 5000, 0.5, 2.0, true);

      expect(result.valid).toBe(true);
    });

    it('should reject price below minimum multiplier', () => {
      const result = service.validatePrice(1000, 5000, 0.5, 2.0, true);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('at least');
    });

    it('should reject price above maximum multiplier', () => {
      const result = service.validatePrice(15000, 5000, 0.5, 2.0, true);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('cannot exceed');
    });

    it('should reject price below absolute minimum', () => {
      const result = service.validatePrice(50, 100, 0.1, 10.0, true);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('must be at least');
    });

    it('should return minPrice and maxPrice in result', () => {
      const result = service.validatePrice(5000, 5000, 0.5, 2.0, true);

      expect(result.minPrice).toBe(2500); // 5000 * 0.5
      expect(result.maxPrice).toBe(10000); // 5000 * 2.0
    });
  });

  describe('validateWalletAddress', () => {
    it('should validate correct Solana address', () => {
      const validAddress = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';

      const result = service.validateWalletAddress(validAddress);

      expect(result).toBe(true);
    });

    it('should reject invalid address format', () => {
      const invalidAddress = 'invalid-address';

      const result = service.validateWalletAddress(invalidAddress);

      expect(result).toBe(false);
    });

    it('should reject empty string', () => {
      const result = service.validateWalletAddress('');

      expect(result).toBe(false);
    });

    it('should reject address with invalid characters', () => {
      const invalidAddress = '0OIl1DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5';

      const result = service.validateWalletAddress(invalidAddress);

      expect(result).toBe(false);
    });
  });

  describe('validateListingCreation', () => {
    const validInput = {
      ticketId: 'ticket-123',
      sellerId: 'seller-123',
      eventId: 'event-123',
      venueId: 'venue-123',
      price: 5000,
      originalFaceValue: 5000,
      eventStartTime: new Date(Date.now() + 86400000), // 1 day from now
    };

    beforeEach(() => {
      (listingModel.findByTicketId as jest.Mock).mockResolvedValue(null);
      (venueSettingsModel.findByVenueId as jest.Mock).mockResolvedValue(defaultVenueSettings);
      (listingModel.countByUserId as jest.Mock).mockResolvedValue(0);
    });

    it('should pass validation for valid input', async () => {
      await expect(service.validateListingCreation(validInput)).resolves.not.toThrow();
    });

    it('should throw if ticket is already listed', async () => {
      (listingModel.findByTicketId as jest.Mock).mockResolvedValue({ id: 'existing-listing' });

      await expect(service.validateListingCreation(validInput)).rejects.toThrow('already listed');
    });

    it('should throw if venue settings not found', async () => {
      (venueSettingsModel.findByVenueId as jest.Mock).mockResolvedValue(null);

      await expect(service.validateListingCreation(validInput)).rejects.toThrow('not found');
    });

    it('should throw if price is invalid', async () => {
      const invalidInput = { ...validInput, price: 100000 }; // Too high

      await expect(service.validateListingCreation(invalidInput)).rejects.toThrow('Invalid price');
    });

    it('should throw if event is in the past', async () => {
      const pastInput = {
        ...validInput,
        eventStartTime: new Date(Date.now() - 86400000), // 1 day ago
      };

      await expect(service.validateListingCreation(pastInput)).rejects.toThrow('past events');
    });

    it('should throw if user exceeds per-event listing limit', async () => {
      (listingModel.countByUserId as jest.Mock).mockResolvedValue(10);

      await expect(service.validateListingCreation(validInput)).rejects.toThrow('listings per event');
    });
  });

  describe('validateTransfer', () => {
    const validInput = {
      listingId: 'listing-123',
      buyerId: 'buyer-123',
      buyerWallet: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
      eventStartTime: new Date(Date.now() + 86400000), // 1 day from now
    };

    const mockListing = {
      id: 'listing-123',
      sellerId: 'seller-456',
      venueId: 'venue-123',
      status: 'active',
      originalFaceValue: 5000,
      expiresAt: new Date(Date.now() + 86400000),
    };

    beforeEach(() => {
      (listingModel.findById as jest.Mock).mockResolvedValue(mockListing);
      (venueSettingsModel.findByVenueId as jest.Mock).mockResolvedValue(defaultVenueSettings);
    });

    it('should pass validation for valid transfer', async () => {
      await expect(service.validateTransfer(validInput)).resolves.not.toThrow();
    });

    it('should throw if listing not found', async () => {
      (listingModel.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.validateTransfer(validInput)).rejects.toThrow('Listing not found');
    });

    it('should throw if listing is not active', async () => {
      (listingModel.findById as jest.Mock).mockResolvedValue({
        ...mockListing,
        status: 'sold',
      });

      await expect(service.validateTransfer(validInput)).rejects.toThrow('sold');
    });

    it('should throw if buyer is the seller', async () => {
      const buyerIsSeller = {
        ...validInput,
        buyerId: 'seller-456',
      };

      await expect(service.validateTransfer(buyerIsSeller)).rejects.toThrow('Cannot buy your own');
    });

    it('should throw if listing has expired', async () => {
      (listingModel.findById as jest.Mock).mockResolvedValue({
        ...mockListing,
        expiresAt: new Date(Date.now() - 86400000), // Expired
      });

      await expect(service.validateTransfer(validInput)).rejects.toThrow('expired');
    });

    it('should throw if within transfer cutoff window', async () => {
      const closeInput = {
        ...validInput,
        eventStartTime: new Date(Date.now() + 3600000), // 1 hour from now
      };

      await expect(service.validateTransfer(closeInput)).rejects.toThrow('not allowed');
    });
  });

  describe('validatePriceUpdate', () => {
    const mockListing = {
      id: 'listing-123',
      sellerId: 'seller-123',
      venueId: 'venue-123',
      status: 'active',
      originalFaceValue: 5000,
    };

    beforeEach(() => {
      (listingModel.findById as jest.Mock).mockResolvedValue(mockListing);
      (venueSettingsModel.findByVenueId as jest.Mock).mockResolvedValue(defaultVenueSettings);
    });

    it('should validate price update successfully', async () => {
      const result = await service.validatePriceUpdate('listing-123', 6000, 'seller-123');

      expect(result.valid).toBe(true);
    });

    it('should throw if listing not found', async () => {
      (listingModel.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.validatePriceUpdate('non-existent', 6000, 'seller-123')
      ).rejects.toThrow('not found');
    });

    it('should throw if user is not the seller', async () => {
      await expect(
        service.validatePriceUpdate('listing-123', 6000, 'other-user')
      ).rejects.toThrow('only update your own');
    });

    it('should throw if listing is not active', async () => {
      (listingModel.findById as jest.Mock).mockResolvedValue({
        ...mockListing,
        status: 'sold',
      });

      await expect(
        service.validatePriceUpdate('listing-123', 6000, 'seller-123')
      ).rejects.toThrow('active listings');
    });

    it('should return invalid result for price outside range', async () => {
      const result = await service.validatePriceUpdate('listing-123', 100000, 'seller-123');

      expect(result.valid).toBe(false);
    });
  });

  describe('Singleton export', () => {
    it('should export validationService instance', () => {
      expect(validationService).toBeDefined();
      expect(validationService).toBeInstanceOf(ValidationService);
    });
  });
});

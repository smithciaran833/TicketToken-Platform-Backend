// @ts-nocheck
/**
 * Unit Tests for venue-enrichment.service.ts
 */

// Mock RatingService
const mockGetRatingSummary = jest.fn();
jest.mock('@tickettoken/shared', () => ({
  RatingService: jest.fn().mockImplementation(() => ({
    getRatingSummary: mockGetRatingSummary
  }))
}));

describe('VenueEnrichmentService - Unit Tests', () => {
  let VenueEnrichmentService: any;
  let mockDb: any;
  let mockMongodb: any;
  let mockLogger: any;
  let mockRatingService: any;

  // Helper function accessible to all tests
  const createQueryChain = (table: string) => {
    const chain: any = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn(),
      select: jest.fn().mockResolvedValue([])
    };

    if (table === 'venues') {
      chain.first.mockResolvedValue({
        id: 'venue-1',
        name: 'Stadium',
        type: 'stadium',
        capacity: 50000,
        address: {
          street: '123 Main St',
          city: 'NYC',
          state: 'NY',
          zipCode: '10001',
          country: 'USA'
        },
        location: { lat: 40.7128, lon: -74.0060 },
        timezone: 'America/New_York',
        is_active: true,
        featured: true,
        created_at: new Date(),
        updated_at: new Date()
      });
    } else if (table === 'venue_sections') {
      chain.select.mockResolvedValue([
        {
          id: 'section-1',
          name: 'Section A',
          capacity: 5000,
          type: 'seating',
          base_price: 100
        },
        {
          id: 'section-2',
          name: 'Section B',
          capacity: 3000,
          type: 'standing',
          base_price: 75
        }
      ]);
    }

    return chain;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    mockDb = jest.fn((table) => createQueryChain(table));

    // Mock MongoDB
    const mockCollection = {
      findOne: jest.fn().mockResolvedValue({
        venueId: 'venue-1',
        description: 'Amazing stadium',
        amenities: ['WiFi', 'Parking', 'Concessions'],
        accessibilityFeatures: ['Wheelchair Access', 'Elevators'],
        images: [
          { url: 'http://example.com/img1.jpg', type: 'photo', caption: 'Main entrance', primary: true }
        ],
        contact: {
          phone: '555-1234',
          email: 'info@stadium.com',
          website: 'http://stadium.com'
        },
        operatingHours: { mon: '9-5', tue: '9-5' },
        parkingInfo: { onsite: true, capacity: 1000, pricing: '$10' },
        policies: { ageRestrictions: 'none', bagPolicy: 'small bags only' }
      })
    };

    const mockMongoDb = {
      collection: jest.fn().mockReturnValue(mockCollection)
    };

    mockMongodb = {
      db: jest.fn().mockReturnValue(mockMongoDb)
    };

    mockLogger = {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    mockRatingService = {
      getRatingSummary: mockGetRatingSummary.mockResolvedValue({
        averageRating: 4.5,
        totalRatings: 100,
        categoryAverages: {
          accessibility: 4.8,
          sound: 4.5,
          parking: 4.2,
          foodAndDrink: 4.0,
          sightlines: 4.6
        }
      })
    };

    VenueEnrichmentService = require('../../../src/services/venue-enrichment.service').VenueEnrichmentService;
  });

  describe('Constructor', () => {
    it('should initialize with database', () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      expect(service['db']).toBe(mockDb);
    });

    it('should initialize with mongodb', () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      expect(service['mongodb']).toBe(mockMongodb);
    });

    it('should initialize with logger', () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      expect(service['logger']).toBe(mockLogger);
    });

    it('should initialize with ratingService', () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      expect(service['ratingService']).toBe(mockRatingService);
    });
  });

  describe('enrich()', () => {
    it('should fetch venue from PostgreSQL', async () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      await service.enrich('venue-1');

      expect(mockDb).toHaveBeenCalledWith('venues');
    });

    it('should throw error if venue not found', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'venues') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(null)
          };
        }
        return { where: jest.fn().mockReturnThis(), select: jest.fn().mockResolvedValue([]) };
      });

      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      await expect(service.enrich('venue-1')).rejects.toThrow('Venue not found: venue-1');
    });

    it('should fetch venue sections from PostgreSQL', async () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      await service.enrich('venue-1');

      expect(mockDb).toHaveBeenCalledWith('venue_sections');
    });

    it('should fetch content from MongoDB', async () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      await service.enrich('venue-1');

      expect(mockMongodb.db).toHaveBeenCalled();
      const mongoDb = mockMongodb.db();
      expect(mongoDb.collection).toHaveBeenCalledWith('venue_content');
    });

    it('should get ratings via RatingService', async () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      await service.enrich('venue-1');

      expect(mockRatingService.getRatingSummary).toHaveBeenCalledWith('venue', 'venue-1');
    });

    it('should return enriched venue', async () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('venue-1');

      expect(result.venueId).toBe('venue-1');
      expect(result.name).toBe('Stadium');
      expect(result.type).toBe('stadium');
      expect(result.capacity).toBe(50000);
    });

    it('should include address information', async () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('venue-1');

      expect(result.address.street).toBe('123 Main St');
      expect(result.address.city).toBe('NYC');
      expect(result.address.state).toBe('NY');
      expect(result.address.zipCode).toBe('10001');
      expect(result.address.country).toBe('USA');
    });

    it('should include location coordinates', async () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('venue-1');

      expect(result.location).toEqual({ lat: 40.7128, lon: -74.0060 });
    });

    it('should include sections', async () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('venue-1');

      expect(result.sections).toHaveLength(2);
      expect(result.sections[0].name).toBe('Section A');
      expect(result.sections[0].capacity).toBe(5000);
    });

    it('should include amenities from MongoDB', async () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('venue-1');

      expect(result.amenities).toContain('WiFi');
      expect(result.amenities).toContain('Parking');
    });

    it('should include accessibility features', async () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('venue-1');

      expect(result.accessibilityFeatures).toContain('Wheelchair Access');
      expect(result.accessibilityFeatures).toContain('Elevators');
    });

    it('should include images', async () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('venue-1');

      expect(result.images).toHaveLength(1);
      expect(result.images[0].url).toBe('http://example.com/img1.jpg');
      expect(result.images[0].primary).toBe(true);
    });

    it('should include ratings', async () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('venue-1');

      expect(result.ratings.averageRating).toBe(4.5);
      expect(result.ratings.totalReviews).toBe(100);
      expect(result.ratings.categories.accessibility).toBe(4.8);
      expect(result.ratings.categories.sound).toBe(4.5);
    });

    it('should handle missing ratings gracefully', async () => {
      mockRatingService.getRatingSummary.mockResolvedValue(null);

      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('venue-1');

      expect(result.ratings).toBeUndefined();
    });

    it('should handle ratings error gracefully', async () => {
      mockRatingService.getRatingSummary.mockRejectedValue(new Error('Rating error'));

      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('venue-1');

      expect(result.ratings).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle missing MongoDB content', async () => {
      const mockCollection = {
        findOne: jest.fn().mockResolvedValue(null)
      };
      mockMongodb.db().collection = jest.fn().mockReturnValue(mockCollection);

      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('venue-1');

      expect(result.amenities).toEqual([]);
      expect(result.accessibilityFeatures).toEqual([]);
    });

    it('should include contact information', async () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('venue-1');

      expect(result.contact.phone).toBe('555-1234');
      expect(result.contact.email).toBe('info@stadium.com');
      expect(result.contact.website).toBe('http://stadium.com');
    });

    it('should include parking info', async () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('venue-1');

      expect(result.parkingInfo.onsite).toBe(true);
      expect(result.parkingInfo.capacity).toBe(1000);
    });

    it('should calculate search boost', async () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('venue-1');

      expect(result.searchBoost).toBeDefined();
      expect(typeof result.searchBoost).toBe('number');
      expect(result.searchBoost).toBeGreaterThan(1.0);
    });

    it('should set status based on is_active', async () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('venue-1');

      expect(result.status).toBe('active');
    });

    it('should log error on failure', async () => {
      mockDb.mockImplementation(() => {
        throw new Error('DB error');
      });

      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      await expect(service.enrich('venue-1')).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('bulkEnrich()', () => {
    it('should enrich multiple venues', async () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const results = await service.bulkEnrich(['venue-1', 'venue-2']);

      expect(results).toHaveLength(2);
    });

    it('should continue on individual failures', async () => {
      let callCount = 0;
      mockDb.mockImplementation((table) => {
        if (table === 'venues') {
          callCount++;
          return {
            where: jest.fn().mockReturnThis(),
            first: callCount === 1
              ? jest.fn().mockResolvedValue({
                  id: 'venue-1',
                  name: 'Stadium',
                  capacity: 50000,
                  is_active: true,
                  created_at: new Date()
                })
              : jest.fn().mockRejectedValue(new Error('Venue 2 error'))
          };
        }
        return { where: jest.fn().mockReturnThis(), select: jest.fn().mockResolvedValue([]) };
      });

      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const results = await service.bulkEnrich(['venue-1', 'venue-2']);

      expect(results).toHaveLength(1);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should return empty array for empty input', async () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const results = await service.bulkEnrich([]);

      expect(results).toEqual([]);
    });
  });

  describe('calculateSearchBoost()', () => {
    it('should boost featured venues', async () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('venue-1');

      // Featured + high rating + many reviews + large capacity
      expect(result.searchBoost).toBeGreaterThan(1.0);
    });

    it('should boost highly rated venues', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'venues') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'venue-1',
              name: 'Stadium',
              capacity: 5000,
              featured: false,
              is_active: true,
              created_at: new Date()
            })
          };
        }
        return createQueryChain(table);
      });

      mockRatingService.getRatingSummary.mockResolvedValue({
        averageRating: 4.5,
        totalRatings: 10
      });

      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('venue-1');

      expect(result.searchBoost).toBeGreaterThan(1.0);
    });

    it('should boost venues with many reviews', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'venues') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'venue-1',
              name: 'Stadium',
              capacity: 5000,
              featured: false,
              is_active: true,
              created_at: new Date()
            })
          };
        }
        return createQueryChain(table);
      });

      mockRatingService.getRatingSummary.mockResolvedValue({
        averageRating: 3.0,
        totalRatings: 150
      });

      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('venue-1');

      expect(result.searchBoost).toBeGreaterThan(1.0);
    });

    it('should boost large capacity venues', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'venues') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'venue-1',
              name: 'Stadium',
              capacity: 60000,
              featured: false,
              is_active: true,
              created_at: new Date()
            })
          };
        }
        return createQueryChain(table);
      });

      mockRatingService.getRatingSummary.mockResolvedValue(null);

      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('venue-1');

      expect(result.searchBoost).toBeGreaterThan(1.0);
    });

    it('should return base boost for plain venue', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'venues') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'venue-1',
              name: 'Small Venue',
              capacity: 100,
              featured: false,
              is_active: true,
              created_at: new Date()
            })
          };
        }
        return createQueryChain(table);
      });

      mockRatingService.getRatingSummary.mockResolvedValue(null);

      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('venue-1');

      expect(result.searchBoost).toBe(1.0);
    });
  });

  describe('Class Structure', () => {
    it('should be instantiable', () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      expect(service).toBeInstanceOf(VenueEnrichmentService);
    });

    it('should have enrich method', () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      expect(typeof service.enrich).toBe('function');
    });

    it('should have bulkEnrich method', () => {
      const service = new VenueEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      expect(typeof service.bulkEnrich).toBe('function');
    });
  });
});

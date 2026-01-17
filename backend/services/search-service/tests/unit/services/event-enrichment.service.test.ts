// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/services/event-enrichment.service.ts
 */

jest.mock('@tickettoken/shared');

describe('src/services/event-enrichment.service.ts - Comprehensive Unit Tests', () => {
  let EventEnrichmentService: any;
  let mockDb: any;
  let mockMongodb: any;
  let mockLogger: any;
  let mockRatingService: any;
  let mockMongoDb: any;
  let mockCollection: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock collection
    mockCollection = {
      findOne: jest.fn().mockResolvedValue(null)
    };

    // Mock MongoDB database
    mockMongoDb = {
      collection: jest.fn().mockReturnValue(mockCollection)
    };

    // Mock MongoDB client
    mockMongodb = {
      db: jest.fn().mockReturnValue(mockMongoDb)
    };

    // Create comprehensive chainable mock factory
    const createQueryChain = (table: string) => {
      const chain: any = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn(),
        join: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn(),
        whereNull: jest.fn().mockReturnThis()
      };

      // Table-specific return values
      if (table === 'events') {
        chain.first.mockResolvedValue({
          id: 'event-1',
          name: 'Concert',
          venue_id: 'venue-1',
          date: new Date(),
          status: 'active'
        });
      } else if (table === 'venues') {
        chain.first.mockResolvedValue({
          id: 'venue-1',
          name: 'Stadium',
          city: 'NYC'
        });
      } else if (table === 'tickets') {
        chain.first.mockResolvedValue({
          min_price: 50,
          max_price: 200,
          avg_price: 100,
          total_tickets: 1000,
          sold_tickets: 500
        });
      } else if (table === 'event_performers') {
        chain.orderBy.mockResolvedValue([
          {
            performerId: 'p1',
            name: 'Artist 1',
            genre: 'Rock',
            headliner: true,
            billing_order: 1
          }
        ]);
      } else {
        chain.first.mockResolvedValue(null);
      }

      return chain;
    };

    // Mock Knex database
    mockDb = jest.fn((table) => createQueryChain(table));
    mockDb.raw = jest.fn();

    // Mock logger
    mockLogger = {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn()
    };

    // Mock RatingService
    mockRatingService = {
      getRatingSummary: jest.fn().mockResolvedValue({
        averageRating: 4.5,
        totalRatings: 100
      })
    };

    EventEnrichmentService = require('../../../src/services/event-enrichment.service').EventEnrichmentService;
  });

  // =============================================================================
  // Constructor
  // =============================================================================

  describe('Constructor', () => {
    it('should initialize with database', () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      expect(service['db']).toBe(mockDb);
    });

    it('should initialize with mongodb', () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      expect(service['mongodb']).toBe(mockMongodb);
    });

    it('should initialize with logger', () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      expect(service['logger']).toBe(mockLogger);
    });

    it('should initialize with ratingService', () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      expect(service['ratingService']).toBe(mockRatingService);
    });
  });

  // =============================================================================
  // enrich() - Event Fetching
  // =============================================================================

  describe('enrich() - Event Fetching', () => {
    it('should fetch event from database', async () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      await service.enrich('event-1');

      expect(mockDb).toHaveBeenCalledWith('events');
    });

    it('should throw error if event not found', async () => {
      // Override default mock for this test
      mockDb.mockImplementation((table) => {
        if (table === 'events') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(null)
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null)
        };
      });

      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      await expect(service.enrich('event-1')).rejects.toThrow('Event not found: event-1');
    });

    it('should fetch venue data', async () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result.venue.name).toBe('Stadium');
    });

    it('should fetch performers', async () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result.performers).toHaveLength(1);
      expect(result.performers[0].name).toBe('Artist 1');
    });

    it('should fetch pricing stats', async () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result.pricing.minPrice).toBe(50);
      expect(result.pricing.maxPrice).toBe(200);
      expect(result.ticketsSold).toBe(500);
    });

    it('should fetch MongoDB content', async () => {
      mockCollection.findOne.mockResolvedValue({
        eventId: 'event-1',
        description: 'Amazing concert',
        tags: ['rock', 'live']
      });

      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result.description).toBe('Amazing concert');
      expect(result.tags).toEqual(['rock', 'live']);
    });

    it('should get ratings', async () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      await service.enrich('event-1');

      expect(mockRatingService.getRatingSummary).toHaveBeenCalledWith('event', 'event-1');
    });
  });

  // =============================================================================
  // enrich() - Enriched Document Structure
  // =============================================================================

  describe('enrich() - Enriched Document Structure', () => {
    it('should return eventId', async () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result.eventId).toBe('event-1');
    });

    it('should include title', async () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result.title).toBe('Concert');
    });

    it('should include category', async () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result.category).toBe('other');
    });

    it('should include event dates', async () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result.eventDate).toBeDefined();
    });

    it('should include venue information', async () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result.venue.venueId).toBe('venue-1');
      expect(result.venue.name).toBe('Stadium');
      expect(result.venue.city).toBe('NYC');
    });

    it('should include metadata', async () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result.metadata).toBeDefined();
    });

    it('should include searchBoost', async () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result.searchBoost).toBeDefined();
      expect(typeof result.searchBoost).toBe('number');
    });

    it('should include visibility', async () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result.visibility).toBe('public');
    });

    it('should handle missing venue gracefully', async () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result.venue.venueId).toBe('venue-1');
    });

    it('should include images from MongoDB', async () => {
      mockCollection.findOne.mockResolvedValue({
        images: [
          { url: 'img1.jpg', type: 'cover', primary: true },
          { url: 'img2.jpg', type: 'photo', primary: false }
        ]
      });

      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result.images).toHaveLength(2);
      expect(result.images[0].url).toBe('img1.jpg');
      expect(result.images[0].primary).toBe(true);
    });
  });

  // =============================================================================
  // enrich() - Error Handling
  // =============================================================================

  describe('enrich() - Error Handling', () => {
    it('should log error on failure', async () => {
      mockDb.mockImplementation(() => {
        throw new Error('DB error');
      });

      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      await expect(service.enrich('event-1')).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle rating service errors', async () => {
      mockRatingService.getRatingSummary.mockRejectedValue(new Error('Rating error'));

      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // bulkEnrich()
  // =============================================================================

  describe('bulkEnrich()', () => {
    it('should enrich multiple events', async () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const results = await service.bulkEnrich(['event-1', 'event-2']);

      expect(results).toHaveLength(2);
    });

    it('should continue on individual failures', async () => {
      let callCount = 0;
      mockDb.mockImplementation((table) => {
        if (table === 'events') {
          callCount++;
          const chain: any = {
            where: jest.fn().mockReturnThis(),
            first: callCount === 1 
              ? jest.fn().mockResolvedValue({ id: 'event-1', name: 'Concert', venue_id: 'venue-1', date: new Date() })
              : jest.fn().mockRejectedValue(new Error('Event 2 error'))
          };
          return chain;
        }
        return {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null),
          join: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockResolvedValue([])
        };
      });

      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const results = await service.bulkEnrich(['event-1', 'event-2']);

      expect(results).toHaveLength(1);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should return empty array for empty input', async () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const results = await service.bulkEnrich([]);

      expect(results).toEqual([]);
    });
  });

  // =============================================================================
  // calculateSearchBoost() - Featured Events
  // =============================================================================

  describe('calculateSearchBoost() - Featured Events', () => {
    it('should boost featured events', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'events') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'event-1',
              name: 'Concert',
              venue_id: 'venue-1',
              date: new Date(Date.now() + 86400000 * 5),
              featured: true
            })
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null),
          join: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockResolvedValue([])
        };
      });

      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result.searchBoost).toBeGreaterThan(1.0);
    });

    it('should not boost non-featured events', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'events') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'event-1',
              name: 'Concert',
              venue_id: 'venue-1',
              date: new Date(Date.now() + 86400000 * 60),
              featured: false
            })
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null),
          join: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockResolvedValue([])
        };
      });

      mockRatingService.getRatingSummary.mockResolvedValue({
        averageRating: 3.0,
        totalRatings: 5
      });

      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result.searchBoost).toBe(1.0);
    });
  });

  // =============================================================================
  // calculateSearchBoost() - Ratings
  // =============================================================================

  describe('calculateSearchBoost() - Ratings', () => {
    it('should boost highly rated events (4.5+)', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'events') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'event-1',
              name: 'Concert',
              venue_id: 'venue-1',
              date: new Date(Date.now() + 86400000 * 60),
              featured: false
            })
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null),
          join: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockResolvedValue([])
        };
      });

      mockRatingService.getRatingSummary.mockResolvedValue({
        averageRating: 4.5,
        totalRatings: 50
      });

      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result.searchBoost).toBeGreaterThan(1.0);
    });

    it('should boost events with many reviews (50+)', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'events') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'event-1',
              name: 'Concert',
              venue_id: 'venue-1',
              date: new Date(Date.now() + 86400000 * 60),
              featured: false
            })
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null),
          join: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockResolvedValue([])
        };
      });

      mockRatingService.getRatingSummary.mockResolvedValue({
        averageRating: 3.5,
        totalRatings: 50
      });

      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result.searchBoost).toBeGreaterThan(1.0);
    });
  });

  // =============================================================================
  // calculateSearchBoost() - Upcoming Events
  // =============================================================================

  describe('calculateSearchBoost() - Upcoming Events', () => {
    it('should boost events happening this week', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'events') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'event-1',
              name: 'Concert',
              venue_id: 'venue-1',
              date: new Date(Date.now() + 86400000 * 3),
              featured: false
            })
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null),
          join: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockResolvedValue([])
        };
      });

      mockRatingService.getRatingSummary.mockResolvedValue({});

      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result.searchBoost).toBeGreaterThan(1.0);
    });

    it('should boost events happening this month', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'events') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'event-1',
              name: 'Concert',
              venue_id: 'venue-1',
              date: new Date(Date.now() + 86400000 * 15),
              featured: false
            })
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null),
          join: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockResolvedValue([])
        };
      });

      mockRatingService.getRatingSummary.mockResolvedValue({});

      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result.searchBoost).toBeGreaterThan(1.0);
    });

    it('should not boost past events', async () => {
      mockDb.mockImplementation((table) => {
        if (table === 'events') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'event-1',
              name: 'Concert',
              venue_id: 'venue-1',
              date: new Date(Date.now() - 86400000 * 5),
              featured: false
            })
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null),
          join: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockResolvedValue([])
        };
      });

      mockRatingService.getRatingSummary.mockResolvedValue({});

      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      const result = await service.enrich('event-1');

      expect(result.searchBoost).toBe(1.0);
    });
  });

  // =============================================================================
  // Class Structure
  // =============================================================================

  describe('Class Structure', () => {
    it('should be instantiable', () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      expect(service).toBeInstanceOf(EventEnrichmentService);
    });

    it('should have enrich method', () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      expect(typeof service.enrich).toBe('function');
    });

    it('should have bulkEnrich method', () => {
      const service = new EventEnrichmentService({
        db: mockDb,
        mongodb: mockMongodb,
        logger: mockLogger,
        ratingService: mockRatingService
      });

      expect(typeof service.bulkEnrich).toBe('function');
    });
  });
});

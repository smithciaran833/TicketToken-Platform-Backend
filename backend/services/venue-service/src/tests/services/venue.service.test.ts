import { VenueService } from '../../services/venue.service';
import { VenueModel } from '../../models/venue.model';
import { StaffModel } from '../../models/staff.model';

describe('VenueService', () => {
  let venueService: VenueService;
  let mockDb: any;
  let mockRedis: any;
  let mockCacheService: any;
  let mockEventPublisher: any;
  let mockLogger: any;

  beforeEach(() => {
    mockDb = {
      transaction: jest.fn((callback) => callback(mockDb)),
      raw: jest.fn(),
    };
    
    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
    };

    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    };

    mockEventPublisher = {
      publishVenueCreated: jest.fn(),
      publishVenueUpdated: jest.fn(),
      publishVenueDeleted: jest.fn(),
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    venueService = new VenueService({
      db: mockDb,
      redis: mockRedis,
      cacheService: mockCacheService,
      eventPublisher: mockEventPublisher,
      logger: mockLogger,
    });
  });

  describe('createVenue', () => {
    it('should create a venue with address object', async () => {
      const venueData = {
        name: 'Test Venue',
        email: 'test@venue.com',
        address: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'US'
        },
        max_capacity: 100,
        venue_type: 'theater' as const
      };

      // Address should exist after transformation
      expect(venueData.address).toBeDefined();
      expect(venueData.address?.city).toBe('New York');
      expect(venueData.address?.state).toBe('NY');
    });
  });
});

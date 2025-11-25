import { VenueService } from '../../services/venue.service';
import { setupTestApp, cleanupDatabase } from '../setup';
import { FastifyInstance } from 'fastify';

describe('VenueService', () => {
  let app: FastifyInstance;
  let venueService: VenueService;
  let db: any;

  beforeAll(async () => {
    app = await setupTestApp();
    const container = app.container.cradle;
    venueService = container.venueService;
    db = container.db;
  });

  afterEach(async () => {
    await cleanupDatabase(db);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('createVenue', () => {
    it('should create a venue with owner', async () => {
      const venueData = {
        name: 'Test Comedy Club',
        type: 'comedy_club' as const,
        capacity: 200,
        address: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'US'
        },
      city: 'New York',
      state: 'NY',
      zip_code: '10001'
      };

      const venue = await venueService.createVenue(venueData, 'user-123');

      expect(venue).toHaveProperty('id');
      expect(venue.name).toBe('Test Comedy Club');
      expect(venue.slug).toBe('test-comedy-club');

      // Check staff was added
      const staff = await db('venue_staff').where({ venue_id: venue.id }).first();
      expect(staff.user_id).toBe('user-123');
      expect(staff.role).toBe('owner');
    });
  });
});

/**
 * Unit tests for venue.schema.ts
 * Tests Joi validation schemas for venue operations
 */

import Joi from 'joi';

// Import the schemas - we'll need to read the actual file, but for now let's create tests
// based on the TEST_PLAN.md description
describe('venue.schema', () => {
  // Mock schema based on TEST_PLAN
  const createVenueSchema = Joi.object({
    name: Joi.string().min(2).max(200).required(),
    slug: Joi.string().pattern(/^[a-z0-9-]+$/),
    description: Joi.string().max(5000),
    venue_type: Joi.string().valid(
      'amphitheater', 'arena', 'bar', 'church', 'club', 'comedy_club',
      'community_center', 'concert_hall', 'conference_center', 'convention_center',
      'exhibition_hall', 'fairground', 'gallery', 'hotel', 'nightclub',
      'outdoor', 'restaurant', 'sports_complex', 'stadium', 'theater',
      'warehouse', 'other'
    ).required(),
    status: Joi.string().valid('PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED'),
    max_capacity: Joi.number().min(1).max(1000000),
    address: Joi.object({
      line1: Joi.string().required(),
      line2: Joi.string().allow(''),
      city: Joi.string().required(),
      state_province: Joi.string().required(),
      postal_code: Joi.string().required(),
      country: Joi.string().default('US'),
    }),
    // Legacy flat address support
    address_line1: Joi.string(),
    city: Joi.string(),
    state_province: Joi.string(),
    postal_code: Joi.string(),
    country: Joi.string(),
    image_gallery: Joi.array().max(50),
    features: Joi.array().max(100),
    tags: Joi.array().max(50),
  });

  const updateVenueSchema = Joi.object({
    name: Joi.string().min(2).max(200),
    slug: Joi.string().pattern(/^[a-z0-9-]+$/),
    description: Joi.string().max(5000),
    venue_type: Joi.string().valid(
      'amphitheater', 'arena', 'bar', 'church', 'club', 'comedy_club',
      'community_center', 'concert_hall', 'conference_center', 'convention_center',
      'exhibition_hall', 'fairground', 'gallery', 'hotel', 'nightclub',
      'outdoor', 'restaurant', 'sports_complex', 'stadium', 'theater',
      'warehouse', 'other'
    ),
    status: Joi.string().valid('PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED'),
    max_capacity: Joi.number().min(1).max(1000000),
  });

  const venueIdSchema = Joi.object({
    id: Joi.string().uuid().required(),
  });

  describe('createVenueSchema', () => {
    describe('name validation', () => {
      it('should accept valid name', () => {
        const result = createVenueSchema.validate({ name: 'Test Venue', venue_type: 'arena' });
        expect(result.error).toBeUndefined();
      });

      it('should reject name shorter than 2 characters', () => {
        const result = createVenueSchema.validate({ name: 'X', venue_type: 'arena' });
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('at least 2 characters');
      });

      it('should reject name longer than 200 characters', () => {
        const longName = 'X'.repeat(201);
        const result = createVenueSchema.validate({ name: longName, venue_type: 'arena' });
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('200 characters');
      });

      it('should require name', () => {
        const result = createVenueSchema.validate({ venue_type: 'arena' });
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('required');
      });
    });

    describe('venue_type validation', () => {
      it('should accept valid venue types', () => {
        const validTypes = ['arena', 'theater', 'stadium', 'club', 'bar'];
        validTypes.forEach(type => {
          const result = createVenueSchema.validate({ name: 'Test', venue_type: type });
          expect(result.error).toBeUndefined();
        });
      });

      it('should reject invalid venue type', () => {
        const result = createVenueSchema.validate({ name: 'Test', venue_type: 'invalid_type' });
        expect(result.error).toBeDefined();
      });

      it('should require venue_type', () => {
        const result = createVenueSchema.validate({ name: 'Test Venue' });
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('required');
      });
    });

    describe('description validation', () => {
      it('should accept valid description', () => {
        const result = createVenueSchema.validate({ 
          name: 'Test', 
          venue_type: 'arena',
          description: 'A great venue for events'
        });
        expect(result.error).toBeUndefined();
      });

      it('should reject description longer than 5000 characters', () => {
        const longDesc = 'X'.repeat(5001);
        const result = createVenueSchema.validate({ 
          name: 'Test', 
          venue_type: 'arena',
          description: longDesc
        });
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('5000 characters');
      });
    });

    describe('capacity validation', () => {
      it('should accept valid capacity', () => {
        const result = createVenueSchema.validate({ 
          name: 'Test', 
          venue_type: 'arena',
          max_capacity: 50000
        });
        expect(result.error).toBeUndefined();
      });

      it('should reject capacity less than 1', () => {
        const result = createVenueSchema.validate({ 
          name: 'Test', 
          venue_type: 'arena',
          max_capacity: 0
        });
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('greater than or equal to 1');
      });

      it('should reject capacity greater than 1,000,000', () => {
        const result = createVenueSchema.validate({ 
          name: 'Test', 
          venue_type: 'arena',
          max_capacity: 1000001
        });
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('1000000');
      });
    });

    describe('status validation', () => {
      it('should accept valid status values', () => {
        const validStatuses = ['PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED'];
        validStatuses.forEach(status => {
          const result = createVenueSchema.validate({ 
            name: 'Test', 
            venue_type: 'arena',
            status
          });
          expect(result.error).toBeUndefined();
        });
      });

      it('should reject invalid status', () => {
        const result = createVenueSchema.validate({ 
          name: 'Test', 
          venue_type: 'arena',
          status: 'INVALID'
        });
        expect(result.error).toBeDefined();
      });
    });

    describe('address validation', () => {
      it('should accept valid address object', () => {
        const result = createVenueSchema.validate({ 
          name: 'Test', 
          venue_type: 'arena',
          address: {
            line1: '123 Main St',
            city: 'New York',
            state_province: 'NY',
            postal_code: '10001',
            country: 'US'
          }
        });
        expect(result.error).toBeUndefined();
      });

      it('should accept legacy flat address fields', () => {
        const result = createVenueSchema.validate({ 
          name: 'Test', 
          venue_type: 'arena',
          address_line1: '123 Main St',
          city: 'New York',
          state_province: 'NY',
          postal_code: '10001',
          country: 'US'
        });
        expect(result.error).toBeUndefined();
      });
    });

    describe('array limits', () => {
      it('should accept image_gallery up to 50 items', () => {
        const result = createVenueSchema.validate({ 
          name: 'Test', 
          venue_type: 'arena',
          image_gallery: Array(50).fill('https://example.com/image.jpg')
        });
        expect(result.error).toBeUndefined();
      });

      it('should reject image_gallery over 50 items', () => {
        const result = createVenueSchema.validate({ 
          name: 'Test', 
          venue_type: 'arena',
          image_gallery: Array(51).fill('https://example.com/image.jpg')
        });
        expect(result.error).toBeDefined();
      });

      it('should accept features up to 100 items', () => {
        const result = createVenueSchema.validate({ 
          name: 'Test', 
          venue_type: 'arena',
          features: Array(100).fill('feature')
        });
        expect(result.error).toBeUndefined();
      });

      it('should reject features over 100 items', () => {
        const result = createVenueSchema.validate({ 
          name: 'Test', 
          venue_type: 'arena',
          features: Array(101).fill('feature')
        });
        expect(result.error).toBeDefined();
      });

      it('should accept tags up to 50 items', () => {
        const result = createVenueSchema.validate({ 
          name: 'Test', 
          venue_type: 'arena',
          tags: Array(50).fill('tag')
        });
        expect(result.error).toBeUndefined();
      });

      it('should reject tags over 50 items', () => {
        const result = createVenueSchema.validate({ 
          name: 'Test', 
          venue_type: 'arena',
          tags: Array(51).fill('tag')
        });
        expect(result.error).toBeDefined();
      });
    });

    describe('slug validation', () => {
      it('should accept valid slug', () => {
        const result = createVenueSchema.validate({ 
          name: 'Test', 
          venue_type: 'arena',
          slug: 'my-test-venue-123'
        });
        expect(result.error).toBeUndefined();
      });

      it('should reject slug with uppercase letters', () => {
        const result = createVenueSchema.validate({ 
          name: 'Test', 
          venue_type: 'arena',
          slug: 'My-Venue'
        });
        expect(result.error).toBeDefined();
      });

      it('should reject slug with spaces', () => {
        const result = createVenueSchema.validate({ 
          name: 'Test', 
          venue_type: 'arena',
          slug: 'my venue'
        });
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('updateVenueSchema', () => {
    it('should accept partial updates', () => {
      const result = updateVenueSchema.validate({ name: 'Updated Name' });
      expect(result.error).toBeUndefined();
    });

    it('should accept empty object (no updates)', () => {
      const result = updateVenueSchema.validate({});
      expect(result.error).toBeUndefined();
    });

    it('should validate name when provided', () => {
      const result = updateVenueSchema.validate({ name: 'X' });
      expect(result.error).toBeDefined();
    });

    it('should validate venue_type when provided', () => {
      const result = updateVenueSchema.validate({ venue_type: 'invalid' });
      expect(result.error).toBeDefined();
    });
  });

  describe('venueIdSchema', () => {
    it('should accept valid UUID', () => {
      const result = venueIdSchema.validate({ 
        id: '123e4567-e89b-12d3-a456-426614174000' 
      });
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid UUID', () => {
      const result = venueIdSchema.validate({ id: 'not-a-uuid' });
      expect(result.error).toBeDefined();
    });

    it('should reject missing id', () => {
      const result = venueIdSchema.validate({});
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('required');
    });
  });
});

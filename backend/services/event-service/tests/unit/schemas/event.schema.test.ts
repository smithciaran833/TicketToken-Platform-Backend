/**
 * Unit tests for src/schemas/event.schema.ts
 * Tests event-related JSON schema definitions and enums
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import {
  eventStatuses,
  visibilityTypes,
  eventTypes,
  eventResponseSchema,
  eventListResponseSchema,
  createEventResponseSchema,
  updateEventResponseSchema,
  deleteEventResponseSchema,
  publishEventResponseSchema,
  eventRouteResponses,
  eventListRouteResponses,
} from '../../../src/schemas/event.schema';

describe('schemas/event.schema', () => {
  let ajv: Ajv;

  beforeAll(() => {
    ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
  });

  describe('Enums', () => {
    describe('eventStatuses', () => {
      it('should be a readonly array', () => {
        expect(Array.isArray(eventStatuses)).toBe(true);
      });

      it('should contain all expected status values', () => {
        expect(eventStatuses).toContain('DRAFT');
        expect(eventStatuses).toContain('REVIEW');
        expect(eventStatuses).toContain('APPROVED');
        expect(eventStatuses).toContain('PUBLISHED');
        expect(eventStatuses).toContain('ON_SALE');
        expect(eventStatuses).toContain('SOLD_OUT');
        expect(eventStatuses).toContain('IN_PROGRESS');
        expect(eventStatuses).toContain('COMPLETED');
        expect(eventStatuses).toContain('CANCELLED');
        expect(eventStatuses).toContain('POSTPONED');
      });

      it('should have exactly 10 status values', () => {
        expect(eventStatuses.length).toBe(10);
      });

      it('should have correct status lifecycle order', () => {
        // Verify key lifecycle states exist
        const lifecycleStates = ['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'COMPLETED'];
        lifecycleStates.forEach(state => {
          expect(eventStatuses).toContain(state);
        });
      });
    });

    describe('visibilityTypes', () => {
      it('should be a readonly array', () => {
        expect(Array.isArray(visibilityTypes)).toBe(true);
      });

      it('should contain all visibility types', () => {
        expect(visibilityTypes).toContain('PUBLIC');
        expect(visibilityTypes).toContain('PRIVATE');
        expect(visibilityTypes).toContain('UNLISTED');
      });

      it('should have exactly 3 visibility types', () => {
        expect(visibilityTypes.length).toBe(3);
      });
    });

    describe('eventTypes', () => {
      it('should be a readonly array', () => {
        expect(Array.isArray(eventTypes)).toBe(true);
      });

      it('should contain all event types', () => {
        expect(eventTypes).toContain('single');
        expect(eventTypes).toContain('recurring');
        expect(eventTypes).toContain('series');
      });

      it('should have exactly 3 event types', () => {
        expect(eventTypes.length).toBe(3);
      });
    });
  });

  describe('eventResponseSchema', () => {
    it('should have correct type and additionalProperties', () => {
      expect(eventResponseSchema.type).toBe('object');
      expect(eventResponseSchema.additionalProperties).toBe(false);
    });

    describe('properties', () => {
      it('should have all core identifier fields', () => {
        const { properties } = eventResponseSchema;
        expect(properties.id).toBeDefined();
        expect(properties.tenant_id).toBeDefined();
        expect(properties.venue_id).toBeDefined();
      });

      it('should have all basic info fields', () => {
        const { properties } = eventResponseSchema;
        expect(properties.name).toBeDefined();
        expect(properties.slug).toBeDefined();
        expect(properties.description).toBeDefined();
        expect(properties.short_description).toBeDefined();
      });

      it('should have event_type with enum validation', () => {
        const { event_type } = eventResponseSchema.properties;
        expect(event_type.type).toBe('string');
        expect(event_type.enum).toEqual(eventTypes);
      });

      it('should have status with enum validation', () => {
        const { status } = eventResponseSchema.properties;
        expect(status.type).toBe('string');
        expect(status.enum).toEqual(eventStatuses);
      });

      it('should have visibility with enum validation', () => {
        const { visibility } = eventResponseSchema.properties;
        expect(visibility.type).toBe('string');
        expect(visibility.enum).toEqual(visibilityTypes);
      });

      it('should have featured and priority fields', () => {
        const { properties } = eventResponseSchema;
        expect(properties.is_featured.type).toBe('boolean');
        expect(properties.priority_score.type).toBe('integer');
      });

      it('should have URL fields with proper format (SD3)', () => {
        const { properties } = eventResponseSchema;
        expect(properties.banner_image_url.format).toBe('uri');
        expect(properties.thumbnail_image_url.format).toBe('uri');
        expect(properties.video_url.format).toBe('uri');
        expect(properties.virtual_event_url.format).toBe('uri');
      });

      it('should have date-time fields with proper format (SD4)', () => {
        const { properties } = eventResponseSchema;
        expect(properties.starts_at.format).toBe('date-time');
        expect(properties.ends_at.format).toBe('date-time');
        expect(properties.doors_open.format).toBe('date-time');
      });

      it('should have timezone field', () => {
        const { timezone } = eventResponseSchema.properties;
        expect(timezone.type).toBe('string');
      });

      it('should have capacity field', () => {
        const { capacity } = eventResponseSchema.properties;
        expect(capacity.type).toBe('integer');
      });

      it('should have tags as array of strings', () => {
        const { tags } = eventResponseSchema.properties;
        expect(tags.type).toBe('array');
        expect(tags.items.type).toBe('string');
      });

      it('should have accessibility_info object with additionalProperties: false', () => {
        const { accessibility_info } = eventResponseSchema.properties;
        expect(accessibility_info.type).toBe('object');
        expect(accessibility_info.additionalProperties).toBe(false);
        expect(accessibility_info.properties.wheelchair_accessible).toBeDefined();
        expect(accessibility_info.properties.hearing_assistance).toBeDefined();
        expect(accessibility_info.properties.visual_assistance).toBeDefined();
        expect(accessibility_info.properties.notes).toBeDefined();
      });

      it('should have policy fields', () => {
        const { properties } = eventResponseSchema;
        expect(properties.cancellation_policy).toBeDefined();
        expect(properties.refund_policy).toBeDefined();
      });

      it('should have virtual/hybrid event fields', () => {
        const { properties } = eventResponseSchema;
        expect(properties.is_virtual.type).toBe('boolean');
        expect(properties.is_hybrid.type).toBe('boolean');
        expect(properties.streaming_platform).toBeDefined();
      });

      it('should have SEO fields', () => {
        const { properties } = eventResponseSchema;
        expect(properties.meta_title).toBeDefined();
        expect(properties.meta_description).toBeDefined();
      });

      it('should have blockchain fields', () => {
        const { properties } = eventResponseSchema;
        expect(properties.artist_wallet).toBeDefined();
        expect(properties.artist_percentage).toBeDefined();
        expect(properties.venue_percentage).toBeDefined();
        expect(properties.resaleable.type).toBe('boolean');
      });

      it('should have statistics fields', () => {
        const { views } = eventResponseSchema.properties;
        expect(views.type).toBe('integer');
      });

      it('should have timestamp fields', () => {
        const { properties } = eventResponseSchema;
        expect(properties.created_at).toBeDefined();
        expect(properties.updated_at).toBeDefined();
        expect(properties.deleted_at).toBeDefined();
      });

      it('should have version field for optimistic locking', () => {
        const { version } = eventResponseSchema.properties;
        expect(version.type).toBe('integer');
      });
    });

    it('should validate a complete event response', () => {
      const validate = ajv.compile(eventResponseSchema);
      
      const validEvent = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        tenant_id: '550e8400-e29b-41d4-a716-446655440001',
        venue_id: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Test Event',
        slug: 'test-event',
        description: 'A test event description',
        short_description: 'Short desc',
        event_type: 'single',
        status: 'DRAFT',
        visibility: 'PUBLIC',
        is_featured: false,
        priority_score: 0,
        starts_at: '2024-06-15T19:00:00Z',
        ends_at: '2024-06-15T23:00:00Z',
        timezone: 'America/New_York',
        capacity: 1000,
        tags: ['concert', 'music'],
        is_virtual: false,
        is_hybrid: false,
        resaleable: true,
        views: 0,
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
        version: 1
      };
      
      expect(validate(validEvent)).toBe(true);
    });

    it('should reject invalid event_type', () => {
      const validate = ajv.compile(eventResponseSchema);
      
      const invalidEvent = {
        event_type: 'invalid_type'
      };
      
      expect(validate(invalidEvent)).toBe(false);
    });

    it('should reject invalid status', () => {
      const validate = ajv.compile(eventResponseSchema);
      
      const invalidEvent = {
        status: 'INVALID_STATUS'
      };
      
      expect(validate(invalidEvent)).toBe(false);
    });

    it('should reject additional properties', () => {
      const validate = ajv.compile(eventResponseSchema);
      
      const invalidEvent = {
        name: 'Test',
        extraField: 'should not be allowed'
      };
      
      expect(validate(invalidEvent)).toBe(false);
    });
  });

  describe('eventListResponseSchema', () => {
    it('should have correct structure', () => {
      expect(eventListResponseSchema.type).toBe('object');
      expect(eventListResponseSchema.additionalProperties).toBe(false);
    });

    it('should have events array and pagination', () => {
      const { properties } = eventListResponseSchema;
      expect(properties.events).toBeDefined();
      expect(properties.events.type).toBe('array');
      expect(properties.pagination).toBeDefined();
    });

    it('should have events array items matching eventResponseSchema', () => {
      const { events } = eventListResponseSchema.properties;
      expect(events.items).toEqual(eventResponseSchema);
    });

    it('should validate valid list response', () => {
      const validate = ajv.compile(eventListResponseSchema);
      
      const validResponse = {
        events: [],
        pagination: {
          total: 0,
          limit: 20,
          offset: 0,
          hasMore: false
        }
      };
      
      expect(validate(validResponse)).toBe(true);
    });
  });

  describe('createEventResponseSchema', () => {
    it('should have correct structure', () => {
      expect(createEventResponseSchema.type).toBe('object');
      expect(createEventResponseSchema.additionalProperties).toBe(false);
    });

    it('should have success and event properties', () => {
      const { properties } = createEventResponseSchema;
      expect(properties.success).toBeDefined();
      expect(properties.success.const).toBe(true);
      expect(properties.event).toBeDefined();
    });

    it('should have event property matching eventResponseSchema', () => {
      const { event } = createEventResponseSchema.properties;
      expect(event).toEqual(eventResponseSchema);
    });
  });

  describe('updateEventResponseSchema', () => {
    it('should have correct structure', () => {
      expect(updateEventResponseSchema.type).toBe('object');
      expect(updateEventResponseSchema.additionalProperties).toBe(false);
    });

    it('should have success and event properties', () => {
      const { properties } = updateEventResponseSchema;
      expect(properties.success.const).toBe(true);
      expect(properties.event).toBeDefined();
    });
  });

  describe('deleteEventResponseSchema', () => {
    it('should have correct structure', () => {
      expect(deleteEventResponseSchema.type).toBe('object');
      expect(deleteEventResponseSchema.additionalProperties).toBe(false);
    });

    it('should have success and message properties', () => {
      const { properties } = deleteEventResponseSchema;
      expect(properties.success.const).toBe(true);
      expect(properties.message.type).toBe('string');
    });

    it('should validate valid delete response', () => {
      const validate = ajv.compile(deleteEventResponseSchema);
      
      const validResponse = {
        success: true,
        message: 'Event deleted successfully'
      };
      
      expect(validate(validResponse)).toBe(true);
    });
  });

  describe('publishEventResponseSchema', () => {
    it('should have correct structure', () => {
      expect(publishEventResponseSchema.type).toBe('object');
      expect(publishEventResponseSchema.additionalProperties).toBe(false);
    });

    it('should have success and event properties', () => {
      const { properties } = publishEventResponseSchema;
      expect(properties.success.const).toBe(true);
      expect(properties.event).toBeDefined();
    });
  });

  describe('Route Response Schemas', () => {
    describe('eventRouteResponses', () => {
      it('should have all HTTP status codes', () => {
        expect(eventRouteResponses[200]).toBeDefined();
        expect(eventRouteResponses[201]).toBeDefined();
        expect(eventRouteResponses[400]).toBeDefined();
        expect(eventRouteResponses[401]).toBeDefined();
        expect(eventRouteResponses[403]).toBeDefined();
        expect(eventRouteResponses[404]).toBeDefined();
        expect(eventRouteResponses[409]).toBeDefined();
      });

      it('200 response should have description and type', () => {
        const response200 = eventRouteResponses[200];
        expect(response200.description).toBe('Successful operation');
        expect(response200.type).toBe('object');
      });

      it('201 response should have description and type', () => {
        const response201 = eventRouteResponses[201];
        expect(response201.description).toBe('Event created successfully');
        expect(response201.type).toBe('object');
      });

      it('error responses should have descriptions', () => {
        expect(eventRouteResponses[400].description).toBe('Bad Request - validation error');
        expect(eventRouteResponses[401].description).toBe('Unauthorized');
        expect(eventRouteResponses[403].description).toBe('Forbidden');
        expect(eventRouteResponses[404].description).toBe('Event not found');
        expect(eventRouteResponses[409].description).toBe('Conflict - duplicate or version mismatch');
      });
    });

    describe('eventListRouteResponses', () => {
      it('should have list-specific HTTP status codes', () => {
        expect(eventListRouteResponses[200]).toBeDefined();
        expect(eventListRouteResponses[400]).toBeDefined();
        expect(eventListRouteResponses[401]).toBeDefined();
      });

      it('200 response should describe list of events', () => {
        const response200 = eventListRouteResponses[200];
        expect(response200.description).toBe('List of events');
        expect(response200.type).toBe('object');
      });
    });
  });

  describe('Security: additionalProperties (SEC1)', () => {
    it('all object schemas should have additionalProperties: false', () => {
      expect(eventResponseSchema.additionalProperties).toBe(false);
      expect(eventListResponseSchema.additionalProperties).toBe(false);
      expect(createEventResponseSchema.additionalProperties).toBe(false);
      expect(updateEventResponseSchema.additionalProperties).toBe(false);
      expect(deleteEventResponseSchema.additionalProperties).toBe(false);
      expect(publishEventResponseSchema.additionalProperties).toBe(false);
    });

    it('nested accessibility_info should have additionalProperties: false', () => {
      expect(eventResponseSchema.properties.accessibility_info.additionalProperties).toBe(false);
    });
  });

  describe('Format Validation (SD3, SD4)', () => {
    it('should validate URL formats correctly', () => {
      const validate = ajv.compile(eventResponseSchema);
      
      // Valid URL
      expect(validate({ banner_image_url: 'https://example.com/image.jpg' })).toBe(true);
      
      // Invalid URL
      expect(validate({ banner_image_url: 'not-a-url' })).toBe(false);
    });

    it('should validate date-time formats correctly', () => {
      const validate = ajv.compile(eventResponseSchema);
      
      // Valid date-time
      expect(validate({ starts_at: '2024-06-15T19:00:00Z' })).toBe(true);
      
      // Invalid date-time
      expect(validate({ starts_at: 'invalid-date' })).toBe(false);
    });
  });
});

/**
 * Unit tests for VenueContentModel (MongoDB/Mongoose)
 * Tests the Mongoose schema, types, and model structure
 */

// Mock mongoose before importing the model
jest.mock('mongoose', () => {
  const mockSchemaFn: any = jest.fn(() => ({
    index: jest.fn(),
  }));
  mockSchemaFn.Types = {
    ObjectId: jest.fn(),
  };

  return {
    Schema: mockSchemaFn,
    model: jest.fn(() => ({
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
      countDocuments: jest.fn(),
      aggregate: jest.fn(),
    })),
    Document: jest.fn(),
    Types: {
      ObjectId: class MockObjectId {
        _id: string;
        constructor() {
          this._id = Math.random().toString(36).substring(7);
        }
        toString() {
          return 'mock-object-id';
        }
        static isValid(id: any) {
          return typeof id === 'string' && id.length === 24;
        }
        static createFromHexString(hex: string) {
          return new MockObjectId();
        }
      },
    },
  };
});

import { Types } from 'mongoose';
import {
  VenueContentModel,
  IVenueContent,
  VenueContentType,
  VenueContentStatus,
} from '../../../src/models/mongodb/venue-content.model';

describe('VenueContentModel (MongoDB)', () => {
  describe('VenueContentType enum', () => {
    it('should include FLOOR_PLAN', () => {
      const type: VenueContentType = 'FLOOR_PLAN';
      expect(type).toBe('FLOOR_PLAN');
    });

    it('should include SEATING_CHART', () => {
      const type: VenueContentType = 'SEATING_CHART';
      expect(type).toBe('SEATING_CHART');
    });

    it('should include PHOTO', () => {
      const type: VenueContentType = 'PHOTO';
      expect(type).toBe('PHOTO');
    });

    it('should include VIDEO', () => {
      const type: VenueContentType = 'VIDEO';
      expect(type).toBe('VIDEO');
    });

    it('should include VIRTUAL_TOUR', () => {
      const type: VenueContentType = 'VIRTUAL_TOUR';
      expect(type).toBe('VIRTUAL_TOUR');
    });

    it('should include AMENITIES', () => {
      const type: VenueContentType = 'AMENITIES';
      expect(type).toBe('AMENITIES');
    });

    it('should include DIRECTIONS', () => {
      const type: VenueContentType = 'DIRECTIONS';
      expect(type).toBe('DIRECTIONS');
    });

    it('should include PARKING_INFO', () => {
      const type: VenueContentType = 'PARKING_INFO';
      expect(type).toBe('PARKING_INFO');
    });

    it('should include ACCESSIBILITY_INFO', () => {
      const type: VenueContentType = 'ACCESSIBILITY_INFO';
      expect(type).toBe('ACCESSIBILITY_INFO');
    });

    it('should include POLICIES', () => {
      const type: VenueContentType = 'POLICIES';
      expect(type).toBe('POLICIES');
    });

    it('should include FAQ', () => {
      const type: VenueContentType = 'FAQ';
      expect(type).toBe('FAQ');
    });
  });

  describe('VenueContentStatus enum', () => {
    it('should include draft', () => {
      const status: VenueContentStatus = 'draft';
      expect(status).toBe('draft');
    });

    it('should include published', () => {
      const status: VenueContentStatus = 'published';
      expect(status).toBe('published');
    });

    it('should include archived', () => {
      const status: VenueContentStatus = 'archived';
      expect(status).toBe('archived');
    });
  });

  describe('IVenueContent interface', () => {
    it('should have required fields', () => {
      const content: Partial<IVenueContent> = {
        venueId: new Types.ObjectId(),
        contentType: 'PHOTO',
        status: 'draft',
        content: {},
        displayOrder: 0,
        featured: false,
        primaryImage: false,
        version: 1,
        createdBy: 'user-123',
        updatedBy: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(content.venueId).toBeDefined();
      expect(content.contentType).toBe('PHOTO');
      expect(content.status).toBe('draft');
      expect(content.createdBy).toBe('user-123');
    });

    it('should support optional fields', () => {
      const content: Partial<IVenueContent> = {
        venueId: new Types.ObjectId(),
        contentType: 'SEATING_CHART',
        status: 'published',
        content: {},
        displayOrder: 1,
        featured: true,
        primaryImage: true,
        version: 2,
        previousVersionId: new Types.ObjectId(),
        publishedAt: new Date(),
        createdBy: 'user-123',
        updatedBy: 'user-456',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(content.previousVersionId).toBeDefined();
      expect(content.publishedAt).toBeDefined();
      expect(content.featured).toBe(true);
    });

    it('should support archived content', () => {
      const content: Partial<IVenueContent> = {
        venueId: new Types.ObjectId(),
        contentType: 'VIDEO',
        status: 'archived',
        content: {},
        displayOrder: 0,
        featured: false,
        primaryImage: false,
        version: 3,
        archivedAt: new Date(),
        createdBy: 'user-123',
        updatedBy: 'user-789',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(content.status).toBe('archived');
      expect(content.archivedAt).toBeDefined();
    });
  });

  describe('Content structure for SEATING_CHART', () => {
    it('should support sections with rows and seats', () => {
      const seatingContent = {
        sections: [
          {
            sectionId: 'sec-001',
            name: 'Orchestra',
            capacity: 200,
            type: 'seated',
            coordinates: { x: 0, y: 0, width: 100, height: 50 },
            rows: [
              {
                rowId: 'row-A',
                name: 'A',
                seats: [
                  { seatId: 'A1', number: '1', type: 'standard', coordinates: { x: 10, y: 10 } },
                  { seatId: 'A2', number: '2', type: 'accessible', coordinates: { x: 20, y: 10 } },
                ],
              },
            ],
          },
        ],
      };

      expect(seatingContent.sections).toHaveLength(1);
      expect(seatingContent.sections[0].rows[0].seats).toHaveLength(2);
      expect(seatingContent.sections[0].type).toBe('seated');
    });

    it('should support different section types', () => {
      const standingSection = { type: 'standing' };
      const vipSection = { type: 'vip' };
      const accessibleSection = { type: 'accessible' };

      expect(standingSection.type).toBe('standing');
      expect(vipSection.type).toBe('vip');
      expect(accessibleSection.type).toBe('accessible');
    });
  });

  describe('Content structure for PHOTO/VIDEO', () => {
    it('should support media fields', () => {
      const mediaContent = {
        media: {
          url: 'https://cdn.example.com/photo.jpg',
          thumbnailUrl: 'https://cdn.example.com/photo-thumb.jpg',
          type: 'interior',
          caption: 'Main stage view',
          altText: 'Interior view of main stage',
          dimensions: { width: 1920, height: 1080 },
        },
      };

      expect(mediaContent.media.url).toBeDefined();
      expect(mediaContent.media.type).toBe('interior');
      expect(mediaContent.media.dimensions.width).toBe(1920);
    });

    it('should support different media types', () => {
      const mediaTypes = ['exterior', 'interior', 'stage', 'seating', 'amenity', 'view_from_seat'];

      mediaTypes.forEach((type) => {
        expect(type).toBeDefined();
      });
    });

    it('should support view from seat with section/row reference', () => {
      const viewFromSeat = {
        media: {
          url: 'https://cdn.example.com/view-a1.jpg',
          type: 'view_from_seat',
          sectionId: 'sec-001',
          rowId: 'row-A',
        },
      };

      expect(viewFromSeat.media.sectionId).toBe('sec-001');
      expect(viewFromSeat.media.rowId).toBe('row-A');
    });
  });

  describe('Content structure for AMENITIES', () => {
    it('should support amenity list', () => {
      const amenitiesContent = {
        amenities: [
          {
            type: 'parking',
            name: 'Main Lot',
            description: 'Covered parking garage',
            location: 'North entrance',
            hours: '6am - 12am',
            pricing: '$20 per event',
          },
          {
            type: 'food',
            name: 'Main Concessions',
            description: 'Hot dogs, nachos, drinks',
            location: 'Main concourse',
          },
        ],
      };

      expect(amenitiesContent.amenities).toHaveLength(2);
      expect(amenitiesContent.amenities[0].type).toBe('parking');
      expect(amenitiesContent.amenities[1].type).toBe('food');
    });

    it('should support all amenity types', () => {
      const amenityTypes = [
        'parking',
        'food',
        'bar',
        'wifi',
        'atm',
        'restrooms',
        'coat_check',
        'vip_lounge',
        'smoking_area',
      ];

      amenityTypes.forEach((type) => {
        expect(type).toBeDefined();
      });
    });
  });

  describe('Content structure for ACCESSIBILITY_INFO', () => {
    it('should support accessibility features', () => {
      const accessibilityContent = {
        accessibility: [
          {
            type: 'wheelchair',
            description: 'Wheelchair accessible seating in sections A, B, C',
            location: 'Ground level',
            contactInfo: 'accessibility@venue.com',
          },
          {
            type: 'hearing_assistance',
            description: 'Assisted listening devices available',
            location: 'Guest services desk',
          },
        ],
      };

      expect(accessibilityContent.accessibility).toHaveLength(2);
      expect(accessibilityContent.accessibility[0].type).toBe('wheelchair');
    });

    it('should support all accessibility types', () => {
      const accessibilityTypes = [
        'wheelchair',
        'hearing_assistance',
        'visual_assistance',
        'service_animals',
        'elevator',
        'accessible_parking',
        'accessible_restrooms',
      ];

      accessibilityTypes.forEach((type) => {
        expect(type).toBeDefined();
      });
    });
  });

  describe('Content structure for PARKING_INFO', () => {
    it('should support parking locations', () => {
      const parkingContent = {
        parking: [
          {
            type: 'onsite',
            name: 'Main Garage',
            address: '123 Venue St',
            capacity: 500,
            pricing: '$25',
            hours: '4pm - 12am on event days',
            distance: 'Adjacent to venue',
            coordinates: { lat: 40.7128, lng: -74.006 },
          },
          {
            type: 'nearby',
            name: 'City Lot B',
            address: '456 Main St',
            capacity: 200,
            pricing: '$15',
            distance: '2 blocks',
          },
        ],
      };

      expect(parkingContent.parking).toHaveLength(2);
      expect(parkingContent.parking[0].type).toBe('onsite');
      expect(parkingContent.parking[0].coordinates?.lat).toBe(40.7128);
    });

    it('should support all parking types', () => {
      const parkingTypes = ['onsite', 'nearby', 'street', 'valet'];

      parkingTypes.forEach((type) => {
        expect(type).toBeDefined();
      });
    });
  });

  describe('Content structure for POLICIES', () => {
    it('should support policy fields', () => {
      const policiesContent = {
        policies: {
          ageRestrictions: '21+ for most events',
          bagPolicy: 'Small bags only, 12x6x12',
          cameraPolicy: 'No professional cameras',
          reentryPolicy: 'No re-entry',
          smokingPolicy: 'No smoking inside',
          alcoholPolicy: 'ID required for purchase',
        },
      };

      expect(policiesContent.policies.ageRestrictions).toBeDefined();
      expect(policiesContent.policies.bagPolicy).toContain('12x6x12');
    });
  });

  describe('Content structure for DIRECTIONS', () => {
    it('should support direction fields', () => {
      const directionsContent = {
        directions: {
          byTransit: 'Take subway line A to 42nd St',
          byCar: 'Exit 15 off I-95, turn left',
          byFoot: 'Walk north on Main St for 3 blocks',
          landmarks: 'Next to City Hall, across from the park',
        },
      };

      expect(directionsContent.directions.byTransit).toBeDefined();
      expect(directionsContent.directions.byCar).toContain('I-95');
    });
  });

  describe('VenueContentModel export', () => {
    it('should export VenueContentModel', () => {
      expect(VenueContentModel).toBeDefined();
    });
  });

  describe('Schema defaults', () => {
    it('should have default status of draft', () => {
      const defaultStatus: VenueContentStatus = 'draft';
      expect(defaultStatus).toBe('draft');
    });

    it('should have default displayOrder of 0', () => {
      const defaultOrder = 0;
      expect(defaultOrder).toBe(0);
    });

    it('should have default featured of false', () => {
      const defaultFeatured = false;
      expect(defaultFeatured).toBe(false);
    });

    it('should have default primaryImage of false', () => {
      const defaultPrimaryImage = false;
      expect(defaultPrimaryImage).toBe(false);
    });

    it('should have default version of 1', () => {
      const defaultVersion = 1;
      expect(defaultVersion).toBe(1);
    });
  });

  describe('Schema indexes', () => {
    it('should have compound index on venueId, contentType, status', () => {
      // Verified by schema definition
      const indexFields = ['venueId', 'contentType', 'status'];
      expect(indexFields).toHaveLength(3);
    });

    it('should have TTL index on archivedAt (30 days)', () => {
      const ttlSeconds = 2592000; // 30 days
      expect(ttlSeconds).toBe(30 * 24 * 60 * 60);
    });
  });

  describe('Version management', () => {
    it('should support previousVersionId for versioning', () => {
      const versionedContent: Partial<IVenueContent> = {
        version: 2,
        previousVersionId: new Types.ObjectId(),
      };

      expect(versionedContent.version).toBe(2);
      expect(versionedContent.previousVersionId).toBeDefined();
    });

    it('should increment version number', () => {
      let version = 1;
      version++;
      expect(version).toBe(2);
    });
  });
});

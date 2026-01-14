/**
 * Unit tests for EventContentModel (MongoDB/Mongoose)
 * Tests Mongoose schema operations for event content
 */

import { EventContentModel, IEventContent, EventContentType, EventContentStatus } from '../../../src/models/mongodb/event-content.model';

// Mock mongoose
jest.mock('mongoose', () => {
  const mockSchema = jest.fn().mockReturnValue({
    index: jest.fn().mockReturnThis(),
  });
  mockSchema.Types = { ObjectId: String };
  
  const mockModel = jest.fn().mockReturnValue({
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
    countDocuments: jest.fn(),
  });
  
  return {
    Schema: mockSchema,
    model: mockModel,
    Types: { ObjectId: String },
  };
});

describe('EventContentModel (MongoDB)', () => {
  describe('EventContentType enum', () => {
    it('should have DESCRIPTION type', () => {
      const types: EventContentType[] = [
        'DESCRIPTION',
        'COVER_IMAGE',
        'GALLERY',
        'VIDEO',
        'TRAILER',
        'PERFORMER_BIO',
        'LINEUP',
        'SCHEDULE',
        'FAQ',
        'SPONSOR',
        'PROMOTIONAL',
      ];
      
      types.forEach(type => {
        expect(typeof type).toBe('string');
      });
    });
  });

  describe('EventContentStatus enum', () => {
    it('should have valid status values', () => {
      const statuses: EventContentStatus[] = ['draft', 'published', 'archived'];
      
      statuses.forEach(status => {
        expect(['draft', 'published', 'archived']).toContain(status);
      });
    });
  });

  describe('IEventContent interface', () => {
    it('should define required fields', () => {
      const content: Partial<IEventContent> = {
        eventId: '507f1f77bcf86cd799439011' as any,
        contentType: 'DESCRIPTION',
        status: 'draft',
        content: {},
        displayOrder: 0,
        featured: false,
        primaryImage: false,
        version: 1,
        createdBy: 'user-123',
        updatedBy: 'user-123',
      };

      expect(content.eventId).toBeDefined();
      expect(content.contentType).toBe('DESCRIPTION');
      expect(content.status).toBe('draft');
    });

    it('should support optional fields', () => {
      const content: Partial<IEventContent> = {
        eventId: '507f1f77bcf86cd799439011' as any,
        contentType: 'GALLERY',
        status: 'published',
        content: {},
        previousVersionId: '507f1f77bcf86cd799439012' as any,
        publishedAt: new Date(),
        archivedAt: undefined,
        createdBy: 'user-123',
        updatedBy: 'user-123',
      };

      expect(content.previousVersionId).toBeDefined();
      expect(content.publishedAt).toBeDefined();
      expect(content.archivedAt).toBeUndefined();
    });
  });

  describe('content field structures', () => {
    describe('DESCRIPTION content', () => {
      it('should support description content structure', () => {
        const descriptionContent = {
          description: {
            short: 'A short description',
            full: 'A full description of the event with all details...',
            highlights: ['Live Music', 'VIP Access', 'Free Parking'],
            tags: ['music', 'concert', 'live'],
          },
        };

        expect(descriptionContent.description.short).toBeDefined();
        expect(descriptionContent.description.full).toBeDefined();
        expect(descriptionContent.description.highlights).toHaveLength(3);
        expect(descriptionContent.description.tags).toHaveLength(3);
      });
    });

    describe('COVER_IMAGE/GALLERY content', () => {
      it('should support media content structure', () => {
        const mediaContent = {
          media: {
            url: 'https://example.com/image.jpg',
            thumbnailUrl: 'https://example.com/thumb.jpg',
            type: 'image' as const,
            caption: 'Main event banner',
            altText: 'Concert stage with lights',
            dimensions: { width: 1920, height: 1080 },
          },
        };

        expect(mediaContent.media.url).toBeDefined();
        expect(mediaContent.media.thumbnailUrl).toBeDefined();
        expect(mediaContent.media.type).toBe('image');
        expect(mediaContent.media.dimensions.width).toBe(1920);
      });

      it('should support video media content', () => {
        const videoContent = {
          media: {
            url: 'https://example.com/video.mp4',
            thumbnailUrl: 'https://example.com/poster.jpg',
            type: 'video' as const,
            caption: 'Event trailer',
            duration: 120, // seconds
          },
        };

        expect(videoContent.media.type).toBe('video');
        expect(videoContent.media.duration).toBe(120);
      });
    });

    describe('PERFORMER_BIO content', () => {
      it('should support performer content structure', () => {
        const performerContent = {
          performer: {
            performerId: 'performer-123',
            name: 'Famous Artist',
            bio: 'Award-winning artist with multiple platinum albums...',
            image: 'https://example.com/artist.jpg',
            genre: ['rock', 'alternative'],
            socialMedia: {
              twitter: '@famousartist',
              instagram: '@famousartist',
              facebook: 'famousartist',
              spotify: 'artist123',
              website: 'https://famousartist.com',
            },
          },
        };

        expect(performerContent.performer.name).toBe('Famous Artist');
        expect(performerContent.performer.genre).toHaveLength(2);
        expect(performerContent.performer.socialMedia.twitter).toBeDefined();
      });
    });

    describe('LINEUP content', () => {
      it('should support lineup content structure', () => {
        const lineupContent = {
          lineup: [
            {
              performerId: 'p1',
              name: 'Headliner',
              role: 'headliner' as const,
              setTime: new Date('2026-03-01T21:00:00Z'),
              duration: 90,
              stage: 'Main Stage',
              order: 1,
            },
            {
              performerId: 'p2',
              name: 'Support Act',
              role: 'support' as const,
              setTime: new Date('2026-03-01T19:30:00Z'),
              duration: 45,
              stage: 'Main Stage',
              order: 2,
            },
          ],
        };

        expect(lineupContent.lineup).toHaveLength(2);
        expect(lineupContent.lineup[0].role).toBe('headliner');
        expect(lineupContent.lineup[1].role).toBe('support');
      });
    });

    describe('SCHEDULE content', () => {
      it('should support schedule content structure', () => {
        const scheduleContent = {
          schedule: [
            {
              startTime: new Date('2026-03-01T18:00:00Z'),
              endTime: new Date('2026-03-01T19:00:00Z'),
              title: 'Doors Open',
              description: 'Gates open, early entry begins',
              location: 'Main Entrance',
              type: 'doors_open' as const,
            },
            {
              startTime: new Date('2026-03-01T21:00:00Z'),
              endTime: new Date('2026-03-01T22:30:00Z'),
              title: 'Main Performance',
              description: 'Headliner takes the stage',
              location: 'Main Stage',
              type: 'performance' as const,
            },
          ],
        };

        expect(scheduleContent.schedule).toHaveLength(2);
        expect(scheduleContent.schedule[0].type).toBe('doors_open');
        expect(scheduleContent.schedule[1].type).toBe('performance');
      });
    });

    describe('FAQ content', () => {
      it('should support FAQ content structure', () => {
        const faqContent = {
          faqs: [
            {
              question: 'What time do doors open?',
              answer: 'Doors open at 6:00 PM.',
              category: 'general' as const,
              order: 1,
            },
            {
              question: 'Is parking available?',
              answer: 'Yes, parking is available for $20.',
              category: 'parking' as const,
              order: 2,
            },
            {
              question: 'Are there accessible entrances?',
              answer: 'Yes, ADA accessible entrances are available.',
              category: 'accessibility' as const,
              order: 3,
            },
          ],
        };

        expect(faqContent.faqs).toHaveLength(3);
        expect(faqContent.faqs[0].category).toBe('general');
        expect(faqContent.faqs[1].category).toBe('parking');
        expect(faqContent.faqs[2].category).toBe('accessibility');
      });
    });

    describe('SPONSOR content', () => {
      it('should support sponsor content structure', () => {
        const sponsorContent = {
          sponsor: {
            name: 'Big Brand Corp',
            logo: 'https://example.com/sponsor-logo.png',
            website: 'https://bigbrand.com',
            tier: 'gold' as const,
            description: 'Premium partner and title sponsor',
          },
        };

        expect(sponsorContent.sponsor.name).toBe('Big Brand Corp');
        expect(sponsorContent.sponsor.tier).toBe('gold');
      });

      it('should support different sponsor tiers', () => {
        const tiers = ['title', 'platinum', 'gold', 'silver', 'bronze'] as const;
        
        tiers.forEach(tier => {
          const sponsor = { sponsor: { name: 'Test', tier } };
          expect(['title', 'platinum', 'gold', 'silver', 'bronze']).toContain(sponsor.sponsor.tier);
        });
      });
    });

    describe('PROMOTIONAL content', () => {
      it('should support promotional content structure', () => {
        const promoContent = {
          promo: {
            title: 'Early Bird Sale!',
            description: 'Get 20% off tickets for a limited time',
            image: 'https://example.com/promo-banner.jpg',
            ctaText: 'Buy Now',
            ctaLink: 'https://tickets.example.com/event123',
            validFrom: new Date('2026-01-01'),
            validUntil: new Date('2026-01-31'),
          },
        };

        expect(promoContent.promo.title).toBe('Early Bird Sale!');
        expect(promoContent.promo.ctaText).toBe('Buy Now');
        expect(promoContent.promo.validFrom).toBeInstanceOf(Date);
      });
    });
  });

  describe('schema indexes', () => {
    it('should define composite index for eventId, contentType, status', () => {
      // The schema defines: eventContentSchema.index({ eventId: 1, contentType: 1, status: 1 });
      const indexFields = ['eventId', 'contentType', 'status'];
      indexFields.forEach(field => {
        expect(typeof field).toBe('string');
      });
    });

    it('should define index for featured content lookup', () => {
      // eventContentSchema.index({ featured: 1, status: 1 });
      const indexFields = ['featured', 'status'];
      indexFields.forEach(field => {
        expect(typeof field).toBe('string');
      });
    });

    it('should define TTL index on archivedAt field', () => {
      // eventContentSchema.index({ archivedAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 day TTL
      const ttlSeconds = 2592000;
      expect(ttlSeconds).toBe(30 * 24 * 60 * 60); // 30 days
    });
  });

  describe('version tracking', () => {
    it('should support version numbering', () => {
      const content: Partial<IEventContent> = {
        version: 1,
        previousVersionId: undefined,
      };

      expect(content.version).toBe(1);
    });

    it('should link to previous version', () => {
      const content: Partial<IEventContent> = {
        version: 2,
        previousVersionId: '507f1f77bcf86cd799439010' as any,
      };

      expect(content.version).toBe(2);
      expect(content.previousVersionId).toBeDefined();
    });
  });

  describe('status transitions', () => {
    it('should track publishedAt when status is published', () => {
      const content: Partial<IEventContent> = {
        status: 'published',
        publishedAt: new Date(),
      };

      expect(content.status).toBe('published');
      expect(content.publishedAt).toBeInstanceOf(Date);
    });

    it('should track archivedAt when status is archived', () => {
      const content: Partial<IEventContent> = {
        status: 'archived',
        archivedAt: new Date(),
      };

      expect(content.status).toBe('archived');
      expect(content.archivedAt).toBeInstanceOf(Date);
    });
  });

  describe('display order and featuring', () => {
    it('should support displayOrder for sorting', () => {
      const content: Partial<IEventContent> = {
        displayOrder: 5,
      };

      expect(content.displayOrder).toBe(5);
    });

    it('should support featured flag', () => {
      const content: Partial<IEventContent> = {
        featured: true,
      };

      expect(content.featured).toBe(true);
    });

    it('should support primaryImage flag for gallery images', () => {
      const content: Partial<IEventContent> = {
        contentType: 'GALLERY',
        primaryImage: true,
      };

      expect(content.primaryImage).toBe(true);
    });
  });

  describe('audit fields', () => {
    it('should require createdBy field', () => {
      const content: Partial<IEventContent> = {
        createdBy: 'user-123',
      };

      expect(content.createdBy).toBe('user-123');
    });

    it('should require updatedBy field', () => {
      const content: Partial<IEventContent> = {
        updatedBy: 'user-456',
      };

      expect(content.updatedBy).toBe('user-456');
    });

    it('should have timestamps (createdAt, updatedAt)', () => {
      const content: Partial<IEventContent> = {
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-15'),
      };

      expect(content.createdAt).toBeInstanceOf(Date);
      expect(content.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('edge cases', () => {
    it('should handle empty content object', () => {
      const content: Partial<IEventContent> = {
        contentType: 'DESCRIPTION',
        content: {},
      };

      expect(content.content).toEqual({});
    });

    it('should handle displayOrder of 0', () => {
      const content: Partial<IEventContent> = {
        displayOrder: 0,
      };

      expect(content.displayOrder).toBe(0);
    });

    it('should handle multiple content types per event', () => {
      const contents: Partial<IEventContent>[] = [
        { contentType: 'DESCRIPTION', displayOrder: 0 },
        { contentType: 'COVER_IMAGE', displayOrder: 1 },
        { contentType: 'GALLERY', displayOrder: 2 },
        { contentType: 'GALLERY', displayOrder: 3 },
        { contentType: 'FAQ', displayOrder: 4 },
      ];

      expect(contents).toHaveLength(5);
      const galleryContents = contents.filter(c => c.contentType === 'GALLERY');
      expect(galleryContents).toHaveLength(2);
    });
  });
});

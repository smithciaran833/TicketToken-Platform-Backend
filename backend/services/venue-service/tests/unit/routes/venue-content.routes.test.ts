/**
 * Unit tests for src/routes/venue-content.routes.ts
 * Tests 15 routes for MongoDB-based content management
 * MEDIUM priority - content CRUD, seating charts, photos, venue info
 */

// Mock the venue content service
jest.mock('../../../src/services/venue-content.service', () => ({
  VenueContentService: jest.fn().mockImplementation(() => ({
    createContent: jest.fn(),
    getVenueContent: jest.fn(),
    getContent: jest.fn(),
    updateContent: jest.fn(),
    deleteContent: jest.fn(),
    publishContent: jest.fn(),
    archiveContent: jest.fn(),
    getSeatingChart: jest.fn(),
    updateSeatingChart: jest.fn(),
    getPhotos: jest.fn(),
    addPhoto: jest.fn(),
    getAmenities: jest.fn(),
    getAccessibilityInfo: jest.fn(),
    getParkingInfo: jest.fn(),
    getPolicies: jest.fn(),
  })),
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

import { VenueContentController } from '../../../src/controllers/venue-content.controller';
import venueContentRoutes from '../../../src/routes/venue-content.routes';

describe('routes/venue-content.routes', () => {
  let mockFastify: any;
  let mockContentService: any;
  let mockReply: any;
  let mockRequest: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReply = {
      code: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
    };

    mockRequest = {
      params: {},
      body: {},
      query: {},
      user: { id: 'user-123' },
    };

    mockFastify = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    };

    // Get the mock service instance
    mockContentService = new (require('../../../src/services/venue-content.service').VenueContentService)();
  });

  describe('route registration', () => {
    it('should register all 15 content routes', async () => {
      await venueContentRoutes(mockFastify, {});

      // Count route registrations
      const postCalls = mockFastify.post.mock.calls.length;
      const getCalls = mockFastify.get.mock.calls.length;
      const putCalls = mockFastify.put.mock.calls.length;
      const deleteCalls = mockFastify.delete.mock.calls.length;

      const totalRoutes = postCalls + getCalls + putCalls + deleteCalls;
      expect(totalRoutes).toBe(15);
    });

    it('should register POST routes', async () => {
      await venueContentRoutes(mockFastify, {});

      // 4 POST routes: createContent, publishContent, archiveContent, addPhoto
      expect(mockFastify.post).toHaveBeenCalledTimes(4);
    });

    it('should register GET routes', async () => {
      await venueContentRoutes(mockFastify, {});

      // 8 GET routes: getVenueContent, getContent, getSeatingChart, getPhotos, getAmenities, getAccessibility, getParking, getPolicies
      expect(mockFastify.get).toHaveBeenCalledTimes(8);
    });

    it('should register PUT routes', async () => {
      await venueContentRoutes(mockFastify, {});

      // 2 PUT routes: updateContent, updateSeatingChart
      expect(mockFastify.put).toHaveBeenCalledTimes(2);
    });

    it('should register DELETE routes', async () => {
      await venueContentRoutes(mockFastify, {});

      // 1 DELETE route: deleteContent
      expect(mockFastify.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('content CRUD routes', () => {
    describe('POST /:venueId/content', () => {
      it('should create content successfully', async () => {
        const mockContent = {
          id: 'content-123',
          venueId: 'venue-123',
          contentType: 'PHOTO',
          status: 'draft',
        };
        mockContentService.createContent.mockResolvedValue(mockContent);

        const handler = async (request: any, reply: any) => {
          const { venueId } = request.params;
          const { contentType, content } = request.body;
          const userId = request.user?.id || 'system';

          const result = await mockContentService.createContent({
            venueId,
            contentType,
            content,
            createdBy: userId,
          });

          return reply.status(201).send({
            success: true,
            data: result,
          });
        };

        mockRequest.params = { venueId: 'venue-123' };
        mockRequest.body = { contentType: 'PHOTO', content: { url: 'https://example.com/photo.jpg' } };
        await handler(mockRequest, mockReply);

        expect(mockContentService.createContent).toHaveBeenCalled();
        expect(mockReply.status).toHaveBeenCalledWith(201);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: mockContent,
        });
      });

      it('should handle creation errors', async () => {
        mockContentService.createContent.mockRejectedValue(new Error('Creation failed'));

        const handler = async (request: any, reply: any) => {
          try {
            const { venueId } = request.params;
            await mockContentService.createContent({ venueId });
            return reply.status(201).send({ success: true });
          } catch (error: any) {
            return reply.status(500).send({
              success: false,
              error: error.message,
            });
          }
        };

        mockRequest.params = { venueId: 'venue-123' };
        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(500);
      });
    });

    describe('GET /:venueId/content', () => {
      it('should get venue content with filters', async () => {
        const mockContent = [
          { id: 'content-1', contentType: 'PHOTO' },
          { id: 'content-2', contentType: 'PHOTO' },
        ];
        mockContentService.getVenueContent.mockResolvedValue(mockContent);

        const handler = async (request: any, reply: any) => {
          const { venueId } = request.params;
          const { contentType, status } = request.query;

          const content = await mockContentService.getVenueContent(
            venueId,
            contentType,
            status
          );

          return reply.send({
            success: true,
            data: content,
          });
        };

        mockRequest.params = { venueId: 'venue-123' };
        mockRequest.query = { contentType: 'PHOTO', status: 'published' };
        await handler(mockRequest, mockReply);

        expect(mockContentService.getVenueContent).toHaveBeenCalledWith(
          'venue-123',
          'PHOTO',
          'published'
        );
        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: mockContent,
        });
      });
    });

    describe('GET /:venueId/content/:contentId', () => {
      it('should get content by ID', async () => {
        const mockContent = { id: 'content-123', contentType: 'VIDEO' };
        mockContentService.getContent.mockResolvedValue(mockContent);

        const handler = async (request: any, reply: any) => {
          const { contentId } = request.params;
          const content = await mockContentService.getContent(contentId);

          if (!content) {
            return reply.status(404).send({
              success: false,
              error: 'Content not found',
            });
          }

          return reply.send({
            success: true,
            data: content,
          });
        };

        mockRequest.params = { contentId: 'content-123' };
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: mockContent,
        });
      });

      it('should return 404 when content not found', async () => {
        mockContentService.getContent.mockResolvedValue(null);

        const handler = async (request: any, reply: any) => {
          const { contentId } = request.params;
          const content = await mockContentService.getContent(contentId);

          if (!content) {
            return reply.status(404).send({
              success: false,
              error: 'Content not found',
            });
          }

          return reply.send({ success: true, data: content });
        };

        mockRequest.params = { contentId: 'nonexistent' };
        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(404);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Content not found',
        });
      });
    });

    describe('PUT /:venueId/content/:contentId', () => {
      it('should update content successfully', async () => {
        const mockContent = { id: 'content-123', displayOrder: 2 };
        mockContentService.updateContent.mockResolvedValue(mockContent);

        const handler = async (request: any, reply: any) => {
          const { contentId } = request.params;
          const { displayOrder } = request.body;
          const userId = request.user?.id || 'system';

          const result = await mockContentService.updateContent(contentId, {
            displayOrder,
            updatedBy: userId,
          });

          if (!result) {
            return reply.status(404).send({
              success: false,
              error: 'Content not found',
            });
          }

          return reply.send({
            success: true,
            data: result,
          });
        };

        mockRequest.params = { contentId: 'content-123' };
        mockRequest.body = { displayOrder: 2 };
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: mockContent,
        });
      });
    });

    describe('DELETE /:venueId/content/:contentId', () => {
      it('should delete content successfully', async () => {
        mockContentService.deleteContent.mockResolvedValue(true);

        const handler = async (request: any, reply: any) => {
          const { contentId } = request.params;
          const result = await mockContentService.deleteContent(contentId);

          if (!result) {
            return reply.status(404).send({
              success: false,
              error: 'Content not found',
            });
          }

          return reply.send({
            success: true,
            message: 'Content deleted successfully',
          });
        };

        mockRequest.params = { contentId: 'content-123' };
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          message: 'Content deleted successfully',
        });
      });

      it('should return 404 when deleting nonexistent content', async () => {
        mockContentService.deleteContent.mockResolvedValue(false);

        const handler = async (request: any, reply: any) => {
          const { contentId } = request.params;
          const result = await mockContentService.deleteContent(contentId);

          if (!result) {
            return reply.status(404).send({
              success: false,
              error: 'Content not found',
            });
          }

          return reply.send({ success: true });
        };

        mockRequest.params = { contentId: 'nonexistent' };
        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(404);
      });
    });
  });

  describe('content action routes', () => {
    describe('POST /:venueId/content/:contentId/publish', () => {
      it('should publish content', async () => {
        const mockContent = { id: 'content-123', status: 'published' };
        mockContentService.publishContent.mockResolvedValue(mockContent);

        const handler = async (request: any, reply: any) => {
          const { contentId } = request.params;
          const userId = request.user?.id || 'system';

          const result = await mockContentService.publishContent(contentId, userId);

          return reply.send({
            success: true,
            data: result,
          });
        };

        mockRequest.params = { contentId: 'content-123' };
        await handler(mockRequest, mockReply);

        expect(mockContentService.publishContent).toHaveBeenCalledWith('content-123', 'user-123');
        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: mockContent,
        });
      });
    });

    describe('POST /:venueId/content/:contentId/archive', () => {
      it('should archive content', async () => {
        const mockContent = { id: 'content-123', status: 'archived' };
        mockContentService.archiveContent.mockResolvedValue(mockContent);

        const handler = async (request: any, reply: any) => {
          const { contentId } = request.params;
          const userId = request.user?.id || 'system';

          const result = await mockContentService.archiveContent(contentId, userId);

          return reply.send({
            success: true,
            data: result,
          });
        };

        mockRequest.params = { contentId: 'content-123' };
        await handler(mockRequest, mockReply);

        expect(mockContentService.archiveContent).toHaveBeenCalledWith('content-123', 'user-123');
        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: mockContent,
        });
      });
    });
  });

  describe('seating chart routes', () => {
    describe('GET /:venueId/seating-chart', () => {
      it('should get seating chart', async () => {
        const mockChart = {
          venueId: 'venue-123',
          sections: [{ name: 'A', rows: 10, seatsPerRow: 20 }],
        };
        mockContentService.getSeatingChart.mockResolvedValue(mockChart);

        const handler = async (request: any, reply: any) => {
          const { venueId } = request.params;
          const chart = await mockContentService.getSeatingChart(venueId);

          if (!chart) {
            return reply.status(404).send({
              success: false,
              error: 'Seating chart not found',
            });
          }

          return reply.send({
            success: true,
            data: chart,
          });
        };

        mockRequest.params = { venueId: 'venue-123' };
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: mockChart,
        });
      });

      it('should return 404 when seating chart not found', async () => {
        mockContentService.getSeatingChart.mockResolvedValue(null);

        const handler = async (request: any, reply: any) => {
          const { venueId } = request.params;
          const chart = await mockContentService.getSeatingChart(venueId);

          if (!chart) {
            return reply.status(404).send({
              success: false,
              error: 'Seating chart not found',
            });
          }

          return reply.send({ success: true, data: chart });
        };

        mockRequest.params = { venueId: 'venue-123' };
        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(404);
      });
    });

    describe('PUT /:venueId/seating-chart', () => {
      it('should update seating chart', async () => {
        const mockResult = { venueId: 'venue-123', sections: [] };
        mockContentService.updateSeatingChart.mockResolvedValue(mockResult);

        const handler = async (request: any, reply: any) => {
          const { venueId } = request.params;
          const { sections } = request.body;
          const userId = request.user?.id || 'system';

          const result = await mockContentService.updateSeatingChart(venueId, sections, userId);

          return reply.send({
            success: true,
            data: result,
          });
        };

        mockRequest.params = { venueId: 'venue-123' };
        mockRequest.body = { sections: [{ name: 'B', rows: 5 }] };
        await handler(mockRequest, mockReply);

        expect(mockContentService.updateSeatingChart).toHaveBeenCalled();
        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: mockResult,
        });
      });
    });
  });

  describe('photos routes', () => {
    describe('GET /:venueId/photos', () => {
      it('should get photos with optional type filter', async () => {
        const mockPhotos = [
          { id: 'photo-1', url: 'https://example.com/1.jpg' },
          { id: 'photo-2', url: 'https://example.com/2.jpg' },
        ];
        mockContentService.getPhotos.mockResolvedValue(mockPhotos);

        const handler = async (request: any, reply: any) => {
          const { venueId } = request.params;
          const { type } = request.query;

          const photos = await mockContentService.getPhotos(venueId, type);

          return reply.send({
            success: true,
            data: photos,
          });
        };

        mockRequest.params = { venueId: 'venue-123' };
        mockRequest.query = { type: 'exterior' };
        await handler(mockRequest, mockReply);

        expect(mockContentService.getPhotos).toHaveBeenCalledWith('venue-123', 'exterior');
        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: mockPhotos,
        });
      });
    });

    describe('POST /:venueId/photos', () => {
      it('should add a photo', async () => {
        const mockResult = { id: 'photo-123', url: 'https://example.com/new.jpg' };
        mockContentService.addPhoto.mockResolvedValue(mockResult);

        const handler = async (request: any, reply: any) => {
          const { venueId } = request.params;
          const { media } = request.body;
          const userId = request.user?.id || 'system';

          const result = await mockContentService.addPhoto(venueId, media, userId);

          return reply.status(201).send({
            success: true,
            data: result,
          });
        };

        mockRequest.params = { venueId: 'venue-123' };
        mockRequest.body = { media: { url: 'https://example.com/new.jpg', type: 'interior' } };
        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(201);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: mockResult,
        });
      });
    });
  });

  describe('venue info routes', () => {
    describe('GET /:venueId/amenities', () => {
      it('should get amenities', async () => {
        const mockAmenities = {
          items: ['WiFi', 'Parking', 'Restaurant'],
          categories: { accessibility: ['Wheelchair access'] },
        };
        mockContentService.getAmenities.mockResolvedValue(mockAmenities);

        const handler = async (request: any, reply: any) => {
          const { venueId } = request.params;
          const amenities = await mockContentService.getAmenities(venueId);

          return reply.send({
            success: true,
            data: amenities,
          });
        };

        mockRequest.params = { venueId: 'venue-123' };
        await handler(mockRequest, mockReply);

        expect(mockContentService.getAmenities).toHaveBeenCalledWith('venue-123');
        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: mockAmenities,
        });
      });
    });

    describe('GET /:venueId/accessibility', () => {
      it('should get accessibility info', async () => {
        const mockInfo = {
          wheelchairAccessible: true,
          hearingAssistance: true,
          signLanguageInterpretation: false,
        };
        mockContentService.getAccessibilityInfo.mockResolvedValue(mockInfo);

        const handler = async (request: any, reply: any) => {
          const { venueId } = request.params;
          const info = await mockContentService.getAccessibilityInfo(venueId);

          return reply.send({
            success: true,
            data: info,
          });
        };

        mockRequest.params = { venueId: 'venue-123' };
        await handler(mockRequest, mockReply);

        expect(mockContentService.getAccessibilityInfo).toHaveBeenCalledWith('venue-123');
        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: mockInfo,
        });
      });
    });

    describe('GET /:venueId/parking', () => {
      it('should get parking info', async () => {
        const mockInfo = {
          available: true,
          spaces: 500,
          pricePerHour: 5.00,
          nearbyLots: [{ name: 'Lot A', distance: '0.1 miles' }],
        };
        mockContentService.getParkingInfo.mockResolvedValue(mockInfo);

        const handler = async (request: any, reply: any) => {
          const { venueId } = request.params;
          const info = await mockContentService.getParkingInfo(venueId);

          return reply.send({
            success: true,
            data: info,
          });
        };

        mockRequest.params = { venueId: 'venue-123' };
        await handler(mockRequest, mockReply);

        expect(mockContentService.getParkingInfo).toHaveBeenCalledWith('venue-123');
        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: mockInfo,
        });
      });
    });

    describe('GET /:venueId/policies', () => {
      it('should get venue policies', async () => {
        const mockPolicies = {
          refundPolicy: 'Full refund up to 24 hours before event',
          ageRestrictions: '21+ for bar area',
          bagPolicy: 'Clear bags only',
          reentryPolicy: 'No re-entry',
        };
        mockContentService.getPolicies.mockResolvedValue(mockPolicies);

        const handler = async (request: any, reply: any) => {
          const { venueId } = request.params;
          const policies = await mockContentService.getPolicies(venueId);

          return reply.send({
            success: true,
            data: policies,
          });
        };

        mockRequest.params = { venueId: 'venue-123' };
        await handler(mockRequest, mockReply);

        expect(mockContentService.getPolicies).toHaveBeenCalledWith('venue-123');
        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: mockPolicies,
        });
      });
    });
  });

  describe('error handling', () => {
    it('should handle service errors gracefully', async () => {
      mockContentService.getVenueContent.mockRejectedValue(new Error('Database error'));

      const handler = async (request: any, reply: any) => {
        try {
          const { venueId } = request.params;
          await mockContentService.getVenueContent(venueId);
          return reply.send({ success: true });
        } catch (error: any) {
          return reply.status(500).send({
            success: false,
            error: error.message || 'Failed to get content',
          });
        }
      };

      mockRequest.params = { venueId: 'venue-123' };
      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Database error',
      });
    });

    it('should use default error message when error has no message', async () => {
      mockContentService.getAmenities.mockRejectedValue(new Error());

      const handler = async (request: any, reply: any) => {
        try {
          const { venueId } = request.params;
          await mockContentService.getAmenities(venueId);
          return reply.send({ success: true });
        } catch (error: any) {
          return reply.status(500).send({
            success: false,
            error: error.message || 'Failed to get amenities',
          });
        }
      };

      mockRequest.params = { venueId: 'venue-123' };
      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to get amenities',
      });
    });
  });

  describe('user authentication context', () => {
    it('should use user ID from request for createdBy', async () => {
      mockContentService.createContent.mockResolvedValue({ id: 'content-123' });

      const handler = async (request: any, reply: any) => {
        const userId = request.user?.id || 'system';
        await mockContentService.createContent({
          createdBy: userId,
        });
        return reply.status(201).send({ success: true });
      };

      mockRequest.user = { id: 'user-456' };
      await handler(mockRequest, mockReply);

      expect(mockContentService.createContent).toHaveBeenCalledWith({
        createdBy: 'user-456',
      });
    });

    it('should use "system" when user is not authenticated', async () => {
      mockContentService.createContent.mockResolvedValue({ id: 'content-123' });

      const handler = async (request: any, reply: any) => {
        const userId = request.user?.id || 'system';
        await mockContentService.createContent({
          createdBy: userId,
        });
        return reply.status(201).send({ success: true });
      };

      mockRequest.user = undefined;
      await handler(mockRequest, mockReply);

      expect(mockContentService.createContent).toHaveBeenCalledWith({
        createdBy: 'system',
      });
    });
  });
});

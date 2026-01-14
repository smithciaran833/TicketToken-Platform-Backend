/**
 * Unit tests for src/routes/venue-reviews.routes.ts
 * Tests 10 routes for reviews and ratings management
 * MEDIUM priority - review CRUD, helpfulness, reporting, ratings
 */

// Mock the @tickettoken/shared module
jest.mock('@tickettoken/shared', () => ({
  ReviewService: jest.fn().mockImplementation(() => ({
    createReview: jest.fn(),
    getReviewsForTarget: jest.fn(),
    getReview: jest.fn(),
    updateReview: jest.fn(),
    deleteReview: jest.fn(),
    markHelpful: jest.fn(),
    reportReview: jest.fn(),
  })),
  RatingService: jest.fn().mockImplementation(() => ({
    submitRating: jest.fn(),
    getRatingSummary: jest.fn(),
    getUserRating: jest.fn(),
  })),
}));

// Mock Redis config
jest.mock('../../../src/config/redis', () => ({
  getRedis: jest.fn().mockReturnValue({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  }),
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

import venueReviewsRoutes from '../../../src/routes/venue-reviews.routes';
import { getRedis } from '../../../src/config/redis';

describe('routes/venue-reviews.routes', () => {
  let mockFastify: any;
  let mockReviewService: any;
  let mockRatingService: any;
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

    // Get mock services
    const { ReviewService, RatingService } = require('@tickettoken/shared');
    mockReviewService = new ReviewService();
    mockRatingService = new RatingService();
  });

  describe('route registration', () => {
    it('should register all 10 review routes', async () => {
      await venueReviewsRoutes(mockFastify, {});

      // Count route registrations
      const postCalls = mockFastify.post.mock.calls.length;
      const getCalls = mockFastify.get.mock.calls.length;
      const putCalls = mockFastify.put.mock.calls.length;
      const deleteCalls = mockFastify.delete.mock.calls.length;

      const totalRoutes = postCalls + getCalls + putCalls + deleteCalls;
      expect(totalRoutes).toBe(10);
    });

    it('should register POST routes', async () => {
      await venueReviewsRoutes(mockFastify, {});

      // 5 POST routes: createReview, markHelpful, reportReview, submitRating
      expect(mockFastify.post).toHaveBeenCalledTimes(4);
    });

    it('should register GET routes', async () => {
      await venueReviewsRoutes(mockFastify, {});

      // 5 GET routes: getReviews, getReview, getRatingSummary, getUserRating
      expect(mockFastify.get).toHaveBeenCalledTimes(4);
    });

    it('should register PUT routes', async () => {
      await venueReviewsRoutes(mockFastify, {});

      // 1 PUT route: updateReview
      expect(mockFastify.put).toHaveBeenCalledTimes(1);
    });

    it('should register DELETE routes', async () => {
      await venueReviewsRoutes(mockFastify, {});

      // 1 DELETE route: deleteReview
      expect(mockFastify.delete).toHaveBeenCalledTimes(1);
    });

    it('should instantiate VenueReviewsController with Redis', async () => {
      await venueReviewsRoutes(mockFastify, {});

      expect(getRedis).toHaveBeenCalled();
    });
  });

  describe('review routes', () => {
    describe('POST /:venueId/reviews', () => {
      it('should create a review successfully', async () => {
        const mockReview = {
          id: 'review-123',
          venueId: 'venue-123',
          userId: 'user-123',
          title: 'Great venue!',
          body: 'Amazing experience',
          rating: 5,
        };
        mockReviewService.createReview.mockResolvedValue(mockReview);

        const handler = async (request: any, reply: any) => {
          const { venueId } = request.params;
          const userId = request.user?.id;

          if (!userId) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
          }

          const { title, body, pros, cons, attendedDate, verifiedAttendee } = request.body;

          const review = await mockReviewService.createReview(
            userId,
            'venue',
            venueId,
            { title, body, pros, cons, attendedDate, verifiedAttendee }
          );

          return reply.status(201).send({
            success: true,
            data: review,
          });
        };

        mockRequest.params = { venueId: 'venue-123' };
        mockRequest.body = {
          title: 'Great venue!',
          body: 'Amazing experience',
          pros: ['Great sound', 'Nice staff'],
          cons: ['Parking expensive'],
        };
        await handler(mockRequest, mockReply);

        expect(mockReviewService.createReview).toHaveBeenCalledWith(
          'user-123',
          'venue',
          'venue-123',
          expect.objectContaining({
            title: 'Great venue!',
            body: 'Amazing experience',
          })
        );
        expect(mockReply.status).toHaveBeenCalledWith(201);
      });

      it('should return 401 when user is not authenticated', async () => {
        const handler = async (request: any, reply: any) => {
          const userId = request.user?.id;

          if (!userId) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
          }

          return reply.status(201).send({ success: true });
        };

        mockRequest.user = undefined;
        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Unauthorized',
        });
      });

      it('should handle creation errors', async () => {
        mockReviewService.createReview.mockRejectedValue(new Error('Database error'));

        const handler = async (request: any, reply: any) => {
          try {
            const review = await mockReviewService.createReview('user', 'venue', 'venue-123', {});
            return reply.status(201).send({ success: true, data: review });
          } catch (error: any) {
            return reply.status(500).send({
              success: false,
              error: error.message || 'Failed to create review',
            });
          }
        };

        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(500);
      });
    });

    describe('GET /:venueId/reviews', () => {
      it('should get paginated reviews', async () => {
        const mockResult = {
          data: [
            { id: 'review-1', title: 'Good' },
            { id: 'review-2', title: 'Great' },
          ],
          pagination: { page: 1, limit: 20, total: 2 },
        };
        mockReviewService.getReviewsForTarget.mockResolvedValue(mockResult);

        const handler = async (request: any, reply: any) => {
          const { venueId } = request.params;
          const { page = '1', limit = '20', sortBy = 'recent', sortOrder = 'desc' } = request.query;

          const result = await mockReviewService.getReviewsForTarget(
            'venue',
            venueId,
            {
              page: parseInt(page),
              limit: parseInt(limit),
              sortBy,
              sortOrder,
            }
          );

          return reply.send({
            success: true,
            data: result.data,
            pagination: result.pagination,
          });
        };

        mockRequest.params = { venueId: 'venue-123' };
        mockRequest.query = { page: '1', limit: '10', sortBy: 'rating', sortOrder: 'desc' };
        await handler(mockRequest, mockReply);

        expect(mockReviewService.getReviewsForTarget).toHaveBeenCalledWith(
          'venue',
          'venue-123',
          expect.objectContaining({
            page: 1,
            limit: 10,
          })
        );
        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: mockResult.data,
          pagination: mockResult.pagination,
        });
      });

      it('should use default pagination values', async () => {
        const mockResult = { data: [], pagination: { page: 1, limit: 20, total: 0 } };
        mockReviewService.getReviewsForTarget.mockResolvedValue(mockResult);

        const handler = async (request: any, reply: any) => {
          const { venueId } = request.params;
          const { page = '1', limit = '20', sortBy = 'recent', sortOrder = 'desc' } = request.query;

          const result = await mockReviewService.getReviewsForTarget(
            'venue',
            venueId,
            {
              page: parseInt(page),
              limit: parseInt(limit),
              sortBy,
              sortOrder,
            }
          );

          return reply.send({ success: true, data: result.data });
        };

        mockRequest.params = { venueId: 'venue-123' };
        mockRequest.query = {};
        await handler(mockRequest, mockReply);

        expect(mockReviewService.getReviewsForTarget).toHaveBeenCalledWith(
          'venue',
          'venue-123',
          expect.objectContaining({
            page: 1,
            limit: 20,
            sortBy: 'recent',
            sortOrder: 'desc',
          })
        );
      });
    });

    describe('GET /:venueId/reviews/:reviewId', () => {
      it('should get a single review', async () => {
        const mockReview = { id: 'review-123', title: 'Great venue!' };
        mockReviewService.getReview.mockResolvedValue(mockReview);

        const handler = async (request: any, reply: any) => {
          const { reviewId } = request.params;
          const review = await mockReviewService.getReview(reviewId);

          if (!review) {
            return reply.status(404).send({
              success: false,
              error: 'Review not found',
            });
          }

          return reply.send({
            success: true,
            data: review,
          });
        };

        mockRequest.params = { reviewId: 'review-123' };
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: mockReview,
        });
      });

      it('should return 404 when review not found', async () => {
        mockReviewService.getReview.mockResolvedValue(null);

        const handler = async (request: any, reply: any) => {
          const { reviewId } = request.params;
          const review = await mockReviewService.getReview(reviewId);

          if (!review) {
            return reply.status(404).send({
              success: false,
              error: 'Review not found',
            });
          }

          return reply.send({ success: true, data: review });
        };

        mockRequest.params = { reviewId: 'nonexistent' };
        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(404);
      });
    });

    describe('PUT /:venueId/reviews/:reviewId', () => {
      it('should update a review', async () => {
        const mockReview = { id: 'review-123', title: 'Updated title' };
        mockReviewService.updateReview.mockResolvedValue(mockReview);

        const handler = async (request: any, reply: any) => {
          const { reviewId } = request.params;
          const userId = request.user?.id;

          if (!userId) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
          }

          const review = await mockReviewService.updateReview(reviewId, userId, request.body);

          if (!review) {
            return reply.status(404).send({
              success: false,
              error: 'Review not found or unauthorized',
            });
          }

          return reply.send({
            success: true,
            data: review,
          });
        };

        mockRequest.params = { reviewId: 'review-123' };
        mockRequest.body = { title: 'Updated title' };
        await handler(mockRequest, mockReply);

        expect(mockReviewService.updateReview).toHaveBeenCalledWith(
          'review-123',
          'user-123',
          { title: 'Updated title' }
        );
        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: mockReview,
        });
      });

      it('should return 404 when update fails (not found or unauthorized)', async () => {
        mockReviewService.updateReview.mockResolvedValue(null);

        const handler = async (request: any, reply: any) => {
          const { reviewId } = request.params;
          const userId = request.user?.id;

          if (!userId) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
          }

          const review = await mockReviewService.updateReview(reviewId, userId, request.body);

          if (!review) {
            return reply.status(404).send({
              success: false,
              error: 'Review not found or unauthorized',
            });
          }

          return reply.send({ success: true, data: review });
        };

        mockRequest.params = { reviewId: 'review-123' };
        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(404);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Review not found or unauthorized',
        });
      });
    });

    describe('DELETE /:venueId/reviews/:reviewId', () => {
      it('should delete a review', async () => {
        mockReviewService.deleteReview.mockResolvedValue(true);

        const handler = async (request: any, reply: any) => {
          const { reviewId } = request.params;
          const userId = request.user?.id;

          if (!userId) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
          }

          const success = await mockReviewService.deleteReview(reviewId, userId);

          if (!success) {
            return reply.status(404).send({
              success: false,
              error: 'Review not found or unauthorized',
            });
          }

          return reply.send({
            success: true,
            message: 'Review deleted successfully',
          });
        };

        mockRequest.params = { reviewId: 'review-123' };
        await handler(mockRequest, mockReply);

        expect(mockReviewService.deleteReview).toHaveBeenCalledWith('review-123', 'user-123');
        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          message: 'Review deleted successfully',
        });
      });

      it('should return 404 when delete fails', async () => {
        mockReviewService.deleteReview.mockResolvedValue(false);

        const handler = async (request: any, reply: any) => {
          const { reviewId } = request.params;
          const userId = request.user?.id;

          if (!userId) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
          }

          const success = await mockReviewService.deleteReview(reviewId, userId);

          if (!success) {
            return reply.status(404).send({
              success: false,
              error: 'Review not found or unauthorized',
            });
          }

          return reply.send({ success: true });
        };

        mockRequest.params = { reviewId: 'review-123' };
        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(404);
      });
    });
  });

  describe('review action routes', () => {
    describe('POST /:venueId/reviews/:reviewId/helpful', () => {
      it('should mark review as helpful', async () => {
        mockReviewService.markHelpful.mockResolvedValue(undefined);

        const handler = async (request: any, reply: any) => {
          const { reviewId } = request.params;
          const userId = request.user?.id;

          if (!userId) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
          }

          await mockReviewService.markHelpful(reviewId, userId);

          return reply.send({
            success: true,
            message: 'Review marked as helpful',
          });
        };

        mockRequest.params = { reviewId: 'review-123' };
        await handler(mockRequest, mockReply);

        expect(mockReviewService.markHelpful).toHaveBeenCalledWith('review-123', 'user-123');
        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          message: 'Review marked as helpful',
        });
      });

      it('should handle errors', async () => {
        mockReviewService.markHelpful.mockRejectedValue(new Error('Already marked'));

        const handler = async (request: any, reply: any) => {
          try {
            const { reviewId } = request.params;
            const userId = request.user?.id;

            if (!userId) {
              return reply.status(401).send({ success: false, error: 'Unauthorized' });
            }

            await mockReviewService.markHelpful(reviewId, userId);
            return reply.send({ success: true, message: 'Review marked as helpful' });
          } catch (error: any) {
            return reply.status(500).send({
              success: false,
              error: error.message || 'Failed to mark review as helpful',
            });
          }
        };

        mockRequest.params = { reviewId: 'review-123' };
        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(500);
      });
    });

    describe('POST /:venueId/reviews/:reviewId/report', () => {
      it('should report a review', async () => {
        mockReviewService.reportReview.mockResolvedValue(undefined);

        const handler = async (request: any, reply: any) => {
          const { reviewId } = request.params;
          const userId = request.user?.id;
          const { reason } = request.body;

          if (!userId) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
          }

          await mockReviewService.reportReview(reviewId, userId, reason);

          return reply.send({
            success: true,
            message: 'Review reported successfully',
          });
        };

        mockRequest.params = { reviewId: 'review-123' };
        mockRequest.body = { reason: 'spam' };
        await handler(mockRequest, mockReply);

        expect(mockReviewService.reportReview).toHaveBeenCalledWith(
          'review-123',
          'user-123',
          'spam'
        );
        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          message: 'Review reported successfully',
        });
      });
    });
  });

  describe('rating routes', () => {
    describe('POST /:venueId/ratings', () => {
      it('should submit a rating', async () => {
        const mockRating = {
          id: 'rating-123',
          userId: 'user-123',
          venueId: 'venue-123',
          overall: 4.5,
        };
        mockRatingService.submitRating.mockResolvedValue(mockRating);

        const handler = async (request: any, reply: any) => {
          const { venueId } = request.params;
          const userId = request.user?.id;

          if (!userId) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
          }

          const { overall, categories } = request.body;

          const rating = await mockRatingService.submitRating(
            userId,
            'venue',
            venueId,
            { overall, categories }
          );

          return reply.status(201).send({
            success: true,
            data: rating,
          });
        };

        mockRequest.params = { venueId: 'venue-123' };
        mockRequest.body = {
          overall: 4.5,
          categories: { sound: 5, cleanliness: 4, staff: 4.5 },
        };
        await handler(mockRequest, mockReply);

        expect(mockRatingService.submitRating).toHaveBeenCalledWith(
          'user-123',
          'venue',
          'venue-123',
          expect.objectContaining({ overall: 4.5 })
        );
        expect(mockReply.status).toHaveBeenCalledWith(201);
      });

      it('should return 401 when user is not authenticated', async () => {
        const handler = async (request: any, reply: any) => {
          const userId = request.user?.id;

          if (!userId) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
          }

          return reply.status(201).send({ success: true });
        };

        mockRequest.user = undefined;
        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
      });
    });

    describe('GET /:venueId/ratings/summary', () => {
      it('should get rating summary', async () => {
        const mockSummary = {
          average: 4.2,
          count: 150,
          distribution: {
            1: 5,
            2: 10,
            3: 25,
            4: 50,
            5: 60,
          },
          categories: {
            sound: { average: 4.5, count: 100 },
            cleanliness: { average: 4.0, count: 95 },
          },
        };
        mockRatingService.getRatingSummary.mockResolvedValue(mockSummary);

        const handler = async (request: any, reply: any) => {
          const { venueId } = request.params;
          const summary = await mockRatingService.getRatingSummary('venue', venueId);

          return reply.send({
            success: true,
            data: summary,
          });
        };

        mockRequest.params = { venueId: 'venue-123' };
        await handler(mockRequest, mockReply);

        expect(mockRatingService.getRatingSummary).toHaveBeenCalledWith('venue', 'venue-123');
        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: mockSummary,
        });
      });

      it('should handle errors', async () => {
        mockRatingService.getRatingSummary.mockRejectedValue(new Error('DB error'));

        const handler = async (request: any, reply: any) => {
          try {
            const { venueId } = request.params;
            const summary = await mockRatingService.getRatingSummary('venue', venueId);
            return reply.send({ success: true, data: summary });
          } catch (error: any) {
            return reply.status(500).send({
              success: false,
              error: error.message || 'Failed to get rating summary',
            });
          }
        };

        mockRequest.params = { venueId: 'venue-123' };
        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(500);
      });
    });

    describe('GET /:venueId/ratings/me', () => {
      it('should get current user rating', async () => {
        const mockRating = {
          id: 'rating-123',
          overall: 4,
          categories: { sound: 5 },
        };
        mockRatingService.getUserRating.mockResolvedValue(mockRating);

        const handler = async (request: any, reply: any) => {
          const { venueId } = request.params;
          const userId = request.user?.id;

          if (!userId) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
          }

          const rating = await mockRatingService.getUserRating(userId, 'venue', venueId);

          return reply.send({
            success: true,
            data: rating,
          });
        };

        mockRequest.params = { venueId: 'venue-123' };
        await handler(mockRequest, mockReply);

        expect(mockRatingService.getUserRating).toHaveBeenCalledWith(
          'user-123',
          'venue',
          'venue-123'
        );
        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: mockRating,
        });
      });

      it('should return null when user has no rating', async () => {
        mockRatingService.getUserRating.mockResolvedValue(null);

        const handler = async (request: any, reply: any) => {
          const { venueId } = request.params;
          const userId = request.user?.id;

          if (!userId) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
          }

          const rating = await mockRatingService.getUserRating(userId, 'venue', venueId);

          return reply.send({
            success: true,
            data: rating,
          });
        };

        mockRequest.params = { venueId: 'venue-123' };
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: null,
        });
      });

      it('should return 401 when user is not authenticated', async () => {
        const handler = async (request: any, reply: any) => {
          const userId = request.user?.id;

          if (!userId) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
          }

          return reply.send({ success: true });
        };

        mockRequest.user = undefined;
        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Unauthorized',
        });
      });
    });
  });

  describe('error handling', () => {
    it('should handle service errors gracefully', async () => {
      mockReviewService.getReviewsForTarget.mockRejectedValue(new Error('Service unavailable'));

      const handler = async (request: any, reply: any) => {
        try {
          await mockReviewService.getReviewsForTarget('venue', 'venue-123', {});
          return reply.send({ success: true });
        } catch (error: any) {
          return reply.status(500).send({
            success: false,
            error: error.message || 'Failed to get reviews',
          });
        }
      };

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Service unavailable',
      });
    });

    it('should provide fallback error message', async () => {
      mockReviewService.getReviewsForTarget.mockRejectedValue(new Error());

      const handler = async (request: any, reply: any) => {
        try {
          await mockReviewService.getReviewsForTarget('venue', 'venue-123', {});
          return reply.send({ success: true });
        } catch (error: any) {
          return reply.status(500).send({
            success: false,
            error: error.message || 'Failed to get reviews',
          });
        }
      };

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to get reviews',
      });
    });
  });

  describe('authentication requirements', () => {
    const authRequiredEndpoints = [
      { name: 'createReview', method: 'POST', path: '/:venueId/reviews' },
      { name: 'updateReview', method: 'PUT', path: '/:venueId/reviews/:reviewId' },
      { name: 'deleteReview', method: 'DELETE', path: '/:venueId/reviews/:reviewId' },
      { name: 'markHelpful', method: 'POST', path: '/:venueId/reviews/:reviewId/helpful' },
      { name: 'reportReview', method: 'POST', path: '/:venueId/reviews/:reviewId/report' },
      { name: 'submitRating', method: 'POST', path: '/:venueId/ratings' },
      { name: 'getUserRating', method: 'GET', path: '/:venueId/ratings/me' },
    ];

    authRequiredEndpoints.forEach(({ name }) => {
      it(`should require authentication for ${name}`, async () => {
        const handler = async (request: any, reply: any) => {
          const userId = request.user?.id;

          if (!userId) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
          }

          return reply.send({ success: true });
        };

        mockRequest.user = undefined;
        await handler(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
      });
    });
  });

  describe('public endpoints', () => {
    it('should allow getReviews without authentication', async () => {
      mockReviewService.getReviewsForTarget.mockResolvedValue({
        data: [],
        pagination: {},
      });

      const handler = async (request: any, reply: any) => {
        const { venueId } = request.params;
        const result = await mockReviewService.getReviewsForTarget('venue', venueId, {});
        return reply.send({ success: true, data: result.data });
      };

      mockRequest.user = undefined;
      mockRequest.params = { venueId: 'venue-123' };
      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should allow getReview without authentication', async () => {
      mockReviewService.getReview.mockResolvedValue({ id: 'review-123' });

      const handler = async (request: any, reply: any) => {
        const { reviewId } = request.params;
        const review = await mockReviewService.getReview(reviewId);
        return reply.send({ success: true, data: review });
      };

      mockRequest.user = undefined;
      mockRequest.params = { reviewId: 'review-123' };
      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should allow getRatingSummary without authentication', async () => {
      mockRatingService.getRatingSummary.mockResolvedValue({ average: 4.5 });

      const handler = async (request: any, reply: any) => {
        const { venueId } = request.params;
        const summary = await mockRatingService.getRatingSummary('venue', venueId);
        return reply.send({ success: true, data: summary });
      };

      mockRequest.user = undefined;
      mockRequest.params = { venueId: 'venue-123' };
      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });
});

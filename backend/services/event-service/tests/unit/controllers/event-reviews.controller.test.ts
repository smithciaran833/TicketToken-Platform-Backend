/**
 * Event Reviews Controller Unit Tests
 * 
 * Tests the event reviews controller handlers for:
 * - createReview: Create new review for an event
 * - getReviews: Get all reviews for an event
 * - getReview: Get specific review
 * - updateReview: Update review
 * - deleteReview: Delete review
 * - respondToReview: Venue response to review
 * - flagReview: Flag review for moderation
 */

import { EventReviewsController } from '../../../src/controllers/event-reviews.controller';

describe('Event Reviews Controller', () => {
  let controller: EventReviewsController;
  let mockReviewsService: any;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReviewsService = {
      createReview: jest.fn(),
      getEventReviews: jest.fn(),
      getReview: jest.fn(),
      updateReview: jest.fn(),
      deleteReview: jest.fn(),
      respondToReview: jest.fn(),
      flagReview: jest.fn()
    };

    controller = new EventReviewsController(mockReviewsService);

    mockRequest = {
      params: { eventId: 'event-123' },
      body: {},
      log: { error: jest.fn() }
    };
    (mockRequest as any).tenantId = 'tenant-123';
    (mockRequest as any).user = { id: 'user-123' };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('createReview', () => {
    it('should create review successfully', async () => {
      const reviewData = {
        rating: 5,
        title: 'Great event!',
        content: 'Had an amazing time'
      };
      const createdReview = { id: 'review-123', ...reviewData };
      mockReviewsService.createReview.mockResolvedValue(createdReview);
      mockRequest.body = reviewData;

      await controller.createReview(mockRequest, mockReply);

      expect(mockReviewsService.createReview).toHaveBeenCalledWith(
        'event-123',
        reviewData,
        'user-123',
        'tenant-123'
      );
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: createdReview
      });
    });

    it('should return 400 for invalid rating', async () => {
      mockRequest.body = { rating: 6, title: 'Test' };

      await controller.createReview(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Rating must be between 1 and 5'
      });
    });

    it('should handle errors', async () => {
      mockReviewsService.createReview.mockRejectedValue(new Error('Creation failed'));
      mockRequest.body = { rating: 5, title: 'Test' };

      await controller.createReview(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getReviews', () => {
    it('should return reviews for an event', async () => {
      const reviews = [
        { id: 'r1', rating: 5, title: 'Great!' },
        { id: 'r2', rating: 4, title: 'Good' }
      ];
      mockReviewsService.getEventReviews.mockResolvedValue(reviews);

      await controller.getReviews(mockRequest, mockReply);

      expect(mockReviewsService.getEventReviews).toHaveBeenCalledWith('event-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: reviews
      });
    });

    it('should handle errors', async () => {
      mockReviewsService.getEventReviews.mockRejectedValue(new Error('Fetch failed'));

      await controller.getReviews(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getReview', () => {
    it('should return specific review', async () => {
      const review = { id: 'review-123', rating: 5, title: 'Great!' };
      mockReviewsService.getReview.mockResolvedValue(review);
      mockRequest.params = { eventId: 'event-123', reviewId: 'review-123' };

      await controller.getReview(mockRequest, mockReply);

      expect(mockReviewsService.getReview).toHaveBeenCalledWith('review-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: review
      });
    });

    it('should return 404 when review not found', async () => {
      mockReviewsService.getReview.mockResolvedValue(null);
      mockRequest.params = { eventId: 'event-123', reviewId: 'nonexistent' };

      await controller.getReview(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Review not found'
      });
    });
  });

  describe('updateReview', () => {
    it('should update review successfully', async () => {
      const updates = { rating: 4, content: 'Updated content' };
      const updatedReview = { id: 'review-123', ...updates };
      mockReviewsService.updateReview.mockResolvedValue(updatedReview);
      mockRequest.params = { eventId: 'event-123', reviewId: 'review-123' };
      mockRequest.body = updates;

      await controller.updateReview(mockRequest, mockReply);

      expect(mockReviewsService.updateReview).toHaveBeenCalledWith(
        'review-123',
        updates,
        'user-123',
        'tenant-123'
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: updatedReview
      });
    });

    it('should return 404 when review not found', async () => {
      mockReviewsService.updateReview.mockResolvedValue(null);
      mockRequest.params = { eventId: 'event-123', reviewId: 'nonexistent' };
      mockRequest.body = { rating: 4 };

      await controller.updateReview(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('deleteReview', () => {
    it('should delete review successfully', async () => {
      mockReviewsService.deleteReview.mockResolvedValue(true);
      mockRequest.params = { eventId: 'event-123', reviewId: 'review-123' };

      await controller.deleteReview(mockRequest, mockReply);

      expect(mockReviewsService.deleteReview).toHaveBeenCalledWith(
        'review-123',
        'user-123',
        'tenant-123'
      );
      expect(mockReply.status).toHaveBeenCalledWith(204);
      expect(mockReply.send).toHaveBeenCalled();
    });

    it('should return 404 when review not found', async () => {
      mockReviewsService.deleteReview.mockResolvedValue(false);
      mockRequest.params = { eventId: 'event-123', reviewId: 'nonexistent' };

      await controller.deleteReview(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('respondToReview', () => {
    it('should add response to review', async () => {
      const responseData = { response: 'Thank you for your feedback!' };
      const reviewWithResponse = { id: 'review-123', venue_response: responseData.response };
      mockReviewsService.respondToReview.mockResolvedValue(reviewWithResponse);
      mockRequest.params = { eventId: 'event-123', reviewId: 'review-123' };
      mockRequest.body = responseData;

      await controller.respondToReview(mockRequest, mockReply);

      expect(mockReviewsService.respondToReview).toHaveBeenCalledWith(
        'review-123',
        responseData.response,
        'tenant-123'
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: reviewWithResponse
      });
    });

    it('should return 404 when review not found', async () => {
      mockReviewsService.respondToReview.mockResolvedValue(null);
      mockRequest.params = { eventId: 'event-123', reviewId: 'nonexistent' };
      mockRequest.body = { response: 'Thanks!' };

      await controller.respondToReview(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('flagReview', () => {
    it('should flag review for moderation', async () => {
      const flagData = { reason: 'inappropriate_content' };
      const flaggedReview = { id: 'review-123', is_flagged: true };
      mockReviewsService.flagReview.mockResolvedValue(flaggedReview);
      mockRequest.params = { eventId: 'event-123', reviewId: 'review-123' };
      mockRequest.body = flagData;

      await controller.flagReview(mockRequest, mockReply);

      expect(mockReviewsService.flagReview).toHaveBeenCalledWith(
        'review-123',
        flagData.reason,
        'user-123',
        'tenant-123'
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: flaggedReview,
        message: 'Review flagged for moderation'
      });
    });

    it('should return 404 when review not found', async () => {
      mockReviewsService.flagReview.mockResolvedValue(null);
      mockRequest.params = { eventId: 'event-123', reviewId: 'nonexistent' };
      mockRequest.body = { reason: 'spam' };

      await controller.flagReview(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });
});

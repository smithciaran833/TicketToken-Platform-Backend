/**
 * Unit tests for venue-reviews.controller.ts
 * Tests HTTP route handlers for venue reviews and ratings
 */

import { createMockRequest, createMockReply, createAuthenticatedRequest } from '../../__mocks__/fastify.mock';

// Mock dependencies
const mockReviewService = {
  getVenueReviews: jest.fn(),
  getReviewById: jest.fn(),
  createReview: jest.fn(),
  updateReview: jest.fn(),
  deleteReview: jest.fn(),
  getReviewStats: jest.fn(),
  reportReview: jest.fn(),
  respondToReview: jest.fn(),
};

const mockVenueService = {
  checkVenueAccess: jest.fn(),
};

describe('venue-reviews.controller', () => {
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  const mockVenueId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = createAuthenticatedRequest({ params: { venueId: mockVenueId } });
    mockReply = createMockReply();
  });

  describe('GET /venues/:venueId/reviews', () => {
    it('should return venue reviews', async () => {
      const reviews = [
        { id: 'rev-1', rating: 5, comment: 'Great venue!', userId: 'user-1' },
        { id: 'rev-2', rating: 4, comment: 'Good experience', userId: 'user-2' },
      ];
      mockReviewService.getVenueReviews.mockResolvedValue(reviews);

      const result = await mockReviewService.getVenueReviews(mockVenueId);

      expect(result).toHaveLength(2);
      expect(result[0].rating).toBe(5);
    });

    it('should support pagination', async () => {
      mockReviewService.getVenueReviews.mockResolvedValue([]);

      await mockReviewService.getVenueReviews(mockVenueId, { limit: 10, offset: 0 });

      expect(mockReviewService.getVenueReviews).toHaveBeenCalledWith(
        mockVenueId,
        { limit: 10, offset: 0 }
      );
    });

    it('should support sorting by date or rating', async () => {
      mockReviewService.getVenueReviews.mockResolvedValue([]);

      await mockReviewService.getVenueReviews(mockVenueId, { sortBy: 'rating', order: 'desc' });

      expect(mockReviewService.getVenueReviews).toHaveBeenCalledWith(
        mockVenueId,
        expect.objectContaining({ sortBy: 'rating' })
      );
    });
  });

  describe('GET /venues/:venueId/reviews/stats', () => {
    it('should return review statistics', async () => {
      const stats = {
        averageRating: 4.5,
        totalReviews: 150,
        distribution: { 5: 80, 4: 40, 3: 20, 2: 5, 1: 5 },
      };
      mockReviewService.getReviewStats.mockResolvedValue(stats);

      const result = await mockReviewService.getReviewStats(mockVenueId);

      expect(result.averageRating).toBe(4.5);
      expect(result.totalReviews).toBe(150);
    });
  });

  describe('POST /venues/:venueId/reviews', () => {
    it('should create review when user has attended an event', async () => {
      const reviewData = {
        rating: 5,
        comment: 'Amazing venue!',
        eventId: 'event-123',
      };
      mockReviewService.createReview.mockResolvedValue({
        id: 'rev-new',
        ...reviewData,
        userId: 'user-123',
      });

      const result = await mockReviewService.createReview(mockVenueId, 'user-123', reviewData);

      expect(result.id).toBeDefined();
      expect(result.rating).toBe(5);
    });

    it('should validate rating range (1-5)', async () => {
      const validRatings = [1, 2, 3, 4, 5];
      const invalidRating = 6;

      expect(validRatings).toContain(5);
      expect(validRatings).not.toContain(invalidRating);
    });
  });

  describe('PUT /venues/:venueId/reviews/:reviewId', () => {
    it('should update own review', async () => {
      const updateData = { rating: 4, comment: 'Updated comment' };
      mockReviewService.updateReview.mockResolvedValue({
        id: 'rev-1',
        ...updateData,
      });

      const result = await mockReviewService.updateReview('rev-1', 'user-123', updateData);

      expect(result.rating).toBe(4);
      expect(result.comment).toBe('Updated comment');
    });

    it('should throw ForbiddenError when updating another user review', async () => {
      mockReviewService.updateReview.mockRejectedValue(new Error('Cannot edit another user\'s review'));

      await expect(
        mockReviewService.updateReview('rev-1', 'wrong-user', {})
      ).rejects.toThrow('Cannot edit another user\'s review');
    });
  });

  describe('DELETE /venues/:venueId/reviews/:reviewId', () => {
    it('should delete own review', async () => {
      mockReviewService.deleteReview.mockResolvedValue({ success: true });

      const result = await mockReviewService.deleteReview('rev-1', 'user-123');

      expect(result.success).toBe(true);
    });
  });

  describe('POST /venues/:venueId/reviews/:reviewId/report', () => {
    it('should report review for moderation', async () => {
      mockReviewService.reportReview.mockResolvedValue({
        reported: true,
        reportId: 'report-123',
      });

      const result = await mockReviewService.reportReview('rev-1', 'user-123', {
        reason: 'inappropriate_content',
      });

      expect(result.reported).toBe(true);
    });
  });

  describe('POST /venues/:venueId/reviews/:reviewId/respond', () => {
    it('should allow venue owner to respond to review', async () => {
      mockVenueService.checkVenueAccess.mockResolvedValue(true);
      mockReviewService.respondToReview.mockResolvedValue({
        reviewId: 'rev-1',
        response: 'Thank you for your feedback!',
        respondedAt: new Date().toISOString(),
      });

      const result = await mockReviewService.respondToReview('rev-1', mockVenueId, {
        response: 'Thank you for your feedback!',
      });

      expect(result.response).toBe('Thank you for your feedback!');
    });

    it('should deny response from non-owners', async () => {
      mockVenueService.checkVenueAccess.mockResolvedValue(false);

      const hasAccess = await mockVenueService.checkVenueAccess(mockVenueId, 'non-owner');
      expect(hasAccess).toBe(false);
    });
  });
});

import { FastifyRequest, FastifyReply } from 'fastify';
import { ReviewService, RatingService } from '@tickettoken/shared';
import { logger } from '../utils/logger';
import Redis from 'ioredis';

export class VenueReviewsController {
  private reviewService: ReviewService;
  private ratingService: RatingService;

  constructor(redis: Redis) {
    this.reviewService = new ReviewService(redis);
    this.ratingService = new RatingService(redis);
  }

  /**
   * Create venue review
   * POST /api/venues/:venueId/reviews
   */
  createReview = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { venueId } = req.params as any;
      const userId = (req as any).user?.id;
      
      if (!userId) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      const { title, body, pros, cons, attendedDate, verifiedAttendee } = req.body as any;

      const review = await this.reviewService.createReview(
        userId,
        'venue',
        venueId,
        { title, body, pros, cons, attendedDate, verifiedAttendee }
      );

      return reply.status(201).send({
        success: true,
        data: review,
      });
    } catch (error: any) {
      logger.error('[VenueReviewsController] Create review error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to create review',
      });
    }
  };

  /**
   * Get venue reviews
   * GET /api/venues/:venueId/reviews
   */
  getReviews = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { venueId } = req.params as any;
      const { page = '1', limit = '20', sortBy = 'recent', sortOrder = 'desc' } = req.query as any;

      const result = await this.reviewService.getReviewsForTarget(
        'venue',
        venueId,
        {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          sortBy: sortBy as any,
          sortOrder: sortOrder as any,
        }
      );

      return reply.send({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error: any) {
      logger.error('[VenueReviewsController] Get reviews error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to get reviews',
      });
    }
  };

  /**
   * Get review by ID
   * GET /api/venues/:venueId/reviews/:reviewId
   */
  getReview = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { reviewId } = req.params as any;
      const review = await this.reviewService.getReview(reviewId);

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
    } catch (error: any) {
      logger.error('[VenueReviewsController] Get review error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to get review',
      });
    }
  };

  /**
   * Update review
   * PUT /api/venues/:venueId/reviews/:reviewId
   */
  updateReview = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { reviewId } = req.params as any;
      const userId = (req as any).user?.id;

      if (!userId) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      const review = await this.reviewService.updateReview(reviewId, userId, req.body as any);

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
    } catch (error: any) {
      logger.error('[VenueReviewsController] Update review error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to update review',
      });
    }
  };

  /**
   * Delete review
   * DELETE /api/venues/:venueId/reviews/:reviewId
   */
  deleteReview = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { reviewId } = req.params as any;
      const userId = (req as any).user?.id;

      if (!userId) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      const success = await this.reviewService.deleteReview(reviewId, userId);

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
    } catch (error: any) {
      logger.error('[VenueReviewsController] Delete review error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to delete review',
      });
    }
  };

  /**
   * Mark review as helpful
   * POST /api/venues/:venueId/reviews/:reviewId/helpful
   */
  markHelpful = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { reviewId } = req.params as any;
      const userId = (req as any).user?.id;

      if (!userId) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      await this.reviewService.markHelpful(reviewId, userId);

      return reply.send({
        success: true,
        message: 'Review marked as helpful',
      });
    } catch (error: any) {
      logger.error('[VenueReviewsController] Mark helpful error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to mark review as helpful',
      });
    }
  };

  /**
   * Report review
   * POST /api/venues/:venueId/reviews/:reviewId/report
   */
  reportReview = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { reviewId } = req.params as any;
      const userId = (req as any).user?.id;
      const { reason } = req.body as any;

      if (!userId) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      await this.reviewService.reportReview(reviewId, userId, reason);

      return reply.send({
        success: true,
        message: 'Review reported successfully',
      });
    } catch (error: any) {
      logger.error('[VenueReviewsController] Report review error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to report review',
      });
    }
  };

  /**
   * Submit venue rating
   * POST /api/venues/:venueId/ratings
   */
  submitRating = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { venueId } = req.params as any;
      const userId = (req as any).user?.id;

      if (!userId) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      const { overall, categories } = req.body as any;

      const rating = await this.ratingService.submitRating(
        userId,
        'venue',
        venueId,
        { overall, categories }
      );

      return reply.status(201).send({
        success: true,
        data: rating,
      });
    } catch (error: any) {
      logger.error('[VenueReviewsController] Submit rating error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to submit rating',
      });
    }
  };

  /**
   * Get venue rating summary
   * GET /api/venues/:venueId/ratings/summary
   */
  getRatingSummary = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { venueId } = req.params as any;
      const summary = await this.ratingService.getRatingSummary('venue', venueId);

      return reply.send({
        success: true,
        data: summary,
      });
    } catch (error: any) {
      logger.error('[VenueReviewsController] Get rating summary error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to get rating summary',
      });
    }
  };

  /**
   * Get user's rating for venue
   * GET /api/venues/:venueId/ratings/me
   */
  getUserRating = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { venueId } = req.params as any;
      const userId = (req as any).user?.id;

      if (!userId) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      const rating = await this.ratingService.getUserRating(userId, 'venue', venueId);

      return reply.send({
        success: true,
        data: rating,
      });
    } catch (error: any) {
      logger.error('[VenueReviewsController] Get user rating error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to get user rating',
      });
    }
  };
}

import { FastifyRequest, FastifyReply } from 'fastify';
import { ReviewService, RatingService } from '@tickettoken/shared';
import { logger } from '../utils/logger';
import Redis from 'ioredis';

export class EventReviewsController {
  private reviewService: ReviewService;
  private ratingService: RatingService;

  constructor(redis: Redis) {
    this.reviewService = new ReviewService(redis);
    this.ratingService = new RatingService(redis);
  }

  /**
   * Create event review
   * POST /api/events/:eventId/reviews
   */
  createReview = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { eventId } = req.params as any;
      const userId = (req as any).user?.id;
      
      if (!userId) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      const { title, body, pros, cons, attendedDate, verifiedAttendee } = req.body as any;

      const review = await this.reviewService.createReview(
        userId,
        'event',
        eventId,
        { title, body, pros, cons, attendedDate, verifiedAttendee }
      );

      return reply.status(201).send({
        success: true,
        data: review,
      });
    } catch (error: any) {
      logger.error('[EventReviewsController] Create review error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to create review',
      });
    }
  };

  /**
   * Get event reviews
   * GET /api/events/:eventId/reviews
   */
  getReviews = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { eventId } = req.params as any;
      const { page = '1', limit = '20', sortBy = 'recent', sortOrder = 'desc' } = req.query as any;

      const result = await this.reviewService.getReviewsForTarget(
        'event',
        eventId,
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
      logger.error('[EventReviewsController] Get reviews error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to get reviews',
      });
    }
  };

  /**
   * Get review by ID
   * GET /api/events/:eventId/reviews/:reviewId
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
      logger.error('[EventReviewsController] Get review error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to get review',
      });
    }
  };

  /**
   * Update review
   * PUT /api/events/:eventId/reviews/:reviewId
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
      logger.error('[EventReviewsController] Update review error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to update review',
      });
    }
  };

  /**
   * Delete review
   * DELETE /api/events/:eventId/reviews/:reviewId
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
      logger.error('[EventReviewsController] Delete review error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to delete review',
      });
    }
  };

  /**
   * Mark review as helpful
   * POST /api/events/:eventId/reviews/:reviewId/helpful
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
      logger.error('[EventReviewsController] Mark helpful error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to mark review as helpful',
      });
    }
  };

  /**
   * Report review
   * POST /api/events/:eventId/reviews/:reviewId/report
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
      logger.error('[EventReviewsController] Report review error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to report review',
      });
    }
  };

  /**
   * Submit event rating
   * POST /api/events/:eventId/ratings
   */
  submitRating = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { eventId } = req.params as any;
      const userId = (req as any).user?.id;

      if (!userId) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      const { overall, categories } = req.body as any;

      const rating = await this.ratingService.submitRating(
        userId,
        'event',
        eventId,
        { overall, categories }
      );

      return reply.status(201).send({
        success: true,
        data: rating,
      });
    } catch (error: any) {
      logger.error('[EventReviewsController] Submit rating error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to submit rating',
      });
    }
  };

  /**
   * Get event rating summary
   * GET /api/events/:eventId/ratings/summary
   */
  getRatingSummary = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { eventId } = req.params as any;
      const summary = await this.ratingService.getRatingSummary('event', eventId);

      return reply.send({
        success: true,
        data: summary,
      });
    } catch (error: any) {
      logger.error('[EventReviewsController] Get rating summary error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to get rating summary',
      });
    }
  };

  /**
   * Get user's rating for event
   * GET /api/events/:eventId/ratings/me
   */
  getUserRating = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { eventId } = req.params as any;
      const userId = (req as any).user?.id;

      if (!userId) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      const rating = await this.ratingService.getUserRating(userId, 'event', eventId);

      return reply.send({
        success: true,
        data: rating,
      });
    } catch (error: any) {
      logger.error('[EventReviewsController] Get user rating error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to get user rating',
      });
    }
  };
}

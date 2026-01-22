import { FastifyRequest, FastifyReply } from 'fastify';
import { ReviewService, RatingService } from '@tickettoken/shared';
import { logger } from '../utils/logger';
import { createProblemError } from '../middleware/error-handler';
import Redis from 'ioredis';

export class EventReviewsController {
  private reviewService: ReviewService;
  private ratingService: RatingService;

  constructor(redis: Redis) {
    this.reviewService = new ReviewService(redis);
    this.ratingService = new RatingService(redis);
  }

  /**
   * CRITICAL FIX: Validate event ownership before any review operations
   * Ensures tenant isolation by verifying the event belongs to the current tenant
   */
  private async validateEventOwnership(
    req: FastifyRequest,
    eventId: string
  ): Promise<void> {
    const tenantId = (req as any).tenantId;
    
    if (!tenantId) {
      throw createProblemError(400, 'TENANT_REQUIRED', 'Tenant ID required');
    }

    const container = (req as any).container;
    const eventService = container.resolve('eventService');
    
    const event = await eventService.getEvent(eventId, tenantId);
    
    if (!event) {
      throw createProblemError(404, 'NOT_FOUND', 'Event not found');
    }
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

      // CRITICAL FIX: Validate event ownership before creating review
      await this.validateEventOwnership(req, eventId);

      const { title, body, pros, cons, attendedDate, verifiedAttendee } = req.body as any;
      const tenantId = (req as any).tenantId;

      const review = await this.reviewService.createReview(
        userId,
        'event',
        eventId,
        { title, body, pros, cons, attendedDate, verifiedAttendee },
        tenantId
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

      // CRITICAL FIX: Validate event ownership before getting reviews
      await this.validateEventOwnership(req, eventId);

      // MEDIUM PRIORITY FIX for Issue #15: Validate pagination bounds
      const pageNum = parseInt(page as string) || 1;
      const limitNum = parseInt(limit as string) || 20;
      
      if (pageNum < 1) {
        throw createProblemError(400, 'INVALID_PAGE', 'Page must be >= 1');
      }
      if (limitNum < 1 || limitNum > 100) {
        throw createProblemError(400, 'INVALID_LIMIT', 'Limit must be between 1 and 100');
      }

      const tenantId = (req as any).tenantId;

      const result = await this.reviewService.getReviewsForTarget(
        'event',
        eventId,
        {
          page: pageNum,
          limit: limitNum,
          sortBy: sortBy as any,
          sortOrder: sortOrder as any,
        },
        tenantId
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
      const tenantId = (req as any).tenantId;
      const review = await this.reviewService.getReview(reviewId, tenantId);

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
      const { eventId, reviewId } = req.params as any;
      const userId = (req as any).user?.id;

      if (!userId) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      // CRITICAL FIX: Validate event ownership before updating review
      await this.validateEventOwnership(req, eventId);

      const tenantId = (req as any).tenantId;
      const review = await this.reviewService.updateReview(reviewId, userId, req.body as any, tenantId);

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
      const { eventId, reviewId } = req.params as any;
      const userId = (req as any).user?.id;

      if (!userId) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      // CRITICAL FIX: Validate event ownership before deleting review
      await this.validateEventOwnership(req, eventId);

      const tenantId = (req as any).tenantId;
      const success = await this.reviewService.deleteReview(reviewId, userId, tenantId);

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

      const tenantId = (req as any).tenantId;
      await this.reviewService.markHelpful(reviewId, userId, tenantId);

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

      const tenantId = (req as any).tenantId;
      await this.reviewService.reportReview(reviewId, userId, reason, tenantId);

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

      // CRITICAL FIX: Validate event ownership before submitting rating
      await this.validateEventOwnership(req, eventId);

      const { overall, categories } = req.body as any;
      const tenantId = (req as any).tenantId;

      const rating = await this.ratingService.submitRating(
        userId,
        'event',
        eventId,
        { overall, categories },
        tenantId
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
      
      // CRITICAL FIX: Validate event ownership before getting rating summary
      await this.validateEventOwnership(req, eventId);

      const tenantId = (req as any).tenantId;
      const summary = await this.ratingService.getRatingSummary('event', eventId, tenantId);

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

      // CRITICAL FIX: Validate event ownership before getting user rating
      await this.validateEventOwnership(req, eventId);

      const tenantId = (req as any).tenantId;
      const rating = await this.ratingService.getUserRating(userId, 'event', eventId, tenantId);

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

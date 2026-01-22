import { FastifyRequest, FastifyReply } from 'fastify';
import { EventContentService } from '../services/event-content.service';
import { logger } from '../utils/logger';
import { createProblemError } from '../middleware/error-handler';

/**
 * HIGH PRIORITY FIX for Issue #7:
 * Removed 'system' fallback for userId - requires authentication
 * HIGH PRIORITY FIX for Issue #4:
 * Standardized error handling with appropriate status codes
 */
export class EventContentController {
  private contentService: EventContentService;

  constructor() {
    this.contentService = new EventContentService();
  }

  createContent = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { eventId } = req.params as any;
      const { contentType, content, displayOrder, featured } = req.body as any;
      
      // HIGH PRIORITY FIX for Issue #7: Require authentication, no 'system' fallback
      const userId = (req as any).user?.id;
      if (!userId) {
        throw createProblemError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      
      const tenantId = (req as any).tenantId;

      const result = await this.contentService.createContent({
        eventId,
        tenantId,
        contentType,
        content,
        createdBy: userId,
        displayOrder,
        featured,
      });

      return reply.status(201).send({ success: true, data: result });
    } catch (error: any) {
      logger.error('[EventContentController] Create error:', error);
      
      // HIGH PRIORITY FIX for Issue #4: Return appropriate status codes
      if (error.statusCode && error.code) {
        throw createProblemError(error.statusCode, error.code, error.message);
      }
      
      throw createProblemError(500, 'INTERNAL_ERROR', error.message || 'Failed to create content');
    }
  };

  getEventContent = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { eventId } = req.params as any;
      const { contentType, status } = req.query as any;
      const tenantId = (req as any).tenantId;

      const content = await this.contentService.getEventContent(
        eventId,
        tenantId,
        contentType as any,
        status as any
      );

      return reply.send({ success: true, data: content });
    } catch (error: any) {
      logger.error('[EventContentController] Get content error:', error);
      
      // HIGH PRIORITY FIX for Issue #4: Return appropriate status codes
      if (error.statusCode && error.code) {
        throw createProblemError(error.statusCode, error.code, error.message);
      }
      
      throw createProblemError(500, 'INTERNAL_ERROR', error.message || 'Failed to get content');
    }
  };

  getContent = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { contentId } = req.params as any;
      const tenantId = (req as any).tenantId;
      const content = await this.contentService.getContent(contentId, tenantId);

      if (!content) {
        throw createProblemError(404, 'NOT_FOUND', 'Content not found');
      }

      return reply.send({ success: true, data: content });
    } catch (error: any) {
      logger.error('[EventContentController] Get content error:', error);
      
      // HIGH PRIORITY FIX for Issue #4: Return appropriate status codes
      if (error.statusCode && error.code) {
        throw createProblemError(error.statusCode, error.code, error.message);
      }
      
      throw createProblemError(500, 'INTERNAL_ERROR', error.message || 'Failed to get content');
    }
  };

  updateContent = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { contentId } = req.params as any;
      const { content, displayOrder, featured, primaryImage } = req.body as any;
      
      // HIGH PRIORITY FIX for Issue #7: Require authentication, no 'system' fallback
      const userId = (req as any).user?.id;
      if (!userId) {
        throw createProblemError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      
      const tenantId = (req as any).tenantId;

      const result = await this.contentService.updateContent(contentId, tenantId, {
        content,
        displayOrder,
        featured,
        primaryImage,
        updatedBy: userId,
      });

      if (!result) {
        throw createProblemError(404, 'NOT_FOUND', 'Content not found');
      }

      return reply.send({ success: true, data: result });
    } catch (error: any) {
      logger.error('[EventContentController] Update error:', error);
      
      // HIGH PRIORITY FIX for Issue #4: Return appropriate status codes
      if (error.statusCode && error.code) {
        throw createProblemError(error.statusCode, error.code, error.message);
      }
      
      throw createProblemError(500, 'INTERNAL_ERROR', error.message || 'Failed to update content');
    }
  };

  deleteContent = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { contentId } = req.params as any;
      const tenantId = (req as any).tenantId;
      const result = await this.contentService.deleteContent(contentId, tenantId);

      if (!result) {
        throw createProblemError(404, 'NOT_FOUND', 'Content not found');
      }

      return reply.send({ success: true, message: 'Content deleted successfully' });
    } catch (error: any) {
      logger.error('[EventContentController] Delete error:', error);
      
      // HIGH PRIORITY FIX for Issue #4: Return appropriate status codes
      if (error.statusCode && error.code) {
        throw createProblemError(error.statusCode, error.code, error.message);
      }
      
      throw createProblemError(500, 'INTERNAL_ERROR', error.message || 'Failed to delete content');
    }
  };

  publishContent = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { contentId } = req.params as any;
      
      // HIGH PRIORITY FIX for Issue #7: Require authentication, no 'system' fallback
      const userId = (req as any).user?.id;
      if (!userId) {
        throw createProblemError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      
      const tenantId = (req as any).tenantId;

      const result = await this.contentService.publishContent(contentId, tenantId, userId);
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      logger.error('[EventContentController] Publish error:', error);
      
      // HIGH PRIORITY FIX for Issue #4: Return appropriate status codes
      if (error.statusCode && error.code) {
        throw createProblemError(error.statusCode, error.code, error.message);
      }
      
      throw createProblemError(500, 'INTERNAL_ERROR', error.message || 'Failed to publish content');
    }
  };

  archiveContent = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { contentId } = req.params as any;
      
      // HIGH PRIORITY FIX for Issue #7: Require authentication, no 'system' fallback
      const userId = (req as any).user?.id;
      if (!userId) {
        throw createProblemError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      
      const tenantId = (req as any).tenantId;

      const result = await this.contentService.archiveContent(contentId, tenantId, userId);
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      logger.error('[EventContentController] Archive error:', error);
      
      // HIGH PRIORITY FIX for Issue #4: Return appropriate status codes
      if (error.statusCode && error.code) {
        throw createProblemError(error.statusCode, error.code, error.message);
      }
      
      throw createProblemError(500, 'INTERNAL_ERROR', error.message || 'Failed to archive content');
    }
  };

  getGallery = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { eventId } = req.params as any;
      const tenantId = (req as any).tenantId;
      const gallery = await this.contentService.getGallery(eventId, tenantId);
      return reply.send({ success: true, data: gallery });
    } catch (error: any) {
      logger.error('[EventContentController] Get gallery error:', error);
      
      // HIGH PRIORITY FIX for Issue #4: Return appropriate status codes
      if (error.statusCode && error.code) {
        throw createProblemError(error.statusCode, error.code, error.message);
      }
      
      throw createProblemError(500, 'INTERNAL_ERROR', error.message || 'Failed to get gallery');
    }
  };

  getLineup = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { eventId } = req.params as any;
      const tenantId = (req as any).tenantId;
      const lineup = await this.contentService.getLineup(eventId, tenantId);
      return reply.send({ success: true, data: lineup });
    } catch (error: any) {
      logger.error('[EventContentController] Get lineup error:', error);
      
      // HIGH PRIORITY FIX for Issue #4: Return appropriate status codes
      if (error.statusCode && error.code) {
        throw createProblemError(error.statusCode, error.code, error.message);
      }
      
      throw createProblemError(500, 'INTERNAL_ERROR', error.message || 'Failed to get lineup');
    }
  };

  getSchedule = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { eventId } = req.params as any;
      const tenantId = (req as any).tenantId;
      const schedule = await this.contentService.getSchedule(eventId, tenantId);
      return reply.send({ success: true, data: schedule });
    } catch (error: any) {
      logger.error('[EventContentController] Get schedule error:', error);
      
      // HIGH PRIORITY FIX for Issue #4: Return appropriate status codes
      if (error.statusCode && error.code) {
        throw createProblemError(error.statusCode, error.code, error.message);
      }
      
      throw createProblemError(500, 'INTERNAL_ERROR', error.message || 'Failed to get schedule');
    }
  };

  getPerformers = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { eventId } = req.params as any;
      const tenantId = (req as any).tenantId;
      const performers = await this.contentService.getPerformers(eventId, tenantId);
      return reply.send({ success: true, data: performers });
    } catch (error: any) {
      logger.error('[EventContentController] Get performers error:', error);
      
      // HIGH PRIORITY FIX for Issue #4: Return appropriate status codes
      if (error.statusCode && error.code) {
        throw createProblemError(error.statusCode, error.code, error.message);
      }
      
      throw createProblemError(500, 'INTERNAL_ERROR', error.message || 'Failed to get performers');
    }
  };
}
